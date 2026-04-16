"""Tool registry for the agent."""

from tools.gmail_read import SCHEMA as GMAIL_READ_SCHEMA, handler as gmail_read
from tools.gmail_send import SCHEMA as GMAIL_SEND_SCHEMA, handler as gmail_send

REGISTRY = {
    "gmail_read": {"schema": GMAIL_READ_SCHEMA, "handler": gmail_read},
    "gmail_send": {"schema": GMAIL_SEND_SCHEMA, "handler": gmail_send},
}


def get_tools() -> list[dict]:
    """Return tool schemas in OpenAI function-calling format."""
    return [
        {"type": "function", "function": entry["schema"]}
        for entry in REGISTRY.values()
    ]


async def execute_tool(name: str, args: dict) -> dict:
    """Execute a tool by name with the given arguments."""
    if name not in REGISTRY:
        return {"error": f"Unknown tool: {name}"}
    return await REGISTRY[name]["handler"](**args)
