"""Gmail send tool for the agent."""

import asyncio
import base64
from email.mime.text import MIMEText

from .gmail_auth import get_gmail_service

SCHEMA = {
    "name": "gmail_send",
    "description": (
        "Send an email via Gmail. Can compose new emails or reply to existing threads. "
        "Always confirm with the user before sending."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "to": {"type": "string", "description": "Recipient email address"},
            "subject": {"type": "string", "description": "Email subject line"},
            "body": {"type": "string", "description": "Email body text (plain text)"},
            "cc": {"type": "string", "description": "CC recipients (comma-separated)"},
            "bcc": {"type": "string", "description": "BCC recipients (comma-separated)"},
            "thread_id": {
                "type": "string",
                "description": "Thread ID to reply to an existing conversation",
            },
        },
        "required": ["to", "subject", "body"],
    },
}


def _send_sync(
    to: str,
    subject: str,
    body: str,
    cc: str = "",
    bcc: str = "",
    thread_id: str | None = None,
) -> dict:
    service = get_gmail_service()

    msg = MIMEText(body)
    msg["to"] = to
    msg["subject"] = subject
    if cc:
        msg["cc"] = cc
    if bcc:
        msg["bcc"] = bcc

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    message = {"raw": raw}
    if thread_id:
        message["threadId"] = thread_id

    result = service.users().messages().send(userId="me", body=message).execute()
    return {
        "success": True,
        "message_id": result["id"],
        "thread_id": result.get("threadId", ""),
        "to": to,
        "subject": subject,
    }


async def handler(
    to: str,
    subject: str,
    body: str,
    cc: str = "",
    bcc: str = "",
    thread_id: str | None = None,
) -> dict:
    try:
        return await asyncio.to_thread(
            _send_sync, to, subject, body, cc, bcc, thread_id
        )
    except Exception as e:
        return {"error": str(e)}
