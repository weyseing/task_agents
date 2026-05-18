"""Combined Google SSO + Gmail OAuth.

One Google consent screen grants both sign-in identity (openid/email/profile)
and Gmail access (gmail.readonly, gmail.send). The callback:
  1. exchanges the code for tokens
  2. upserts a `users` row from the id_token claims
  3. upserts `gmail_credentials` so the agent tools work immediately
  4. creates a server-side session and sets an HttpOnly cookie
"""

import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from google_auth_oauthlib.flow import Flow

from auth import (
    current_user_id,
    logout as session_logout,
    new_session_token,
    set_session_cookie,
    SESSION_TTL_SECONDS,
)
from db import (
    create_session,
    delete_gmail_creds,
    get_gmail_creds,
    get_user_by_id,
    upsert_gmail_creds,
    upsert_user,
)

router = APIRouter()

CLIENT_ID = os.getenv("GMAIL_OAUTH_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GMAIL_OAUTH_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("GMAIL_OAUTH_REDIRECT_URI", "")

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    # Google Sheets export (creates Sheets in user's Drive)
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]

# HMAC the state parameter so a forged callback can't attach tokens to a
# session the attacker controls.
STATE_SECRET = (
    os.getenv("SESSION_SECRET") or CLIENT_SECRET or "dev-state-secret"
).encode()
STATE_MAX_AGE_SECONDS = 600


def _client_config() -> dict:
    return {
        "web": {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [REDIRECT_URI],
        }
    }


def _sign_state() -> str:
    nonce = secrets.token_urlsafe(16)
    ts = str(int(time.time()))
    payload = f"{ts}|{nonce}"
    sig = hmac.new(STATE_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}|{sig}"


def _verify_state(state: str):
    try:
        ts, nonce, sig = state.split("|", 2)
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed state")
    payload = f"{ts}|{nonce}"
    expected = hmac.new(STATE_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="Invalid state signature")
    if int(time.time()) - int(ts) > STATE_MAX_AGE_SECONDS:
        raise HTTPException(status_code=400, detail="State expired")


def _extract_identity(creds) -> dict:
    """Read sub/email/name/picture from the id_token, fall back to userinfo."""
    id_token = getattr(creds, "id_token", None)
    if id_token:
        try:
            import base64

            payload_b64 = id_token.split(".")[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
            if payload.get("sub") and payload.get("email"):
                return {
                    "sub": payload["sub"],
                    "email": payload["email"],
                    "name": payload.get("name"),
                    "picture": payload.get("picture"),
                }
        except Exception:
            pass

    from googleapiclient.discovery import build

    svc = build("oauth2", "v2", credentials=creds)
    info = svc.userinfo().get().execute()
    return {
        "sub": info.get("id"),
        "email": info.get("email"),
        "name": info.get("name"),
        "picture": info.get("picture"),
    }


# --- Auth routes ---


@router.get("/api/auth/google/start")
async def google_start():
    """Return the Google auth URL. Frontend opens this URL in a popup."""
    if not CLIENT_ID or not CLIENT_SECRET or not REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="GMAIL_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI not configured",
        )
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES)
    flow.redirect_uri = REDIRECT_URI
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=_sign_state(),
    )
    return JSONResponse({"auth_url": auth_url})


@router.get("/api/gmail/oauth/callback")
async def google_callback(request: Request):
    """Google redirects here after the user approves the consent screen.

    Path kept as `/api/gmail/oauth/callback` so the existing OAuth client's
    registered redirect URI doesn't need to change in Google Cloud Console.
    """
    error = request.query_params.get("error")
    if error:
        return HTMLResponse(_popup_html(ok=False, message=error), status_code=400)

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    _verify_state(state)

    flow = Flow.from_client_config(_client_config(), scopes=SCOPES)
    flow.redirect_uri = REDIRECT_URI
    flow.fetch_token(code=code)
    creds = flow.credentials

    identity = _extract_identity(creds)
    if not identity.get("sub") or not identity.get("email"):
        raise HTTPException(status_code=400, detail="Could not read Google identity")

    user_id = await upsert_user(
        google_sub=identity["sub"],
        email=identity["email"],
        name=identity.get("name"),
        picture=identity.get("picture"),
    )

    # Same consent screen authorized Gmail scopes — persist for tool use.
    await upsert_gmail_creds(user_id, identity["email"], json.loads(creds.to_json()))

    token = new_session_token()
    await create_session(user_id, token, SESSION_TTL_SECONDS)

    response = HTMLResponse(_popup_html(ok=True, message=identity["email"]))
    set_session_cookie(response, token)
    return response


@router.get("/api/auth/me")
async def me(user_id: str = Depends(current_user_id)):
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return JSONResponse(user)


@router.post("/api/auth/logout")
async def logout(request: Request):
    response = JSONResponse({"ok": True})
    await session_logout(request, response)
    return response


# --- Gmail status (driven by the same OAuth grant) ---


@router.get("/api/gmail/status")
async def gmail_status(user_id: str = Depends(current_user_id)):
    row = await get_gmail_creds(user_id)
    if not row:
        return JSONResponse({"connected": False, "email": None})
    return JSONResponse({"connected": True, "email": row["email"]})


@router.post("/api/gmail/disconnect")
async def gmail_disconnect(user_id: str = Depends(current_user_id)):
    await delete_gmail_creds(user_id)
    return JSONResponse({"ok": True})


def _popup_html(ok: bool, message: str) -> str:
    status = "Signed in" if ok else "Sign-in failed"
    color = "#10b981" if ok else "#ef4444"
    glyph = "&#10003;" if ok else "&#10007;"
    return f"""<!doctype html>
<html><head><title>{status}</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa;">
  <div style="text-align:center;">
    <div style="font-size:48px;color:{color};">{glyph}</div>
    <h2 style="margin:8px 0;">{status}</h2>
    <p style="opacity:0.7;">{message}</p>
    <p style="opacity:0.5;font-size:14px;">You can close this window.</p>
  </div>
  <script>setTimeout(() => window.close(), 1500);</script>
</body></html>"""
