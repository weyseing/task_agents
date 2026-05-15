import { C_CANVAS, C_INK, C_INK2, C_LINE, C_MUTED, C_MUTED2 } from "../tokens";

export default function SheetEditor({ file, onChange }) {
  const { columns, rows } = file.content;

  const updateCell = (r, c, v) => {
    const nextRows = rows.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row
    );
    onChange({ columns, rows: nextRows });
  };

  const colLetter = (i) => String.fromCharCode(65 + i);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C_CANVAS }}>
      <div
        style={{
          height: 36,
          borderBottom: `1px solid ${C_LINE}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
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
          }}
        >
          A1
        </div>
        <span style={{ color: C_MUTED2, fontFamily: "ui-monospace, monospace" }}>ƒx</span>
        <span style={{ fontSize: 13, color: C_INK }}>{rows[0]?.[0] || ""}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: C_MUTED2 }}>
          {rows.length} rows · {columns.length} cols
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
            </tr>
            <tr>
              <th style={rowHeaderCell()}>1</th>
              {columns.map((c, i) => (
                <th key={i} style={headerCell(C_INK2, C_LINE)}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td style={rowHeaderCell()}>{ri + 2}</td>
                {row.map((cell, ci) => (
                  <td key={ci} style={dataCell(ri === rows.length - 1)}>
                    <input
                      value={cell}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      style={{
                        width: 140,
                        height: 32,
                        padding: "0 10px",
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        font: "inherit",
                        color: "inherit",
                        textAlign: /\d/.test(cell) ? "right" : "left",
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
const headerCell = (ink, line) => ({
  height: 34,
  padding: "0 10px",
  border: `1px solid ${line}`,
  background: "#FBFCFD",
  textAlign: "left",
  fontWeight: 500,
  color: ink,
  fontSize: 12.5,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
});
const dataCell = (last) => ({
  border: `1px solid ${C_LINE}`,
  background: last ? "#FBFCFD" : "#fff",
  fontWeight: last ? 500 : 400,
});
