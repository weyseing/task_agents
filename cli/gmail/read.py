#!/usr/bin/env python3
"""Read emails from Gmail."""

import argparse
import base64
import html
import re
import sys

sys.path.insert(0, "/cli/gmail")
from auth import get_gmail_service


def get_header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def decode_body(payload: dict) -> str:
    """Extract plain text body from message payload."""
    if payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")

    parts = payload.get("parts", [])
    for part in parts:
        mime = part.get("mimeType", "")
        if mime == "text/plain" and part.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="replace")

    # Fallback: try nested parts or html
    for part in parts:
        if part.get("parts"):
            result = decode_body(part)
            if result:
                return result
        if part.get("mimeType") == "text/html" and part.get("body", {}).get("data"):
            raw_html = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="replace")
            text = re.sub(r"<[^>]+>", "", raw_html)
            return html.unescape(text)

    return "(no readable body)"


def print_message(msg: dict, full: bool = False):
    headers = msg.get("payload", {}).get("headers", [])
    subject = get_header(headers, "Subject") or "(no subject)"
    sender = get_header(headers, "From")
    date = get_header(headers, "Date")
    snippet = msg.get("snippet", "")
    msg_id = msg["id"]
    labels = msg.get("labelIds", [])

    unread = "UNREAD" in labels
    marker = " [UNREAD]" if unread else ""

    print(f"{'─' * 70}")
    print(f"  ID:      {msg_id}")
    print(f"  From:    {sender}")
    print(f"  Date:    {date}")
    print(f"  Subject: {subject}{marker}")

    if full:
        body = decode_body(msg.get("payload", {}))
        print(f"{'─' * 70}")
        print(body.strip())
    else:
        print(f"  Preview: {snippet[:120]}")

    print()


def list_messages(service, query: str, max_results: int):
    result = service.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()

    messages = result.get("messages", [])
    if not messages:
        print("No messages found.")
        return

    print(f"\nFound {len(messages)} message(s):\n")

    for entry in messages:
        msg = service.users().messages().get(
            userId="me", id=entry["id"], format="metadata",
            metadataHeaders=["From", "Subject", "Date"],
        ).execute()
        print_message(msg, full=False)


def read_message(service, msg_id: str):
    msg = service.users().messages().get(
        userId="me", id=msg_id, format="full"
    ).execute()
    print_message(msg, full=True)


def main():
    parser = argparse.ArgumentParser(
        description="Read emails from Gmail.",
        epilog="""Examples:
  python /cli/gmail/read.py                          # latest 10 inbox messages
  python /cli/gmail/read.py --max 5                  # latest 5
  python /cli/gmail/read.py -q "from:boss"           # search by sender
  python /cli/gmail/read.py -q "subject:invoice"     # search by subject
  python /cli/gmail/read.py -q "after:2026/04/15"    # search by date
  python /cli/gmail/read.py --id <message_id>        # read full message
  python /cli/gmail/read.py --unread                 # unread only""",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--max", type=int, default=10, help="Max messages to list (default: 10)")
    parser.add_argument("--query", "-q", type=str, default="", help="Gmail search query (same syntax as Gmail search bar)")
    parser.add_argument("--id", type=str, default=None, help="Read a specific message by ID (shows full body)")
    parser.add_argument("--unread", action="store_true", help="Show unread messages only")
    args = parser.parse_args()

    service = get_gmail_service()

    if args.id:
        read_message(service, args.id)
    else:
        query = args.query
        if args.unread:
            query = f"is:unread {query}".strip()
        if not query:
            query = "in:inbox"
        list_messages(service, query, args.max)


if __name__ == "__main__":
    main()
