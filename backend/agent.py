"""Agent loop: LiteLLM completion with tool-calling."""

import json
import logging
import os
import uuid
from typing import AsyncGenerator

import litellm

logger = logging.getLogger(__name__)

from tools import get_tools, execute_tool

MODEL = os.getenv("LITELLM_MODEL", "ollama_chat/gemma4:e4b")
MAX_ITERATIONS = 10


async def run_agent(
    messages: list[dict],
) -> AsyncGenerator[dict, None]:
    """
    Run the agent loop, yielding SSE event dicts.

    Events:
      {"content": str}       — text chunk
      {"tool_call": dict}    — tool invocation
      {"tool_result": dict}  — tool execution result

    The caller is responsible for wrapping these into SSE frames
    and for persisting the final state to the database.
    """
    tools = get_tools()
    api_base = os.getenv("OLLAMA_API_BASE") if "ollama" in MODEL else None

    kwargs = dict(
        model=MODEL,
        messages=messages,
        tools=tools,
        stream=True,
    )
    if api_base:
        kwargs["api_base"] = api_base

    for _ in range(MAX_ITERATIONS):
        response = await litellm.acompletion(**kwargs)

        content = ""
        tool_calls_acc: dict[int, dict] = {}

        async for chunk in response:
            delta = chunk.choices[0].delta

            # Stream text content
            if delta.content:
                content += delta.content
                yield {"content": delta.content}

            # Accumulate tool-call deltas
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index

                    # Detect if model reuses same index for a NEW tool call
                    # (new id on an index that already has data)
                    if idx in tool_calls_acc and tc.id and tool_calls_acc[idx]["id"] and tc.id != tool_calls_acc[idx]["id"]:
                        # Bump to a new index
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
                            # New complete JSON object on an index that already
                            # has complete args → treat as a separate tool call
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

        # No tool calls — final response, done
        if not tool_calls_acc:
            break

        logger.info(
            "Tool calls accumulated: %s",
            json.dumps(
                {idx: {"id": tc["id"], "name": tc["function"]["name"]} for idx, tc in tool_calls_acc.items()}
            ),
        )

        # Build the assistant message (for LLM context on next iteration)
        # Deduplicate: drop tool calls with the same name + arguments
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
            # Ensure every tool call has an id
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

        # Execute each tool
        for tc in tc_list:
            name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"])
            except json.JSONDecodeError:
                args = {}

            yield {"tool_call": {"id": tc["id"], "name": name, "args": args}}
            result = await execute_tool(name, args)
            yield {"tool_result": {"id": tc["id"], "name": name, "data": result}}

            # Feed result back into LLM context
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                }
            )

        # Update kwargs for next iteration (messages list is mutated in-place)
        kwargs["messages"] = messages
