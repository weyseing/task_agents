"""Gmail OAuth2 authentication.

Run:
  python /cli/gmail/auth.py
  python /cli/gmail/auth.py --help
"""

import argparse
import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

DIR = Path("/cli/gmail")
CREDENTIALS_FILE = DIR / "credentials.json"
TOKEN_FILE = DIR / "token.json"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


def get_credentials() -> Credentials:
    """Get valid credentials, running OAuth flow if needed."""
    if not CREDENTIALS_FILE.exists():
        print(f"Error: {CREDENTIALS_FILE} not found.", file=sys.stderr)
        print(
            "\nPlace credentials.json in cli/gmail/ on the host.\n"
            "It will be mounted to /cli/gmail/ in the container.\n",
            file=sys.stderr,
        )
        sys.exit(1)

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                str(CREDENTIALS_FILE), SCOPES,
                redirect_uri="urn:ietf:wg:oauth:2.0:oob",
            )
            auth_url, _ = flow.authorization_url(prompt="consent")
            print(f"\nOpen this URL in your browser:\n\n{auth_url}\n")
            code = input("Enter the authorization code: ").strip()
            flow.fetch_token(code=code)
            creds = flow.credentials
        TOKEN_FILE.write_text(creds.to_json())

    return creds


def get_gmail_service():
    """Build and return an authenticated Gmail API service."""
    creds = get_credentials()
    return build("gmail", "v1", credentials=creds)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Authenticate with Gmail API via OAuth2.",
        epilog="""Setup:
  1. Go to https://console.cloud.google.com/apis/credentials
  2. Create OAuth 2.0 Client ID (Desktop app)
  3. Enable Gmail API
  4. Download JSON -> save as cli/gmail/credentials.json

Examples:
  python /cli/gmail/auth.py""",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.parse_args()

    get_credentials()
    print("Authentication successful!")
