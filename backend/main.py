import json
import os
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from agent import run_agent
from auth import current_user_id
from db import (
    init_db,
    close_db,
    clear_workspace_conversation,
    collect_descendant_r2_keys,
    conversation_belongs_to,
    create_conversation,
    create_file_row,
    create_workspace_conversation,
    delete_conversation,
    delete_file_row,
    file_belongs_to,
    get_conversations,
    get_conversation_messages,
    get_file,
    get_or_create_workspace_conversation,
    get_user_by_id,
    get_workspace_conversation_id,
    list_user_files,
    list_workspace_conversations,
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


def get_excel_system_prompt(user: dict, workbooks: list[dict]) -> str:
    today = date.today().strftime("%Y/%m/%d")
    name = user.get("name") or user.get("email") or "the user"
    if workbooks:
        wb_lines = "\n".join(
            f"- {w['name']} ({w['type']}, {w['rows']} rows × {w['columns']} cols)"
            for w in workbooks
        )
    else:
        wb_lines = "- (no workbooks yet)"
    return f"""You are the Excel agent — a data-science specialist for spreadsheets in Lumen.

Today is {today}. The user is {name}.

You operate over the user's ENTIRE workbook collection. Every sheet/workbook
tool takes a `file` argument (workbook name like 'sales_q1.csv'). YOU decide
which workbook(s) to read or modify based on the request.

Available workbooks right now:
{wb_lines}

How to work:
- ALWAYS pass `file=` explicitly to every sheet_* tool. Never guess the active file — there isn't one.
- When the user mentions a workbook ambiguously ("the sales sheet"), call workbook_list, pick the best match, and proceed. If truly ambiguous, ask once.
- For data exploration: workbook_peek → sheet_describe / sheet_value_counts / sheet_correlate / sheet_histogram / sheet_pivot.
- For aggregations (sum/avg/group_by), prefer sheet_compute. Don't do mental math on previewed rows.
- For multi-file work: workbook_join (merge on a key), workbook_concat (stack rows), workbook_create (write a new report file).
- For cleanup: workbook_delete removes one or more workbooks. ONLY call it after the user explicitly approves deletion — never delete unprompted, never delete a source workbook (csv/xlsx the user uploaded) without their go-ahead.
- After mutations or new-file creation, the workspace UI auto-refreshes — just confirm what you did in one sentence.
- Column refs accept header name, letter (A, B, ..., AA), or 0-based index. Row indices are 0-based, exclude header.
- For pivots, set save_as if the user wants a persistent report file.
- Use markdown tables only when the user explicitly asks to "show" data; otherwise the workbook is the output.
- Be concise. Do the work, confirm in one sentence. No filler, no emojis, no restating the request.

Formulas (IMPORTANT):
- For DERIVED columns or cells (totals, ratios, line totals, running balances, lookups via cell math), use sheet_set_formula or sheet_add_formula_column — DO NOT write literal computed values via sheet_set_cells. Formulas re-evaluate when source cells change; literal values go stale.
- Address syntax is A1 notation: A1 = first header cell, A2 = first data row, B5 = column B, fifth address row (= 4th data row).
- Formula language supports: + − × ÷ ^ ( ); comparisons (= <> > < >= <=); cell refs A1, ranges A1:B10; functions SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTIF, SUMIF, IF, IFERROR, ROUND, ABS, LEN, CONCAT, LEFT, RIGHT, MID, UPPER, LOWER, TRIM.
- For a one-shot derived column over every data row, use sheet_add_formula_column with the {{ROW}} placeholder, e.g. formula='=B{{ROW}}*C{{ROW}}'.
- For pivots/joined report files that won't update, literal values are fine. For working sheets, prefer formulas.
- When you sheet_read, the response includes `formulas` for visible cells so you can see what's derived vs literal.

Workspace organisation:
- Use folder_create to make folders (e.g. 'Reports', 'Archive').
- Use move_item to organise files — pass the file/folder name and the target folder name (omit target for root).
- workbook_create, workbook_join, workbook_concat, and sheet_pivot (save_as) all accept a `parent` argument (folder NAME). When the user wants outputs in a specific folder, pass `parent` at create time — don't create-then-move."""


async def _workbook_list_for_prompt(user_id: str) -> list[dict]:
    """Cheap workbook listing for the system prompt: id, name, type, rough size."""
    from tools.sheet import handler_workbook_list

    res = await handler_workbook_list(user_id=user_id)
    if "error" in res:
        return []
    return res.get("workbooks", [])


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
    # For sheet files with formulas, recompute server-side before storing
    # so UI-side formula edits behave identically to agent edits.
    if row["type"] in ("csv", "xlsx") and isinstance(content, dict):
        from tools.sheet import recompute_content
        content = recompute_content(content)
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


# --- Upload (csv/xlsx only) ---


@app.post("/api/files/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    parent_id: str | None = Form(None),
    user_id: str = Depends(current_user_id),
):
    """Multipart upload. Only .csv and .xlsx are accepted. xlsx workbooks
    with multiple sheets are stored as the multi-sheet shape."""
    import upload as upload_mod

    if not files:
        raise HTTPException(status_code=400, detail="no files attached")
    if parent_id and not await file_belongs_to(parent_id, user_id):
        raise HTTPException(status_code=404, detail="parent folder not found")

    created: list[dict] = []
    skipped: list[dict] = []

    for f in files:
        blob = await f.read()
        try:
            ftype, content = upload_mod.parse_upload(f.filename or "", blob)
        except ValueError as e:
            skipped.append({"name": f.filename, "reason": str(e)})
            continue

        row = await create_file_row(
            user_id,
            name=f.filename,
            kind="file",
            type=ftype,
            parent_id=parent_id,
        )
        payload = json.dumps(content).encode("utf-8")
        key = storage.object_key(user_id, row["id"])
        await storage.put(key, payload, content_type="application/json")
        await set_file_r2_key_and_size(row["id"], user_id, key, len(payload))
        row["r2_key"] = key
        row["size"] = len(payload)
        # Surface sheet count so the frontend can show a hint.
        if "sheets" in content:
            row["sheet_count"] = len(content["sheets"])
        created.append(row)

    return JSONResponse({"created": created, "skipped": skipped})


# --- Export ---


@app.get("/api/files/{file_id}/export/csv")
async def export_csv(file_id: str, user_id: str = Depends(current_user_id)):
    """Stream the file as CSV. Works for csv/xlsx (we store both as JSON)."""
    from fastapi.responses import Response
    from tools.sheet_export import to_csv_bytes

    row = await get_file(file_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    if row["type"] not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="Only csv/xlsx are exportable as CSV")
    if not row["r2_key"]:
        return Response(content=b"", media_type="text/csv")
    raw = await storage.get(row["r2_key"])
    try:
        content = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        content = {}
    body = to_csv_bytes(content)
    filename = row["name"]
    if not filename.lower().endswith(".csv"):
        filename = filename.rsplit(".", 1)[0] + ".csv"
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/files/{file_id}/export/google_sheets")
async def export_google_sheets(
    file_id: str, user_id: str = Depends(current_user_id)
):
    """Push the workbook to a new Google Sheet in the user's Drive."""
    from tools.sheet_export import SheetsNotAuthorizedError, to_google_sheet

    row = await get_file(file_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    if row["type"] not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="Only csv/xlsx can be exported to Sheets")
    if not row["r2_key"]:
        content = {"columns": [], "rows": []}
    else:
        raw = await storage.get(row["r2_key"])
        try:
            content = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            content = {"columns": [], "rows": []}

    title = row["name"]
    if title.lower().endswith(".csv") or title.lower().endswith(".xlsx"):
        title = title.rsplit(".", 1)[0]
    try:
        result = await to_google_sheet(user_id, title, content)
    except SheetsNotAuthorizedError as e:
        # 409 = action requires re-auth; frontend offers a "Reconnect" link.
        raise HTTPException(status_code=409, detail=str(e))
    return JSONResponse(result)


# --- Workspace-scoped Excel chat (persisted history) ---

EXCEL_WORKSPACE = "excel"
DEFAULT_THREAD_TITLE = "Excel workspace"


@app.get("/api/workspace/excel/conversations")
async def list_excel_conversations(user_id: str = Depends(current_user_id)):
    """All Excel-workspace conversations for this user, newest first."""
    convs = await list_workspace_conversations(user_id, EXCEL_WORKSPACE)
    return JSONResponse(convs)


@app.get("/api/workspace/excel/conversation")
async def get_workspace_conversation_default(
    user_id: str = Depends(current_user_id)
):
    """Most-recent conversation in the Excel workspace, with full messages."""
    conv_id = await get_workspace_conversation_id(user_id, EXCEL_WORKSPACE)
    if not conv_id:
        return JSONResponse({"conversation_id": None, "messages": []})
    messages = await get_conversation_messages(conv_id, user_id)
    return JSONResponse({"conversation_id": conv_id, "messages": messages})


@app.get("/api/workspace/excel/conversations/{conversation_id}")
async def get_excel_conversation_by_id(
    conversation_id: str, user_id: str = Depends(current_user_id)
):
    """Load one specific Excel-workspace conversation by id."""
    if not await conversation_belongs_to(conversation_id, user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = await get_conversation_messages(conversation_id, user_id)
    return JSONResponse({"conversation_id": conversation_id, "messages": messages})


@app.post("/api/workspace/excel/conversations")
async def new_excel_conversation(user_id: str = Depends(current_user_id)):
    """Start a fresh thread (preserves all prior threads in history)."""
    conv_id = await create_workspace_conversation(
        user_id, EXCEL_WORKSPACE, DEFAULT_THREAD_TITLE
    )
    return JSONResponse({"conversation_id": conv_id})


@app.delete("/api/workspace/excel/conversations/{conversation_id}")
async def delete_excel_conversation(
    conversation_id: str, user_id: str = Depends(current_user_id)
):
    """Delete one specific thread from history."""
    if not await conversation_belongs_to(conversation_id, user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    await delete_conversation(conversation_id, user_id)
    return JSONResponse({"ok": True})


@app.patch("/api/workspace/excel/conversations/{conversation_id}")
async def rename_excel_conversation(
    conversation_id: str,
    request: Request,
    user_id: str = Depends(current_user_id),
):
    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title required")
    if not await conversation_belongs_to(conversation_id, user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    await update_conversation_title(conversation_id, user_id, title)
    return JSONResponse({"ok": True})


@app.delete("/api/workspace/excel/conversation")
async def reset_all_excel_conversations(user_id: str = Depends(current_user_id)):
    """Wipe ALL Excel-workspace conversations (used by 'Forget everything')."""
    await clear_workspace_conversation(user_id, EXCEL_WORKSPACE)
    return JSONResponse({"ok": True})


@app.post("/api/workspace/excel/chat")
async def workspace_excel_chat(
    request: Request, user_id: str = Depends(current_user_id)
):
    """Run the Excel agent. Body may include `conversation_id` to target a
    specific past thread; otherwise the most-recent thread (creating one if
    needed) is used."""
    body = await request.json()
    user_content = body.get("content", "")
    requested_conv_id = body.get("conversation_id")
    mentions = body.get("mentions") or []
    # Normalise mentions — list of workbook names (strings)
    mentions = [str(m).strip() for m in mentions if isinstance(m, str) and m.strip()]

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if requested_conv_id:
        if not await conversation_belongs_to(requested_conv_id, user_id):
            raise HTTPException(status_code=404, detail="Conversation not found")
        conversation_id = requested_conv_id
    else:
        conversation_id = await get_or_create_workspace_conversation(
            user_id, EXCEL_WORKSPACE, DEFAULT_THREAD_TITLE
        )

    # Auto-title from the first user message if the thread is still untitled.
    existing_messages = await get_conversation_messages(conversation_id, user_id)
    first_message = next(
        (m for m in existing_messages if m["role"] == "user"), None
    )
    if first_message is None and user_content:
        snippet = (user_content or "").strip().split("\n")[0][:60]
        if snippet:
            await update_conversation_title(conversation_id, user_id, snippet)

    await save_message(conversation_id, "user", user_content)

    # Inject a fresh workbook map into the system prompt every turn so
    # the agent sees newly created files immediately.
    workbooks = await _workbook_list_for_prompt(user_id)

    MAX_HISTORY = 16
    history = await get_conversation_messages(conversation_id, user_id)
    recent = history[-MAX_HISTORY:]

    messages: list[dict] = [
        {"role": "system", "content": get_excel_system_prompt(user, workbooks)}
    ]
    # If the user @-tagged workbooks in this turn, surface that to the agent
    # as a turn-only system hint. It's not persisted, so it doesn't pollute
    # future turns where the user hasn't re-tagged.
    if mentions:
        messages.append({
            "role": "system",
            "content": (
                "The user explicitly tagged these workbooks in this message: "
                + ", ".join(mentions)
                + ". Treat them as the primary files for this request — "
                "read/operate on those exact workbooks unless the request "
                "clearly calls for others."
            ),
        })
    for msg in recent:
        if msg["role"] == "user":
            messages.append({"role": "user", "content": msg["content"]})
        elif msg["role"] == "assistant":
            if msg.get("tool_calls"):
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
                for tc in msg["tool_calls"]:
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": json.dumps(tc.get("result", {})),
                        }
                    )
            if msg.get("content"):
                messages.append({"role": "assistant", "content": msg["content"]})

    # Tools that mutate an existing workbook (so any open editor needs to refresh)
    MUTATING = {
        "sheet_set_cells",
        "sheet_add_rows",
        "sheet_delete_rows",
        "sheet_add_columns",
        "sheet_delete_columns",
        "sheet_set_headers",
        "sheet_replace_all",
        "sheet_sort",
        "sheet_set_formula",
        "sheet_add_formula_column",
    }
    # Tools that create a new workbook OR touch the file tree
    CREATING = {
        "workbook_create",
        "workbook_join",
        "workbook_concat",
        "sheet_pivot",  # only when save_as is set, but easier to just refresh
        "folder_create",
        "move_item",
    }
    # Tools that delete files — the frontend needs to drop matching open
    # tabs AND refresh the tree.
    DELETING = {"workbook_delete"}

    async def event_stream():
        yield json.dumps({"conversation_id": conversation_id})

        response_content = ""
        tool_calls_data: list[dict] = []
        mutated_files: set[str] = set()
        created_files: list[dict] = []
        deleted_files: list[dict] = []

        async for event in run_agent(
            messages, user_id=user_id, toolset="excel"
        ):
            if "content" in event:
                response_content += event["content"]
            if "tool_call" in event:
                tool_calls_data.append(event["tool_call"])
            if "tool_result" in event:
                for tc in tool_calls_data:
                    if tc["id"] == event["tool_result"]["id"]:
                        tc["result"] = event["tool_result"]["data"]
                        data = event["tool_result"]["data"] or {}
                        if "error" not in data:
                            if tc["name"] in MUTATING and data.get("file_id"):
                                mutated_files.add(data["file_id"])
                            if tc["name"] in CREATING:
                                saved = data.get("saved_as") if tc["name"] == "sheet_pivot" else data
                                if saved and saved.get("id"):
                                    created_files.append(
                                        {"id": saved["id"], "name": saved.get("name")}
                                    )
                            if tc["name"] in DELETING:
                                for d in (data.get("deleted") or []):
                                    if d.get("id"):
                                        deleted_files.append(d)
                        break
            yield json.dumps(event)
            # Emit incremental refresh hints right after the tool result so
            # the UI can update the tree / open editors mid-stream instead of
            # waiting for the final `done` event.
            if "tool_result" in event:
                tc_match = next(
                    (tc for tc in tool_calls_data if tc["id"] == event["tool_result"]["id"]),
                    None,
                )
                if tc_match:
                    data = event["tool_result"]["data"] or {}
                    if "error" not in data:
                        if tc_match["name"] in MUTATING and data.get("file_id"):
                            yield json.dumps({"file_mutated": data["file_id"]})
                        if tc_match["name"] in CREATING:
                            saved = (
                                data.get("saved_as")
                                if tc_match["name"] == "sheet_pivot"
                                else data
                            )
                            if saved and saved.get("id"):
                                yield json.dumps(
                                    {
                                        "file_created": {
                                            "id": saved["id"],
                                            "name": saved.get("name"),
                                        }
                                    }
                                )
                        if tc_match["name"] in DELETING:
                            for d in (data.get("deleted") or []):
                                if d.get("id"):
                                    yield json.dumps(
                                        {"file_deleted": {"id": d["id"], "name": d.get("name")}}
                                    )

        yield json.dumps(
            {
                "done": True,
                "mutated_files": list(mutated_files),
                "created_files": created_files,
                "deleted_files": deleted_files,
            }
        )

        await save_message(
            conversation_id,
            "assistant",
            response_content,
            tool_calls=tool_calls_data or None,
        )

    return EventSourceResponse(event_stream())


@app.post("/api/files/seed")
async def seed_workbooks(user_id: str = Depends(current_user_id)):
    """One-shot: create a Workbooks folder containing sample csv/xlsx files.

    Returns the existing tree if the folder already exists — idempotent re-run
    is safe but does NOT duplicate.
    """
    from db import list_user_files

    rows = await list_user_files(user_id)
    existing = next(
        (r for r in rows if r["kind"] == "folder" and r["name"] == "Workbooks"),
        None,
    )
    if existing:
        children = [r for r in rows if r["parent_id"] == existing["id"]]
        return JSONResponse(
            {"folder_id": existing["id"], "created": False, "files": len(children)}
        )

    folder = await create_file_row(
        user_id, name="Workbooks", kind="folder", parent_id=None
    )

    samples = _sample_sheets()
    created_ids = []
    for name, type_, content in samples:
        row = await create_file_row(
            user_id, name=name, kind="file", type=type_, parent_id=folder["id"]
        )
        key = storage.object_key(user_id, row["id"])
        payload = json.dumps(content).encode("utf-8")
        await storage.put(key, payload, content_type="application/json")
        await set_file_r2_key_and_size(row["id"], user_id, key, len(payload))
        created_ids.append(row["id"])

    return JSONResponse(
        {"folder_id": folder["id"], "created": True, "file_ids": created_ids}
    )


def _sample_sheets() -> list[tuple[str, str, dict]]:
    """A normalised relational dataset (customers → orders → order_items →
    products + payments) plus utility sheets (employees with ManagerID,
    performance, inventory, project tracker, expenses). Designed for real
    multi-file analysis — joins, lookups, aggregations across files."""
    return [
        # ---- Reference data --------------------------------------------
        (
            "customers.csv",
            "csv",
            {
                "columns": ["CustomerID", "Name", "Region", "Tier", "JoinDate"],
                "rows": [
                    ["C001", "Acme Holdings", "APAC", "Enterprise", "2022-01-15"],
                    ["C002", "Nimbus Labs", "EMEA", "Growth", "2023-04-02"],
                    ["C003", "Orchid Bank", "APAC", "Enterprise", "2021-09-20"],
                    ["C004", "Pinecrest LLC", "AMER", "SMB", "2024-02-11"],
                    ["C005", "Vertex Corp", "AMER", "Enterprise", "2020-06-30"],
                    ["C006", "Sable Foods", "EMEA", "SMB", "2024-08-18"],
                    ["C007", "Maple Energy", "AMER", "Growth", "2023-11-05"],
                    ["C008", "Kintaro KK", "APAC", "Growth", "2022-12-01"],
                    ["C009", "Helio Mining", "AMER", "SMB", "2025-01-12"],
                    ["C010", "Bristol Logistics", "EMEA", "Growth", "2023-07-22"],
                    ["C011", "Tessera Pharma", "EMEA", "Enterprise", "2021-03-08"],
                    ["C012", "Andes Retail", "AMER", "SMB", "2024-10-04"],
                ],
            },
        ),
        (
            "products.csv",
            "csv",
            {
                "columns": ["ProductID", "Name", "Category", "UnitPrice", "UnitCost"],
                "rows": [
                    ["P01", "Lumen Pro Plan", "Software", "1200", "180"],
                    ["P02", "Lumen Lite Plan", "Software", "350", "60"],
                    ["P03", "Lumen Enterprise Plan", "Software", "4500", "650"],
                    ["P04", "Onboarding Pack", "Service", "800", "320"],
                    ["P05", "Premium Support", "Service", "600", "180"],
                    ["P06", "Data Migration", "Service", "1500", "700"],
                    ["P07", "Custom Integration", "Service", "2800", "1200"],
                    ["P08", "Training Workshop", "Service", "950", "300"],
                ],
            },
        ),
        # ---- Transactional data ----------------------------------------
        (
            "orders.csv",
            "csv",
            {
                "columns": ["OrderID", "CustomerID", "Date", "Status", "SalesRepID"],
                "rows": [
                    ["O1001", "C001", "2026-01-08", "Closed", "E002"],
                    ["O1002", "C003", "2026-01-12", "Closed", "E006"],
                    ["O1003", "C005", "2026-01-18", "Closed", "E002"],
                    ["O1004", "C002", "2026-01-22", "Closed", "E010"],
                    ["O1005", "C007", "2026-02-02", "Closed", "E010"],
                    ["O1006", "C001", "2026-02-10", "Closed", "E002"],
                    ["O1007", "C004", "2026-02-14", "Closed", "E006"],
                    ["O1008", "C008", "2026-02-21", "Closed", "E002"],
                    ["O1009", "C011", "2026-02-26", "Closed", "E006"],
                    ["O1010", "C005", "2026-03-03", "Closed", "E010"],
                    ["O1011", "C010", "2026-03-09", "Closed", "E010"],
                    ["O1012", "C003", "2026-03-15", "Closed", "E002"],
                    ["O1013", "C012", "2026-03-18", "Open", "E006"],
                    ["O1014", "C006", "2026-03-22", "Open", "E010"],
                    ["O1015", "C009", "2026-03-25", "Closed", "E002"],
                    ["O1016", "C001", "2026-04-02", "Open", "E002"],
                    ["O1017", "C005", "2026-04-08", "Closed", "E010"],
                    ["O1018", "C011", "2026-04-15", "Closed", "E006"],
                    ["O1019", "C002", "2026-04-22", "Open", "E010"],
                    ["O1020", "C008", "2026-04-28", "Closed", "E002"],
                ],
            },
        ),
        (
            "order_items.csv",
            "csv",
            {
                # Quantity is the count; UnitPrice can be derived via lookup on products.
                "columns": ["OrderID", "ProductID", "Quantity"],
                "rows": [
                    # O1001 Acme (Enterprise): Pro plan + Onboarding
                    ["O1001", "P01", "10"], ["O1001", "P04", "1"],
                    # O1002 Orchid (Enterprise): Enterprise plan + Support + Migration
                    ["O1002", "P03", "3"], ["O1002", "P05", "12"], ["O1002", "P06", "1"],
                    # O1003 Vertex (Enterprise): Enterprise + Integration
                    ["O1003", "P03", "5"], ["O1003", "P07", "2"],
                    # O1004 Nimbus (Growth): Pro
                    ["O1004", "P01", "6"], ["O1004", "P08", "1"],
                    # O1005 Maple (Growth): Lite x large
                    ["O1005", "P02", "40"], ["O1005", "P05", "6"],
                    # O1006 Acme add-on: Support
                    ["O1006", "P05", "20"],
                    # O1007 Pinecrest (SMB): Lite
                    ["O1007", "P02", "12"], ["O1007", "P04", "1"],
                    # O1008 Kintaro (Growth): Pro + Onboarding
                    ["O1008", "P01", "8"], ["O1008", "P04", "1"],
                    # O1009 Tessera (Enterprise): Enterprise + Migration + Integration
                    ["O1009", "P03", "4"], ["O1009", "P06", "2"], ["O1009", "P07", "1"],
                    # O1010 Vertex more Pro
                    ["O1010", "P01", "15"],
                    # O1011 Bristol (Growth): Lite
                    ["O1011", "P02", "25"], ["O1011", "P05", "5"],
                    # O1012 Orchid more Pro
                    ["O1012", "P01", "9"],
                    # O1013 Andes (SMB, OPEN): Lite
                    ["O1013", "P02", "6"],
                    # O1014 Sable (SMB, OPEN): Lite + Training
                    ["O1014", "P02", "10"], ["O1014", "P08", "1"],
                    # O1015 Helio (SMB): Lite
                    ["O1015", "P02", "8"],
                    # O1016 Acme open: Enterprise upgrade
                    ["O1016", "P03", "2"],
                    # O1017 Vertex closed: Support + Training
                    ["O1017", "P05", "15"], ["O1017", "P08", "2"],
                    # O1018 Tessera: Pro + Support
                    ["O1018", "P01", "12"], ["O1018", "P05", "8"],
                    # O1019 Nimbus OPEN: Pro
                    ["O1019", "P01", "5"],
                    # O1020 Kintaro: Pro
                    ["O1020", "P01", "7"],
                ],
            },
        ),
        (
            "payments.csv",
            "csv",
            {
                # Note: not every order has a payment row (open orders). Some closed
                # orders have multiple split payments. This lets us test left joins
                # and "unpaid orders" detection.
                "columns": ["PaymentID", "OrderID", "Date", "Amount", "Method"],
                "rows": [
                    ["PMT-001", "O1001", "2026-01-10", "12800", "Wire"],
                    ["PMT-002", "O1002", "2026-01-15", "21700", "Wire"],
                    ["PMT-003", "O1003", "2026-01-20", "28100", "Wire"],
                    ["PMT-004", "O1004", "2026-01-25", "7150", "Card"],
                    ["PMT-005", "O1005", "2026-02-04", "17600", "Card"],
                    ["PMT-006", "O1006", "2026-02-12", "12000", "Wire"],
                    ["PMT-007", "O1007", "2026-02-16", "5000", "Card"],
                    ["PMT-008", "O1008", "2026-02-23", "10400", "Wire"],
                    ["PMT-009", "O1009", "2026-02-28", "23800", "Wire"],
                    ["PMT-010", "O1010", "2026-03-05", "18000", "Wire"],
                    # O1011 paid partially in two installments
                    ["PMT-011", "O1011", "2026-03-12", "6000", "Card"],
                    ["PMT-011b", "O1011", "2026-04-02", "5800", "Card"],
                    ["PMT-012", "O1012", "2026-03-18", "10800", "Wire"],
                    # O1013, O1014 OPEN — no payment
                    ["PMT-015", "O1015", "2026-03-28", "2800", "Card"],
                    # O1016 OPEN — no payment
                    ["PMT-017", "O1017", "2026-04-10", "10900", "Wire"],
                    ["PMT-018", "O1018", "2026-04-18", "19200", "Wire"],
                    # O1019 OPEN — no payment
                    ["PMT-020", "O1020", "2026-05-02", "8400", "Card"],
                ],
            },
        ),
        # ---- HR -------------------------------------------------------
        (
            "employees.csv",
            "csv",
            {
                "columns": [
                    "EmployeeID", "Name", "Department", "Role",
                    "Salary", "JoinDate", "ManagerID",
                ],
                "rows": [
                    ["E001", "Aisha Tan", "Engineering", "Senior Engineer", "8500", "2022-03-15", "E007"],
                    ["E002", "Brandon Lee", "Sales", "Account Executive", "6200", "2023-07-01", "E006"],
                    ["E003", "Carmen Lim", "Marketing", "Content Lead", "7100", "2021-11-09", ""],
                    ["E004", "Devan Singh", "Engineering", "Engineer", "5800", "2024-02-19", "E007"],
                    ["E005", "Elena Wong", "Finance", "Analyst", "5400", "2023-04-12", "E009"],
                    ["E006", "Farah Yusof", "Sales", "Sales Manager", "9200", "2020-08-30", ""],
                    ["E007", "Gerald Ong", "Engineering", "Engineering Manager", "11500", "2019-05-21", ""],
                    ["E008", "Hannah Koh", "Marketing", "Designer", "5300", "2024-09-02", "E003"],
                    ["E009", "Ivan Tay", "Finance", "Senior Analyst", "7700", "2022-01-10", ""],
                    ["E010", "Jasmine Goh", "Sales", "Account Executive", "6100", "2024-05-06", "E006"],
                    ["E011", "Kelvin Chua", "Engineering", "Engineer", "5900", "2025-02-01", "E007"],
                    ["E012", "Lina Ho", "Marketing", "Designer", "5500", "2024-11-20", "E003"],
                ],
            },
        ),
        (
            "performance.csv",
            "csv",
            {
                "columns": ["EmployeeID", "Quarter", "Rating", "Bonus"],
                "rows": [
                    ["E001", "Q1-2026", "4.5", "1500"],
                    ["E002", "Q1-2026", "3.8", "800"],
                    ["E003", "Q1-2026", "4.2", "1200"],
                    ["E004", "Q1-2026", "4.0", "1000"],
                    ["E005", "Q1-2026", "3.5", "600"],
                    ["E006", "Q1-2026", "4.7", "2200"],
                    ["E007", "Q1-2026", "4.9", "3000"],
                    ["E008", "Q1-2026", "3.9", "900"],
                    ["E009", "Q1-2026", "4.3", "1400"],
                    ["E010", "Q1-2026", "3.7", "700"],
                    ["E011", "Q1-2026", "4.1", "1100"],
                    ["E012", "Q1-2026", "3.6", "650"],
                ],
            },
        ),
        # ---- Utility sheets (unchanged from before) -------------------
        (
            "inventory.xlsx",
            "xlsx",
            {
                "columns": ["SKU", "Item", "Category", "InStock", "Reorder", "UnitCost"],
                "rows": [
                    ["SKU-100", "Laptop Stand", "Accessories", "42", "20", "35"],
                    ["SKU-101", "USB-C Hub", "Accessories", "8", "15", "28"],
                    ["SKU-102", "Mechanical Keyboard", "Peripherals", "12", "10", "95"],
                    ["SKU-103", "27-inch Monitor", "Displays", "5", "8", "320"],
                    ["SKU-104", "Wireless Mouse", "Peripherals", "63", "30", "22"],
                    ["SKU-105", "Webcam HD", "Peripherals", "18", "12", "60"],
                    ["SKU-106", "Office Chair", "Furniture", "3", "5", "180"],
                    ["SKU-107", "Standing Desk", "Furniture", "2", "4", "450"],
                ],
            },
        ),
        (
            "expenses_apr.csv",
            "csv",
            {
                "columns": ["Date", "Category", "Vendor", "Description", "Amount", "Status"],
                "rows": [
                    ["2026-04-02", "Travel", "Singapore Airlines", "Flight KL-SG", "420", "Approved"],
                    ["2026-04-03", "Software", "Notion", "Annual subscription", "120", "Approved"],
                    ["2026-04-05", "Meals", "Pancious", "Client lunch", "85", "Pending"],
                    ["2026-04-09", "Travel", "Grab", "Airport transfer", "32", "Approved"],
                    ["2026-04-11", "Software", "Figma", "Team seats x5", "375", "Approved"],
                    ["2026-04-14", "Office", "IKEA", "Standing desk", "450", "Pending"],
                    ["2026-04-18", "Meals", "Toast Box", "Team breakfast", "62", "Approved"],
                    ["2026-04-22", "Marketing", "Meta Ads", "Lead-gen campaign", "1200", "Approved"],
                    ["2026-04-26", "Software", "GitHub", "Enterprise add-on", "210", "Pending"],
                    ["2026-04-29", "Travel", "Booking.com", "Hotel — KL trip", "640", "Approved"],
                ],
            },
        ),
        (
            "project_tracker.xlsx",
            "xlsx",
            {
                "columns": ["Task", "Owner", "Priority", "Status", "DueDate", "ProgressPct"],
                "rows": [
                    ["Design new landing page", "Carmen", "High", "In Progress", "2026-05-20", "60"],
                    ["Migrate to Postgres 16", "Devan", "High", "Done", "2026-04-30", "100"],
                    ["Q2 sales forecast", "Farah", "Medium", "Not Started", "2026-05-25", "0"],
                    ["Reduce API latency", "Gerald", "High", "In Progress", "2026-05-15", "40"],
                    ["Onboard new analyst", "Ivan", "Low", "In Progress", "2026-05-22", "30"],
                    ["Brand refresh assets", "Hannah", "Medium", "Not Started", "2026-06-05", "0"],
                    ["Refactor billing logic", "Aisha", "High", "In Progress", "2026-05-18", "75"],
                    ["Customer interviews", "Brandon", "Medium", "Done", "2026-04-25", "100"],
                ],
            },
        ),
    ]


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
