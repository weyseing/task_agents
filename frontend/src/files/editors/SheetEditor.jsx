import { useEffect, useMemo, useRef, useState } from "react";
import { C_CANVAS, C_INK, C_INK2, C_LINE, C_MUTED, C_MUTED2 } from "../tokens";

// Storage shape: { columns: [...], rows: [[...]], formulas?: { "A2": "=...", ... } }
// Address convention: row 1 = header, row 2 = first data row.
// formulas keyed by A1 notation.

function colLetter(i) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function addrFor(row, col) {
  // row, col are 1-indexed
  return `${colLetter(col - 1)}${row}`;
}

function isFormulaInput(s) {
  return typeof s === "string" && s.length > 0 && s.startsWith("=");
}

export default function SheetEditor({ file, onChange, onCommitFormula }) {
  const { columns, rows } = file.content;
  const formulas = file.content.formulas || {};

  // Active cell: {row, col} in 1-indexed address space (header=1, data=2..N+1)
  const [active, setActive] = useState({ row: 2, col: 1 });
  // While editing, we track the in-flight text. Submitting commits to content.
  const [editing, setEditing] = useState(null); // { row, col, value }
  const formulaBarRef = useRef(null);

  // Reset editing whenever the underlying file changes (e.g. agent mutation).
  useEffect(() => {
    setEditing(null);
  }, [file.id]);

  const activeAddr = addrFor(active.row, active.col);
  const activeFormula = formulas[activeAddr];
  const activeRawValue =
    active.row === 1
      ? columns[active.col - 1] ?? ""
      : rows[active.row - 2]?.[active.col - 1] ?? "";

  const displayedInFormulaBar =
    editing && editing.row === active.row && editing.col === active.col
      ? editing.value
      : activeFormula || activeRawValue;

  // Commit an edit at (r, c) with `value`. Decides formula vs literal.
  function commitEdit(r, c, value) {
    const isFormula = isFormulaInput(value);
    const addr = addrFor(r, c);
    const prevFormula = formulas[addr];
    const nextFormulas = { ...formulas };
    let nextColumns = columns;
    let nextRows = rows;

    if (isFormula) {
      nextFormulas[addr] = value;
      // Show the formula text in the cell as a hint until the backend
      // recomputes; once onCommitFormula triggers a save+refresh the
      // computed value replaces it.
      if (r === 1) {
        nextColumns = columns.map((c2, i) => (i === c - 1 ? value : c2));
      } else {
        nextRows = rows.map((row, ri) =>
          ri === r - 2
            ? row.map((cell, ci) => (ci === c - 1 ? value : cell))
            : row
        );
      }
    } else {
      if (nextFormulas[addr]) delete nextFormulas[addr];
      if (r === 1) {
        nextColumns = columns.map((c2, i) => (i === c - 1 ? value : c2));
      } else {
        nextRows = rows.map((row, ri) =>
          ri === r - 2
            ? row.map((cell, ci) => (ci === c - 1 ? value : cell))
            : row
        );
      }
    }
    const nextContent = {
      columns: nextColumns,
      rows: nextRows,
      formulas: Object.keys(nextFormulas).length ? nextFormulas : undefined,
    };
    onChange(nextContent);
    setEditing(null);

    // If the user typed/cleared a formula, the cell's computed value lives
    // on the server. Ask FilesPage to save + refetch so the value appears
    // without an explicit Cmd+S.
    const formulaChanged =
      (isFormula && nextFormulas[addr] !== prevFormula) ||
      (!isFormula && prevFormula);
    if (formulaChanged && typeof onCommitFormula === "function") {
      onCommitFormula(nextContent);
    }
  }

  function startEdit(r, c, initial) {
    const addr = addrFor(r, c);
    const cur = formulas[addr] ??
      (r === 1 ? columns[c - 1] ?? "" : rows[r - 2]?.[c - 1] ?? "");
    setEditing({ row: r, col: c, value: initial !== undefined ? initial : cur });
    setActive({ row: r, col: c });
  }

  const addRow = () => {
    onChange({
      columns,
      rows: [...rows, Array(columns.length).fill("")],
      formulas,
    });
  };

  const addColumn = () => {
    onChange({
      columns: [...columns, ""],
      rows: rows.map((r) => [...r, ""]),
      formulas,
    });
  };

  // Total cells now have a formula indicator (corner mark).
  const formulaCells = useMemo(() => {
    const m = new Set();
    for (const k of Object.keys(formulas)) m.add(k);
    return m;
  }, [formulas]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: C_CANVAS,
      }}
    >
      {/* Formula bar */}
      <div
        style={{
          height: 36,
          borderBottom: `1px solid ${C_LINE}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          background: "#FBFCFD",
        }}
      >
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: C_MUTED2,
            padding: "2px 8px",
            border: `1px solid ${C_LINE}`,
            borderRadius: 4,
            background: "#fff",
            minWidth: 40,
            textAlign: "center",
            fontWeight: 500,
          }}
        >
          {activeAddr}
        </div>
        <span style={{ color: C_MUTED2, fontFamily: "ui-monospace, monospace" }}>ƒx</span>
        <input
          ref={formulaBarRef}
          value={displayedInFormulaBar || ""}
          onFocus={() =>
            setEditing({ row: active.row, col: active.col, value: activeFormula || activeRawValue || "" })
          }
          onChange={(e) =>
            setEditing({ row: active.row, col: active.col, value: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit(active.row, active.col, editing?.value ?? "");
            } else if (e.key === "Escape") {
              setEditing(null);
            }
          }}
          onBlur={() => {
            if (editing) commitEdit(active.row, active.col, editing.value);
          }}
          placeholder={activeFormula ? "" : "Enter value or formula (start with =)"}
          style={{
            flex: 1,
            height: 24,
            padding: "0 8px",
            border: "none",
            outline: 0,
            background: "transparent",
            fontFamily: activeFormula
              ? 'ui-monospace, "SF Mono", monospace'
              : "inherit",
            fontSize: 13,
            color: C_INK,
          }}
        />
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: C_MUTED2 }}>
          {rows.length} rows · {columns.length} cols
          {formulaCells.size > 0 ? ` · ${formulaCells.size}ƒ` : ""}
        </span>
      </div>

      <div className="files-sheet-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 24px" }}>
        <table
          style={{
            borderCollapse: "collapse",
            background: "#fff",
            boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 8px 18px -10px rgba(15,23,42,0.12)",
            fontFamily: '"Sora", system-ui',
            fontSize: 13,
            color: C_INK,
          }}
        >
          <thead>
            <tr>
              <th style={cornerCell()}></th>
              {columns.map((_, i) => (
                <th key={i} style={colHeaderCell()}>
                  {colLetter(i)}
                </th>
              ))}
              <th className="files-sheet-add-col-header" style={addColHeaderCell()} title="Add column" onClick={addColumn}>
                +
              </th>
            </tr>
            <tr>
              <th style={rowHeaderCell()}>1</th>
              {columns.map((c, i) => (
                <SheetCell
                  key={i}
                  row={1}
                  col={i + 1}
                  active={active.row === 1 && active.col === i + 1}
                  isHeader
                  hasFormula={formulaCells.has(addrFor(1, i + 1))}
                  formula={formulas[addrFor(1, i + 1)]}
                  rawValue={c}
                  editing={
                    editing && editing.row === 1 && editing.col === i + 1
                      ? editing.value
                      : null
                  }
                  onActivate={() => setActive({ row: 1, col: i + 1 })}
                  onStartEdit={(initial) => startEdit(1, i + 1, initial)}
                  onChangeEditing={(v) =>
                    setEditing({ row: 1, col: i + 1, value: v })
                  }
                  onCommit={(v) => commitEdit(1, i + 1, v)}
                />
              ))}
              <th style={addColCell()} onClick={addColumn} title="Add column" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const rAddr = ri + 2;
              return (
                <tr key={ri}>
                  <td style={rowHeaderCell()}>{rAddr}</td>
                  {row.map((cell, ci) => (
                    <SheetCell
                      key={ci}
                      row={rAddr}
                      col={ci + 1}
                      active={active.row === rAddr && active.col === ci + 1}
                      lastRow={ri === rows.length - 1}
                      hasFormula={formulaCells.has(addrFor(rAddr, ci + 1))}
                      formula={formulas[addrFor(rAddr, ci + 1)]}
                      rawValue={cell}
                      editing={
                        editing && editing.row === rAddr && editing.col === ci + 1
                          ? editing.value
                          : null
                      }
                      onActivate={() => setActive({ row: rAddr, col: ci + 1 })}
                      onStartEdit={(initial) => startEdit(rAddr, ci + 1, initial)}
                      onChangeEditing={(v) =>
                        setEditing({ row: rAddr, col: ci + 1, value: v })
                      }
                      onCommit={(v) => commitEdit(rAddr, ci + 1, v)}
                    />
                  ))}
                  <td className="files-sheet-add-col-cell" style={addColCell()} onClick={addColumn} title="Add column" />
                </tr>
              );
            })}
            <tr>
              <td style={rowHeaderCell()}>{rows.length + 2}</td>
              <td
                colSpan={columns.length + 1}
                style={addRowCell()}
                onClick={addRow}
                title="Add row"
              >
                <span style={addRowLabelStyle()}>+ Add row</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}


function SheetCell({
  row,
  col,
  active,
  isHeader,
  lastRow,
  hasFormula,
  formula,
  rawValue,
  editing,
  onActivate,
  onStartEdit,
  onChangeEditing,
  onCommit,
}) {
  const isEditing = editing !== null;
  const displayValue = isEditing ? editing : rawValue;
  const isFormulaEditing = isEditing && isFormulaInput(editing);
  const cellStyle = isHeader ? headerCell() : dataCell(lastRow);

  return (
    <td
      style={{
        ...cellStyle,
        position: "relative",
        outline: active && !isHeader ? `2px solid #0F172A` : "none",
        outlineOffset: active && !isHeader ? -2 : 0,
        background: hasFormula
          ? "#F4F8FF"
          : isHeader
          ? "#FBFCFD"
          : lastRow
          ? "#FBFCFD"
          : "#fff",
      }}
      onClick={onActivate}
      onDoubleClick={() => onStartEdit(formula || rawValue)}
    >
      <input
        value={displayValue}
        onFocus={() => {
          onActivate();
          // Switching to a cell focus shows the formula text if any
          if (!isEditing) onStartEdit(formula || rawValue);
        }}
        onChange={(e) => onChangeEditing(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(displayValue);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onChangeEditing(formula || rawValue);
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (isEditing) onCommit(displayValue);
        }}
        style={{
          width: 140,
          height: isHeader ? 32 : 32,
          padding: "0 10px",
          border: "none",
          outline: "none",
          background: "transparent",
          font: "inherit",
          color: "inherit",
          fontWeight: isHeader ? 500 : 400,
          fontSize: isHeader ? 12.5 : 13,
          letterSpacing: isHeader ? "0.02em" : 0,
          textTransform: isHeader ? "uppercase" : "none",
          textAlign: !isHeader && /^-?\d/.test(rawValue) ? "right" : "left",
          fontFamily: isFormulaEditing
            ? 'ui-monospace, "SF Mono", monospace'
            : "inherit",
        }}
      />
      {hasFormula && !isEditing && (
        <span
          title={formula}
          style={{
            position: "absolute",
            top: 1,
            right: 1,
            width: 0,
            height: 0,
            borderTop: "5px solid #2563EB",
            borderLeft: "5px solid transparent",
            pointerEvents: "none",
          }}
        />
      )}
    </td>
  );
}


