"""Sheet tools for the Excel agent.

Two families of tools share the same agent:

- sheet_*    — operate on a single workbook identified by `file` (name or id).
- workbook_* — multi-file ops. Reach other workbooks, combine them, or
               create new workbooks. Always referenced by file name.

The agent loop injects user_id. Every tool takes a `file` parameter that
resolves by name OR id, scoped to the user's workspace.
"""

import json
import logging
import math
import statistics
from typing import Any

import storage
from db import (
    create_file_row,
    get_file,
    list_user_files,
    set_file_r2_key_and_size,
    update_file_size,
)
from tools import formula as _formula

logger = logging.getLogger(__name__)


# ---- File I/O helpers ----

EMPTY_SHEET = {"columns": [], "rows": []}


def _norm_sheet_fields(columns, rows, formulas) -> tuple[list[str], list[list[str]], dict[str, str]]:
    """Coerce one sheet's columns/rows/formulas into the canonical string shapes."""
    columns = [str(c) for c in (columns or [])]
    rows = [[("" if c is None else str(c)) for c in r] for r in (rows or [])]
    width = len(columns)
    for r in rows:
        while len(r) < width:
            r.append("")
    if not isinstance(formulas, dict):
        formulas = {}
    formulas = {
        k: str(v) for k, v in formulas.items()
        if isinstance(k, str) and isinstance(v, str)
    }
    return columns, rows, formulas


def _resolve_sheet_index(sheets_list: list, sheet: str | int | None) -> int:
    """Resolve a sheet ref (name, 0-based index, or None) to an index into sheets_list."""
    if sheet is None or sheet == "":
        return 0
    if isinstance(sheet, int):
        if 0 <= sheet < len(sheets_list):
            return sheet
        raise ValueError(f"sheet index {sheet} out of range (0..{len(sheets_list)-1})")
    s = str(sheet).strip()
    if s.lstrip("-").isdigit():
        idx = int(s)
        if 0 <= idx < len(sheets_list):
            return idx
        raise ValueError(f"sheet index {idx} out of range (0..{len(sheets_list)-1})")
    target = s.lower()
    for i, sh in enumerate(sheets_list):
        if str((sh or {}).get("name") or "").strip().lower() == target:
            return i
    names = [str((sh or {}).get("name") or "") for sh in sheets_list]
    raise ValueError(f"sheet {sheet!r} not found. Available sheets: {names}")


async def _load_sheet(file_id: str, user_id: str, sheet: str | int | None = None) -> dict:
    """Load one sheet of a workbook.

    For multi-sheet xlsx (content has a `sheets` array), resolves `sheet` by
    name/index and returns the chosen sheet; the full sheet list is stashed
    on the returned dict so `_save_sheet` can write back without losing siblings.
    For legacy flat content, ignores `sheet` and returns the single sheet.
    """
    row = await get_file(file_id, user_id)
    if not row:
        raise ValueError(f"File {file_id} not found")
    if row["kind"] != "file":
        raise ValueError(f"{file_id} is not a file")
    if not row["r2_key"]:
        return {
            "_row": row,
            "_multi": False,
            "_active": 0,
            "name": "Sheet1",
            "columns": [],
            "rows": [],
            "formulas": {},
        }
    raw = await storage.get(row["r2_key"])
    try:
        content = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        content = {}
    if not isinstance(content, dict):
        content = {}

    sheets_list = content.get("sheets")
    if isinstance(sheets_list, list) and sheets_list:
        idx = _resolve_sheet_index(sheets_list, sheet)
        s = sheets_list[idx] or {}
        columns, rows, formulas = _norm_sheet_fields(
            s.get("columns"), s.get("rows"), s.get("formulas")
        )
        return {
            "_row": row,
            "_multi": True,
            "_all_sheets": sheets_list,
            "_active": idx,
            "name": str(s.get("name") or f"Sheet{idx+1}"),
            "columns": columns,
            "rows": rows,
            "formulas": formulas,
        }

    columns, rows, formulas = _norm_sheet_fields(
        content.get("columns"), content.get("rows"), content.get("formulas")
    )
    return {
        "_row": row,
        "_multi": False,
        "_active": 0,
        "name": "Sheet1",
        "columns": columns,
        "rows": rows,
        "formulas": formulas,
    }


def _recompute_formulas(sheet: dict) -> None:
    """Re-evaluate all formula cells in the sheet, writing results into rows[][].

    Order is determined by a topological sort of the dependency graph. Cells
    in a cycle (or with parse errors) get '#CIRCULAR' / '#ERROR'.
    """
    formulas = sheet.get("formulas") or {}
    if not formulas:
        return
    cols = sheet["columns"]
    rows = sheet["rows"]
    n_data_rows = len(rows)
    n_cols = len(cols)

    # Parse all formulas up-front; bad ones get a fixed error.
    parsed: dict[str, object] = {}
    parse_errors: dict[str, str] = {}
    for addr_, expr in formulas.items():
        try:
            parsed[addr_] = _formula.parse(expr)
        except Exception as e:  # noqa: BLE001
            parse_errors[addr_] = "#ERROR"
            logger.warning("formula parse error for %s: %s", addr_, e)

    # Build dep graph: addr -> set of addrs it depends on (formula cells only).
    deps: dict[str, set[str]] = {}
    for addr_, ast in parsed.items():
        ds = set()
        for r, c in _formula.references(ast):
            ref_addr = _formula.addr(r, c)
            if ref_addr in parsed:
                ds.add(ref_addr)
        deps[addr_] = ds

    # Kahn topological sort
    incoming: dict[str, int] = {a: len(deps[a]) for a in deps}
    dependents: dict[str, list[str]] = {a: [] for a in deps}
    for a, ds in deps.items():
        for d in ds:
            dependents.setdefault(d, []).append(a)
    queue = [a for a, n in incoming.items() if n == 0]
    order: list[str] = []
    while queue:
        a = queue.pop(0)
        order.append(a)
        for d in dependents.get(a, []):
            incoming[d] -= 1
            if incoming[d] == 0:
                queue.append(d)
    cyclic = set(parsed.keys()) - set(order)

    def get_cell(row: int, col: int):
        # row=1 → header row; row>=2 → data row index row-2
        if row < 1 or col < 1 or col > n_cols:
            return ""
        if row == 1:
            return cols[col - 1]
        ri = row - 2
        if ri < 0 or ri >= n_data_rows:
            return ""
        return rows[ri][col - 1]

    def write_cell(addr_: str, value: str) -> None:
        try:
            r, c = _formula.parse_addr(addr_)
        except Exception:
            return
        if r < 1 or c < 1 or c > n_cols:
            return
        if r == 1:
            cols[c - 1] = value
            return
        ri = r - 2
        if 0 <= ri < n_data_rows:
            rows[ri][c - 1] = value

    for addr_ in order:
        try:
            v = _formula.evaluate(parsed[addr_], get_cell)
            write_cell(addr_, _formula.format_result(v))
        except _formula.FormulaError as e:
            write_cell(addr_, getattr(e, "code", "#ERROR") or "#ERROR")
        except Exception:  # noqa: BLE001
            write_cell(addr_, "#ERROR")

    for addr_ in cyclic:
        write_cell(addr_, "#CIRCULAR")

    for addr_, err in parse_errors.items():
        write_cell(addr_, err)


def recompute_content(content: dict) -> dict:
    """Public helper: take a raw sheet content dict, recompute its formula
    cells (if any), and return the updated dict. Used by /api/files PUT so
    UI-side formula edits evaluate the same way agent edits do.

    Handles both the legacy flat shape and the multi-sheet `sheets` shape.
    """
    if not isinstance(content, dict):
        return content
    if isinstance(content.get("sheets"), list):
        out_sheets = []
        for i, s in enumerate(content["sheets"]):
            if not isinstance(s, dict):
                continue
            inner = recompute_content(
                {"columns": s.get("columns"), "rows": s.get("rows"), "formulas": s.get("formulas")}
            )
            inner["name"] = str(s.get("name") or f"Sheet{i+1}")
            out_sheets.append(inner)
        return {"sheets": out_sheets}
    columns, rows, formulas = _norm_sheet_fields(
        content.get("columns"), content.get("rows"), content.get("formulas")
    )
    fake_sheet = {
        "_row": None,
        "_multi": False,
        "columns": columns,
        "rows": rows,
        "formulas": formulas,
    }
    _prune_invalid_formulas(fake_sheet)
    _recompute_formulas(fake_sheet)
    out = {"columns": fake_sheet["columns"], "rows": fake_sheet["rows"]}
    if fake_sheet["formulas"]:
        out["formulas"] = fake_sheet["formulas"]
    return out


