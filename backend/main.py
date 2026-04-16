import json
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from agent import run_agent
from db import (
    init_db,
    close_db,
    create_conversation,
    get_conversations,
    get_conversation_messages,
    save_message,
    update_conversation_title,
    delete_conversation,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(title="Task Agents API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_system_prompt() -> str:
    today = date.today().strftime("%Y/%m/%d")
    return f"""You are Task Agents, a professional AI assistant with access to tools.

Rules:
- Be concise and direct. Avoid filler words.
- Do not use emojis or icons in responses.
- Use markdown for formatting: headings, code blocks, lists, tables.
- For code, always specify the language in fenced code blocks.
- When explaining, prioritize clarity over length.
- If unsure, say so rather than guessing.

The user's name is Jeremy Heng, email is hengweyseing531@gmail.com.
Today's date is {today}.

Tool guidelines:
- You MUST use the gmail_read tool to read emails. Do not generate fake email data.
- You MUST use the gmail_send tool to send emails. Do not just say "email sent" in text.
- Sending emails is a two-step process:
  Step 1: Draft the email (to, subject, body) in your response text and ask the user to confirm.
  Step 2: When the user confirms (e.g. "yes", "send it", "looks good"), call gmail_send EXACTLY ONCE with the drafted content. Never call gmail_send more than once.
- When showing email search results, summarize the key information clearly.
- Gmail search uses absolute dates: after:2026/04/09, before:2026/04/16. Never use relative date syntax."""


@app.get("/health")
def health():
    return {"status": "ok"}


# --- Conversation CRUD ---


@app.get("/api/conversations")
async def list_conversations():
    conversations = await get_conversations()
    return JSONResponse(conversations)


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    messages = await get_conversation_messages(conversation_id)
    return JSONResponse(messages)


@app.patch("/api/conversations/{conversation_id}")
async def rename_conversation(conversation_id: str, request: Request):
    body = await request.json()
    title = body.get("title", "").strip()
    if not title:
        return JSONResponse({"error": "title required"}, status_code=400)
    await update_conversation_title(conversation_id, title)
    return JSONResponse({"ok": True})


@app.delete("/api/conversations/{conversation_id}")
async def remove_conversation(conversation_id: str):
    await delete_conversation(conversation_id)
    return JSONResponse({"ok": True})


# --- Chat ---


def build_llm_messages(history: list[dict]) -> list[dict]:
    """Convert DB history to the LLM message format, expanding tool_calls."""
    messages: list[dict] = [{"role": "system", "content": get_system_prompt()}]

    for msg in history:
        if msg["role"] == "user":
            messages.append({"role": "user", "content": msg["content"]})

        elif msg["role"] == "assistant":
            if msg.get("tool_calls"):
                # Reconstruct assistant message with tool_calls
                tc_list = []
                for tc in msg["tool_calls"]:
                    tc_list.append(
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": json.dumps(tc["args"]),
                            },
                        }
                    )
                messages.append({"role": "assistant", "tool_calls": tc_list})

                # Reconstruct tool result messages
                for tc in msg["tool_calls"]:
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": json.dumps(tc.get("result", {})),
                        }
                    )

            # Final text content
            if msg.get("content"):
                messages.append({"role": "assistant", "content": msg["content"]})

    return messages


@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    conversation_id = body.get("conversation_id")
    user_content = body.get("content", "")

    # Create new conversation if needed
    is_new = conversation_id is None
    if is_new:
        title = user_content[:80].strip() or "New chat"
        conversation_id = await create_conversation(title)

    # Save the user message
    await save_message(conversation_id, "user", user_content)

    # Load recent history and build LLM messages
    MAX_HISTORY = 20
    history = await get_conversation_messages(conversation_id)
    recent = history[-MAX_HISTORY:]
    messages = build_llm_messages(recent)

    async def event_stream():
        yield json.dumps({"conversation_id": conversation_id, "is_new": is_new})

        response_content = ""
        tool_calls_data: list[dict] = []

        async for event in run_agent(messages):
            if "content" in event:
                response_content += event["content"]

            if "tool_call" in event:
                tool_calls_data.append(event["tool_call"])

            if "tool_result" in event:
                for tc in tool_calls_data:
                    if tc["id"] == event["tool_result"]["id"]:
                        tc["result"] = event["tool_result"]["data"]
                        break

            yield json.dumps(event)

        yield json.dumps({"done": True})

        # Persist assistant message
        await save_message(
            conversation_id,
            "assistant",
            response_content,
            tool_calls=tool_calls_data or None,
        )

    return EventSourceResponse(event_stream())
