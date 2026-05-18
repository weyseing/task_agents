import json
import os
import uuid

import asyncpg

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://taskagents:taskagents@localhost:5491/taskagents"
)

pool: asyncpg.Pool | None = None


async def init_db():
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                google_sub TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL,
                name TEXT,
                picture TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS conversations (
                id UUID PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY,
                conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                thinking TEXT,
                tool_calls JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS gmail_credentials (
                user_id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                token_json JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS files (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                parent_id UUID REFERENCES files(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('file', 'folder')),
                type TEXT,
                size BIGINT NOT NULL DEFAULT 0,
                r2_key TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id, parent_id);
        """)
        # Migrations for existing tables — must run before indexes that
        # reference the migrated columns.
        await conn.execute(
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_calls JSONB"
        )
        await conn.execute(
            "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID"
        )
        # Legacy: per-file conversations. Replaced by `workspace`-scoped chats.
        await conn.execute(
            "ALTER TABLE conversations DROP COLUMN IF EXISTS file_id"
        )
        await conn.execute(
            "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS workspace TEXT"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_conversations_user_updated "
            "ON conversations(user_id, updated_at DESC)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_conversations_workspace "
            "ON conversations(user_id, workspace) WHERE workspace IS NOT NULL"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_gmail_creds_email ON gmail_credentials(email)"
        )


async def close_db():
    global pool
    if pool:
        await pool.close()
        pool = None


# --- Users ---


async def get_user_by_google_sub(google_sub: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, google_sub, email, name, picture FROM users WHERE google_sub = $1",
            google_sub,
        )
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "google_sub": row["google_sub"],
        "email": row["email"],
        "name": row["name"],
        "picture": row["picture"],
    }


async def get_user_by_id(user_id: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, google_sub, email, name, picture FROM users WHERE id = $1",
            uuid.UUID(user_id),
        )
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "google_sub": row["google_sub"],
        "email": row["email"],
        "name": row["name"],
        "picture": row["picture"],
    }


async def upsert_user(
    google_sub: str, email: str, name: str | None, picture: str | None
) -> str:
    """Insert or update a user by google_sub. Returns users.id."""
    user_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (id, google_sub, email, name, picture)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (google_sub) DO UPDATE
              SET email = EXCLUDED.email,
                  name = EXCLUDED.name,
                  picture = EXCLUDED.picture,
                  updated_at = now()
            RETURNING id
            """,
            uuid.UUID(user_id),
            google_sub,
            email,
            name,
            picture,
        )
    return str(row["id"])


# --- Sessions ---


async def create_session(user_id: str, token: str, ttl_seconds: int):
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) "
            "VALUES ($1, $2, now() + ($3 || ' seconds')::interval)",
            token,
            uuid.UUID(user_id),
            str(ttl_seconds),
        )


async def get_session_user_id(token: str) -> str | None:
    """Return user_id if the session exists and is not expired, else None."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()",
            token,
        )
    return str(row["user_id"]) if row else None


async def touch_session(token: str, ttl_seconds: int):
    """Slide the session expiry forward."""
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE sessions SET expires_at = now() + ($2 || ' seconds')::interval "
            "WHERE token = $1",
            token,
            str(ttl_seconds),
        )


async def delete_session(token: str):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sessions WHERE token = $1", token)


# --- Conversations ---


async def create_conversation(user_id: str, title: str) -> str:
    conv_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)",
            uuid.UUID(conv_id),
            uuid.UUID(user_id),
            title,
        )
    return conv_id


async def get_or_create_workspace_conversation(
    user_id: str, workspace: str, title: str
) -> str:
    """Returns the most-recent workspace conv, creating one if none exist."""
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM conversations WHERE user_id = $1 AND workspace = $2 "
            "ORDER BY updated_at DESC LIMIT 1",
            uuid.UUID(user_id),
            workspace,
        )
        if existing:
            return str(existing)
        conv_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO conversations (id, user_id, title, workspace) "
            "VALUES ($1, $2, $3, $4)",
            uuid.UUID(conv_id),
            uuid.UUID(user_id),
            title,
            workspace,
        )
    return conv_id


async def create_workspace_conversation(
    user_id: str, workspace: str, title: str
) -> str:
    """Always creates a new conversation row (for 'New chat' flow)."""
    conv_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO conversations (id, user_id, title, workspace) "
            "VALUES ($1, $2, $3, $4)",
            uuid.UUID(conv_id),
            uuid.UUID(user_id),
            title,
            workspace,
        )
    return conv_id


async def get_workspace_conversation_id(user_id: str, workspace: str) -> str | None:
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM conversations WHERE user_id = $1 AND workspace = $2 "
            "ORDER BY updated_at DESC LIMIT 1",
            uuid.UUID(user_id),
            workspace,
        )
    return str(existing) if existing else None


async def list_workspace_conversations(
    user_id: str,
    workspace: str,
    *,
    limit: int = 50,
    before: str | None = None,
) -> list[dict]:
    """Workspace conversations newest first.

    Cursor pagination: pass `before=<iso-updated_at>` to fetch rows strictly
    older than that timestamp. Default page size 50.
    """
    limit = max(1, min(int(limit), 200))
    # Fetch one extra row to detect whether more pages exist without a count.
    async with pool.acquire() as conn:
        if before:
            from datetime import datetime
            cursor = datetime.fromisoformat(before.replace("Z", "+00:00"))
            rows = await conn.fetch(
                """
                SELECT c.id, c.title, c.created_at, c.updated_at,
                       (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
                FROM conversations c
                WHERE c.user_id = $1 AND c.workspace = $2 AND c.updated_at < $3
                ORDER BY c.updated_at DESC
                LIMIT $4
                """,
                uuid.UUID(user_id),
                workspace,
                cursor,
                limit + 1,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT c.id, c.title, c.created_at, c.updated_at,
                       (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
                FROM conversations c
                WHERE c.user_id = $1 AND c.workspace = $2
                ORDER BY c.updated_at DESC
                LIMIT $3
                """,
                uuid.UUID(user_id),
                workspace,
                limit + 1,
            )
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "created_at": r["created_at"].isoformat(),
            "updated_at": r["updated_at"].isoformat(),
            "message_count": int(r["message_count"]),
        }
        for r in rows
    ]


