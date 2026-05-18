"""End-to-end tests for the Excel agent.

Self-contained: a module-scoped fixture seeds a dedicated 'excel-agent-tests'
folder with a small relational dataset and tears it down after the module runs.

Hits the running stack (FastAPI + Postgres + R2 + Anthropic), so it carries
all the slow / integration / db markers. Skipped automatically if the API
isn't reachable, just like test_files_integration.py.

Run everything in this file:
    make test FILE=tests/test_excel_agent.py
Run just one case:
    make test FILE=tests/test_excel_agent.py K=pipeline
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import sys
import uuid
from pathlib import Path
from typing import Any

import asyncpg
import httpx
import pytest
import pytest_asyncio
from dotenv import load_dotenv

# Make `backend/` importable so `from db import ...` works from tests/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load R2 + Neon + Anthropic creds from the local env file.
load_dotenv(Path(__file__).resolve().parents[2] / "envs" / ".env.local")


API = os.getenv("API_BASE", "http://localhost:8890")
DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://taskagents:taskagents@localhost:5491/taskagents",
)
DEFAULT_EMAIL = os.getenv("TEST_USER_EMAIL", "hengweyseing53@gmail.com")


def _stack_up() -> bool:
    """Skip the module if the stack isn't running — friendly message instead
    of a wall of connection-refused tracebacks."""
    try:
        r = httpx.get(f"{API}/health", timeout=1.0)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


# Every test here costs Anthropic tokens, talks to Postgres, hits the live
# FastAPI app, and waits on streaming SSE — slow + integration + db.
pytestmark = [
    pytest.mark.slow,
    pytest.mark.integration,
    pytest.mark.db,
    pytest.mark.skipif(
        not _stack_up(),
        reason=f"API not reachable at {API} — start `docker compose up`",
    ),
]


# ----------------------------------------------------------------------------
# Test dataset (a small relational seed: customers → orders → order_items →
# products, plus payments / employees / performance). Kept inline so the test
# file is self-contained.
# ----------------------------------------------------------------------------

SEED: dict[str, tuple[str, dict]] = {
    "customers.csv": ("csv", {
        "columns": ["CustomerID", "Name", "Region", "Tier", "JoinDate"],
        "rows": [
            ["C001", "Acme Holdings", "APAC", "Enterprise", "2022-01-15"],
            ["C002", "Nimbus Labs", "EMEA", "Growth", "2023-04-02"],
            ["C003", "Orchid Bank", "APAC", "Enterprise", "2021-09-20"],
            ["C004", "Pinecrest LLC", "AMER", "SMB", "2024-02-11"],
            ["C005", "Vertex Corp", "AMER", "Enterprise", "2020-06-30"],
            ["C006", "Sable Foods", "EMEA", "SMB", "2024-08-18"],
            ["C007", "Maple Energy", "AMER", "Growth", "2023-11-05"],
            ["C008", "Kintaro KK", "APAC", "Growth", "2022-12-01"],
            ["C009", "Helio Mining", "AMER", "SMB", "2025-01-12"],
            ["C010", "Bristol Logistics", "EMEA", "Growth", "2023-07-22"],
            ["C011", "Tessera Pharma", "EMEA", "Enterprise", "2021-03-08"],
            ["C012", "Andes Retail", "AMER", "SMB", "2024-10-04"],
        ],
    }),
    "products.csv": ("csv", {
        "columns": ["ProductID", "Name", "Category", "UnitPrice", "UnitCost"],
        "rows": [
            ["P01", "Lumen Pro Plan", "Software", "1200", "180"],
            ["P02", "Lumen Lite Plan", "Software", "350", "60"],
            ["P03", "Lumen Enterprise Plan", "Software", "4500", "650"],
            ["P04", "Onboarding Pack", "Service", "800", "320"],
            ["P05", "Premium Support", "Service", "600", "180"],
            ["P06", "Data Migration", "Service", "1500", "700"],
            ["P07", "Custom Integration", "Service", "2800", "1200"],
            ["P08", "Training Workshop", "Service", "950", "300"],
        ],
    }),
    "orders.csv": ("csv", {
        "columns": ["OrderID", "CustomerID", "Date", "Status", "SalesRepID"],
        "rows": [
            ["O1001", "C001", "2026-01-08", "Closed", "E002"],
            ["O1002", "C003", "2026-01-12", "Closed", "E006"],
            ["O1003", "C005", "2026-01-18", "Closed", "E002"],
            ["O1004", "C002", "2026-01-22", "Closed", "E010"],
            ["O1005", "C007", "2026-02-02", "Closed", "E010"],
            ["O1006", "C001", "2026-02-10", "Closed", "E002"],
            ["O1007", "C004", "2026-02-14", "Closed", "E006"],
            ["O1008", "C008", "2026-02-21", "Closed", "E002"],
            ["O1009", "C011", "2026-02-26", "Closed", "E006"],
            ["O1010", "C005", "2026-03-03", "Closed", "E010"],
            ["O1011", "C010", "2026-03-09", "Closed", "E010"],
            ["O1012", "C003", "2026-03-15", "Closed", "E002"],
            ["O1013", "C012", "2026-03-18", "Open",   "E006"],
            ["O1014", "C006", "2026-03-22", "Open",   "E010"],
            ["O1015", "C009", "2026-03-25", "Closed", "E002"],
            ["O1016", "C001", "2026-04-02", "Open",   "E002"],
            ["O1017", "C005", "2026-04-08", "Closed", "E010"],
            ["O1018", "C011", "2026-04-15", "Closed", "E006"],
            ["O1019", "C002", "2026-04-22", "Open",   "E010"],
            ["O1020", "C008", "2026-04-28", "Closed", "E002"],
        ],
    }),
    "order_items.csv": ("csv", {
        "columns": ["OrderID", "ProductID", "Quantity"],
        "rows": [
            ["O1001", "P01", "10"], ["O1001", "P04", "1"],
            ["O1002", "P03", "3"], ["O1002", "P05", "12"], ["O1002", "P06", "1"],
            ["O1003", "P03", "5"], ["O1003", "P07", "2"],
            ["O1004", "P01", "6"], ["O1004", "P08", "1"],
            ["O1005", "P02", "40"], ["O1005", "P05", "6"],
            ["O1006", "P05", "20"],
            ["O1007", "P02", "12"], ["O1007", "P04", "1"],
            ["O1008", "P01", "8"], ["O1008", "P04", "1"],
            ["O1009", "P03", "4"], ["O1009", "P06", "2"], ["O1009", "P07", "1"],
            ["O1010", "P01", "15"],
            ["O1011", "P02", "25"], ["O1011", "P05", "5"],
            ["O1012", "P01", "9"],
            ["O1013", "P02", "6"],
            ["O1014", "P02", "10"], ["O1014", "P08", "1"],
            ["O1015", "P02", "8"],
            ["O1016", "P03", "2"],
            ["O1017", "P05", "15"], ["O1017", "P08", "2"],
            ["O1018", "P01", "12"], ["O1018", "P05", "8"],
            ["O1019", "P01", "5"],
            ["O1020", "P01", "7"],
        ],
    }),
    "payments.csv": ("csv", {
        "columns": ["PaymentID", "OrderID", "Date", "Amount", "Method"],
        "rows": [
            ["PMT-001", "O1001", "2026-01-10", "12800", "Wire"],
            ["PMT-002", "O1002", "2026-01-15", "21700", "Wire"],
            ["PMT-003", "O1003", "2026-01-20", "28100", "Wire"],
            ["PMT-004", "O1004", "2026-01-25", "7150", "Card"],
            ["PMT-005", "O1005", "2026-02-04", "17600", "Card"],
            ["PMT-006", "O1006", "2026-02-12", "12000", "Wire"],
            ["PMT-007", "O1007", "2026-02-16", "5000", "Card"],
            ["PMT-008", "O1008", "2026-02-23", "10400", "Wire"],
            ["PMT-009", "O1009", "2026-02-28", "23800", "Wire"],
            ["PMT-010", "O1010", "2026-03-05", "18000", "Wire"],
            ["PMT-011", "O1011", "2026-03-12", "6000", "Card"],
            ["PMT-011b", "O1011", "2026-04-02", "5800", "Card"],
            ["PMT-012", "O1012", "2026-03-18", "10800", "Wire"],
            ["PMT-015", "O1015", "2026-03-28", "2800", "Card"],
            ["PMT-017", "O1017", "2026-04-10", "10900", "Wire"],
            ["PMT-018", "O1018", "2026-04-18", "19200", "Wire"],
            ["PMT-020", "O1020", "2026-05-02", "8400", "Card"],
        ],
    }),
    "employees.csv": ("csv", {
        "columns": ["EmployeeID", "Name", "Department", "Role",
                    "Salary", "JoinDate", "ManagerID"],
        "rows": [
            ["E001", "Aisha Tan", "Engineering", "Senior Engineer", "8500", "2022-03-15", "E007"],
            ["E002", "Brandon Lee", "Sales", "Account Executive", "6200", "2023-07-01", "E006"],
            ["E003", "Carmen Lim", "Marketing", "Content Lead", "7100", "2021-11-09", ""],
            ["E004", "Devan Singh", "Engineering", "Engineer", "5800", "2024-02-19", "E007"],
            ["E005", "Elena Wong", "Finance", "Analyst", "5400", "2023-04-12", "E009"],
            ["E006", "Farah Yusof", "Sales", "Sales Manager", "9200", "2020-08-30", ""],
            ["E007", "Gerald Ong", "Engineering", "Engineering Manager", "11500", "2019-05-21", ""],
            ["E008", "Hannah Koh", "Marketing", "Designer", "5300", "2024-09-02", "E003"],
            ["E009", "Ivan Tay", "Finance", "Senior Analyst", "7700", "2022-01-10", ""],
            ["E010", "Jasmine Goh", "Sales", "Account Executive", "6100", "2024-05-06", "E006"],
            ["E011", "Kelvin Chua", "Engineering", "Engineer", "5900", "2025-02-01", "E007"],
            ["E012", "Lina Ho", "Marketing", "Designer", "5500", "2024-11-20", "E003"],
        ],
    }),
    "performance.csv": ("csv", {
        "columns": ["EmployeeID", "Quarter", "Rating", "Bonus"],
        "rows": [
            ["E001", "Q1-2026", "4.5", "1500"],
            ["E002", "Q1-2026", "3.8", "800"],
            ["E003", "Q1-2026", "4.2", "1200"],
            ["E004", "Q1-2026", "4.0", "1000"],
            ["E005", "Q1-2026", "3.5", "600"],
            ["E006", "Q1-2026", "4.7", "2200"],
            ["E007", "Q1-2026", "4.9", "3000"],
            ["E008", "Q1-2026", "3.9", "900"],
            ["E009", "Q1-2026", "4.3", "1400"],
            ["E010", "Q1-2026", "3.7", "700"],
            ["E011", "Q1-2026", "4.1", "1100"],
            ["E012", "Q1-2026", "3.6", "650"],
        ],
    }),
}


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------


async def _user_id_by_email(email: str) -> str:
    conn = await asyncpg.connect(DB_URL)
    try:
        row = await conn.fetchrow("SELECT id FROM users WHERE email=$1 LIMIT 1", email)
    finally:
        await conn.close()
    if not row:
        pytest.skip(f"User {email} not found (sign in via OAuth first)")
    return str(row["id"])


async def _mint_session(user_id: str) -> str:
    tok = secrets.token_urlsafe(32)
    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) "
            "VALUES ($1, $2, now() + interval '2 hours')",
            tok,
            uuid.UUID(user_id),
        )
    finally:
        await conn.close()
    return tok


async def _drop_session(token: str) -> None:
    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute("DELETE FROM sessions WHERE token=$1", token)
    finally:
        await conn.close()


async def _reset_workspace_chat(user_id: str) -> None:
    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute(
            "DELETE FROM conversations WHERE user_id=$1 AND workspace='excel'",
            uuid.UUID(user_id),
        )
    finally:
        await conn.close()


def find_node(tree: dict, name: str, kind: str | None = None) -> dict | None:
    def walk(n: dict):
        if n.get("name") == name and (kind is None or n.get("kind") == kind):
            return n
        for c in n.get("children") or []:
            r = walk(c)
            if r:
                return r
        return None
    return walk(tree)


class Env:
    """Convenience handle returned by the `env` fixture."""

    def __init__(self, user_id: str, client: httpx.AsyncClient, folder_name: str, folder_id: str):
        self.user_id = user_id
        self.client = client
        self.folder_name = folder_name
        self.folder_id = folder_id

    async def list_files(self) -> dict:
        r = await self.client.get("/api/files")
        r.raise_for_status()
        return r.json()

    async def get_content(self, name: str) -> Any:
        tree = await self.list_files()
        node = find_node(tree, name, kind="file")
        if not node:
            return None
        r = await self.client.get(f"/api/files/{node['id']}/content")
        r.raise_for_status()
        return r.json()["content"]

    async def reset_chat(self) -> None:
        await _reset_workspace_chat(self.user_id)

    async def chat(self, content: str, timeout: float = 240.0) -> dict:
        summary = {"text": "", "tool_calls": [], "mutated_files": [], "created_files": []}
        async with self.client.stream(
            "POST",
            "/api/workspace/excel/chat",
            json={"content": content},
            timeout=httpx.Timeout(timeout, connect=10.0),
        ) as r:
            assert r.status_code == 200, await r.aread()
            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data:
                    continue
                try:
                    ev = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if "content" in ev:
                    summary["text"] += ev["content"]
                if "tool_call" in ev:
                    summary["tool_calls"].append({
                        "id": ev["tool_call"]["id"],
                        "name": ev["tool_call"]["name"],
                        "args": ev["tool_call"]["args"],
                        "data": None,
                    })
                if "tool_result" in ev:
                    for tc in summary["tool_calls"]:
                        if tc["id"] == ev["tool_result"]["id"]:
                            tc["data"] = ev["tool_result"]["data"]
                            break
                if ev.get("done"):
                    summary["mutated_files"] = ev.get("mutated_files", [])
                    summary["created_files"] = ev.get("created_files", [])
        return summary


def tool_names(s):
    return [tc["name"] for tc in s["tool_calls"]]


def find_tool(s, name):
    return next((tc for tc in s["tool_calls"] if tc["name"] == name), None)


def count_tool(s, name):
    return sum(1 for tc in s["tool_calls"] if tc["name"] == name)


def find_numbers(text: str) -> list[int]:
    """Pull out integer-looking numbers from chat text, comma-formatted ok."""
    return [int(m.replace(",", "")) for m in re.findall(r"\d{1,3}(?:,\d{3})+|\d{4,8}", text)]


# ----------------------------------------------------------------------------
# Fixtures
# ----------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="module")
async def env():
    """One fresh test folder + seed per module. Tears the folder down after."""
    user_id = await _user_id_by_email(DEFAULT_EMAIL)
    token = await _mint_session(user_id)

    async with httpx.AsyncClient(
        base_url=API, cookies={"session": token}, timeout=60.0
    ) as client:
        # Drop any prior folder with the same name (idempotent setup)
        folder_name = "excel-agent-tests"
        tree = (await client.get("/api/files")).json()
        for c in tree.get("children") or []:
            if c["kind"] == "folder" and c["name"] == folder_name:
                await client.delete(f"/api/files/{c['id']}")
                break
        # Create the test folder
        r = await client.post(
            "/api/files",
            json={"name": folder_name, "kind": "folder", "parent_id": None},
        )
        r.raise_for_status()
        folder_id = r.json()["id"]
        # Seed the workbooks
        for name, (ftype, content) in SEED.items():
            await client.post(
                "/api/files",
                json={
                    "name": name,
                    "kind": "file",
                    "type": ftype,
                    "parent_id": folder_id,
                    "content": content,
                },
            )

        yield Env(user_id, client, folder_name, folder_id)

        # Teardown — best-effort cleanup
        try:
            await client.delete(f"/api/files/{folder_id}")
        except Exception:
            pass

    await _drop_session(token)


@pytest_asyncio.fixture(autouse=True)
async def _fresh_chat(env):
    """Each test starts with an empty Excel-workspace conversation."""
    await env.reset_chat()
    # Be polite to Anthropic's 50K input-tokens/min rate limit between cases.
    # The agent test cases each consume thousands of tokens.
    await asyncio.sleep(20)


# ----------------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pipeline_4way_customer_summary(env):
    """Multi-stage join → per-customer revenue summary saved to a new file."""
    s = await env.chat(
        "Build a customer summary report and save it as 'customer_summary.csv'. "
        "Columns: CustomerID, Name, Tier, TotalSpend. TotalSpend per customer = "
        "sum across their orders of (quantity × product unit price). Walk it: "
        "1) join order_items with products on ProductID for line totals; "
        "2) join with orders on OrderID; 3) aggregate by CustomerID; "
        "4) join with customers.csv for Name + Tier. Sort by TotalSpend desc.",
        timeout=480.0,
    )
    assert count_tool(s, "workbook_join") >= 2, tool_names(s)
    content = await env.get_content("customer_summary.csv")
    assert content, "customer_summary.csv was not created"
    cols_lower = [c.lower() for c in content["columns"]]
    assert any("name" in c for c in cols_lower)
    assert any("tier" in c for c in cols_lower)
    assert len(content["rows"]) >= 10
    name_idx = cols_lower.index("name")
    top3 = " ".join(r[name_idx] for r in content["rows"][:3])
    assert any(n in top3 for n in ("Vertex", "Tessera", "Orchid", "Acme")), top3


@pytest.mark.asyncio
async def test_formula_kpi_dashboard(env):
    """The agent must use formulas (not literal values) for derived cells."""
    s = await env.chat(
        "Create a KPI dashboard 'kpi_dashboard.csv' with two columns: Metric, Value. "
        "Stage the underlying numbers in helper columns (Source / SourceValue), then "
        "make Value a FORMULA referencing the SourceValue cells. Four metrics: "
        "Total Customers, Total Orders, Total Open Orders, Total Closed Orders. "
        "Use customers.csv and orders.csv. Use sheet_set_formula or "
        "sheet_add_formula_column — not literal values.",
        timeout=360.0,
    )
    assert find_tool(s, "sheet_set_formula") or find_tool(s, "sheet_add_formula_column"), tool_names(s)
    content = await env.get_content("kpi_dashboard.csv")
    assert content, "kpi_dashboard.csv missing"
    formulas = content.get("formulas") or {}
    assert len(formulas) >= 2, list(formulas.keys())

    customers = await env.get_content("customers.csv")
    orders = await env.get_content("orders.csv")
    expected = {
        str(len(customers["rows"])),
        str(len(orders["rows"])),
        str(sum(1 for r in orders["rows"] if r[3].lower() == "open")),
        str(sum(1 for r in orders["rows"] if r[3].lower() == "closed")),
    }
    cols_lower = [c.lower() for c in content["columns"]]
    val_idx = next((i for i, c in enumerate(cols_lower) if "value" in c), None)
    assert val_idx is not None, content["columns"]
    values = [r[val_idx] for r in content["rows"]]
    hits = sum(1 for v in values if v.strip() in expected)
    assert hits >= 2, (values, expected)


@pytest.mark.asyncio
async def test_cohort_revenue_2022(env):
    s = await env.chat(
        "Total lifetime revenue from customers who joined in 2022 (JoinDate starts "
        "with '2022'). Revenue = sum across their orders of (quantity × product unit price). "
        "Tell me the number.",
        timeout=360.0,
    )
    plausible = [n for n in find_numbers(s["text"]) if 40000 <= n <= 70000]
    assert plausible, s["text"]


@pytest.mark.asyncio
async def test_scenario_pricing_10pct_discount(env):
    """10% Pro discount scenario with formula columns."""
    s = await env.chat(
        "Run a 10% discount scenario on Lumen Pro Plan (P01). Create "
        "'scenario_discount.csv' with columns: OrderID, Quantity, OriginalPrice, "
        "DiscountedPrice, OriginalRevenue, DiscountedRevenue, DeltaRevenue. Include "
        "only line items where ProductID = P01. Use FORMULAS for DiscountedPrice "
        "(= OriginalPrice × 0.9), OriginalRevenue (= Qty × OriginalPrice), "
        "DiscountedRevenue (= Qty × DiscountedPrice), and DeltaRevenue. Then tell "
        "me the total revenue lost across all P01 line items.",
        timeout=360.0,
    )
    assert find_tool(s, "sheet_set_formula") or find_tool(s, "sheet_add_formula_column"), tool_names(s)
    content = await env.get_content("scenario_discount.csv")
    assert content, "scenario_discount.csv missing"
    formulas = content.get("formulas") or {}
    assert len(formulas) >= 4
    plausible = [n for n in find_numbers(s["text"]) if 7500 <= n <= 9500]
    assert plausible, s["text"]


@pytest.mark.asyncio
async def test_long_running_reports_folder(env):
    """End-to-end pipeline that builds multiple report files inside a folder."""
    s = await env.chat(
        f"In the '{env.folder_name}' folder, create a 'Reports' subfolder. Then build "
        "three CSV report files and place them inside Reports (use the parent= "
        "argument on workbook_create / workbook_join / sheet_pivot save_as): "
        "(1) 'revenue_by_region.csv' — total revenue per Region. "
        "(2) 'top_products.csv' — units sold per ProductID with product Name, sorted desc. "
        "(3) 'monthly_sales.csv' — total revenue per month from orders.Date.",
        timeout=600.0,
    )
    tree = await env.list_files()
    reports = find_node(tree, "Reports", kind="folder")
    assert reports, tool_names(s)
    sheet_children = [
        c["name"] for c in (reports.get("children") or [])
        if c["kind"] == "file"
        and c["name"].lower().endswith((".csv", ".xlsx"))
    ]
    assert len(sheet_children) >= 2, sheet_children
