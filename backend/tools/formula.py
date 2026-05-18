"""Spreadsheet formula parser + evaluator.

Supports a useful subset of Excel-style formulas:
  - Arithmetic: + - * / ^ ( )       ; unary minus; % postfix
  - Cell refs: A1, B10, AA12        ; $A$1 also accepted (treated as relative)
  - Ranges:    A1:B10               ; (only valid inside function args)
  - Comparisons: = <> > < >= <=
  - Functions: SUM, AVG/AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTIF, SUMIF,
               IF, ROUND, ABS, LEN, CONCAT/CONCATENATE, LEFT, RIGHT, MID,
               UPPER, LOWER, TRIM, IFERROR

Addressing convention
---------------------
Inside our sheet content (`{columns, rows, formulas}`):
  - Row 1 = the header row (columns[col_index])
  - Row 2 = first data row (rows[0])
  - Row N = rows[N-2]
This matches what Excel users expect ("=A2" pulls the first data cell).

The evaluator exposes:
  - parse(expr) -> AST
  - references(ast) -> set of (row, col) 1-indexed absolute addresses
  - evaluate(ast, get_cell) -> str/float/bool/None
    where get_cell(row, col) returns the raw cell value (string).

The caller builds a dependency graph from `references` and feeds evaluation
results back via `get_cell`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Iterable


# ============================================================
# Tokenizer
# ============================================================

# Order matters: longer ops first.
TOKEN_PATTERNS = [
    ("WS",      r"\s+"),
    ("NUMBER",  r"\d+\.\d+|\.\d+|\d+"),
    ("STRING",  r'"(?:[^"]|"")*"'),
    ("RANGE",   r"\$?[A-Za-z]+\$?\d+:\$?[A-Za-z]+\$?\d+"),
    ("CELL",    r"\$?[A-Za-z]+\$?\d+"),
    ("FUNC",    r"[A-Za-z_][A-Za-z0-9_]*\("),
    ("IDENT",   r"[A-Za-z_][A-Za-z0-9_]*"),
    ("OP",      r"<=|>=|<>|=|<|>|\+|-|\*|/|\^|%"),
    ("LPAREN",  r"\("),
    ("RPAREN",  r"\)"),
    ("COMMA",   r","),
]

TOKEN_RE = re.compile("|".join(f"(?P<{n}>{p})" for n, p in TOKEN_PATTERNS))


@dataclass
class Token:
    kind: str
    value: str


def tokenize(s: str) -> list[Token]:
    tokens: list[Token] = []
    i = 0
    n = len(s)
    while i < n:
        m = TOKEN_RE.match(s, i)
        if not m:
            raise FormulaError(f"unexpected character at {i}: {s[i]!r}")
        kind = m.lastgroup
        val = m.group()
        i = m.end()
        if kind == "WS":
            continue
        tokens.append(Token(kind, val))
    return tokens


# ============================================================
# Errors + values
# ============================================================


class FormulaError(Exception):
    """Raised for parse/eval errors. Renders as '#ERROR' in output."""

    def __init__(self, message: str, code: str = "#ERROR"):
        super().__init__(message)
        self.code = code


class ErrorValue:
    """Sentinel for Excel-style error values (#DIV/0!, #VALUE!, #REF!, etc.)."""

    __slots__ = ("code",)

    def __init__(self, code: str):
        self.code = code

    def __str__(self) -> str:
        return self.code

    def __repr__(self) -> str:
        return f"ErrorValue({self.code!r})"


# ============================================================
# AST
# ============================================================


@dataclass
class Num:
    value: float


@dataclass
class Str:
    value: str


@dataclass
class CellRef:
    row: int    # 1-indexed (row 1 = header)
    col: int    # 1-indexed


@dataclass
class RangeRef:
    start: CellRef
    end: CellRef


@dataclass
class BinOp:
    op: str
    left: object
    right: object


@dataclass
class UnOp:
    op: str
    operand: object


@dataclass
class FuncCall:
    name: str
    args: list


# ============================================================
# Parser  (recursive descent, precedence climbing)
# ============================================================


def col_letters_to_index(s: str) -> int:
    """A->1, Z->26, AA->27."""
    n = 0
    for ch in s.upper():
        if not ch.isalpha():
            raise FormulaError(f"bad column ref: {s!r}")
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n


def parse_cell(text: str) -> CellRef:
    raw = text.replace("$", "")
    m = re.fullmatch(r"([A-Za-z]+)(\d+)", raw)
    if not m:
        raise FormulaError(f"bad cell ref: {text!r}")
    col = col_letters_to_index(m.group(1))
    row = int(m.group(2))
    return CellRef(row=row, col=col)


def parse_range(text: str) -> RangeRef:
    a, b = text.split(":")
    return RangeRef(start=parse_cell(a), end=parse_cell(b))


class Parser:
    """Pratt-style parser for our formula grammar."""

    PRECEDENCE = {
        "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1,
        "+": 2, "-": 2,
        "*": 3, "/": 3,
        "^": 4,
    }
    RIGHT_ASSOC = {"^"}

    def __init__(self, tokens: list[Token]):
        self.toks = tokens
        self.pos = 0

    def peek(self) -> Token | None:
        return self.toks[self.pos] if self.pos < len(self.toks) else None

    def advance(self) -> Token:
        t = self.toks[self.pos]
        self.pos += 1
        return t

    def expect(self, kind: str) -> Token:
        t = self.peek()
        if not t or t.kind != kind:
            raise FormulaError(f"expected {kind}, got {t.kind if t else 'EOF'}")
        return self.advance()

    def parse(self):
        node = self.parse_expr(0)
        if self.pos != len(self.toks):
            raise FormulaError(f"trailing tokens: {self.toks[self.pos:]}")
        return node

    def parse_expr(self, min_prec: int):
        left = self.parse_unary()
        while True:
            t = self.peek()
            if not t or t.kind != "OP":
                break
            op = t.value
            if op == "%":
                # Postfix percent at any level — wraps the LHS in /100
                self.advance()
                left = BinOp("/", left, Num(100.0))
                continue
            prec = self.PRECEDENCE.get(op)
            if prec is None or prec < min_prec:
                break
            self.advance()
            next_min = prec + (0 if op in self.RIGHT_ASSOC else 1)
            right = self.parse_expr(next_min)
            left = BinOp(op, left, right)
        return left

    def parse_unary(self):
        t = self.peek()
        if t and t.kind == "OP" and t.value in ("-", "+"):
            self.advance()
            operand = self.parse_unary()
            if t.value == "-":
                return UnOp("-", operand)
            return operand
        node = self.parse_atom()
        # Allow a trailing postfix % right after an atom
        t = self.peek()
        if t and t.kind == "OP" and t.value == "%":
            self.advance()
            node = BinOp("/", node, Num(100.0))
        return node

    def parse_atom(self):
        t = self.peek()
        if not t:
            raise FormulaError("unexpected end of formula")
        if t.kind == "NUMBER":
            self.advance()
            return Num(float(t.value))
        if t.kind == "STRING":
            self.advance()
            # Excel-style escaped quotes "" → "
            return Str(t.value[1:-1].replace('""', '"'))
        if t.kind == "RANGE":
            self.advance()
            return parse_range(t.value)
        if t.kind == "CELL":
            self.advance()
            return parse_cell(t.value)
        if t.kind == "IDENT":
            # Bareword — TRUE/FALSE/NULL otherwise treat as text? Excel has booleans.
            self.advance()
            up = t.value.upper()
            if up == "TRUE":
                return Num(1.0)
            if up == "FALSE":
                return Num(0.0)
            raise FormulaError(f"unknown identifier {t.value!r}")
        if t.kind == "FUNC":
            self.advance()
            name = t.value[:-1].upper()
            args = []
            if self.peek() and self.peek().kind != "RPAREN":
                args.append(self.parse_expr(0))
                while self.peek() and self.peek().kind == "COMMA":
                    self.advance()
                    args.append(self.parse_expr(0))
            self.expect("RPAREN")
            return FuncCall(name, args)
        if t.kind == "LPAREN":
            self.advance()
            inner = self.parse_expr(0)
            self.expect("RPAREN")
            return inner
        raise FormulaError(f"unexpected token: {t}")


def parse(expr: str):
    """Parse a formula string (with or without leading '='). Returns AST."""
    s = expr.lstrip()
    if s.startswith("="):
        s = s[1:]
    tokens = tokenize(s)
    if not tokens:
        raise FormulaError("empty formula")
    return Parser(tokens).parse()


# ============================================================
# References (for dependency graph)
# ============================================================


def references(node) -> set[tuple[int, int]]:
    """Return all (row, col) cells the AST depends on. Ranges are expanded."""
    out: set[tuple[int, int]] = set()
    _collect_refs(node, out)
    return out


def _collect_refs(node, out: set[tuple[int, int]]) -> None:
    if isinstance(node, CellRef):
        out.add((node.row, node.col))
    elif isinstance(node, RangeRef):
        r1, r2 = sorted([node.start.row, node.end.row])
        c1, c2 = sorted([node.start.col, node.end.col])
        for r in range(r1, r2 + 1):
            for c in range(c1, c2 + 1):
                out.add((r, c))
    elif isinstance(node, BinOp):
        _collect_refs(node.left, out)
        _collect_refs(node.right, out)
    elif isinstance(node, UnOp):
        _collect_refs(node.operand, out)
    elif isinstance(node, FuncCall):
        for a in node.args:
            _collect_refs(a, out)


# ============================================================
# Evaluator
# ============================================================


def _to_number(v) -> float | None:
    """Best-effort conversion. None means non-numeric (skip in SUM etc.)."""
    if isinstance(v, ErrorValue):
        raise FormulaError(str(v), v.code)
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "")
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
    except (ValueError, TypeError):
        return None


