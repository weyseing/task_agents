import FileEditor from "./editors";
import { C_BG, C_LINE, C_MUTED2, TYPE_META } from "./tokens";

export default function EditorFrame({ file, onChange, dirty }) {
  return (
    <main
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: C_BG,
      }}
    >
      <FileEditor file={file} onChange={onChange} />
      <div
        style={{
          height: 28,
          borderTop: `1px solid ${C_LINE}`,
          background: "#FBFCFD",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 16px",
          fontFamily: 'ui-monospace, "SF Mono", monospace',
          fontSize: 11,
          color: C_MUTED2,
          letterSpacing: "0.03em",
          flexShrink: 0,
        }}
      >
        {file ? (
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: dirty ? "#EAB308" : "#1F8A5B",
                }}
              />
              {dirty ? "unsaved changes" : "all changes saved"}
            </span>
            <span style={{ color: C_LINE }}>·</span>
            <span>{(TYPE_META[file.type] && TYPE_META[file.type].label) || file.type}</span>
            <span style={{ color: C_LINE }}>·</span>
            <span>{contentMeasure(file)}</span>
            <div style={{ flex: 1 }} />
            <span>UTF-8</span>
            <span style={{ color: C_LINE }}>·</span>
            <span>v4.2.1</span>
          </>
        ) : (
          <span>No file open · click a file in the sidebar to begin</span>
        )}
      </div>
    </main>
  );
}

function contentMeasure(file) {
  const c = file.content;
  if (typeof c === "string") {
    const lines = c.split("\n").length;
    const words = c.split(/\s+/).filter(Boolean).length;
    return `${lines} lines · ${words} words`;
  }
  if (c && c.rows) return `${c.rows.length} rows · ${c.columns.length} cols`;
  if (c && c.blocks) return `${c.blocks.length} blocks`;
  if (c && c.slides) return `${c.slides.length} slides`;
  if (c && c.pages) return `${c.pages.length} pages`;
  if (c && c.w) return `${c.w}×${c.h}`;
  return "";
}