def _prune_invalid_formulas(sheet: dict) -> None:
    """Drop formula entries pointing outside the current sheet grid."""
    formulas = sheet.get("formulas") or {}
    if not formulas:
        return
    n_cols = len(sheet["columns"])
    n_rows = len(sheet["rows"])
    valid: dict[str, str] = {}
    for addr_, expr in formulas.items():
        try:
            r, c = _formula.parse_addr(addr_)
        except Exception:
            continue
        if r < 1 or c < 1 or c > n_cols:
            continue
        # Allow r==1 (header), and r >= 2 within data rows
        if r > n_rows + 1:
            continue
        valid[addr_] = expr
    sheet["formulas"] = valid


async def _save_sheet(sheet: dict, file_id: str, user_id: str) -> None:
    _prune_invalid_formulas(sheet)
    _recompute_formulas(sheet)
    row = sheet["_row"]
    sheet_content: dict = {
        "columns": sheet["columns"],
        "rows": sheet["rows"],
    }
    if sheet.get("formulas"):
        sheet_content["formulas"] = sheet["formulas"]

    if sheet.get("_multi"):
        # Multi-sheet workbook: splice the modified sheet back into the array.
        idx = sheet["_active"]
        all_sheets = list(sheet["_all_sheets"])
        sheet_content["name"] = sheet.get("name") or (
            (all_sheets[idx] or {}).get("name") if idx < len(all_sheets) else None
        ) or f"Sheet{idx+1}"
        all_sheets[idx] = sheet_content
        content: dict = {"sheets": all_sheets}
    else:
        content = sheet_content

    payload = json.dumps(content).encode("utf-8")
    key = row["r2_key"] or storage.object_key(user_id, file_id)
    await storage.put(key, payload, content_type="application/json")
    if row["r2_key"]:
        await update_file_size(file_id, user_id, len(payload))
    else:
        await set_file_r2_key_and_size(file_id, user_id, key, len(payload))


def _col_letter(i: int) -> str:
    # 0->A, 25->Z, 26->AA, ...
    s = ""
    n = i
    while True:
        s = chr(ord("A") + (n % 26)) + s
        n = n // 26 - 1
        if n < 0:
            break
    return s


def _col_index(name: str, columns: list[str]) -> int:
    """Resolve a column reference. Accepts header name (case-insensitive),
    column letter (A, B, ..., AA), or 0-based integer string."""
    if name is None:
        raise ValueError("column reference required")
    s = str(name).strip()
    if not s:
        raise ValueError("empty column reference")
    # Exact header match (case-insensitive)
    lower = s.lower()
    for i, h in enumerate(columns):
        if h.lower() == lower:
            return i
    # Numeric index
    if s.lstrip("-").isdigit():
        idx = int(s)
        if 0 <= idx < len(columns):
            return idx
    # Column letter
    if s.replace(" ", "").isalpha():
        letters = s.upper()
        v = 0
        for ch in letters:
            v = v * 26 + (ord(ch) - ord("A") + 1)
        idx = v - 1
        if 0 <= idx < len(columns):
            return idx
    raise ValueError(f"unknown column: {name!r}")


def _try_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    s = str(v).strip().replace(",", "")
    # Common currency / percent stripping
    for ch in "$£€¥":
        s = s.replace(ch, "")
    pct = s.endswith("%")
    if pct:
        s = s[:-1]
    try:
        f = float(s)
        if pct:
            f /= 100.0
        return f
    except ValueError:
        return None


# ---- Tool schemas ----

SCHEMA_READ = {
    "name": "sheet_read",
    "description": (
        "Read a workbook. Returns columns (with letters) and rows. Always "
        "call this (or workbook_peek) before answering questions or editing — "
        "you need to know the actual structure, not guess from the filename."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Workbook name (e.g. 'employees.csv')"},
            "limit": {"type": "integer", "description": "Max rows to return (default 100)"},
            "offset": {"type": "integer", "description": "0-based row offset (default 0)"},
        },
        "required": ["file"],
    },
}

SCHEMA_SET_CELLS = {
    "name": "sheet_set_cells",
    "description": (
        "Update individual cells. Each update is {row, column, value} where "
        "row is the 0-based data row (header is NOT counted) and column is a "
        "header name, letter, or 0-based index."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Workbook name"},
            "updates": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "row": {"type": "integer"},
                        "column": {"type": "string"},
                        "value": {"type": "string"},
                    },
                    "required": ["row", "column", "value"],
                },
            },
        },
        "required": ["file", "updates"],
    },
}

SCHEMA_ADD_ROWS = {
    "name": "sheet_add_rows",
    "description": "Append one or more rows to the bottom of a workbook.",
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "rows": {
                "type": "array",
                "description": "Array of rows. Each row is an array of cell strings, in column order.",
                "items": {"type": "array", "items": {"type": "string"}},
            },
        },
        "required": ["file", "rows"],
    },
}

SCHEMA_DELETE_ROWS = {
    "name": "sheet_delete_rows",
    "description": "Delete rows by their 0-based data indices. Indices refer to the CURRENT sheet — sort/filter before delete and you may need to re-read first.",
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "indices": {"type": "array", "items": {"type": "integer"}},
        },
        "required": ["file", "indices"],
    },
}

SCHEMA_ADD_COLUMNS = {
    "name": "sheet_add_columns",
    "description": "Append columns to the right. Optional values must match row count.",
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "columns": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "header": {"type": "string"},
                        "values": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional: pre-populate this column. Length must equal row count.",
                        },
                        "formula": {
                            "type": "string",
                            "description": "Optional aggregate: sum/avg/min/max/count over another column. e.g. 'sum(Price)*0.1', 'A+B', '{Qty}*{Price}'. Use {Header} or column letters.",
                        },
                    },
                    "required": ["header"],
                },
            },
        },
        "required": ["file", "columns"],
    },
}

SCHEMA_DELETE_COLUMNS = {
    "name": "sheet_delete_columns",
    "description": "Delete columns by header name, letter, or 0-based index.",
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "columns": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["file", "columns"],
    },
}

SCHEMA_SET_HEADERS = {
    "name": "sheet_set_headers",
    "description": "Rename one or more column headers.",
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "renames": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "column": {"type": "string", "description": "current header, letter, or index"},
                        "new_header": {"type": "string"},
                    },
                    "required": ["column", "new_header"],
                },
            },
        },
        "required": ["file", "renames"],
    },
}

SCHEMA_REPLACE_ALL = {
    "name": "sheet_replace_all",
    "description": (
        "Overwrite the entire workbook. Use sparingly — prefer targeted ops. "
        "Useful for total rebuilds (e.g. generating a report from scratch)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "columns": {"type": "array", "items": {"type": "string"}},
            "rows": {"type": "array", "items": {"type": "array", "items": {"type": "string"}}},
        },
        "required": ["file", "columns", "rows"],
    },
}

SCHEMA_COMPUTE = {
    "name": "sheet_compute",
    "description": (
        "Aggregate a column without mutating the sheet. Returns the numeric result. "
        "Use this to answer questions like 'what's the total revenue?' or "
        "'how many rows match status=paid?'. For filter/group_by, pass them in."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "op": {
                "type": "string",
                "enum": ["sum", "avg", "min", "max", "count", "count_distinct"],
            },
            "column": {"type": "string", "description": "Header, letter, or 0-based index. Required except for op=count (whole sheet)."},
            "where": {
                "type": "object",
                "description": "Optional row filter as {column: value}. Equality only.",
                "additionalProperties": {"type": "string"},
            },
            "group_by": {"type": "string", "description": "Optional: group results by this column. Returns {group: result}."},
        },
        "required": ["file", "op"],
    },
}

SCHEMA_SORT = {
    "name": "sheet_sort",
    "description": "Sort rows in place by a column. order='asc' or 'desc'. Numeric vs lexicographic auto-detected.",
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "column": {"type": "string"},
            "order": {"type": "string", "enum": ["asc", "desc"]},
        },
        "required": ["file", "column"],
    },
}

