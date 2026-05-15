"""End-to-end integration tests for /api/files.

Talks to the running stack (docker-compose):
  - API on http://localhost:8890
  - Postgres on localhost:5491
  - Real Cloudflare R2 bucket (creds in .env.local)

Run with:
    make test FILE=tests/test_files_integration.py
    make test M=integration              # all integration tests

Skipped automatically if the API isn't reachable (e.g. you haven't run
`docker compose up`).
"""

import os
import secrets
import sys
import uuid
from pathlib import Path

import asyncpg
import httpx
import pytest
import pytest_asyncio
from botocore.exceptions import ClientError
from dotenv import load_dotenv

# Make `backend/` importable so `from storage import …` works from tests/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load real R2 creds from .env.local (one dir up from backend/).
load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

from storage import R2_BUCKET, _client  # noqa: E402 — requires env above


API = os.getenv("API_BASE", "http://localhost:8890")
DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://taskagents:taskagents@localhost:5491/taskagents",
)


def _stack_up() -> bool:
    """Skip the whole module if the stack isn't up — gives a friendly
    message instead of a wall of connection-refused tracebacks."""
    try:
        r = httpx.get(f"{API}/health", timeout=1.0)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


# Every test in this file hits a live Postgres + live R2, so it's `db` and
# `slow` by definition. We also include `security` — cross-user isolation
# is asserted in a dedicated test. Individual tests add `integration` to
# indicate HOW they exercise the code (live HTTP).
pytestmark = [
    pytest.mark.db,
    pytest.mark.slow,
    pytest.mark.security,
    pytest.mark.skipif(
        not _stack_up(),
        reason=f"API not reachable at {API} — start `docker compose up`",
    ),
]


# --- Fixtures --------------------------------------------------------------


@pytest_asyncio.fixture
async def session_for_existing_user():
    """Mint a fresh 1-hour session for the first user in the DB.

    Yields (user_id, session_token); cleans up the session afterwards.
    """
    conn = await asyncpg.connect(DB_URL)
    try:
        row = await conn.fetchrow("SELECT id FROM users ORDER BY created_at LIMIT 1")
        if not row:
            pytest.skip("no users in DB — log in via OAuth first")
        user_id = str(row["id"])
        token = secrets.token_urlsafe(32)
        await conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) "
            "VALUES ($1, $2, now() + interval '1 hour')",
            token,
            uuid.UUID(user_id),
        )
    finally:
        await conn.close()

    yield user_id, token

    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute("DELETE FROM sessions WHERE token = $1", token)
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def fresh_other_user():
    """Create a brand-new user + session purely for cross-user isolation
    checks. Cleaned up after the test (CASCADE removes the session too)."""
    user_id = str(uuid.uuid4())
    token = secrets.token_urlsafe(32)
    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute(
            "INSERT INTO users (id, google_sub, email) VALUES ($1, $2, $3)",
            uuid.UUID(user_id),
            f"isolation-test-{user_id}",
            f"isolation+{user_id[:8]}@example.com",
        )
        await conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) "
            "VALUES ($1, $2, now() + interval '1 hour')",
            token,
            uuid.UUID(user_id),
        )
    finally:
        await conn.close()

    yield user_id, token

    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute("DELETE FROM users WHERE id = $1", uuid.UUID(user_id))
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def authed_client(session_for_existing_user):
    """An httpx client carrying the session cookie."""
    _, token = session_for_existing_user
    async with httpx.AsyncClient(base_url=API, cookies={"session": token}) as c:
        yield c


@pytest_asyncio.fixture
async def other_client(fresh_other_user):
    """An httpx client for the throwaway 'other' user."""
    _, token = fresh_other_user
    async with httpx.AsyncClient(base_url=API, cookies={"session": token}) as c:
        yield c


@pytest_asyncio.fixture
async def cleanup(authed_client):
    """Test appends file/folder IDs here; they get deleted after the test.

    Best-effort — failures during cleanup are ignored so they don't mask
    the actual test failure.
    """
    ids: list[str] = []
    yield ids
    for fid in ids:
        try:
            await authed_client.delete(f"/api/files/{fid}")
        except Exception:
            pass


# --- Helpers ---------------------------------------------------------------


