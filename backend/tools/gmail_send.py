"""Gmail send tool — prepares a draft for the UI to confirm.

This tool does NOT call Gmail's send API. It resolves the recipient list
(including reply-all auto-fill) and returns a fully-prepared draft, which
the frontend renders with a Send button. The actual send happens when the
user clicks Send in the UI, which hits POST /api/gmail/send and calls
`send_prepared_draft` below.
"""

import asyncio
import base64
from email.mime.text import MIMEText
from email.utils import formataddr, getaddresses

from .gmail_auth import get_gmail_service, GmailNotConnectedError

SCHEMA = {
    "name": "gmail_send",
    "description": (
        "Prepare an email draft to send via Gmail. Can compose new emails or reply to a thread. "
        "To reply, pass reply_to_message_id — the draft is auto-filled reply-all style "
        "(original sender + all other recipients, excluding yourself). "
        "The draft is shown to the user with a Send button — they confirm by clicking, "
        "not by replying in chat. Do not ask for textual confirmation. Call this tool ONCE."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "to": {
                "type": "string",
                "description": "Recipient(s), comma-separated. Optional on reply (auto-filled reply-all).",
            },
            "subject": {
                "type": "string",
                "description": "Subject line. Optional on reply (auto-filled as 'Re: <original>').",
            },
            "body": {"type": "string", "description": "Email body text (plain text)"},
            "cc": {
                "type": "string",
                "description": "CC recipients (comma-separated). On reply, auto-filled from original Cc unless overridden.",
            },
            "bcc": {"type": "string", "description": "BCC recipients (comma-separated)"},
            "reply_to_message_id": {
                "type": "string",
                "description": (
                    "Gmail message id being replied to. When set, the draft is threaded with "
                    "proper In-Reply-To/References headers and 'to'/'cc'/'subject' are auto-filled."
                ),
            },
            "thread_id": {
                "type": "string",
                "description": "Gmail thread id (prefer reply_to_message_id for proper threading).",
            },
        },
        "required": ["body"],
    },
}


def _get_header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _parse_addrs(header_value: str) -> list[tuple[str, str]]:
    if not header_value:
        return []
    return [(n, e) for n, e in getaddresses([header_value]) if e]


def _format_addrs(addrs: list[tuple[str, str]]) -> str:
    return ", ".join(formataddr((n, e)) if n else e for n, e in addrs)


def _dedupe(addrs: list[tuple[str, str]], exclude: set[str]) -> list[tuple[str, str]]:
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for n, e in addrs:
        key = e.lower()
        if key in exclude or key in seen:
            continue
        seen.add(key)
        out.append((n, e))
    return out


def _self_email(service) -> str:
    try:
        return service.users().getProfile(userId="me").execute().get("emailAddress", "")
    except Exception:
        return ""


def _load_reply_context(service, message_id: str) -> dict:
    msg = (
        service.users()
        .messages()
        .get(
            userId="me",
            id=message_id,
            format="metadata",
            metadataHeaders=[
                "From",
                "Reply-To",
                "To",
                "Cc",
                "Subject",
                "Message-ID",
                "References",
            ],
        )
        .execute()
    )
    headers = msg.get("payload", {}).get("headers", [])
    return {
        "thread_id": msg.get("threadId", ""),
        "from_addrs": _parse_addrs(_get_header(headers, "Reply-To") or _get_header(headers, "From")),
        "to_addrs": _parse_addrs(_get_header(headers, "To")),
        "cc_addrs": _parse_addrs(_get_header(headers, "Cc")),
        "subject": _get_header(headers, "Subject") or "",
        "rfc_message_id": _get_header(headers, "Message-ID"),
        "references": _get_header(headers, "References"),
    }


def _prepare_sync(
    service,
    body: str,
    to: str = "",
    subject: str = "",
    cc: str = "",
    bcc: str = "",
    thread_id: str | None = None,
    reply_to_message_id: str | None = None,
) -> dict:
    in_reply_to = ""
    references = ""

    if reply_to_message_id:
        ctx = _load_reply_context(service, reply_to_message_id)
        exclude = {_self_email(service).lower()} if _self_email(service) else set()

        if not thread_id:
            thread_id = ctx["thread_id"]

        if not to:
            primary = _dedupe(ctx["from_addrs"], exclude)
            others = _dedupe(ctx["to_addrs"], exclude | {e.lower() for _, e in primary})
            to = _format_addrs(primary + others)

        if not cc:
            to_emails = {e.lower() for _, e in _parse_addrs(to)}
            cc = _format_addrs(_dedupe(ctx["cc_addrs"], exclude | to_emails))

        if not subject:
            orig = ctx["subject"]
            subject = orig if orig.lower().startswith("re:") else f"Re: {orig}"

        in_reply_to = ctx["rfc_message_id"]
        references = (
            f"{ctx['references']} {ctx['rfc_message_id']}".strip()
            if ctx["references"]
            else ctx["rfc_message_id"]
        )

    if not to:
        return {"error": "Recipient 'to' is required (or pass reply_to_message_id)."}

    return {
        "status": "pending_confirmation",
        "to": to,
        "cc": cc,
        "bcc": bcc,
        "subject": subject,
        "body": body,
        "thread_id": thread_id or "",
        "in_reply_to": in_reply_to,
        "references": references,
        "is_reply": bool(reply_to_message_id),
    }


def _build_mime(
    to: str,
    subject: str,
    body: str,
    cc: str = "",
    bcc: str = "",
    in_reply_to: str = "",
    references: str = "",
) -> MIMEText:
    msg = MIMEText(body)
    msg["to"] = to
    msg["subject"] = subject
    if cc:
        msg["cc"] = cc
    if bcc:
        msg["bcc"] = bcc
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references
    return msg


async def send_prepared_draft(user_id: str, draft: dict) -> dict:
    """Actually send a draft (the payload posted to /api/gmail/send).

    Expected keys in `draft`: to, subject, body, cc?, bcc?, thread_id?,
    in_reply_to?, references?
    """
    try:
        service = await get_gmail_service(user_id)
    except GmailNotConnectedError as e:
        return {"error": str(e), "not_connected": True}

    def _send():
        msg = _build_mime(
            to=draft["to"],
            subject=draft.get("subject", ""),
            body=draft["body"],
            cc=draft.get("cc", ""),
            bcc=draft.get("bcc", ""),
            in_reply_to=draft.get("in_reply_to", ""),
            references=draft.get("references", ""),
        )
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        message = {"raw": raw}
        if draft.get("thread_id"):
            message["threadId"] = draft["thread_id"]
        return service.users().messages().send(userId="me", body=message).execute()

    result = await asyncio.to_thread(_send)
    return {
        "success": True,
        "message_id": result.get("id"),
        "thread_id": result.get("threadId", ""),
        "to": draft["to"],
        "cc": draft.get("cc", ""),
        "subject": draft.get("subject", ""),
    }


async def handler(
    user_id: str,
    body: str,
    to: str = "",
    subject: str = "",
    cc: str = "",
    bcc: str = "",
    thread_id: str | None = None,
    reply_to_message_id: str | None = None,
) -> dict:
    try:
        service = await get_gmail_service(user_id)
    except GmailNotConnectedError as e:
        return {"error": str(e), "not_connected": True}
    except Exception as e:
        return {"error": str(e)}
    try:
        return await asyncio.to_thread(
            _prepare_sync,
            service,
            body,
            to,
            subject,
            cc,
            bcc,
            thread_id,
            reply_to_message_id,
        )
    except Exception as e:
        return {"error": str(e)}