SCHEMA_FILTER = {
    "name": "sheet_filter",
    "description": (
        "Find rows matching a filter without mutating. Returns the matching rows "
        "with their 0-based data indices, so you can follow up with set_cells or delete_rows."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "where": {
                "type": "object",
                "description": "Equality filter as {column: value}. All conditions must match.",
                "additionalProperties": {"type": "string"},
            },
            "contains": {
                "type": "object",
                "description": "Substring (case-insensitive) filter as {column: substring}.",
                "additionalProperties": {"type": "string"},
            },
            "limit": {"type": "integer", "description": "Max rows to return (default 50)"},
        },
        "required": ["file"],
    },
}


# ---- Handlers ----


async def handler_read(
    *, user_id: str, file: str | None = None, limit: int = 100, offset: int = 0,
    sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    columns = sheet["columns"]
    rows = sheet["rows"]
    formulas = sheet.get("formulas") or {}
    total = len(rows)
    sliced = rows[offset : offset + max(0, int(limit))] if limit else rows[offset:]
    # Only return formulas whose row is within the slice the agent sees.
    visible_formulas: dict[str, str] = {}
    if formulas and sliced:
        slice_lo = offset + 2  # data row 0 = address row 2
        slice_hi = offset + len(sliced) + 1
        for a, e in formulas.items():
            try:
                r, _c = _formula.parse_addr(a)
            except Exception:
                continue
            if r == 1 or slice_lo <= r <= slice_hi:
                visible_formulas[a] = e
    return {
        "type": "sheet_view",
        "file_id": fid,
        "sheet": sheet.get("name"),
        "columns": [{"index": i, "letter": _col_letter(i), "header": h} for i, h in enumerate(columns)],
        "rows": sliced,
        "row_count": total,
        "shown": {"offset": offset, "count": len(sliced)},
        "formulas": visible_formulas,
    }


async def handler_set_cells(
    *, user_id: str, file: str | None = None, updates: list, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    columns = sheet["columns"]
    rows = sheet["rows"]
    applied = 0
    errors = []
    for u in updates or []:
        try:
            r = int(u["row"])
            c = _col_index(u["column"], columns)
            v = "" if u.get("value") is None else str(u["value"])
        except (KeyError, ValueError) as e:
            errors.append(str(e))
            continue
        if r < 0 or r >= len(rows):
            errors.append(f"row {r} out of range (0..{len(rows)-1})")
            continue
        rows[r][c] = v
        applied += 1
    await _save_sheet(sheet, fid, user_id)
    return {
        "type": "sheet_update",
        "file_id": fid,
        "applied": applied,
        "errors": errors,
        "row_count": len(rows),
    }


async def handler_add_rows(
    *, user_id: str, file: str | None = None, rows: list, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    columns = sheet["columns"]
    width = len(columns)
    appended = []
    for r in rows or []:
        if not isinstance(r, list):
            continue
        row = [("" if c is None else str(c)) for c in r]
        if len(row) < width:
            row += [""] * (width - len(row))
        elif len(row) > width:
            row = row[:width]
        appended.append(row)
    sheet["rows"].extend(appended)
    await _save_sheet(sheet, fid, user_id)
    return {
        "type": "sheet_update",
        "file_id": fid,
        "added": len(appended),
        "row_count": len(sheet["rows"]),
    }


async def handler_delete_rows(
    *, user_id: str, file: str | None = None, indices: list, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    rows = sheet["rows"]
    drop = sorted({int(i) for i in (indices or []) if 0 <= int(i) < len(rows)}, reverse=True)
    for i in drop:
        rows.pop(i)
    await _save_sheet(sheet, fid, user_id)
    return {
        "type": "sheet_update",
        "file_id": fid,
        "deleted": len(drop),
        "row_count": len(rows),
    }


def _eval_formula(expr: str, columns: list[str], row: list[str]) -> str:
    """Very small expression evaluator. Supports column refs by {Header}
    or letter, numbers, + - * / and parentheses."""
    import re

    s = expr
    # {Header} → value
    def repl_hdr(m):
        ref = m.group(1)
        try:
            idx = _col_index(ref, columns)
        except ValueError:
            return "0"
        return str(_try_float(row[idx]) or 0)

    s = re.sub(r"\{([^}]+)\}", repl_hdr, s)
    # Bare A, B, AA, ... → cell value (letters only, no header conflict)
    def repl_letter(m):
        ref = m.group(0)
        try:
            idx = _col_index(ref, columns)
        except ValueError:
            return ref
        return str(_try_float(row[idx]) or 0)

    s = re.sub(r"\b[A-Z]{1,2}\b", repl_letter, s)
    # Whitelisted eval
    if not re.match(r"^[\d\.\+\-\*\/\(\)\s]+$", s):
        return ""
    try:
        # eval is safe here because of the whitelist regex above
        return str(eval(s, {"__builtins__": {}}, {}))  # noqa: S307
    except Exception:
        return ""


async def handler_add_columns(
    *, user_id: str, file: str | None = None, columns: list, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    added = 0
    for col in columns or []:
        header = str(col.get("header") or "").strip()
        if not header:
            continue
        sheet["columns"].append(header)
        values = col.get("values")
        formula = col.get("formula")
        new_col: list[str] = []
        for i, row in enumerate(sheet["rows"]):
            if values and i < len(values):
                new_col.append(str(values[i]))
            elif formula:
                new_col.append(_eval_formula(formula, sheet["columns"][:-1], row))
            else:
                new_col.append("")
        for i, row in enumerate(sheet["rows"]):
            row.append(new_col[i] if i < len(new_col) else "")
        added += 1
    await _save_sheet(sheet, fid, user_id)
    return {
        "type": "sheet_update",
        "file_id": fid,
        "added": added,
        "column_count": len(sheet["columns"]),
    }


async def handler_delete_columns(
    *, user_id: str, file: str | None = None, columns: list, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    indices = []
    for c in columns or []:
        try:
            indices.append(_col_index(c, sheet["columns"]))
        except ValueError:
            pass
    for i in sorted(set(indices), reverse=True):
        sheet["columns"].pop(i)
        for r in sheet["rows"]:
            if i < len(r):
                r.pop(i)
    await _save_sheet(sheet, fid, user_id)
    return {
        "type": "sheet_update",
        "file_id": fid,
        "deleted": len(set(indices)),
        "column_count": len(sheet["columns"]),
    }


async def handler_set_headers(
    *, user_id: str, file: str | None = None, renames: list, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    applied = 0
    for r in renames or []:
        try:
            idx = _col_index(r["column"], sheet["columns"])
            sheet["columns"][idx] = str(r["new_header"])
            applied += 1
        except (KeyError, ValueError):
            continue
    await _save_sheet(sheet, fid, user_id)
    return {"type": "sheet_update", "file_id": fid, "renamed": applied}


async def handler_replace_all(
    *, user_id: str, file: str | None = None,
    columns: list, rows: list, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    sheet["columns"] = [str(c) for c in (columns or [])]
    width = len(sheet["columns"])
    cleaned: list[list[str]] = []
    for r in rows or []:
        if not isinstance(r, list):
            continue
        row = [("" if c is None else str(c)) for c in r]
        if len(row) < width:
            row += [""] * (width - len(row))
        elif len(row) > width:
            row = row[:width]
        cleaned.append(row)
    sheet["rows"] = cleaned
    await _save_sheet(sheet, fid, user_id)
    return {
        "type": "sheet_update",
        "file_id": fid,
        "row_count": len(cleaned),
        "column_count": width,
    }


def _matches(row: list[str], columns: list[str], where: dict) -> bool:
    for k, v in (where or {}).items():
        try:
            idx = _col_index(k, columns)
        except ValueError:
            return False
        if str(row[idx]).strip().lower() != str(v).strip().lower():
            return False
    return True


async def handler_compute(
    *, user_id: str, file: str | None = None,
    op: str, column: str | None = None,
    where: dict | None = None, group_by: str | None = None, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    columns = sheet["columns"]
    rows = [r for r in sheet["rows"] if _matches(r, columns, where or {})]

    if op == "count" and not column:
        if group_by:
            try:
                g = _col_index(group_by, columns)
            except ValueError as e:
                return {"error": str(e)}
            buckets: dict[str, int] = {}
            for r in rows:
                buckets[r[g]] = buckets.get(r[g], 0) + 1
            return {"type": "compute_result", "op": op, "groups": buckets, "matched_rows": len(rows)}
        return {"type": "compute_result", "op": op, "result": len(rows), "matched_rows": len(rows)}

    if not column:
        return {"error": "column is required for this op"}
    try:
        ci = _col_index(column, columns)
    except ValueError as e:
        return {"error": str(e)}

    def _agg(items: list[str]) -> Any:
        if op == "count":
            return sum(1 for v in items if str(v).strip() != "")
        if op == "count_distinct":
            return len({v for v in items if str(v).strip() != ""})
        nums = [n for n in (_try_float(v) for v in items) if n is not None]
        if not nums:
            return None
        if op == "sum":
            return round(sum(nums), 6)
        if op == "avg":
            return round(sum(nums) / len(nums), 6)
        if op == "min":
            return min(nums)
        if op == "max":
            return max(nums)
        return None

    if group_by:
        try:
            g = _col_index(group_by, columns)
        except ValueError as e:
            return {"error": str(e)}
        buckets: dict[str, list[str]] = {}
        for r in rows:
            buckets.setdefault(r[g], []).append(r[ci])
        return {
            "type": "compute_result",
            "op": op,
            "column": columns[ci],
            "group_by": columns[g],
            "groups": {k: _agg(v) for k, v in buckets.items()},
            "matched_rows": len(rows),
        }
    return {
        "type": "compute_result",
        "op": op,
        "column": columns[ci],
        "result": _agg([r[ci] for r in rows]),
        "matched_rows": len(rows),
    }


async def handler_sort(
    *, user_id: str, file: str | None = None,
    column: str, order: str = "asc", sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    try:
        ci = _col_index(column, sheet["columns"])
    except ValueError as e:
        return {"error": str(e)}
    rows = sheet["rows"]
    # Decide numeric vs lexicographic — numeric if every non-empty cell parses.
    nums = [_try_float(r[ci]) for r in rows]
    if rows and all(n is not None for n, r in zip(nums, rows) if str(r[ci]).strip() != ""):
        key = lambda r: (_try_float(r[ci]) is None, _try_float(r[ci]) or 0)
    else:
        key = lambda r: str(r[ci]).lower()
    rows.sort(key=key, reverse=(order == "desc"))
    await _save_sheet(sheet, fid, user_id)
    return {
        "type": "sheet_update",
        "file_id": fid,
        "sorted_by": sheet["columns"][ci],
        "order": order,
        "row_count": len(rows),
    }


async def handler_filter(
    *, user_id: str, file: str | None = None,
    where: dict | None = None, contains: dict | None = None, limit: int = 50, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    columns = sheet["columns"]
    matches: list[dict] = []
    for i, row in enumerate(sheet["rows"]):
        if where and not _matches(row, columns, where):
            continue
        ok = True
        for k, v in (contains or {}).items():
            try:
                idx = _col_index(k, columns)
            except ValueError:
                ok = False
                break
            if str(v).lower() not in str(row[idx]).lower():
                ok = False
                break
        if not ok:
            continue
        matches.append({"index": i, "row": row})
        if len(matches) >= max(1, int(limit or 50)):
            break
    return {
        "type": "filter_result",
        "file_id": fid,
        "columns": columns,
        "matches": matches,
        "match_count": len(matches),
    }


# ====================================================================
# Cross-workbook resolution + creation
# ====================================================================


SHEET_TYPES = {"csv", "xlsx"}


def _is_uuid(s: str) -> bool:
    import re
    return bool(re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", s or ""))


async def _resolve_file(user_id: str, ref: str | None) -> tuple[str, dict]:
    """Return (file_id, file_row). `ref` is a uuid or workbook name."""
    if not ref:
        raise ValueError(
            "no file specified — pass `file` with the workbook name "
            "(e.g. file='employees.csv'). Call workbook_list to see options."
        )
    if _is_uuid(ref):
        row = await get_file(ref, user_id)
        if not row:
            raise ValueError(f"file {ref} not found")
        return ref, row
    # Resolve by name within the user's workspace, sheet types only.
    all_rows = await list_user_files(user_id)
    matches = [
        r for r in all_rows
        if r["kind"] == "file" and r["type"] in SHEET_TYPES
        and r["name"].lower() == ref.strip().lower()
    ]
    if not matches:
        raise ValueError(f"workbook {ref!r} not found in workspace")
    if len(matches) > 1:
        raise ValueError(
            f"workbook {ref!r} is ambiguous ({len(matches)} matches) — use the full file id"
        )
    return matches[0]["id"], matches[0]


async def _load_sheet_by_ref(
    user_id: str, ref: str | None, sheet: str | int | None = None,
) -> tuple[str, dict]:
    fid, _row = await _resolve_file(user_id, ref)
    return fid, await _load_sheet(fid, user_id, sheet=sheet)


async def _create_workbook(
    user_id: str,
    name: str,
    file_type: str,
    parent_id: str | None,
    columns: list[str],
    rows: list[list[str]],
) -> dict:
    """Create a new csv/xlsx file in the given parent folder (None = root)."""
    row = await create_file_row(
        user_id, name=name, kind="file", type=file_type, parent_id=parent_id
    )
    payload = json.dumps({"columns": columns, "rows": rows}).encode("utf-8")
    key = storage.object_key(user_id, row["id"])
    await storage.put(key, payload, content_type="application/json")
    await set_file_r2_key_and_size(row["id"], user_id, key, len(payload))
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "parent_id": row["parent_id"],
        "row_count": len(rows),
        "column_count": len(columns),
    }


# ====================================================================
# Data science tools
# ====================================================================


SCHEMA_DESCRIBE = {
    "name": "sheet_describe",
    "description": (
        "Summary statistics for numeric columns: count, missing, mean, median, "
        "stdev, min, p25, p75, max, distinct. Use this to size up a column "
        "before deeper analysis."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Workbook name (e.g. 'sales_q1.csv')"},
            "columns": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Columns to describe. Omit to describe all numeric-looking columns.",
            },
        },
        "required": ["file"],
    },
}


SCHEMA_CORRELATE = {
    "name": "sheet_correlate",
    "description": (
        "Pearson correlation r between two numeric columns. r is in [-1, 1]; "
        "near 0 means no linear relationship. Returns r, sample size, and a "
        "qualitative strength label."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "x": {"type": "string", "description": "First column"},
            "y": {"type": "string", "description": "Second column"},
        },
        "required": ["file", "x", "y"],
    },
}


SCHEMA_VALUE_COUNTS = {
    "name": "sheet_value_counts",
    "description": "Frequency of distinct values in a column, sorted by count desc.",
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "column": {"type": "string"},
            "top": {"type": "integer", "description": "Max distinct values to return (default 20)"},
        },
        "required": ["file", "column"],
    },
}


SCHEMA_HISTOGRAM = {
    "name": "sheet_histogram",
    "description": "Bucketize a numeric column into bins and count rows per bin.",
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "column": {"type": "string"},
            "bins": {"type": "integer", "description": "Number of buckets (default 10)"},
        },
        "required": ["file", "column"],
    },
}


SCHEMA_PIVOT = {
    "name": "sheet_pivot",
    "description": (
        "Pivot table: aggregate `values` over rows × columns. Equivalent to "
        "Excel/Pandas pivot_table. Returns the pivot grid; optionally saves it "
        "as a new workbook via `save_as`."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Source workbook"},
            "rows": {"type": "string", "description": "Column to use as row labels"},
            "columns": {"type": "string", "description": "Optional column for column labels"},
            "values": {"type": "string", "description": "Numeric column to aggregate"},
            "aggfunc": {
                "type": "string",
                "enum": ["sum", "avg", "min", "max", "count"],
                "description": "Aggregation (default sum)",
            },
            "save_as": {
                "type": "string",
                "description": "Optional: write the pivot to a new workbook with this filename (e.g. 'pivot_revenue.csv').",
            },
            "parent": {
                "type": "string",
                "description": "Optional destination folder NAME for the saved file (e.g. 'Reports'). Default: same folder as the source.",
            },
        },
        "required": ["file", "rows", "values"],
    },
}


# ====================================================================
# Cross-workbook tools
# ====================================================================


SCHEMA_WORKBOOK_LIST = {
    "name": "workbook_list",
    "description": (
        "List all CSV/XLSX workbooks the user owns. Returns id, name, type, "
        "row/column counts. Call this FIRST when a request mentions another "
        "file by name."
    ),
    "parameters": {"type": "object", "properties": {}},
}


SCHEMA_WORKBOOK_PEEK = {
    "name": "workbook_peek",
    "description": "Preview another workbook: columns + first N rows. Read-only.",
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Workbook name or id"},
            "limit": {"type": "integer", "description": "Rows to preview (default 10)"},
        },
        "required": ["file"],
    },
}


SCHEMA_WORKBOOK_CREATE = {
    "name": "workbook_create",
    "description": (
        "Create a NEW workbook. Lands in the workspace's default location; "
        "pass `parent` (folder name) to place it in a specific folder."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Filename including extension, e.g. 'q1_report.csv'"},
            "columns": {"type": "array", "items": {"type": "string"}},
            "rows": {
                "type": "array",
                "items": {"type": "array", "items": {"type": "string"}},
            },
            "parent": {
                "type": "string",
                "description": "Destination folder NAME (e.g. 'Reports'). Omit for default location.",
            },
        },
        "required": ["name", "columns", "rows"],
    },
}