def _require_number(v) -> float:
    n = _to_number(v)
    if n is None:
        raise FormulaError(f"#VALUE! cannot coerce {v!r}", "#VALUE!")
    return n


def _truthy(v) -> bool:
    if v is None or v == "":
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    n = _to_number(v)
    if n is not None:
        return n != 0
    return True


def _iter_args(args, get_cell) -> Iterable:
    """Flatten arguments — expand ranges into their cell values."""
    for a in args:
        if isinstance(a, RangeRef):
            r1, r2 = sorted([a.start.row, a.end.row])
            c1, c2 = sorted([a.start.col, a.end.col])
            for r in range(r1, r2 + 1):
                for c in range(c1, c2 + 1):
                    yield evaluate(CellRef(r, c), get_cell)
        else:
            yield evaluate(a, get_cell)


def _iter_numbers(args, get_cell) -> Iterable[float]:
    for v in _iter_args(args, get_cell):
        n = _to_number(v)
        if n is not None:
            yield n


def _criterion_match(value, criterion) -> bool:
    """Excel-style criterion: number, string, or comparison string like '>10', '<=5', '<>foo'."""
    if isinstance(criterion, (int, float)):
        n = _to_number(value)
        return n is not None and n == float(criterion)
    s = str(criterion)
    m = re.match(r"\s*(<=|>=|<>|=|<|>)\s*(.*)", s)
    if m:
        op, rhs = m.group(1), m.group(2).strip()
        rhs_num = _to_number(rhs)
        if rhs_num is not None:
            v_num = _to_number(value)
            if v_num is None:
                return False
            return _cmp(op, v_num, rhs_num)
        if op == "=":
            return str(value).strip().lower() == rhs.lower()
        if op == "<>":
            return str(value).strip().lower() != rhs.lower()
        return False
    # No operator — equality (string or numeric)
    n = _to_number(s)
    if n is not None:
        v = _to_number(value)
        return v is not None and v == n
    return str(value).strip().lower() == s.lower()


