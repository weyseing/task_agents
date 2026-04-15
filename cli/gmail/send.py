#!/usr/bin/env python3
"""Send emails via Gmail."""

import argparse
import base64
import sys
from email.mime.text import MIMEText

sys.path.insert(0, "/cli/gmail")
from auth import get_gmail_service


def create_message(to: str, subject: str, body: str, sender_name: str = "",
                   cc: str = "", bcc: str = "") -> dict:
    msg = MIMEText(body)
    msg["to"] = to
    msg["subject"] = subject
    if sender_name:
        msg["from"] = f"{sender_name} <me>"
    if cc:
        msg["cc"] = cc
    if bcc:
        msg["bcc"] = bcc
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    return {"raw": raw}


def send_message(service, message: dict, thread_id: str | None = None) -> dict:
    if thread_id:
        message["threadId"] = thread_id
    result = service.users().messages().send(userId="me", body=message).execute()
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Send an email via Gmail.",
        epilog="""Examples:
  python /cli/gmail/send.py --to user@example.com -s "Hello" -b "Hi there"
  python /cli/gmail/send.py --to user@example.com -s "Hello" -b "Hi" --name "Jeremy"
  python /cli/gmail/send.py --to user@example.com -s "Hello" --body-file message.txt
  python /cli/gmail/send.py --to user@example.com -s "Re: thread" -b "reply" --thread-id <id>
  python /cli/gmail/send.py --to a@x.com --cc b@x.com --bcc c@x.com -s "Hi" -b "Body" """,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--to", required=True, help="Recipient email address")
    parser.add_argument("--subject", "-s", required=True, help="Email subject")
    parser.add_argument("--body", "-b", default=None, help="Email body text")
    parser.add_argument("--body-file", default=None, help="Read body from file")
    parser.add_argument("--name", default="", help="Sender display name (e.g. 'Jeremy Heng')")
    parser.add_argument("--cc", default="", help="CC recipients (comma-separated)")
    parser.add_argument("--bcc", default="", help="BCC recipients (comma-separated)")
    parser.add_argument("--thread-id", default=None, help="Thread ID for replies")
    args = parser.parse_args()

    # Resolve body: flag > file > stdin
    if args.body:
        body = args.body
    elif args.body_file:
        with open(args.body_file) as f:
            body = f.read()
    elif not sys.stdin.isatty():
        body = sys.stdin.read()
    else:
        print("Error: provide --body, --body-file, or pipe via stdin", file=sys.stderr)
        sys.exit(1)

    service = get_gmail_service()
    message = create_message(args.to, args.subject, body, sender_name=args.name,
                             cc=args.cc, bcc=args.bcc)
    result = send_message(service, message, thread_id=args.thread_id)

    print(f"Sent! Message ID: {result['id']}")
    if result.get("threadId"):
        print(f"Thread ID: {result['threadId']}")


if __name__ == "__main__":
    main()