SCHEMA_WORKBOOK_JOIN = {
    "name": "workbook_join",
    "description": (
        "Join two workbooks on a key column and write the result to a new file. "
        "Equivalent to pandas merge. `how` controls retention of unmatched rows."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "left": {"type": "string", "description": "Left workbook name (or id)"},
            "right": {"type": "string", "description": "Right workbook name (or id)"},
            "on": {"type": "string", "description": "Column name present in both sheets"},
            "left_on": {"type": "string", "description": "Left key (if column names differ)"},
            "right_on": {"type": "string", "description": "Right key (if column names differ)"},
            "how": {"type": "string", "enum": ["inner", "left", "right", "outer"]},
            "save_as": {"type": "string", "description": "Output filename"},
            "parent": {
                "type": "string",
                "description": "Destination folder NAME (e.g. 'Reports').",
            },
        },
        "required": ["left", "right", "save_as"],
    },
}


SCHEMA_WORKBOOK_CONCAT = {
    "name": "workbook_concat",
    "description": (
        "Vertically stack rows from multiple workbooks. Columns must match "
        "(by header). Writes to a new file."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "files": {"type": "array", "items": {"type": "string"}},
            "save_as": {"type": "string"},
            "add_source_column": {
                "type": "boolean",
                "description": "If true, add a 'Source' column with the origin filename.",
            },
            "parent": {
                "type": "string",
                "description": "Destination folder NAME.",
            },
        },
        "required": ["files", "save_as"],
    },
}


