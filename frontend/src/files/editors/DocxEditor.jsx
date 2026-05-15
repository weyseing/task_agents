import { useEffect, useRef } from "react";
import { C_CANVAS, C_INK, C_INK2, C_LINE, C_MUTED, C_MUTED2 } from "../tokens";

export default function DocxEditor({ file, onChange }) {
  const { blocks } = file.content;
  const update = (i, text) => {
    const next = blocks.map((b, j) => (j === i ? { ...b, text } : b));
    onChange({ blocks: next });
  };
  const wordCount = blocks.reduce(
    (n, b) => n + (b.text || "").split(/\s+/).filter(Boolean).length,
    0
  );

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
        <span style={{ fontSize: 12, color: C_MUTED, fontWeight: 500 }}>Aa Body</span>
        <div style={{ width: 1, height: 14, background: C_LINE }} />
        <ToolGlyph>B</ToolGlyph>
        <ToolGlyph italic>I</ToolGlyph>
        <ToolGlyph underline>U</ToolGlyph>
        <div style={{ width: 1, height: 14, background: C_LINE }} />
        <ToolGlyph>≡</ToolGlyph>
        <ToolGlyph>•</ToolGlyph>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: C_MUTED2 }}>
          {wordCount} words
        </span>
      </div>

      <div className="files-docx-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "40px 0" }}>
        <div
          className="files-docx-page"
          style={{
            width: 720,
            margin: "0 auto",
            background: "#fff",
            padding: "72px 88px",
            minHeight: 940,
            boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 18px 40px -12px rgba(15,23,42,0.18)",
            fontFamily: '"Sora", system-ui',
            color: C_INK,
            fontSize: 14.5,
            lineHeight: 1.7,
          }}
        >
          {blocks.map((b, i) => (
            <EditableBlock key={i} block={b} onChange={(t) => update(i, t)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolGlyph({ children, italic, underline }) {
  return (
    <span
      style={{
        width: 24,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"Sora", system-ui',
        fontSize: 13,
        fontWeight: 600,
        color: C_INK2,
        cursor: "pointer",
        borderRadius: 5,
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : "none",
      }}
    >
      {children}
    </span>
  );
}

function EditableBlock({ block, onChange }) {
  const ref = useRef(null);
  // Set text only on mount / when block type changes (different file).
  // Don't fight the cursor on every keystroke.
  useEffect(() => {
    if (ref.current && ref.current.textContent !== block.text) {
      ref.current.textContent = block.text;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.type]);

  const style =
    {
      h1: { fontSize: 32, fontWeight: 500, letterSpacing: "-0.025em", margin: "0 0 18px", lineHeight: 1.2 },
      h2: { fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em", margin: "28px 0 8px" },
      p: { margin: "0 0 12px" },
      li: { margin: "4px 0 4px 24px", listStyle: "disc", display: "list-item" },
    }[block.type] || { margin: "0 0 12px" };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onChange(e.currentTarget.textContent)}
      style={{ ...style, outline: "none" }}
    />
  );
}
