"""Tool registry for the agents.

Two registries:
- GENERAL: gmail + web search; used by /api/chat
- EXCEL:   sheet manipulation; used by /api/workspace/excel/chat
The agent loop picks one via get_tools(toolset=...).
"""

from tools.gmail_read import SCHEMA as GMAIL_READ_SCHEMA, handler as gmail_read
from tools.gmail_send import SCHEMA as GMAIL_SEND_SCHEMA, handler as gmail_send
from tools.web_search import SCHEMA as WEB_SEARCH_SCHEMA, handler as web_search
from tools import sheet

# Tools that need the requesting user's id.
USER_SCOPED = {
    "gmail_read",
    "gmail_send",
    "sheet_read",
    "sheet_set_cells",
    "sheet_add_rows",
    "sheet_delete_rows",
    "sheet_add_columns",
    "sheet_delete_columns",
    "sheet_set_headers",
    "sheet_replace_all",
    "sheet_compute",
    "sheet_sort",
    "sheet_filter",
    "sheet_describe",
    "sheet_correlate",
    "sheet_value_counts",
    "sheet_histogram",
    "sheet_pivot",
    "sheet_set_formula",
    "sheet_add_formula_column",
    "workbook_list",
    "workbook_peek",
    "workbook_create",
    "workbook_join",
    "workbook_concat",
    "folder_create",
    "move_item",
}

REGISTRY = {
    "gmail_read": {"schema": GMAIL_READ_SCHEMA, "handler": gmail_read},
    "gmail_send": {"schema": GMAIL_SEND_SCHEMA, "handler": gmail_send},
    "web_search": {"schema": WEB_SEARCH_SCHEMA, "handler": web_search},
    "sheet_read": {"schema": sheet.SCHEMA_READ, "handler": sheet.handler_read},
    "sheet_set_cells": {"schema": sheet.SCHEMA_SET_CELLS, "handler": sheet.handler_set_cells},
    "sheet_add_rows": {"schema": sheet.SCHEMA_ADD_ROWS, "handler": sheet.handler_add_rows},
    "sheet_delete_rows": {"schema": sheet.SCHEMA_DELETE_ROWS, "handler": sheet.handler_delete_rows},
    "sheet_add_columns": {"schema": sheet.SCHEMA_ADD_COLUMNS, "handler": sheet.handler_add_columns},
    "sheet_delete_columns": {"schema": sheet.SCHEMA_DELETE_COLUMNS, "handler": sheet.handler_delete_columns},
    "sheet_set_headers": {"schema": sheet.SCHEMA_SET_HEADERS, "handler": sheet.handler_set_headers},
    "sheet_replace_all": {"schema": sheet.SCHEMA_REPLACE_ALL, "handler": sheet.handler_replace_all},
    "sheet_compute": {"schema": sheet.SCHEMA_COMPUTE, "handler": sheet.handler_compute},
    "sheet_sort": {"schema": sheet.SCHEMA_SORT, "handler": sheet.handler_sort},
    "sheet_filter": {"schema": sheet.SCHEMA_FILTER, "handler": sheet.handler_filter},
    "sheet_describe": {"schema": sheet.SCHEMA_DESCRIBE, "handler": sheet.handler_describe},
    "sheet_correlate": {"schema": sheet.SCHEMA_CORRELATE, "handler": sheet.handler_correlate},
    "sheet_value_counts": {"schema": sheet.SCHEMA_VALUE_COUNTS, "handler": sheet.handler_value_counts},
    "sheet_histogram": {"schema": sheet.SCHEMA_HISTOGRAM, "handler": sheet.handler_histogram},
    "sheet_pivot": {"schema": sheet.SCHEMA_PIVOT, "handler": sheet.handler_pivot},
    "sheet_set_formula": {"schema": sheet.SCHEMA_SET_FORMULA, "handler": sheet.handler_set_formula},
    "sheet_add_formula_column": {"schema": sheet.SCHEMA_ADD_FORMULA_COLUMN, "handler": sheet.handler_add_formula_column},
    "workbook_list": {"schema": sheet.SCHEMA_WORKBOOK_LIST, "handler": sheet.handler_workbook_list},
    "workbook_peek": {"schema": sheet.SCHEMA_WORKBOOK_PEEK, "handler": sheet.handler_workbook_peek},
    "workbook_create": {"schema": sheet.SCHEMA_WORKBOOK_CREATE, "handler": sheet.handler_workbook_create},
    "workbook_join": {"schema": sheet.SCHEMA_WORKBOOK_JOIN, "handler": sheet.handler_workbook_join},
    "workbook_concat": {"schema": sheet.SCHEMA_WORKBOOK_CONCAT, "handler": sheet.handler_workbook_concat},
    "folder_create": {"schema": sheet.SCHEMA_FOLDER_CREATE, "handler": sheet.handler_folder_create},
    "move_item": {"schema": sheet.SCHEMA_MOVE_ITEM, "handler": sheet.handler_move_item},
}

_EXCEL_TOOLS = [
    "sheet_read",
    "sheet_set_cells",
    "sheet_add_rows",
    "sheet_delete_rows",
    "sheet_add_columns",
    "sheet_delete_columns",
    "sheet_set_headers",
    "sheet_replace_all",
    "sheet_compute",
    "sheet_sort",
    "sheet_filter",
    "sheet_describe",
    "sheet_correlate",
    "sheet_value_counts",
    "sheet_histogram",
    "sheet_pivot",
    "sheet_set_formula",
    "sheet_add_formula_column",
    "workbook_list",
    "workbook_peek",
    "workbook_create",
    "workbook_join",
    "workbook_concat",
    "folder_create",
    "move_item",
]

# Named tool sets per agent variant.
TOOLSETS: dict[str, list[str]] = {
    "general": ["gmail_read", "gmail_send", "web_search"],
    "excel": _EXCEL_TOOLS,
}


def get_tools(toolset: str = "general") -> list[dict]:
    """Return tool schemas in OpenAI function-calling format."""
    names = TOOLSETS.get(toolset, TOOLSETS["general"])
    return [
        {"type": "function", "function": REGISTRY[n]["schema"]}
        for n in names
        if n in REGISTRY
    ]


async def execute_tool(name: str, args: dict, user_id: str) -> dict:
    """Execute a tool by name. Injects user_id for tools that need it.

    Sheet/workbook tools take a `file` arg from the model (workbook name or id).
    """
    if name not in REGISTRY:
        return {"error": f"Unknown tool: {name}"}
    handler = REGISTRY[name]["handler"]
    kwargs = dict(args)
    if name in USER_SCOPED:
        kwargs["user_id"] = user_id
    return await handler(**kwargs)