# ====================================================================
# Handlers — data science
# ====================================================================


def _numeric_column(rows: list[list[str]], ci: int) -> list[float]:
    vals: list[float] = []
    for r in rows:
        if ci >= len(r):
            continue
        n = _try_float(r[ci])
        if n is not None:
            vals.append(n)
    return vals


def _describe_one(header: str, values: list[str]) -> dict:
    raw = list(values)
    nums = [n for n in (_try_float(v) for v in raw) if n is not None]
    distinct = len({v for v in raw if str(v).strip() != ""})
    missing = sum(1 for v in raw if str(v).strip() == "")
    out: dict = {
        "column": header,
        "count": len(raw),
        "missing": missing,
        "distinct": distinct,
        "numeric_count": len(nums),
    }
    if nums:
        nums_sorted = sorted(nums)
        n = len(nums_sorted)
        def pct(p: float) -> float:
            if n == 1:
                return nums_sorted[0]
            k = (n - 1) * p
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return nums_sorted[int(k)]
            return nums_sorted[f] + (nums_sorted[c] - nums_sorted[f]) * (k - f)
        out.update(
            {
                "mean": round(sum(nums) / len(nums), 6),
                "median": round(pct(0.5), 6),
                "stdev": round(statistics.pstdev(nums), 6) if len(nums) > 1 else 0.0,
                "min": min(nums),
                "p25": round(pct(0.25), 6),
                "p75": round(pct(0.75), 6),
                "max": max(nums),
                "sum": round(sum(nums), 6),
            }
        )
    return out


async def handler_describe(
    *, user_id: str, columns: list[str] | None = None, file: str | None = None, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    all_cols = sheet["columns"]
    if columns:
        target_idxs = []
        for c in columns:
            try:
                target_idxs.append(_col_index(c, all_cols))
            except ValueError:
                continue
    else:
        # Default: any column where ≥50% of non-empty cells parse as numeric.
        target_idxs = []
        for i in range(len(all_cols)):
            vals = [r[i] for r in sheet["rows"] if i < len(r)]
            non_empty = [v for v in vals if str(v).strip() != ""]
            if not non_empty:
                continue
            num = sum(1 for v in non_empty if _try_float(v) is not None)
            if num / len(non_empty) >= 0.5:
                target_idxs.append(i)
    results = []
    for i in target_idxs:
        col_values = [r[i] for r in sheet["rows"] if i < len(r)]
        results.append(_describe_one(all_cols[i], col_values))
    return {
        "type": "describe_result",
        "file_id": fid,
        "row_count": len(sheet["rows"]),
        "columns": results,
    }


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ys))
    if den_x == 0 or den_y == 0:
        return None
    return num / (den_x * den_y)


def _strength(r: float) -> str:
    a = abs(r)
    if a < 0.1:
        return "none"
    if a < 0.3:
        return "weak"
    if a < 0.5:
        return "moderate"
    if a < 0.7:
        return "strong"
    return "very strong"


