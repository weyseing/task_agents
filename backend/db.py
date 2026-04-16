import json
import os
import uuid
from datetime import datetime

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
            CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_conversations_updated
                ON conversations(updated_at DESC);
        """)
        # Migration for existing tables
        await conn.execute(
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_calls JSONB"
        )


async def close_db():
    global pool
    if pool:
        await pool.close()
        pool = None


async def create_conversation(title: str) -> str:
    conv_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO conversations (id, title) VALUES ($1, $2)",
            uuid.UUID(conv_id),
            title,
        )
    return conv_id


async def get_conversations() -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC"
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


async def get_conversation_messages(conversation_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT role, content, thinking, tool_calls FROM messages WHERE conversation_id = $1 ORDER BY created_at",
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


async def update_conversation_title(conversation_id: str, title: str):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE conversations SET title = $1 WHERE id = $2",
            title,
            uuid.UUID(conversation_id),
        )


async def delete_conversation(conversation_id: str):
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM conversations WHERE id = $1",
            uuid.UUID(conversation_id),
        )
