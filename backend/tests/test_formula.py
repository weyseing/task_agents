"""Unit tests for the spreadsheet formula parser + evaluator.

No I/O, no app, no mocks — pure Python over the formula module.
Run a subset with: make test M=unit  (or `make test FILE=tests/test_formula.py`).
"""

import pytest

from tools import formula as F


pytestmark = [pytest.mark.unit]


# A tiny in-memory grid used as the cell lookup for every case below.
#   A1:H1  B1:H2  C1:H3
#   A2:10  B2:20  C2:30
#   A3:5   B3:15  C3:25
#   A4:8   B4:hello  C4:(empty)
GRID = {
    (1, 1): "H1", (1, 2): "H2", (1, 3): "H3",
    (2, 1): "10", (2, 2): "20", (2, 3): "30",
    (3, 1): "5",  (3, 2): "15", (3, 3): "25",
    (4, 1): "8",  (4, 2): "hello", (4, 3): "",
}


def get_cell(r, c):
    return GRID.get((r, c), "")


def eval_formula(expr):
    return F.format_result(F.evaluate(F.parse(expr), get_cell))


@pytest.mark.parametrize(
    "expr,expected",
    [
        # Basic arithmetic
        ("=1+2",                  "3"),
        ("=2*3+4",                "10"),
        ("=(2+3)*4",              "20"),
        ("=10/4",                 "2.5"),
        ("=2^3",                  "8"),
        ("=-5+3",                 "-2"),
        ("=50%",                  "0.5"),
        # Cell refs
        ("=A2",                   "10"),
        ("=A2+B2",                "30"),
        ("=A2*B2",                "200"),
        ("=A2*B2+C2",             "230"),
        # Range aggregates
        ("=SUM(A2:A4)",           "23"),
        ("=SUM(A2:C3)",           "105"),
        ("=AVERAGE(A2:A4)",       "7.666666667"),
        ("=AVG(A2:A4)",           "7.666666667"),
        ("=MIN(A2:C3)",           "5"),
        ("=MAX(A2:C3)",           "30"),
        ("=COUNT(A2:C4)",         "7"),    # 7 numeric (B4=hello skip, C4 empty)
        ("=COUNTA(A2:C4)",        "8"),    # 8 non-empty (C4 empty)
        # COUNTIF / SUMIF
        ('=COUNTIF(A2:A4,">5")',  "2"),
        ("=COUNTIF(A2:A4,5)",     "1"),
        ('=SUMIF(A2:A4,">5")',    "18"),
        ('=SUMIF(A2:A4,">5",B2:B4)', "20"),  # A2>5 → B2=20; A4>5 → B4=hello(skip)
        # Comparisons / IF
        ('=IF(A2>5,"big","small")', "big"),
        ("=IF(A3>5,1,0)",         "0"),
        ("=IF(A2=10,A2*2,0)",     "20"),
        # Functions
        ("=ROUND(10/3,2)",        "3.33"),
        ("=ROUND(10/3,0)",        "3"),
        ("=ABS(-7)",              "7"),
        ('=LEN("hello")',         "5"),
        ('=CONCAT("a","-","b")',  "a-b"),
        ('=UPPER("hi")',          "HI"),
        ('=LOWER("HI")',          "hi"),
        ('=TRIM("  x ")',         "x"),
        ('=LEFT("abcdef",3)',     "abc"),
        ('=RIGHT("abcdef",2)',    "ef"),
        ('=MID("abcdef",2,3)',    "bcd"),
        # Errors
        ("=A2/0",                 "#DIV/0!"),
        ("=IFERROR(A2/0,99)",     "99"),
        ("=IFERROR(A2*2,99)",     "20"),
    ],
    ids=lambda v: v if isinstance(v, str) else None,
)
def test_evaluate(expr, expected):
    assert eval_formula(expr) == expected


def test_parse_rejects_bad_formula():
    with pytest.raises(F.FormulaError):
        F.parse("=(1+2")


def test_address_helpers_roundtrip():
    # 0-based not relevant — we use 1-indexed (row, col) in formulas
    assert F.addr(1, 1) == "A1"
    assert F.addr(2, 27) == "AA2"
    assert F.parse_addr("A1") == (1, 1)
    assert F.parse_addr("AA2") == (2, 27)


def test_references_expands_ranges():
    ast = F.parse("=SUM(A1:B2)+C5")
    refs = F.references(ast)
    assert refs == {(1, 1), (1, 2), (2, 1), (2, 2), (5, 3)}
