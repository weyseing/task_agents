# Task Agents

## Overview

A company-internal AI coding assistant with a custom web UI, powered by LangGraph. Provides Claude Code-like agent capabilities (file editing, code search, bash execution, planning, error recovery) through a user-friendly interface for team members.

## Architecture

- **Frontend**: React + Vite (chat UI with streaming, tool call visualization, diff viewer)
- **Backend**: Python + FastAPI (SSE streaming to frontend)
- **Agent**: LangGraph (state machine with planning, execution, error recovery, sub-agents)
- **LLM**: LiteLLM provider abstraction (supports Claude, OpenAI, local LLMs)
- **Tools**: Read, Edit, Write, Bash, Glob, Grep, WebSearch

## Project Structure

```
task_agents/
├── backend/              # Python + FastAPI
│   ├── agents/           # LangGraph agent definitions
│   ├── tools/            # Tool implementations (read, edit, bash, etc.)
│   ├── api/              # FastAPI routes
│   └── main.py           # Entry point
├── frontend/             # React + Vite
│   ├── src/
│   │   ├── components/   # Chat UI, tool cards, diff viewer
│   │   └── hooks/        # SSE streaming hooks
│   └── index.html
└── CLAUDE.md
```