def _cmp(op: str, a, b) -> bool:
    if op == "=": return a == b
    if op == "<>": return a != b
    if op == ">": return a > b
    if op == "<": return a < b
    if op == ">=": return a >= b
    if op == "<=": return a <= b
    return False


FUNCTIONS = {}


def func(name):
    def deco(fn):
        FUNCTIONS[name] = fn
        return fn
    return deco


@func("SUM")
def _sum(args, get_cell):
    return sum(_iter_numbers(args, get_cell))


@func("AVG")
@func("AVERAGE")
def _avg(args, get_cell):
    nums = list(_iter_numbers(args, get_cell))
    if not nums:
        return ErrorValue("#DIV/0!")
    return sum(nums) / len(nums)


@func("MIN")
def _min(args, get_cell):
    nums = list(_iter_numbers(args, get_cell))
    return min(nums) if nums else ErrorValue("#NUM!")


@func("MAX")
def _max(args, get_cell):
    nums = list(_iter_numbers(args, get_cell))
    return max(nums) if nums else ErrorValue("#NUM!")


@func("COUNT")
def _count(args, get_cell):
    """COUNT only counts numeric cells."""
    return sum(1 for _ in _iter_numbers(args, get_cell))


@func("COUNTA")
def _counta(args, get_cell):
    """COUNTA counts non-empty cells."""
    n = 0
    for v in _iter_args(args, get_cell):
        if v is None or v == "":
            continue
        n += 1
    return n


