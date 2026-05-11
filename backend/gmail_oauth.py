"""Gmail OAuth web flow: start, callback, status, disconnect."""

import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from google_auth_oauthlib.flow import Flow

from auth import current_user_id
from db import delete_gmail_creds, get_gmail_creds, upsert_gmail_creds
from tools.gmail_auth import SCOPES

router = APIRouter(prefix="/api/gmail")

CLIENT_ID = os.getenv("GMAIL_OAUTH_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GMAIL_OAUTH_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("GMAIL_OAUTH_REDIRECT_URI", "")

# HMAC the state parameter so an attacker can't forge a callback that
# attaches their Gmail token to someone else's user_id.
STATE_SECRET = (
    os.getenv("GMAIL_OAUTH_STATE_SECRET") or CLIENT_SECRET or "dev-state-secret"
).encode()
STATE_MAX_AGE_SECONDS = 600  # 10 minutes


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


def _sign_state(user_id: str) -> str:
    nonce = secrets.token_urlsafe(16)
    ts = str(int(time.time()))
    payload = f"{user_id}|{ts}|{nonce}"
    sig = hmac.new(STATE_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}|{sig}"


def _verify_state(state: str) -> str:
    try:
        user_id, ts, nonce, sig = state.split("|", 3)
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed state")
    payload = f"{user_id}|{ts}|{nonce}"
    expected = hmac.new(STATE_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="Invalid state signature")
    if int(time.time()) - int(ts) > STATE_MAX_AGE_SECONDS:
        raise HTTPException(status_code=400, detail="State expired")
    return user_id


@router.get("/oauth/start")
async def oauth_start(request: Request):
    """Return the Google auth URL. Frontend opens this URL in a popup.

    Returns JSON (not a redirect) so the X-User-Id header is honored;
    cross-window navigation does not propagate custom headers.
    """
    if not CLIENT_ID or not CLIENT_SECRET or not REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="GMAIL_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI not configured",
        )
    user_id = current_user_id(request)
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES)
    flow.redirect_uri = REDIRECT_URI
    auth_url, _state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=_sign_state(user_id),
    )
    return JSONResponse({"auth_url": auth_url})


@router.get("/oauth/callback")
async def oauth_callback(request: Request):
    error = request.query_params.get("error")
    if error:
        return HTMLResponse(_popup_html(ok=False, message=error), status_code=400)

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    user_id = _verify_state(state)

    flow = Flow.from_client_config(_client_config(), scopes=SCOPES)
    flow.redirect_uri = REDIRECT_URI
    flow.fetch_token(code=code)
    creds = flow.credentials

    # Fetch the authenticated user's email from the id_token / userinfo
    email = _extract_email(creds)

    await upsert_gmail_creds(user_id, email, json.loads(creds.to_json()))

    return HTMLResponse(_popup_html(ok=True, message=email))


@router.get("/status")
async def gmail_status(request: Request):
    user_id = current_user_id(request)
    row = await get_gmail_creds(user_id)
    if not row:
        return JSONResponse({"connected": False, "email": None})
    return JSONResponse({"connected": True, "email": row["email"]})


@router.post("/disconnect")
async def gmail_disconnect(request: Request):
    user_id = current_user_id(request)
    await delete_gmail_creds(user_id)
    return JSONResponse({"ok": True})


def _extract_email(creds) -> str:
    """Try id_token first; fall back to a userinfo call if needed."""
    id_token = getattr(creds, "id_token", None)
    if id_token:
        try:
            import base64

            payload_b64 = id_token.split(".")[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
            if payload.get("email"):
                return payload["email"]
        except Exception:
            pass

    # Fallback: call userinfo endpoint
    from googleapiclient.discovery import build

    svc = build("oauth2", "v2", credentials=creds)
    info = svc.userinfo().get().execute()
    return info.get("email", "")


def _popup_html(ok: bool, message: str) -> str:
    status = "Connected" if ok else "Connection failed"
    color = "#10b981" if ok else "#ef4444"
    return f"""<!doctype html>
<html><head><title>{status}</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa;">
  <div style="text-align:center;">
    <div style="font-size:48px;color:{color};">{'✓' if ok else '✗'}</div>
    <h2 style="margin:8px 0;">{status}</h2>
    <p style="opacity:0.7;">{message}</p>
    <p style="opacity:0.5;font-size:14px;">You can close this window.</p>
  </div>
  <script>setTimeout(() => window.close(), 1500);</script>
</body></html>"""
