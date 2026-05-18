"""Export a workbook to CSV (bytes) or to a new Google Sheet in the user's Drive.

Uses the user's existing Google OAuth credentials (the same token used for
Gmail). New scopes required for Sheets export:
  - https://www.googleapis.com/auth/drive.file
  - https://www.googleapis.com/auth/spreadsheets

Existing users authenticated before these scopes were added need to reconnect
(sign out and back in) for the broader consent.
"""

import csv
import io
import json
from typing import Any

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from db import get_gmail_creds, upsert_gmail_creds


# Scopes we need to push a Sheet into the user's Drive.
SHEETS_SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]


class SheetsNotAuthorizedError(Exception):
    """The user has Gmail creds but didn't grant Sheets/Drive scopes.

    Frontend should prompt them to reconnect (sign out + sign in) so the
    OAuth consent screen runs again with the expanded SCOPES list.
    """


def to_csv_bytes(content: Any) -> bytes:
    """Serialise a sheet content dict {columns, rows} to CSV bytes."""
    if not isinstance(content, dict):
        return b""
    columns = content.get("columns") or []
    rows = content.get("rows") or []
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow([str(c) for c in columns])
    for r in rows:
        writer.writerow([("" if c is None else str(c)) for c in r])
    return buf.getvalue().encode("utf-8-sig")  # BOM so Excel/Sheets auto-detect UTF-8


async def _get_authorized_creds(user_id: str) -> Credentials:
    """Load the user's stored Google creds and refresh if needed.

    Raises SheetsNotAuthorizedError if the stored token doesn't include the
    Sheets/Drive scopes (so the caller can return a 409 to the frontend).
    """
    row = await get_gmail_creds(user_id)
    if not row:
        raise SheetsNotAuthorizedError(
            "Google account is not connected. Sign in with Google first."
        )
    # We must construct Credentials with the FULL scope set we want, not just
    # what the token has — Credentials.has_scopes() compares the request set
    # against the granted set. Pass the original token's scopes for refresh
    # to work, and check granted scopes separately.
    token_info = row["token_json"]
    granted = set(token_info.get("scopes") or [])
    missing = [s for s in SHEETS_SCOPES if s not in granted]
    if missing:
        raise SheetsNotAuthorizedError(
            "Google account needs Sheets + Drive access. "
            "Sign out and sign back in to grant the new scope."
        )

    creds = Credentials.from_authorized_user_info(token_info, list(granted))
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except RefreshError as e:
                raise SheetsNotAuthorizedError(
                    f"Stored Google token is no longer valid: {e}. Sign in again."
                )
            await upsert_gmail_creds(user_id, row["email"], json.loads(creds.to_json()))
        else:
            raise SheetsNotAuthorizedError(
                "Stored Google token is invalid. Sign in again."
            )
    return creds


async def to_google_sheet(user_id: str, title: str, content: Any) -> dict:
    """Create a new Google Sheet in the user's Drive and return its URL.

    Returns {url, spreadsheet_id, title, rows, columns} on success.
    Raises SheetsNotAuthorizedError if creds aren't usable.
    """
    creds = await _get_authorized_creds(user_id)

    columns = (content or {}).get("columns") or []
    rows = (content or {}).get("rows") or []
    # First row in the Sheet = headers; rest = data
    values: list[list[str]] = [
        [str(c) for c in columns]
    ] + [
        [("" if c is None else str(c)) for c in r] for r in rows
    ]

    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
    try:
        created = sheets.spreadsheets().create(
            body={"properties": {"title": title}},
            fields="spreadsheetId,spreadsheetUrl",
        ).execute()
        spreadsheet_id = created["spreadsheetId"]
        url = created["spreadsheetUrl"]

        # Push values starting at A1
        if values:
            sheets.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range="A1",
                valueInputOption="USER_ENTERED",  # Lets Sheets evaluate formulas
                body={"values": values},
            ).execute()
    except HttpError as e:
        raise SheetsNotAuthorizedError(f"Google API error: {e}")

    return {
        "url": url,
        "spreadsheet_id": spreadsheet_id,
        "title": title,
        "rows": len(rows),
        "columns": len(columns),
    }