@func("COUNTIF")
def _countif(args, get_cell):
    if len(args) != 2:
        raise FormulaError("COUNTIF takes 2 args")
    rng, crit = args
    crit_v = evaluate(crit, get_cell)
    n = 0
    for v in _iter_args([rng], get_cell):
        if _criterion_match(v, crit_v):
            n += 1
    return n


@func("SUMIF")
def _sumif(args, get_cell):
    if len(args) not in (2, 3):
        raise FormulaError("SUMIF takes 2-3 args")
    rng = args[0]
    crit_v = evaluate(args[1], get_cell)
    sum_rng = args[2] if len(args) == 3 else rng
    vals = list(_iter_args([rng], get_cell))
    sums = list(_iter_args([sum_rng], get_cell))
    total = 0.0
    for i, v in enumerate(vals):
        if i >= len(sums):
            break
        if _criterion_match(v, crit_v):
            n = _to_number(sums[i])
            if n is not None:
                total += n
    return total


@func("IF")
def _if(args, get_cell):
    if len(args) < 2:
        raise FormulaError("IF takes 2-3 args")
    cond = evaluate(args[0], get_cell)
    if _truthy(cond):
        return evaluate(args[1], get_cell)
    if len(args) == 3:
        return evaluate(args[2], get_cell)
    return False


@func("IFERROR")
def _iferror(args, get_cell):
    if len(args) != 2:
        raise FormulaError("IFERROR takes 2 args")
    try:
        v = evaluate(args[0], get_cell)
    except FormulaError:
        return evaluate(args[1], get_cell)
    if isinstance(v, ErrorValue):
        return evaluate(args[1], get_cell)
    return v


@func("ROUND")
def _round(args, get_cell):
    if len(args) not in (1, 2):
        raise FormulaError("ROUND takes 1-2 args")
    n = _require_number(evaluate(args[0], get_cell))
    digits = int(_require_number(evaluate(args[1], get_cell))) if len(args) == 2 else 0
    return round(n, digits)


@func("ABS")
def _abs(args, get_cell):
    return abs(_require_number(evaluate(args[0], get_cell)))


@func("LEN")
def _len(args, get_cell):
    v = evaluate(args[0], get_cell)
    return len("" if v is None else str(v))


@func("CONCAT")
@func("CONCATENATE")
def _concat(args, get_cell):
    parts: list[str] = []
    for v in _iter_args(args, get_cell):
        if v is None:
            continue
        if isinstance(v, ErrorValue):
            return v
        parts.append("" if v is None else _fmt_value(v))
    return "".join(parts)


