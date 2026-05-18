"""Agent loop: LiteLLM completion with tool-calling.

Generic over the tool set:
- General agent : toolset='general' — /api/chat
- Excel agent   : toolset='excel'   — /api/workspace/excel/chat
"""

import asyncio
import json
import logging
import os
import uuid
from typing import AsyncGenerator

import litellm

logger = logging.getLogger(__name__)

from tools import get_tools, execute_tool

MODEL = os.getenv("LITELLM_MODEL", "anthropic/claude-haiku-4-5")
MAX_ITERATIONS = 15
# Anthropic enforces a 50K input-token/min rate limit on Haiku.
# Multi-step tool chains hit it; back off and retry rather than fail the turn.
RATE_LIMIT_RETRIES = 2
RATE_LIMIT_BACKOFF_SECONDS = 30


async def _stream_completion_with_retries(kwargs: dict):
    """Wrap litellm.acompletion in a retry loop for rate-limit errors."""
    attempt = 0
    while True:
        try:
            return await litellm.acompletion(**kwargs)
        except litellm.exceptions.RateLimitError as e:
            attempt += 1
            if attempt > RATE_LIMIT_RETRIES:
                raise
            logger.warning(
                "RateLimitError (attempt %d/%d), sleeping %ss",
                attempt, RATE_LIMIT_RETRIES, RATE_LIMIT_BACKOFF_SECONDS
            )
            await asyncio.sleep(RATE_LIMIT_BACKOFF_SECONDS)


async def run_agent(
    messages: list[dict],
    user_id: str,
    toolset: str = "general",
) -> AsyncGenerator[dict, None]:
    """
    Run the agent loop, yielding SSE event dicts.

    Events:
      {"step": {"n": int, "label": str}} — progress marker (iteration / tool call)
      {"content": str}       — text chunk
      {"tool_call": dict}    — tool invocation
      {"tool_result": dict}  — tool execution result

    The caller wraps these into SSE frames and persists final state.
    """
    tools = get_tools(toolset=toolset)

    kwargs = dict(
        model=MODEL,
        messages=messages,
        tools=tools,
        stream=True,
    )

    for iteration in range(MAX_ITERATIONS):
        step_n = iteration + 1
        yield {"step": {"n": step_n, "label": "Thinking"}}

        try:
            response = await _stream_completion_with_retries(kwargs)
        except litellm.exceptions.RateLimitError as e:
            yield {
                "content": (
                    "\n\n_Hit the model's rate limit even after retries. "
                    "Try again in ~30 seconds._\n"
                )
            }
            return

        content = ""
        tool_calls_acc: dict[int, dict] = {}

        async for chunk in response:
            delta = chunk.choices[0].delta

            if delta.content:
                content += delta.content
                yield {"content": delta.content}

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index

                    if idx in tool_calls_acc and tc.id and tool_calls_acc[idx]["id"] and tc.id != tool_calls_acc[idx]["id"]:
                        idx = max(tool_calls_acc.keys()) + 1

                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {
                            "id": "",
                            "function": {"name": "", "arguments": ""},
                        }
                    if tc.id:
                        tool_calls_acc[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls_acc[idx]["function"]["name"] = tc.function.name
                        if tc.function.arguments:
                            existing = tool_calls_acc[idx]["function"]["arguments"]
                            fragment = tc.function.arguments
                            if existing.rstrip().endswith("}") and fragment.lstrip().startswith("{"):
                                new_idx = max(tool_calls_acc.keys()) + 1
                                tool_calls_acc[new_idx] = {
                                    "id": f"call_{uuid.uuid4().hex[:8]}",
                                    "function": {
                                        "name": tool_calls_acc[idx]["function"]["name"],
                                        "arguments": fragment,
                                    },
                                }
                            elif not existing or not fragment.startswith(existing):
                                tool_calls_acc[idx]["function"]["arguments"] += fragment
                            else:
                                tool_calls_acc[idx]["function"]["arguments"] = fragment

        if not tool_calls_acc:
            break

        logger.info(
            "Tool calls accumulated: %s",
            json.dumps(
                {idx: {"id": tc["id"], "name": tc["function"]["name"]} for idx, tc in tool_calls_acc.items()}
            ),
        )

        seen: set[str] = set()
        tc_list = []
        for idx in sorted(tool_calls_acc):
            tc = tool_calls_acc[idx]
            try:
                norm_args = json.dumps(json.loads(tc["function"]["arguments"]), sort_keys=True)
            except (json.JSONDecodeError, TypeError):
                norm_args = tc["function"]["arguments"]
            dedup_key = tc["function"]["name"] + "|" + norm_args
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            if not tc["id"]:
                tc["id"] = f"call_{uuid.uuid4().hex[:8]}"
            tc_list.append(
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": tc["function"],
                }
            )

        assistant_msg: dict = {"role": "assistant", "tool_calls": tc_list}
        if content:
            assistant_msg["content"] = content
        messages.append(assistant_msg)

        for tc in tc_list:
            name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"])
            except json.JSONDecodeError:
                args = {}

            yield {"step": {"n": step_n, "label": f"Calling {name}"}}
            yield {"tool_call": {"id": tc["id"], "name": name, "args": args}}
            result = await execute_tool(name, args, user_id=user_id)
            yield {"tool_result": {"id": tc["id"], "name": name, "data": result}}

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                }
            )

        kwargs["messages"] = messages
