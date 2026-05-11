"""Gmail OAuth2 credential loading for the backend.

Tokens are stored per-user in the `gmail_credentials` table.
The interactive OAuth flow itself lives in backend/main.py
(/api/gmail/oauth/start, /api/gmail/oauth/callback).
"""

import json

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from db import get_gmail_creds, upsert_gmail_creds

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]


class GmailNotConnectedError(Exception):
    """Raised when no usable Gmail credentials are available for this user."""


async def get_gmail_service(user_id: str):
    """Build a Gmail service for the given user.

    Loads token_json from the DB. If the access token is expired and a
    refresh_token is available, refreshes it and persists the new token_json
    back to the DB. Raises GmailNotConnectedError if no creds are stored or
    the stored creds can't be made valid.
    """
    row = await get_gmail_creds(user_id)
    if not row:
        raise GmailNotConnectedError(
            "Gmail is not connected for this user. Click 'Connect Gmail' to authorize."
        )

    creds = Credentials.from_authorized_user_info(row["token_json"], SCOPES)

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            await upsert_gmail_creds(
                user_id, row["email"], json.loads(creds.to_json())
            )
        else:
            raise GmailNotConnectedError(
                "Stored Gmail token is invalid. Please reconnect Gmail."
            )

    return build("gmail", "v1", credentials=creds)