async def clear_workspace_conversation(user_id: str, workspace: str) -> None:
    """Wipe ALL workspace conversations (used for 'forget everything')."""
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM conversations WHERE user_id = $1 AND workspace = $2",
            uuid.UUID(user_id),
            workspace,
        )


async def get_conversations(
    user_id: str,
    *,
    limit: int = 50,
    before: str | None = None,
) -> list[dict]:
    """General-chat conversations newest first.

    Workspace-scoped chats are excluded (they have their own panel).
    Cursor pagination: pass `before=<iso-updated_at>` for older pages.
    """
    limit = max(1, min(int(limit), 200))
    async with pool.acquire() as conn:
        if before:
            from datetime import datetime
            cursor = datetime.fromisoformat(before.replace("Z", "+00:00"))
            rows = await conn.fetch(
                "SELECT id, title, created_at, updated_at FROM conversations "
                "WHERE user_id = $1 AND workspace IS NULL AND updated_at < $2 "
                "ORDER BY updated_at DESC LIMIT $3",
                uuid.UUID(user_id),
                cursor,
                limit + 1,
            )
        else:
            rows = await conn.fetch(
                "SELECT id, title, created_at, updated_at FROM conversations "
                "WHERE user_id = $1 AND workspace IS NULL "
                "ORDER BY updated_at DESC LIMIT $2",
                uuid.UUID(user_id),
                limit + 1,
            )
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "created_at": r["created_at"].isoformat(),
            "updated_at": r["updated_at"].isoformat(),
        }
        for r in rows
    ]


async def get_conversation_messages(conversation_id: str, user_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        owner = await conn.fetchval(
            "SELECT user_id FROM conversations WHERE id = $1",
            uuid.UUID(conversation_id),
        )
        if owner is None or str(owner) != user_id:
            return []
        rows = await conn.fetch(
            "SELECT role, content, thinking, tool_calls FROM messages "
            "WHERE conversation_id = $1 ORDER BY created_at",
            uuid.UUID(conversation_id),
        )
    results = []
    for r in rows:
        msg = {"role": r["role"], "content": r["content"]}
        if r["thinking"]:
            msg["thinking"] = r["thinking"]
        if r["tool_calls"]:
            tc = r["tool_calls"]
            msg["tool_calls"] = json.loads(tc) if isinstance(tc, str) else tc
        results.append(msg)
    return results


async def save_message(
    conversation_id: str,
    role: str,
    content: str,
    thinking: str | None = None,
    tool_calls: list | None = None,
):
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, thinking, tool_calls) VALUES ($1, $2, $3, $4, $5, $6)",
            uuid.uuid4(),
            uuid.UUID(conversation_id),
            role,
            content,
            thinking,
            json.dumps(tool_calls) if tool_calls else None,
        )
        await conn.execute(
            "UPDATE conversations SET updated_at = now() WHERE id = $1",
            uuid.UUID(conversation_id),
        )


async def update_conversation_title(conversation_id: str, user_id: str, title: str):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE conversations SET title = $1 WHERE id = $2 AND user_id = $3",
            title,
            uuid.UUID(conversation_id),
            uuid.UUID(user_id),
        )


async def delete_conversation(conversation_id: str, user_id: str):
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM conversations WHERE id = $1 AND user_id = $2",
            uuid.UUID(conversation_id),
            uuid.UUID(user_id),
        )


async def conversation_belongs_to(conversation_id: str, user_id: str) -> bool:
    async with pool.acquire() as conn:
        owner = await conn.fetchval(
            "SELECT user_id FROM conversations WHERE id = $1",
            uuid.UUID(conversation_id),
        )
    return owner is not None and str(owner) == user_id


# --- Gmail credentials ---


async def get_gmail_creds(user_id: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT email, token_json FROM gmail_credentials WHERE user_id = $1",
            user_id,
        )
    if not row:
        return None
    tj = row["token_json"]
    return {
        "email": row["email"],
        "token_json": json.loads(tj) if isinstance(tj, str) else tj,
    }