@func("LEFT")
def _left(args, get_cell):
    s = _fmt_value(evaluate(args[0], get_cell))
    n = int(_require_number(evaluate(args[1], get_cell))) if len(args) > 1 else 1
    return s[:n]


@func("RIGHT")
def _right(args, get_cell):
    s = _fmt_value(evaluate(args[0], get_cell))
    n = int(_require_number(evaluate(args[1], get_cell))) if len(args) > 1 else 1
    return s[-n:] if n > 0 else ""


@func("MID")
def _mid(args, get_cell):
    if len(args) != 3:
        raise FormulaError("MID takes 3 args")
    s = _fmt_value(evaluate(args[0], get_cell))
    start = int(_require_number(evaluate(args[1], get_cell)))
    length = int(_require_number(evaluate(args[2], get_cell)))
    start = max(1, start)
    return s[start - 1 : start - 1 + length]


@func("UPPER")
def _upper(args, get_cell):
    return _fmt_value(evaluate(args[0], get_cell)).upper()


@func("LOWER")
def _lower(args, get_cell):
    return _fmt_value(evaluate(args[0], get_cell)).lower()


@func("TRIM")
def _trim(args, get_cell):
    return _fmt_value(evaluate(args[0], get_cell)).strip()


def _fmt_value(v) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, float):
        if v.is_integer():
            return str(int(v))
        return str(v)
    return str(v)


def evaluate(node, get_cell: Callable[[int, int], object]):
    """Evaluate AST. `get_cell(row, col)` returns the cell's value (string or numeric)."""
    if isinstance(node, Num):
        return node.value
    if isinstance(node, Str):
        return node.value
    if isinstance(node, CellRef):
        return get_cell(node.row, node.col)
    if isinstance(node, RangeRef):
        # A bare range outside a function — Excel returns #VALUE!
        return ErrorValue("#VALUE!")
    if isinstance(node, UnOp):
        v = evaluate(node.operand, get_cell)
        if node.op == "-":
            return -_require_number(v)
        return _require_number(v)
    if isinstance(node, BinOp):
        left = evaluate(node.left, get_cell)
        right = evaluate(node.right, get_cell)
        op = node.op
        if op in ("=", "<>", "<", ">", "<=", ">="):
            ln = _to_number(left)
            rn = _to_number(right)
            if ln is not None and rn is not None:
                return _cmp(op, ln, rn)
            ls = "" if left is None else str(left)
            rs = "" if right is None else str(right)
            return _cmp(op, ls.lower(), rs.lower())
        a = _require_number(left)
        b = _require_number(right)
        if op == "+": return a + b
        if op == "-": return a - b
        if op == "*": return a * b
        if op == "/":
            if b == 0:
                return ErrorValue("#DIV/0!")
            return a / b
        if op == "^": return a ** b
        raise FormulaError(f"unknown operator {op}")
    if isinstance(node, FuncCall):
        fn = FUNCTIONS.get(node.name)
        if not fn:
            return ErrorValue("#NAME?")
        return fn(node.args, get_cell)
    raise FormulaError(f"unknown AST node {type(node).__name__}")


# ============================================================
# Public helpers
# ============================================================


def format_result(v) -> str:
    """Convert evaluator output to the string we store in `rows[][]`."""
    if isinstance(v, ErrorValue):
        return str(v)
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, float):
        if v != v:  # NaN
            return "#NUM!"
        if v.is_integer():
            return str(int(v))
        # Trim trailing zeros for readability but keep enough precision.
        return f"{v:.10g}"
    return str(v)


def addr(row: int, col: int) -> str:
    """1-indexed (row, col) → 'A1' notation."""
    n = col
    letters = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        letters = chr(ord("A") + rem) + letters
    return f"{letters}{row}"


def parse_addr(text: str) -> tuple[int, int]:
    """'A1' → (row=1, col=1)."""
    ref = parse_cell(text)
    return ref.row, ref.col
