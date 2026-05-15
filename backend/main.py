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
    collect_descendant_r2_keys,
    conversation_belongs_to,
    create_conversation,
    create_file_row,
    delete_conversation,
    delete_file_row,
    file_belongs_to,
    get_conversations,
    get_conversation_messages,
    get_file,
    get_user_by_id,
    list_user_files,
    rename_file_row,
    save_message,
    set_file_r2_key_and_size,
    update_conversation_title,
    update_file_size,
)
from sso import router as sso_router
import storage


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
- gmail_send prepares a DRAFT — it does NOT send. The UI renders the draft with a Send button; the user clicks Send to actually send. Do not ask for textual confirmation ("yes? send?"). Just call gmail_send once with the complete draft, then briefly tell the user the draft is ready below.
- For replies: pass reply_to_message_id and 'body'. To/Cc/Subject auto-fill reply-all from the original message.
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
    if not await conversation_belongs_to(conversation_id, user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
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
    if not await conversation_belongs_to(conversation_id, user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    await update_conversation_title(conversation_id, user_id, title)
    return JSONResponse({"ok": True})


@app.delete("/api/conversations/{conversation_id}")
async def remove_conversation(
    conversation_id: str, user_id: str = Depends(current_user_id)
):
    if not await conversation_belongs_to(conversation_id, user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
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


# --- Files ---


def _build_tree(rows: list[dict]) -> dict:
    """Build a nested tree from a flat list of file/folder rows."""
    by_parent: dict[str | None, list[dict]] = {}
    nodes: dict[str, dict] = {}
    for r in rows:
        node = {
            "id": r["id"],
            "name": r["name"],
            "kind": r["kind"],
            "type": r["type"],
            "parent_id": r["parent_id"],
        }
        if r["kind"] == "folder":
            node["children"] = []
        nodes[r["id"]] = node
        by_parent.setdefault(r["parent_id"], []).append(node)

    for parent_id, children in by_parent.items():
        if parent_id and parent_id in nodes:
            nodes[parent_id]["children"] = children

    return by_parent.get(None, [])


@app.get("/api/files")
async def list_files(user_id: str = Depends(current_user_id)):
    """Return the user's file tree, wrapped in a synthetic root."""
    rows = await list_user_files(user_id)
    children = _build_tree(rows)
    return JSONResponse(
        {
            "id": "root",
            "name": "My Files",
            "kind": "folder",
            "children": children,
        }
    )


@app.post("/api/files")
async def create_file(
    request: Request, user_id: str = Depends(current_user_id)
):
    """Create a file or folder. For files, optional `content` (any JSON) is
    written to R2; if omitted, an empty string is stored."""
    body = await request.json()
    name = (body.get("name") or "").strip()
    kind = body.get("kind")
    file_type = body.get("type")
    parent_id = body.get("parent_id")
    content = body.get("content", "")

    if not name:
        raise HTTPException(status_code=400, detail="name required")
    if kind not in ("file", "folder"):
        raise HTTPException(status_code=400, detail="kind must be 'file' or 'folder'")
    if parent_id and not await file_belongs_to(parent_id, user_id):
        raise HTTPException(status_code=404, detail="parent folder not found")

    if kind == "folder":
        row = await create_file_row(
            user_id, name=name, kind="folder", parent_id=parent_id
        )
        return JSONResponse(row)

    # File: write content to R2 first, then create the DB row.
    # We don't know the file_id yet, so create the row first with a placeholder,
    # then update r2_key and write content. Simpler: insert row, then write to R2.
    row = await create_file_row(
        user_id, name=name, kind="file", type=file_type, parent_id=parent_id
    )
    key = storage.object_key(user_id, row["id"])
    payload = json.dumps(content).encode("utf-8")
    await storage.put(key, payload, content_type="application/json")
    await set_file_r2_key_and_size(row["id"], user_id, key, len(payload))
    row["r2_key"] = key
    row["size"] = len(payload)
    return JSONResponse(row)


@app.get("/api/files/{file_id}/content")
async def read_file_content(
    file_id: str, user_id: str = Depends(current_user_id)
):
    row = await get_file(file_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    if row["kind"] != "file":
        raise HTTPException(status_code=400, detail="Not a file")
    if not row["r2_key"]:
        return JSONResponse({"content": ""})
    raw = await storage.get(row["r2_key"])
    try:
        content = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        content = raw.decode("utf-8", errors="replace")
    return JSONResponse({"content": content})


@app.put("/api/files/{file_id}/content")
async def write_file_content(
    file_id: str, request: Request, user_id: str = Depends(current_user_id)
):
    row = await get_file(file_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    if row["kind"] != "file":
        raise HTTPException(status_code=400, detail="Not a file")

    body = await request.json()
    content = body.get("content", "")
    payload = json.dumps(content).encode("utf-8")

    key = row["r2_key"] or storage.object_key(user_id, file_id)
    await storage.put(key, payload, content_type="application/json")
    if row["r2_key"]:
        await update_file_size(file_id, user_id, len(payload))
    else:
        await set_file_r2_key_and_size(file_id, user_id, key, len(payload))
    return JSONResponse({"ok": True, "size": len(payload)})


@app.patch("/api/files/{file_id}")
async def rename_file(
    file_id: str, request: Request, user_id: str = Depends(current_user_id)
):
    if not await file_belongs_to(file_id, user_id):
        raise HTTPException(status_code=404, detail="File not found")
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    await rename_file_row(file_id, user_id, name)
    return JSONResponse({"ok": True})


@app.delete("/api/files/{file_id}")
async def remove_file(
    file_id: str, user_id: str = Depends(current_user_id)
):
    if not await file_belongs_to(file_id, user_id):
        raise HTTPException(status_code=404, detail="File not found")
    keys = await collect_descendant_r2_keys(file_id, user_id)
    await delete_file_row(file_id, user_id)
    await storage.delete_many(keys)
    return JSONResponse({"ok": True, "r2_objects_deleted": len(keys)})


# --- Gmail send (Send button on draft widget) ---


@app.post("/api/gmail/send")
async def gmail_send_confirmed(
    request: Request, user_id: str = Depends(current_user_id)
):
    """Send a draft prepared by the gmail_send tool.

    Body: { to, subject, body, cc?, bcc?, thread_id?, in_reply_to?, references? }
    """
    from tools.gmail_send import send_prepared_draft

    payload = await request.json()
    if not (payload.get("to") or "").strip():
        raise HTTPException(status_code=400, detail="Missing 'to'")
    if not (payload.get("body") or ""):
        raise HTTPException(status_code=400, detail="Missing 'body'")

    try:
        result = await send_prepared_draft(user_id, payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return JSONResponse(result)
