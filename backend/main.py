import json
import os
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from agent import run_agent
from auth import current_user_id
from db import (
    init_db,
    close_db,
    conversation_belongs_to,
    create_conversation,
    get_conversations,
    get_conversation_messages,
    get_user_by_id,
    save_message,
    update_conversation_title,
    delete_conversation,
)
from sso import router as sso_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(title="Task Agents API", lifespan=lifespan)

# Cookies require explicit origins + allow_credentials=True (wildcard rejected).
# FRONTEND_ORIGIN is a comma-separated list of allowed origins.
_origins_env = os.getenv("FRONTEND_ORIGIN", "http://localhost:8891")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sso_router)


# Security headers. CSP here protects HTML responses the backend serves
# (currently only the OAuth callback popup). The React app served by
# Cloudflare Pages has its own CSP in `frontend/public/_headers`.
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)

    # The OAuth callback returns inline-styled HTML with an inline window.close
    # script — allow inline only on that one path. Everything else is strict.
    if request.url.path == "/api/gmail/oauth/callback":
        csp = (
            "default-src 'none'; "
            "style-src 'unsafe-inline'; "
            "script-src 'unsafe-inline'; "
            "frame-ancestors 'none'"
        )
    else:
        csp = "default-src 'none'; frame-ancestors 'none'"

    response.headers["Content-Security-Policy"] = csp
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


def get_system_prompt(user: dict) -> str:
    today = date.today().strftime("%Y/%m/%d")
    name = user.get("name") or user.get("email") or "the user"
    email = user.get("email") or ""
    return f"""You are Task Agents, a professional AI assistant with access to tools.

Rules:
- Be concise and direct. Avoid filler words.
- Do not use emojis or icons in responses.
- Use markdown for formatting: headings, code blocks, lists, tables.
- For code, always specify the language in fenced code blocks.
- When explaining, prioritize clarity over length.
- If unsure, say so rather than guessing.

The user's name is {name}, email is {email}.
Today's date is {today}.

Tool guidelines:
- You MUST use the gmail_read tool to read emails. Do not generate fake email data.
- You MUST use the gmail_send tool to send emails. Do not just say "email sent" in text.
- Sending emails is a two-step process:
  Step 1: Draft the email (to, subject, body) in your response text and ask the user to confirm.
  Step 2: When the user confirms (e.g. "yes", "send it", "looks good"), call gmail_send EXACTLY ONCE with the drafted content. Never call gmail_send more than once.
- When showing email search results, summarize the key information clearly.
- Gmail search uses absolute dates: after:2026/04/09, before:2026/04/16. Never use relative date syntax.
- After a web search, write ONE short combined summary of the findings. Do not repeat titles, URLs, or snippets already visible in the tool results widget. Do not separate into "Text Summary" and "Image Summary". Just give a brief, useful answer."""


@app.get("/health")
def health():
    return {"status": "ok"}


# --- Conversation CRUD ---


@app.get("/api/conversations")
async def list_conversations(user_id: str = Depends(current_user_id)):
    conversations = await get_conversations(user_id)
    return JSONResponse(conversations)


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str, user_id: str = Depends(current_user_id)
):
    messages = await get_conversation_messages(conversation_id, user_id)
    return JSONResponse(messages)


@app.patch("/api/conversations/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    request: Request,
    user_id: str = Depends(current_user_id),
):
    body = await request.json()
    title = body.get("title", "").strip()
    if not title:
        return JSONResponse({"error": "title required"}, status_code=400)
    await update_conversation_title(conversation_id, user_id, title)
    return JSONResponse({"ok": True})


@app.delete("/api/conversations/{conversation_id}")
async def remove_conversation(
    conversation_id: str, user_id: str = Depends(current_user_id)
):
    await delete_conversation(conversation_id, user_id)
    return JSONResponse({"ok": True})


# --- Chat ---


def build_llm_messages(history: list[dict], user: dict) -> list[dict]:
    """Convert DB history to the LLM message format, expanding tool_calls."""
    messages: list[dict] = [{"role": "system", "content": get_system_prompt(user)}]

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
async def chat(request: Request, user_id: str = Depends(current_user_id)):
    body = await request.json()
    conversation_id = body.get("conversation_id")
    user_content = body.get("content", "")

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Create new conversation if needed; otherwise verify ownership
    is_new = conversation_id is None
    if is_new:
        title = user_content[:80].strip() or "New chat"
        conversation_id = await create_conversation(user_id, title)
    else:
        if not await conversation_belongs_to(conversation_id, user_id):
            raise HTTPException(status_code=404, detail="Conversation not found")

    # Save the user message
    await save_message(conversation_id, "user", user_content)

    # Load recent history and build LLM messages
    MAX_HISTORY = 20
    history = await get_conversation_messages(conversation_id, user_id)
    recent = history[-MAX_HISTORY:]
    messages = build_llm_messages(recent, user)

    async def event_stream():
        yield json.dumps({"conversation_id": conversation_id, "is_new": is_new})

        response_content = ""
        tool_calls_data: list[dict] = []

        async for event in run_agent(messages, user_id=user_id):
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
