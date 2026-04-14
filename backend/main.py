import os
import json
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

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

PROVIDER = os.getenv("LLM_PROVIDER", "ollama")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e4b")


@app.get("/health")
def health():
    return {"status": "ok"}


SYSTEM_PROMPT = """You are Task Agents, a professional AI coding assistant.

Rules:
- Be concise and direct. Avoid filler words.
- Do not use emojis or icons in responses.
- Use markdown for formatting: headings, code blocks, lists, tables.
- For code, always specify the language in fenced code blocks.
- When explaining, prioritize clarity over length.
- If unsure, say so rather than guessing."""


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


# --- Chat with history ---


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

    # Load full history from DB
    history = await get_conversation_messages(conversation_id)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + [
        {"role": m["role"], "content": m["content"]} for m in history
    ]

    async def event_stream():
        # Send conversation_id as first event so frontend can track it
        yield json.dumps({"conversation_id": conversation_id, "is_new": is_new})

        thinking_content = ""
        response_content = ""

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "stream": True,
                    "think": True,
                },
            ) as resp:
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    msg = chunk.get("message", {})
                    data = {}
                    if msg.get("thinking"):
                        thinking_content += msg["thinking"]
                        data["thinking"] = msg["thinking"]
                    if msg.get("content"):
                        response_content += msg["content"]
                        data["content"] = msg["content"]
                    if data:
                        yield json.dumps(data)
                    if chunk.get("done"):
                        yield json.dumps({"done": True})

        # Save assistant message after stream completes
        await save_message(
            conversation_id,
            "assistant",
            response_content,
            thinking_content or None,
        )

    return EventSourceResponse(event_stream())
