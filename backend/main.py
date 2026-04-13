import os
import json
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

app = FastAPI(title="Task Agents API")

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


@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + body.get("messages", [])

    async def event_stream():
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
                        data["thinking"] = msg["thinking"]
                    if msg.get("content"):
                        data["content"] = msg["content"]
                    if data:
                        yield json.dumps(data)
                    if chunk.get("done"):
                        yield json.dumps({"done": True})

    return EventSourceResponse(event_stream())
