"""Cookie-based session auth.

Sessions are opaque random tokens stored in the `sessions` table.
The token is set as an HttpOnly cookie at sign-in; every authenticated
endpoint reads it via `current_user_id` (which also slides the expiry).
"""

import os
import secrets

from fastapi import HTTPException, Request, Response

from db import delete_session, get_session_user_id, touch_session

SESSION_COOKIE = "session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days, sliding

# DEV=1 (set in docker-compose) means localhost cross-port: keep Lax + non-secure.
# In prod the frontend and backend live on different sites, so we need None+Secure.
_IS_DEV = os.getenv("DEV") == "1"
COOKIE_SAMESITE = "lax" if _IS_DEV else "none"
COOKIE_SECURE = not _IS_DEV


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def set_session_cookie(response: Response, token: str):
    response.set_cookie(
        SESSION_COOKIE,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def clear_session_cookie(response: Response):
    # Match the attributes used at set time so the browser actually clears it.
    response.set_cookie(
        SESSION_COOKIE,
        value="",
        max_age=0,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


async def current_user_id(request: Request) -> str:
    """Resolve the requesting user from the session cookie.

    Raises 401 if missing or expired. On success, slides the session
    forward so active users stay logged in indefinitely.
    """
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = await get_session_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Session expired")
    await touch_session(token, SESSION_TTL_SECONDS)
    return user_id


async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await delete_session(token)
    clear_session_cookie(response)