async def handler_correlate(
    *, user_id: str, x: str, y: str, file: str | None = None, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
        xi = _col_index(x, sheet["columns"])
        yi = _col_index(y, sheet["columns"])
    except ValueError as e:
        return {"error": str(e)}
    xs: list[float] = []
    ys: list[float] = []
    for row in sheet["rows"]:
        if xi >= len(row) or yi >= len(row):
            continue
        a = _try_float(row[xi])
        b = _try_float(row[yi])
        if a is None or b is None:
            continue
        xs.append(a)
        ys.append(b)
    r = _pearson(xs, ys)
    return {
        "type": "correlation_result",
        "file_id": fid,
        "x": sheet["columns"][xi],
        "y": sheet["columns"][yi],
        "r": round(r, 6) if r is not None else None,
        "r_squared": round(r * r, 6) if r is not None else None,
        "strength": _strength(r) if r is not None else "undefined",
        "sample_size": len(xs),
    }


async def handler_value_counts(
    *, user_id: str, column: str, top: int = 20, file: str | None = None, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
        ci = _col_index(column, sheet["columns"])
    except ValueError as e:
        return {"error": str(e)}
    counts: dict[str, int] = {}
    for r in sheet["rows"]:
        if ci >= len(r):
            continue
        v = str(r[ci]).strip()
        if not v:
            continue
        counts[v] = counts.get(v, 0) + 1
    sorted_counts = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[: max(1, int(top))]
    return {
        "type": "value_counts_result",
        "file_id": fid,
        "column": sheet["columns"][ci],
        "distinct": len(counts),
        "values": [{"value": k, "count": v} for k, v in sorted_counts],
    }


async def handler_histogram(
    *, user_id: str, column: str, bins: int = 10, file: str | None = None, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
        ci = _col_index(column, sheet["columns"])
    except ValueError as e:
        return {"error": str(e)}
    nums = _numeric_column(sheet["rows"], ci)
    if not nums:
        return {"error": f"column {sheet['columns'][ci]!r} has no numeric values"}
    n_bins = max(1, int(bins))
    lo = min(nums)
    hi = max(nums)
    if lo == hi:
        return {
            "type": "histogram_result",
            "file_id": fid,
            "column": sheet["columns"][ci],
            "bins": [{"lo": lo, "hi": hi, "count": len(nums)}],
            "sample_size": len(nums),
        }
    width = (hi - lo) / n_bins
    buckets = [0] * n_bins
    for v in nums:
        idx = int((v - lo) / width)
        if idx >= n_bins:
            idx = n_bins - 1
        buckets[idx] += 1
    bins_out = [
        {"lo": round(lo + i * width, 6), "hi": round(lo + (i + 1) * width, 6), "count": c}
        for i, c in enumerate(buckets)
    ]
    return {
        "type": "histogram_result",
        "file_id": fid,
        "column": sheet["columns"][ci],
        "bins": bins_out,
        "sample_size": len(nums),
        "min": lo,
        "max": hi,
    }


async def handler_pivot(
    *, user_id: str, rows: str, values: str,
    columns: str | None = None, aggfunc: str = "sum",
    file: str | None = None, save_as: str | None = None,
    parent: str | None = None, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
        ri = _col_index(rows, sheet["columns"])
        vi = _col_index(values, sheet["columns"])
        ci = _col_index(columns, sheet["columns"]) if columns else None
    except ValueError as e:
        return {"error": str(e)}

    def agg(items: list[float]) -> float | int | None:
        if aggfunc == "count":
            return len(items)
        if not items:
            return None
        if aggfunc == "sum":
            return round(sum(items), 6)
        if aggfunc == "avg":
            return round(sum(items) / len(items), 6)
        if aggfunc == "min":
            return min(items)
        if aggfunc == "max":
            return max(items)
        return None

    # Collect cells
    cells: dict[tuple[str, str | None], list[float]] = {}
    for row in sheet["rows"]:
        rk = row[ri] if ri < len(row) else ""
        ck = row[ci] if ci is not None and ci < len(row) else None
        if aggfunc == "count":
            cells.setdefault((rk, ck), []).append(1.0)
        else:
            v = _try_float(row[vi]) if vi < len(row) else None
            if v is None:
                continue
            cells.setdefault((rk, ck), []).append(v)

    row_keys = sorted({k[0] for k in cells.keys()}, key=str)
    if ci is not None:
        col_keys = sorted({k[1] for k in cells.keys() if k[1] is not None}, key=str)
        grid_rows: list[list[str]] = []
        for rk in row_keys:
            r_out = [rk]
            for ck in col_keys:
                v = agg(cells.get((rk, ck), []))
                r_out.append("" if v is None else str(v))
            grid_rows.append(r_out)
        result_columns = [sheet["columns"][ri], *[str(k) for k in col_keys]]
    else:
        grid_rows = []
        for rk in row_keys:
            v = agg(cells.get((rk, None), []))
            grid_rows.append([rk, "" if v is None else str(v)])
        result_columns = [sheet["columns"][ri], f"{aggfunc}({sheet['columns'][vi]})"]

    out: dict = {
        "type": "pivot_result",
        "file_id": fid,
        "rows": sheet["columns"][ri],
        "columns": sheet["columns"][ci] if ci is not None else None,
        "values": sheet["columns"][vi],
        "aggfunc": aggfunc,
        "result_columns": result_columns,
        "result_rows": grid_rows,
        "shape": [len(grid_rows), len(result_columns)],
    }
    if save_as:
        ftype = "xlsx" if save_as.lower().endswith(".xlsx") else "csv"
        parent_id = await _resolve_parent_id(user_id, fid, parent)
        new = await _create_workbook(
            user_id, save_as, ftype, parent_id, result_columns, grid_rows,
        )
        out["saved_as"] = new
    return out


# ====================================================================
# Handlers — cross-workbook
# ====================================================================


async def handler_workbook_list(*, user_id: str) -> dict:
    all_rows = await list_user_files(user_id)
    workbooks = []
    for r in all_rows:
        if r["kind"] != "file" or r["type"] not in SHEET_TYPES:
            continue
        cols = 0
        n_rows = 0
        sheet_names: list[str] = []
        if r["r2_key"]:
            try:
                raw = await storage.get(r["r2_key"])
                content = json.loads(raw.decode("utf-8"))
                if isinstance(content.get("sheets"), list) and content["sheets"]:
                    first = content["sheets"][0] or {}
                    cols = len(first.get("columns") or [])
                    n_rows = len(first.get("rows") or [])
                    sheet_names = [
                        str((s or {}).get("name") or f"Sheet{i+1}")
                        for i, s in enumerate(content["sheets"])
                    ]
                else:
                    cols = len(content.get("columns") or [])
                    n_rows = len(content.get("rows") or [])
            except Exception:
                pass
        entry = {
            "id": r["id"],
            "name": r["name"],
            "type": r["type"],
            "parent_id": r["parent_id"],
            "columns": cols,
            "rows": n_rows,
        }
        if sheet_names:
            entry["sheets"] = sheet_names
        workbooks.append(entry)
    return {
        "type": "workbook_list",
        "workbooks": workbooks,
    }


SCHEMA_WORKBOOK_LIST_SHEETS = {
    "name": "workbook_list_sheets",
    "description": (
        "List sheet names inside an xlsx workbook. Use this BEFORE any "
        "sheet_* call on a multi-sheet xlsx so you know what to pass as `sheet`."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Workbook name (e.g. 'orders.xlsx')"},
        },
        "required": ["file"],
    },
}


async def handler_workbook_list_sheets(*, user_id: str, file: str) -> dict:
    try:
        fid, _row = await _resolve_file(user_id, file)
    except ValueError as e:
        return {"error": str(e)}
    row = await get_file(fid, user_id)
    if not row or not row.get("r2_key"):
        return {"type": "workbook_sheets", "file_id": fid, "sheets": []}
    try:
        raw = await storage.get(row["r2_key"])
        content = json.loads(raw.decode("utf-8"))
    except Exception:
        return {"type": "workbook_sheets", "file_id": fid, "sheets": []}

    out: list[dict] = []
    if isinstance(content.get("sheets"), list) and content["sheets"]:
        for i, s in enumerate(content["sheets"]):
            s = s or {}
            out.append(
                {
                    "index": i,
                    "name": str(s.get("name") or f"Sheet{i+1}"),
                    "rows": len(s.get("rows") or []),
                    "columns": len(s.get("columns") or []),
                }
            )
    else:
        out.append(
            {
                "index": 0,
                "name": "Sheet1",
                "rows": len(content.get("rows") or []),
                "columns": len(content.get("columns") or []),
            }
        )
    return {"type": "workbook_sheets", "file_id": fid, "sheets": out}


async def handler_workbook_peek(
    *, user_id: str, file: str, limit: int = 10, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    n = max(1, int(limit or 10))
    return {
        "type": "workbook_peek",
        "file_id": fid,
        "columns": sheet["columns"],
        "rows": sheet["rows"][:n],
        "row_count": len(sheet["rows"]),
    }


async def _default_parent_id(user_id: str, source_file_id: str | None = None) -> str | None:
    """Pick a sensible parent folder for newly-created workbooks.

    Order: 1) parent of `source_file_id` (the workbook the output is derived from),
    2) the only Workbooks-ish folder the user has, 3) the only folder, 4) root."""
    if source_file_id:
        src = await get_file(source_file_id, user_id)
        if src:
            return src["parent_id"]
    all_rows = await list_user_files(user_id)
    sheet_parents = {
        r["parent_id"] for r in all_rows
        if r["kind"] == "file" and r["type"] in SHEET_TYPES and r["parent_id"]
    }
    if len(sheet_parents) == 1:
        return next(iter(sheet_parents))
    folders = [r for r in all_rows if r["kind"] == "folder"]
    if len(folders) == 1:
        return folders[0]["id"]
    return None


async def _resolve_parent_id(
    user_id: str, source_file_id: str | None, parent: str | None
) -> str | None:
    """If `parent` (folder name/id) is provided, resolve to its id; else use default."""
    if parent:
        s = str(parent).strip()
        if s:
            if _is_uuid(s):
                return s
            f = await _find_folder(user_id, s)
            if f:
                return f["id"]
            # Fall through to default if name doesn't match — better than failing.
    return await _default_parent_id(user_id, source_file_id)


async def handler_workbook_create(
    *, user_id: str, name: str, columns: list, rows: list,
    parent: str | None = None,
) -> dict:
    if not name or not isinstance(name, str):
        return {"error": "name required"}
    ftype = "xlsx" if name.lower().endswith(".xlsx") else "csv"
    cols = [str(c) for c in (columns or [])]
    width = len(cols)
    cleaned: list[list[str]] = []
    for r in rows or []:
        if not isinstance(r, list):
            continue
        row = [("" if c is None else str(c)) for c in r]
        if len(row) < width:
            row += [""] * (width - len(row))
        elif len(row) > width:
            row = row[:width]
        cleaned.append(row)
    parent_id = await _resolve_parent_id(user_id, None, parent)
    new = await _create_workbook(user_id, name, ftype, parent_id, cols, cleaned)
    return {"type": "workbook_create", **new}


async def handler_workbook_join(
    *, user_id: str, left: str, right: str, save_as: str,
    on: str | None = None, left_on: str | None = None, right_on: str | None = None,
    how: str = "inner", parent: str | None = None,
    left_sheet: str | int | None = None, right_sheet: str | int | None = None,
) -> dict:
    try:
        l_fid, l_sheet = await _load_sheet_by_ref(user_id, left, sheet=left_sheet)
        r_fid, r_sheet = await _load_sheet_by_ref(user_id, right, sheet=right_sheet)
    except ValueError as e:
        return {"error": str(e)}
    l_key = left_on or on
    r_key = right_on or on
    if not l_key or not r_key:
        return {"error": "must provide `on` or both `left_on`+`right_on`"}
    try:
        li = _col_index(l_key, l_sheet["columns"])
        ri = _col_index(r_key, r_sheet["columns"])
    except ValueError as e:
        return {"error": str(e)}

    # Output columns = left cols + right cols (rename collisions)
    out_cols: list[str] = list(l_sheet["columns"])
    right_aliases: list[str] = []
    for i, c in enumerate(r_sheet["columns"]):
        if i == ri:
            right_aliases.append(None)  # skip — we already have the key
            continue
        candidate = c
        if c in out_cols:
            candidate = f"{c}_r"
        right_aliases.append(candidate)
        out_cols.append(candidate)

    # Build right index
    right_by_key: dict[str, list[list[str]]] = {}
    for row in r_sheet["rows"]:
        k = row[ri] if ri < len(row) else ""
        right_by_key.setdefault(k, []).append(row)
    matched_right_keys: set[str] = set()

    out_rows: list[list[str]] = []
    for l_row in l_sheet["rows"]:
        k = l_row[li] if li < len(l_row) else ""
        matches = right_by_key.get(k, [])
        if matches:
            matched_right_keys.add(k)
            for r_row in matches:
                combined = list(l_row)
                for j, alias in enumerate(right_aliases):
                    if alias is None:
                        continue
                    combined.append(r_row[j] if j < len(r_row) else "")
                out_rows.append(combined)
        elif how in ("left", "outer"):
            combined = list(l_row) + ["" for alias in right_aliases if alias is not None]
            out_rows.append(combined)

    if how in ("right", "outer"):
        for k, rows in right_by_key.items():
            if k in matched_right_keys:
                continue
            for r_row in rows:
                combined = ["" for _ in l_sheet["columns"]]
                # Put the join key into the left key position so it isn't blank
                if li < len(combined):
                    combined[li] = r_row[ri] if ri < len(r_row) else ""
                for j, alias in enumerate(right_aliases):
                    if alias is None:
                        continue
                    combined.append(r_row[j] if j < len(r_row) else "")
                out_rows.append(combined)

    ftype = "xlsx" if save_as.lower().endswith(".xlsx") else "csv"
    parent_id = await _resolve_parent_id(user_id, None, parent)
    new = await _create_workbook(
        user_id, save_as, ftype, parent_id, out_cols, out_rows
    )
    return {
        "type": "workbook_join_result",
        "how": how,
        "left": left,
        "right": right,
        "on_left": l_sheet["columns"][li],
        "on_right": r_sheet["columns"][ri],
        "row_count": len(out_rows),
        "saved_as": new,
    }


async def handler_workbook_concat(
    *, user_id: str, files: list, save_as: str,
    add_source_column: bool = False, parent: str | None = None,
) -> dict:
    if not files or len(files) < 2:
        return {"error": "concat needs at least 2 files"}
    sheets: list[tuple[str, dict]] = []
    for f in files:
        # Each entry is either a workbook name (str) or {file: name, sheet: name|index}
        ref = f
        sheet_ref = None
        if isinstance(f, dict):
            ref = f.get("file") or f.get("name")
            sheet_ref = f.get("sheet")
        try:
            fid, sheet = await _load_sheet_by_ref(user_id, ref, sheet=sheet_ref)
        except ValueError as e:
            return {"error": str(e)}
        # Carry original name through for the optional source column
        src_row = await get_file(fid, user_id)
        sheets.append((src_row["name"] if src_row else str(ref), sheet))

    # Union of headers preserving order of first appearance.
    out_cols: list[str] = []
    for _name, s in sheets:
        for c in s["columns"]:
            if c not in out_cols:
                out_cols.append(c)
    if add_source_column and "Source" not in out_cols:
        out_cols.append("Source")
    out_rows: list[list[str]] = []
    for name, s in sheets:
        idx_map = {c: s["columns"].index(c) if c in s["columns"] else None for c in out_cols if c != "Source"}
        for row in s["rows"]:
            new_row = []
            for c in out_cols:
                if c == "Source":
                    new_row.append(name)
                    continue
                j = idx_map.get(c)
                new_row.append(row[j] if j is not None and j < len(row) else "")
            out_rows.append(new_row)
    ftype = "xlsx" if save_as.lower().endswith(".xlsx") else "csv"
    parent_id = await _resolve_parent_id(user_id, None, parent)
    new = await _create_workbook(
        user_id, save_as, ftype, parent_id, out_cols, out_rows
    )
    return {
        "type": "workbook_concat_result",
        "source_count": len(sheets),
        "row_count": len(out_rows),
        "column_count": len(out_cols),
        "saved_as": new,
    }


# ====================================================================
# Formula tools
# ====================================================================


SCHEMA_SET_FORMULA = {
    "name": "sheet_set_formula",
    "description": (
        "Write one or many cells as FORMULAS (e.g. '=B2*C2', '=SUM(A2:A10)'). "
        "Formulas auto-recompute when their source cells change. Prefer this "
        "over sheet_set_cells for derived values — totals, ratios, lookups — "
        "so the workbook stays live. Address uses A1 notation: A1 = first "
        "header cell, A2 = first data row, etc. To clear a formula, pass an "
        "empty string."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string", "description": "Workbook name"},
            "cells": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "address": {"type": "string", "description": "A1 notation, e.g. 'D2'"},
                        "formula": {"type": "string", "description": "e.g. '=B2*C2' (with or without leading '=')"},
                    },
                    "required": ["address", "formula"],
                },
            },
        },
        "required": ["file", "cells"],
    },
}


