"""Tool registry for the agent."""

from tools.gmail_read import SCHEMA as GMAIL_READ_SCHEMA, handler as gmail_read
from tools.gmail_send import SCHEMA as GMAIL_SEND_SCHEMA, handler as gmail_send
from tools.web_search import SCHEMA as WEB_SEARCH_SCHEMA, handler as web_search

# Tools that need the requesting user's id (Gmail tools load per-user creds).
USER_SCOPED = {"gmail_read", "gmail_send"}

REGISTRY = {
    "gmail_read": {"schema": GMAIL_READ_SCHEMA, "handler": gmail_read},
    "gmail_send": {"schema": GMAIL_SEND_SCHEMA, "handler": gmail_send},
    "web_search": {"schema": WEB_SEARCH_SCHEMA, "handler": web_search},
}


def get_tools() -> list[dict]:
    """Return tool schemas in OpenAI function-calling format."""
    return [
        {"type": "function", "function": entry["schema"]}
        for entry in REGISTRY.values()
    ]


async def execute_tool(name: str, args: dict, user_id: str) -> dict:
    """Execute a tool by name. Injects user_id only for user-scoped tools."""
    if name not in REGISTRY:
        return {"error": f"Unknown tool: {name}"}
    handler = REGISTRY[name]["handler"]
    if name in USER_SCOPED:
        return await handler(user_id=user_id, **args)
    return await handler(**args)
