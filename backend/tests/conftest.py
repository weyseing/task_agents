"""Shared pytest fixtures.

Bootstraps the FastAPI app for tests without touching Postgres or Google:
  - `STATE_SECRET` is pinned to a known value so signing is deterministic
  - `init_db` / `close_db` are no-ops
  - The DB module's `pool` and helper functions are replaced with AsyncMocks
"""

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

# Pin env BEFORE importing the app — sso.py reads these at import time.
os.environ.setdefault("STATE_SECRET", "test-state-secret")
os.environ.setdefault("SESSION_SECRET", "test-state-secret")
os.environ.setdefault("GMAIL_OAUTH_CLIENT_ID", "test-client-id")
os.environ.setdefault("GMAIL_OAUTH_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GMAIL_OAUTH_REDIRECT_URI", "http://localhost:8000/api/gmail/oauth/callback")
os.environ.setdefault("DEV", "1")
os.environ.setdefault("FRONTEND_ORIGIN", "http://localhost:8891")
os.environ.setdefault("DATABASE_URL", "postgresql://test/test")

# Make `backend/` importable so `import main`, `import sso` work from the tests dir.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="session", autouse=True)
def _patch_db(session_mocker=None):
    """Replace every db.* coroutine with an AsyncMock so nothing hits Postgres."""
    import db

    db.init_db = AsyncMock()
    db.close_db = AsyncMock()
    db.get_session_user_id = AsyncMock(return_value=None)
    db.touch_session = AsyncMock()
    db.delete_session = AsyncMock()
    db.create_session = AsyncMock()
    db.get_user_by_id = AsyncMock(return_value=None)
    db.get_user_by_google_sub = AsyncMock(return_value=None)
    db.upsert_user = AsyncMock(return_value="00000000-0000-0000-0000-000000000001")
    db.upsert_gmail_creds = AsyncMock()
    db.delete_gmail_creds = AsyncMock()
    db.get_gmail_creds = AsyncMock(return_value=None)
    db.get_conversations = AsyncMock(return_value=[])
    db.get_conversation_messages = AsyncMock(return_value=[])
    db.create_conversation = AsyncMock(return_value="00000000-0000-0000-0000-000000000002")
    db.update_conversation_title = AsyncMock()
    db.delete_conversation = AsyncMock()
    db.conversation_belongs_to = AsyncMock(return_value=False)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app)