async def _create_file(client, *, content, name="pytest.md", type_="md", parent_id=None):
    r = await client.post(
        "/api/files",
        json={
            "name": name,
            "kind": "file",
            "type": type_,
            "parent_id": parent_id,
            "content": content,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _create_folder(client, *, name="pytest-folder", parent_id=None):
    r = await client.post(
        "/api/files",
        json={"name": name, "kind": "folder", "parent_id": parent_id},
    )
    assert r.status_code == 200, r.text
    return r.json()


# --- Tests -----------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_create_folder(authed_client, cleanup):
    """POST a folder and confirm it appears in the tree."""
    folder = await _create_folder(authed_client)
    cleanup.append(folder["id"])

    assert folder["kind"] == "folder"
    assert folder["r2_key"] is None

    tree = (await authed_client.get("/api/files")).json()
    assert any(c["id"] == folder["id"] for c in tree["children"])


@pytest.mark.integration
@pytest.mark.asyncio
async def test_create_file_writes_to_r2(authed_client, cleanup, session_for_existing_user):
    """POST a file and confirm R2 actually received the bytes."""
    user_id, _ = session_for_existing_user

    f = await _create_file(authed_client, content="hello r2")
    cleanup.append(f["id"])

    assert f["r2_key"] == f"u/{user_id}/{f['id']}"
    assert f["size"] > 0

    head = _client().head_object(Bucket=R2_BUCKET, Key=f["r2_key"])
    assert head["ContentLength"] == f["size"]
    assert head["ContentType"] == "application/json"


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "content",
    [
        "# markdown string\n",
        {"columns": ["A", "B"], "rows": [["1", "2"], ["3", "4"]]},
        [1, 2, 3, {"nested": True}],
    ],
    ids=["string", "object", "array"],
)
async def test_content_roundtrip(authed_client, cleanup, content):
    """Whatever JSON-shape you write, you get back identically."""
    f = await _create_file(authed_client, content=content)
    cleanup.append(f["id"])

    got = (await authed_client.get(f"/api/files/{f['id']}/content")).json()["content"]
    assert got == content


@pytest.mark.integration
@pytest.mark.asyncio
async def test_update_content(authed_client, cleanup):
    """PUT replaces content; subsequent GET reflects it."""
    f = await _create_file(authed_client, content="v1")
    cleanup.append(f["id"])

    r = await authed_client.put(
        f"/api/files/{f['id']}/content", json={"content": "v2 — updated"}
    )
    assert r.status_code == 200
    assert r.json()["size"] > 0

    got = (await authed_client.get(f"/api/files/{f['id']}/content")).json()["content"]
    assert got == "v2 — updated"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rename_file(authed_client, cleanup):
    """PATCH renames; tree reflects the new name."""
    f = await _create_file(authed_client, name="before.md", content="x")
    cleanup.append(f["id"])

    r = await authed_client.patch(f"/api/files/{f['id']}", json={"name": "after.md"})
    assert r.status_code == 200

    tree = (await authed_client.get("/api/files")).json()
    node = next(c for c in tree["children"] if c["id"] == f["id"])
    assert node["name"] == "after.md"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_delete_file_removes_r2_object(authed_client):
    """DELETE drops the DB row AND the R2 object."""
    f = await _create_file(authed_client, content="bye")
    key = f["r2_key"]

    r = await authed_client.delete(f"/api/files/{f['id']}")
    assert r.status_code == 200
    assert r.json()["r2_objects_deleted"] == 1

    with pytest.raises(ClientError) as exc:
        _client().head_object(Bucket=R2_BUCKET, Key=key)
    assert exc.value.response["Error"]["Code"] in ("404", "NoSuchKey")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_delete_folder_cascades_files_and_r2(authed_client):
    """Deleting a folder removes child rows AND their R2 objects."""
    folder = await _create_folder(authed_client)
    f1 = await _create_file(authed_client, name="a.md", content="A", parent_id=folder["id"])
    f2 = await _create_file(authed_client, name="b.md", content="B", parent_id=folder["id"])

    r = await authed_client.delete(f"/api/files/{folder['id']}")
    assert r.status_code == 200
    assert r.json()["r2_objects_deleted"] == 2

    for fx in (f1, f2):
        with pytest.raises(ClientError) as exc:
            _client().head_object(Bucket=R2_BUCKET, Key=fx["r2_key"])
        assert exc.value.response["Error"]["Code"] in ("404", "NoSuchKey")


# --- Cross-user isolation --------------------------------------------------
# These are the security boundary tests: another user must not be able to
# read or delete the first user's files.


@pytest.mark.integration
@pytest.mark.asyncio
async def test_isolation_foreign_user_sees_empty_tree(authed_client, other_client, cleanup):
    """Files created by user A do not appear in user B's tree."""
    f = await _create_file(authed_client, content="private to A")
    cleanup.append(f["id"])

    tree_b = (await other_client.get("/api/files")).json()
    assert tree_b["children"] == []


@pytest.mark.integration
@pytest.mark.asyncio
async def test_isolation_foreign_user_cannot_read(authed_client, other_client, cleanup):
    """User B gets 404 on GET of user A's file."""
    f = await _create_file(authed_client, content="secret")
    cleanup.append(f["id"])

    r = await other_client.get(f"/api/files/{f['id']}/content")
    assert r.status_code == 404


@pytest.mark.integration
@pytest.mark.asyncio
async def test_isolation_foreign_user_cannot_delete(authed_client, other_client, cleanup):
    """User B gets 404 on DELETE of user A's file, and the file remains."""
    f = await _create_file(authed_client, content="don't delete me")
    cleanup.append(f["id"])

    r = await other_client.delete(f"/api/files/{f['id']}")
    assert r.status_code == 404

    # Owner can still read it — the failed delete didn't drop it.
    r = await authed_client.get(f"/api/files/{f['id']}/content")
    assert r.status_code == 200
    assert r.json()["content"] == "don't delete me"
