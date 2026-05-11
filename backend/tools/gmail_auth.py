"""Gmail OAuth2 credential loading for the backend.

The interactive OAuth flow lives in cli/gmail/auth.py.
This module only loads / refreshes existing tokens for tool calls.
"""

from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

DIR = Path("/cli/gmail")
CREDENTIALS_FILE = DIR / "credentials.json"
TOKEN_FILE = DIR / "token.json"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


class GmailNotConnectedError(Exception):
    """Raised when no usable Gmail credentials are available for this request."""


def get_credentials() -> Credentials:
    """Get valid credentials, running OAuth flow if needed."""
    if not CREDENTIALS_FILE.exists():
        raise GmailNotConnectedError(
            f"Gmail credentials not found at {CREDENTIALS_FILE}. "
            "Connect a Gmail account first."
        )

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            raise GmailNotConnectedError(
                "No valid Gmail token. Connect a Gmail account first."
            )
        TOKEN_FILE.write_text(creds.to_json())

    return creds


def get_gmail_service():
    """Build and return an authenticated Gmail API service."""
    creds = get_credentials()
    return build("gmail", "v1", credentials=creds)