SCHEMA_ADD_FORMULA_COLUMN = {
    "name": "sheet_add_formula_column",
    "description": (
        "Append a new column whose every data row is the same formula pattern. "
        "Use {ROW} as a placeholder for the current row number (e.g. "
        "'=B{ROW}*C{ROW}' becomes '=B2*C2' in the first data row, '=B3*C3' in "
        "the second). The formulas re-evaluate on any source-cell change."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file": {"type": "string"},
            "header": {"type": "string"},
            "formula": {
                "type": "string",
                "description": "Formula pattern with {ROW} placeholder, e.g. '=B{ROW}*C{ROW}' or '=SUM(B{ROW}:D{ROW})'",
            },
        },
        "required": ["file", "header", "formula"],
    },
}


async def handler_set_formula(
    *, user_id: str, file: str | None = None, cells: list, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    formulas = dict(sheet.get("formulas") or {})
    applied = 0
    errors: list[str] = []
    for c in cells or []:
        addr_ = str(c.get("address") or "").strip().upper().replace("$", "")
        expr = c.get("formula")
        if not addr_:
            errors.append("missing address")
            continue
        # Validate address shape
        try:
            r, col_ = _formula.parse_addr(addr_)
        except Exception:
            errors.append(f"bad address {addr_!r}")
            continue
        if col_ < 1 or col_ > len(sheet["columns"]):
            errors.append(f"{addr_}: column out of range")
            continue
        if r < 1 or r > len(sheet["rows"]) + 1:
            errors.append(f"{addr_}: row out of range")
            continue
        if expr is None or str(expr).strip() == "":
            formulas.pop(addr_, None)
            # Clear the cell too
            if r == 1:
                sheet["columns"][col_ - 1] = ""
            else:
                sheet["rows"][r - 2][col_ - 1] = ""
            applied += 1
            continue
        s = str(expr).strip()
        if not s.startswith("="):
            s = "=" + s
        try:
            _formula.parse(s)
        except _formula.FormulaError as e:
            errors.append(f"{addr_}: {e}")
            continue
        formulas[addr_] = s
        applied += 1
    sheet["formulas"] = formulas
    await _save_sheet(sheet, fid, user_id)
    return {
        "type": "sheet_update",
        "file_id": fid,
        "applied": applied,
        "errors": errors,
        "row_count": len(sheet["rows"]),
        "formulas_count": len(sheet["formulas"]),
    }


async def handler_add_formula_column(
    *, user_id: str, file: str | None = None,
    header: str, formula: str, sheet: str | int | None = None,
) -> dict:
    try:
        fid, sheet = await _load_sheet_by_ref(user_id, file, sheet=sheet)
    except ValueError as e:
        return {"error": str(e)}
    if not header or not isinstance(header, str):
        return {"error": "header required"}
    pattern = str(formula or "").strip()
    if not pattern:
        return {"error": "formula required"}
    if not pattern.startswith("="):
        pattern = "=" + pattern

    # Append the new column (empty values)
    sheet["columns"].append(header.strip())
    for row in sheet["rows"]:
        row.append("")
    col_index = len(sheet["columns"])
    col_letter = _formula.addr(1, col_index)[:-1]  # drop trailing "1"

    formulas = dict(sheet.get("formulas") or {})
    errors: list[str] = []
    added = 0
    for i in range(len(sheet["rows"])):
        rownum = i + 2  # data row addresses start at 2
        expr = pattern.replace("{ROW}", str(rownum))
        try:
            _formula.parse(expr)
        except _formula.FormulaError as e:
            errors.append(f"row {rownum}: {e}")
            continue
        formulas[f"{col_letter}{rownum}"] = expr
        added += 1
    sheet["formulas"] = formulas
    await _save_sheet(sheet, fid, user_id)
    return {
        "type": "sheet_update",
        "file_id": fid,
        "added": added,
        "errors": errors,
        "column_count": len(sheet["columns"]),
        "new_column": header.strip(),
    }


# ====================================================================
# Folder tools
# ====================================================================


SCHEMA_FOLDER_CREATE = {
    "name": "folder_create",
    "description": (
        "Create a new folder in the user's workspace. Use this to organise "
        "outputs (e.g. group reports into a 'Reports' folder)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Folder name"},
            "parent": {
                "type": "string",
                "description": "Optional parent folder name (default: root). Use folder name not id.",
            },
        },
        "required": ["name"],
    },
}


