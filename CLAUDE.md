# Task Agents

## Overview

A company-internal AI assistant with a custom web UI. Provides an agentic tool-calling loop with SSE streaming through a user-friendly chat interface for team members.

## Architecture

- **Frontend**: React + Vite (chat UI with streaming, tool call widgets)
- **Backend**: Python + FastAPI (SSE streaming to frontend)
- **Agent**: LiteLLM + manual tool-calling loop (`backend/agent.py`)
- **LLM**: LiteLLM → Anthropic Claude (Haiku 4.5 fast, Sonnet 4.6 deep)
- **Tools**: Gmail Read/Search, Gmail Send (extensible registry in `backend/tools/`)

## Project Structure

```
task_agents/
├── backend/              # Python + FastAPI
│   ├── agent.py          # Agent loop (LiteLLM + tool calling)
│   ├── tools/            # Tool registry and implementations
│   │   ├── __init__.py   # get_tools(), execute_tool()
│   │   ├── gmail_read.py # Search and read emails
│   │   └── gmail_send.py # Send emails
│   ├── db.py             # PostgreSQL (asyncpg)
│   └── main.py           # FastAPI entry point
├── frontend/             # React + Vite
│   ├── src/
│   │   ├── App.jsx       # SSE streaming + state management
│   │   └── components/   # Chat UI, ToolCall widget, Gmail result renderers
│   └── index.html
├── cli/                  # Standalone CLI tools
│   ├── gmail/            # Gmail OAuth + read/send scripts
│   └── database/         # DB management scripts
└── CLAUDE.md
```

## SSE Event Contract

```
{"conversation_id": "...", "is_new": bool}   — first event
{"thinking": "..."}                          — thinking text chunk
{"content": "..."}                           — response text chunk
{"tool_call": {"id", "name", "args"}}        — tool invocation
{"tool_result": {"id", "name", "data"}}      — tool result (structured JSON)
{"done": true}                               — final event
```

## Adding New Tools

1. Create `backend/tools/<name>.py` with `SCHEMA` dict and `async handler(**args)` function
2. Register in `backend/tools/__init__.py` REGISTRY
3. Create a result renderer component in `frontend/src/components/ToolCall.jsx`
