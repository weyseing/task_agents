"""Gmail read/search tool for the agent."""

import asyncio
import base64
import html
import re

from .gmail_auth import get_gmail_service

SCHEMA = {
    "name": "gmail_read",
    "description": (
        "Search and read emails from Gmail. "
        "Partial names work: 'from:john' matches all Johns. Never guess full email addresses. "
        "For time-based searches, use days_ago instead of date queries to avoid date math errors. "
        "To read a full email body, provide a message_id from a previous search."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Gmail search query (default: 'in:inbox'). Examples: 'from:john', 'subject:invoice', 'is:unread'. Do NOT include after:/before: dates here — use days_ago instead.",
            },
            "days_ago": {
                "type": "integer",
                "description": "Only return emails from the last N days. E.g. 7 for this week, 1 for today, 30 for this month.",
            },
            "max_results": {
                "type": "integer",
                "description": "Max messages to return (default: 5)",
            },
            "message_id": {
                "type": "string",
                "description": "Specific message ID to read full body",
            },
        },
    },
}


def _get_header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _decode_body(payload: dict) -> str:
    if payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"]).decode(
            "utf-8", errors="replace"
        )
    parts = payload.get("parts", [])
    for part in parts:
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(part["body"]["data"]).decode(
                "utf-8", errors="replace"
            )
    for part in parts:
        if part.get("parts"):
            result = _decode_body(part)
            if result:
                return result
        if part.get("mimeType") == "text/html" and part.get("body", {}).get("data"):
            raw_html = base64.urlsafe_b64decode(part["body"]["data"]).decode(
                "utf-8", errors="replace"
            )
            text = re.sub(r"<[^>]+>", "", raw_html)
            return html.unescape(text)
    return ""


def _read_sync(
    query: str = "in:inbox", max_results: int = 5, message_id: str | None = None, days_ago: int | None = None,
) -> dict:
    service = get_gmail_service()

    # Inject date filter from days_ago using Gmail's native relative syntax
    if days_ago is not None:
        query = f"{query} newer_than:{days_ago}d".strip()

    if message_id:
        msg = (
            service.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute()
        )
        headers = msg.get("payload", {}).get("headers", [])
        return {
            "type": "email_detail",
            "email": {
                "id": msg["id"],
                "thread_id": msg.get("threadId", ""),
                "from": _get_header(headers, "From"),
                "to": _get_header(headers, "To"),
                "subject": _get_header(headers, "Subject") or "(no subject)",
                "date": _get_header(headers, "Date"),
                "body": _decode_body(msg.get("payload", {})),
                "unread": "UNREAD" in msg.get("labelIds", []),
            },
        }

    result = (
        service.users()
        .messages()
        .list(userId="me", q=query, maxResults=max_results)
        .execute()
    )
    messages = result.get("messages", [])

    if not messages:
        return {"type": "email_list", "emails": [], "query": query}

    emails = []
    for entry in messages:
        msg = (
            service.users()
            .messages()
            .get(
                userId="me",
                id=entry["id"],
                format="metadata",
                metadataHeaders=["From", "Subject", "Date"],
            )
            .execute()
        )
        headers = msg.get("payload", {}).get("headers", [])
        emails.append(
            {
                "id": msg["id"],
                "from": _get_header(headers, "From"),
                "subject": _get_header(headers, "Subject") or "(no subject)",
                "date": _get_header(headers, "Date"),
                "snippet": msg.get("snippet", ""),
                "unread": "UNREAD" in msg.get("labelIds", []),
            }
        )

    return {"type": "email_list", "emails": emails, "query": query}


async def handler(
    query: str = "in:inbox", max_results: int = 5, message_id: str | None = None, days_ago: int | None = None,
) -> dict:
    try:
        return await asyncio.to_thread(_read_sync, query, max_results, message_id, days_ago)
    except Exception as e:
        return {"error": str(e)}