SCHEMA_MOVE_ITEM = {
    "name": "move_item",
    "description": (
        "Move a file or folder to a different parent folder. Pass target='' or "
        "omit to move to root."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "item": {"type": "string", "description": "File/folder name to move"},
            "target": {
                "type": "string",
                "description": "Destination folder name (omit/empty for root)",
            },
        },
        "required": ["item"],
    },
}


async def _find_folder(user_id: str, name: str) -> dict | None:
    rows = await list_user_files(user_id)
    matches = [
        r for r in rows
        if r["kind"] == "folder" and r["name"].lower() == name.strip().lower()
    ]
    if not matches:
        return None
    if len(matches) > 1:
        # Prefer one at root if ambiguous
        roots = [r for r in matches if r["parent_id"] is None]
        return roots[0] if roots else matches[0]
    return matches[0]


async def _find_item(user_id: str, name: str) -> dict | None:
    """Find a file OR folder by name. Files matched case-insensitively."""
    rows = await list_user_files(user_id)
    matches = [
        r for r in rows
        if r["name"].lower() == name.strip().lower()
    ]
    if not matches:
        return None
    if len(matches) > 1:
        return matches[0]  # best-effort first match
    return matches[0]


async def _is_descendant(user_id: str, item_id: str, candidate_ancestor_id: str) -> bool:
    """True if candidate_ancestor_id is in the descendant chain of item_id."""
    rows = await list_user_files(user_id)
    by_id = {r["id"]: r for r in rows}
    # Walk descendants of item_id
    stack = [item_id]
    while stack:
        cur = stack.pop()
        if cur == candidate_ancestor_id:
            return True
        for r in rows:
            if r["parent_id"] == cur:
                stack.append(r["id"])
    return False


async def handler_folder_create(
    *, user_id: str, name: str, parent: str | None = None,
) -> dict:
    name = (name or "").strip()
    if not name:
        return {"error": "name required"}
    parent_id: str | None = None
    if parent:
        f = await _find_folder(user_id, parent)
        if not f:
            return {"error": f"parent folder {parent!r} not found"}
        parent_id = f["id"]
    row = await create_file_row(
        user_id, name=name, kind="folder", parent_id=parent_id
    )
    return {
        "type": "folder_create",
        "id": row["id"],
        "name": row["name"],
        "parent_id": row["parent_id"],
    }


async def handler_move_item(
    *, user_id: str, item: str, target: str | None = None,
) -> dict:
    from db import move_file_row

    item_name = (item or "").strip()
    if not item_name:
        return {"error": "item required"}
    src = await _find_item(user_id, item_name)
    if not src:
        return {"error": f"item {item!r} not found"}
    target_id: str | None = None
    target_name = "(root)"
    if target and str(target).strip():
        tgt = await _find_folder(user_id, target)
        if not tgt:
            return {"error": f"target folder {target!r} not found"}
        # Cycle guard: can't move a folder into itself or a descendant
        if src["kind"] == "folder":
            if src["id"] == tgt["id"]:
                return {"error": "cannot move a folder into itself"}
            if await _is_descendant(user_id, src["id"], tgt["id"]):
                return {"error": "cannot move a folder into one of its descendants"}
        target_id = tgt["id"]
        target_name = tgt["name"]
    await move_file_row(src["id"], user_id, target_id)
    return {
        "type": "move_item",
        "id": src["id"],
        "name": src["name"],
        "moved_to": target_name,
        "parent_id": target_id,
    }


# --------------------------------------------------------------------
# Multi-sheet xlsx: inject `sheet` property into every schema whose
# handler accepts the `sheet` kwarg. Keeping this here (vs. inline in
# every schema literal) avoids dozens of duplicated description strings.
# --------------------------------------------------------------------

_SHEET_PROP = {
    "type": "string",
    "description": (
        "For xlsx workbooks with multiple sheets: the sheet to operate on "
        "(name or 0-based index). Defaults to the first sheet. Call "
        "workbook_list_sheets first if you don't know the sheet names."
    ),
}

for _s in (
    SCHEMA_READ,
    SCHEMA_SET_CELLS,
    SCHEMA_ADD_ROWS,
    SCHEMA_DELETE_ROWS,
    SCHEMA_ADD_COLUMNS,
    SCHEMA_DELETE_COLUMNS,
    SCHEMA_SET_HEADERS,
    SCHEMA_REPLACE_ALL,
    SCHEMA_COMPUTE,
    SCHEMA_SORT,
    SCHEMA_FILTER,
    SCHEMA_DESCRIBE,
    SCHEMA_CORRELATE,
    SCHEMA_VALUE_COUNTS,
    SCHEMA_HISTOGRAM,
    SCHEMA_PIVOT,
    SCHEMA_WORKBOOK_PEEK,
    SCHEMA_SET_FORMULA,
    SCHEMA_ADD_FORMULA_COLUMN,
):
    _s["parameters"]["properties"].setdefault("sheet", _SHEET_PROP)

# Cross-workbook tools take per-side sheet refs instead of a single `sheet`.
SCHEMA_WORKBOOK_JOIN["parameters"]["properties"].setdefault(
    "left_sheet", {**_SHEET_PROP, "description": "Sheet to use from `left` (xlsx multi-sheet only)."}
)
SCHEMA_WORKBOOK_JOIN["parameters"]["properties"].setdefault(
    "right_sheet", {**_SHEET_PROP, "description": "Sheet to use from `right` (xlsx multi-sheet only)."}
)
# workbook_concat: `files` items can now be either a workbook name or
# {file, sheet}. Update the items schema to allow both.
SCHEMA_WORKBOOK_CONCAT["parameters"]["properties"]["files"] = {
    "type": "array",
    "description": (
        "List of workbooks to stack. Each entry is either a workbook name "
        "(uses first sheet) or an object {file, sheet} to pick a sheet from "
        "a multi-sheet xlsx."
    ),
    "items": {
        "oneOf": [
            {"type": "string"},
            {
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "sheet": _SHEET_PROP,
                },
                "required": ["file"],
            },
        ]
    },
}