const cornerCell = () => ({
  width: 36,
  height: 30,
  background: "#F1F4F9",
  border: `1px solid ${C_LINE}`,
});
const colHeaderCell = () => ({
  height: 24,
  background: "#F1F4F9",
  border: `1px solid ${C_LINE}`,
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  fontWeight: 500,
  color: C_MUTED,
  textAlign: "center",
});
const rowHeaderCell = () => ({
  width: 36,
  background: "#F1F4F9",
  border: `1px solid ${C_LINE}`,
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  fontWeight: 500,
  color: C_MUTED,
  textAlign: "center",
});
const headerCell = () => ({
  height: 34,
  padding: 0,
  border: `1px solid ${C_LINE}`,
  background: "#FBFCFD",
});
const dataCell = (last) => ({
  border: `1px solid ${C_LINE}`,
  background: last ? "#FBFCFD" : "#fff",
  fontWeight: last ? 500 : 400,
});
const addColHeaderCell = () => ({
  width: 32,
  background: "#F1F4F9",
  border: `1px solid ${C_LINE}`,
  fontFamily: "ui-monospace, monospace",
  fontSize: 13,
  fontWeight: 500,
  color: C_MUTED2,
  textAlign: "center",
  cursor: "pointer",
  userSelect: "none",
});
const addColCell = () => ({
  width: 32,
  border: `1px dashed ${C_LINE}`,
  background: "#FBFCFD",
  cursor: "pointer",
});
const addRowCell = () => ({
  height: 30,
  border: `1px dashed ${C_LINE}`,
  background: "#FBFCFD",
  cursor: "pointer",
  textAlign: "center",
});
const addRowLabelStyle = () => ({
  fontFamily: '"Sora", system-ui',
  fontSize: 12,
  color: C_MUTED2,
  fontWeight: 500,
});
