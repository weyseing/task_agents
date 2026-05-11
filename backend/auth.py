"""Pseudo-auth shim until real user auth lands.

Frontend generates a stable UUID per browser, persists it in localStorage,
and sends it on every API call as the X-User-Id header. When real auth
arrives, replace current_user_id() with the session-derived user id and
migrate existing gmail_credentials rows.
"""

from fastapi import Request

DEFAULT_USER_ID = "default-user"


def current_user_id(request: Request) -> str:
    return request.headers.get("X-User-Id") or DEFAULT_USER_ID