async def upsert_gmail_creds(user_id: str, email: str, token_json: dict):
    """Upsert gmail creds keyed by user_id. Also clears any orphaned row
    that holds the same email under a different (legacy/anon) user_id."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "DELETE FROM gmail_credentials WHERE email = $1 AND user_id <> $2",
                email,
                user_id,
            )
            await conn.execute(
                """
                INSERT INTO gmail_credentials (user_id, email, token_json)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id) DO UPDATE
                  SET email = EXCLUDED.email,
                      token_json = EXCLUDED.token_json,
                      updated_at = now()
                """,
                user_id,
                email,
                json.dumps(token_json),
            )


async def delete_gmail_creds(user_id: str):
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM gmail_credentials WHERE user_id = $1",
            user_id,
        )


# --- Files ---


def _file_row_to_dict(r) -> dict:
    return {
        "id": str(r["id"]),
        "user_id": str(r["user_id"]),
        "parent_id": str(r["parent_id"]) if r["parent_id"] else None,
        "name": r["name"],
        "kind": r["kind"],
        "type": r["type"],
        "size": r["size"],
        "r2_key": r["r2_key"],
        "created_at": r["created_at"].isoformat(),
        "updated_at": r["updated_at"].isoformat(),
    }


async def list_user_files(user_id: str) -> list[dict]:
    """All files+folders owned by the user, in a stable order
    (folders first, then by name)."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, parent_id, name, kind, type, size, r2_key,
                   created_at, updated_at
            FROM files
            WHERE user_id = $1
            ORDER BY (kind = 'folder') DESC, name
            """,
            uuid.UUID(user_id),
        )
    return [_file_row_to_dict(r) for r in rows]


async def get_file(file_id: str, user_id: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, parent_id, name, kind, type, size, r2_key,
                   created_at, updated_at
            FROM files WHERE id = $1 AND user_id = $2
            """,
            uuid.UUID(file_id),
            uuid.UUID(user_id),
        )
    return _file_row_to_dict(row) if row else None


async def create_file_row(
    user_id: str,
    name: str,
    kind: str,
    type: str | None = None,
    parent_id: str | None = None,
    r2_key: str | None = None,
) -> dict:
    file_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO files (id, user_id, parent_id, name, kind, type, r2_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, user_id, parent_id, name, kind, type, size, r2_key,
                      created_at, updated_at
            """,
            uuid.UUID(file_id),
            uuid.UUID(user_id),
            uuid.UUID(parent_id) if parent_id else None,
            name,
            kind,
            type,
            r2_key,
        )
    return _file_row_to_dict(row)


async def rename_file_row(file_id: str, user_id: str, name: str):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE files SET name = $1, updated_at = now() "
            "WHERE id = $2 AND user_id = $3",
            name,
            uuid.UUID(file_id),
            uuid.UUID(user_id),
        )


async def move_file_row(file_id: str, user_id: str, parent_id: str | None):
    """Re-parent a file or folder. Caller is responsible for cycle checks."""
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE files SET parent_id = $1, updated_at = now() "
            "WHERE id = $2 AND user_id = $3",
            uuid.UUID(parent_id) if parent_id else None,
            uuid.UUID(file_id),
            uuid.UUID(user_id),
        )


async def update_file_size(file_id: str, user_id: str, size: int):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE files SET size = $1, updated_at = now() "
            "WHERE id = $2 AND user_id = $3",
            size,
            uuid.UUID(file_id),
            uuid.UUID(user_id),
        )


async def set_file_r2_key_and_size(
    file_id: str, user_id: str, r2_key: str, size: int
):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE files SET r2_key = $1, size = $2, updated_at = now() "
            "WHERE id = $3 AND user_id = $4",
            r2_key,
            size,
            uuid.UUID(file_id),
            uuid.UUID(user_id),
        )


async def file_belongs_to(file_id: str, user_id: str) -> bool:
    async with pool.acquire() as conn:
        owner = await conn.fetchval(
            "SELECT user_id FROM files WHERE id = $1",
            uuid.UUID(file_id),
        )
    return owner is not None and str(owner) == user_id


async def collect_descendant_r2_keys(file_id: str, user_id: str) -> list[str]:
    """Return R2 keys of this file and all descendants (for folder delete).
    Filters by user_id at every step — defense in depth."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            WITH RECURSIVE tree AS (
                SELECT id, r2_key FROM files
                WHERE id = $1 AND user_id = $2
                UNION ALL
                SELECT f.id, f.r2_key
                FROM files f JOIN tree t ON f.parent_id = t.id
                WHERE f.user_id = $2
            )
            SELECT r2_key FROM tree WHERE r2_key IS NOT NULL
            """,
            uuid.UUID(file_id),
            uuid.UUID(user_id),
        )
    return [r["r2_key"] for r in rows]


async def delete_file_row(file_id: str, user_id: str):
    """Delete a file or folder (ON DELETE CASCADE removes children rows)."""
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM files WHERE id = $1 AND user_id = $2",
            uuid.UUID(file_id),
            uuid.UUID(user_id),
        )
