import { C_CANVAS, C_INK, C_INK2, C_LINE, C_MUTED2 } from "../tokens";

export default function PdfViewer({ file }) {
  const { pages } = file.content;
  return (
    <div style={{ flex: 1, minHeight: 0, background: C_CANVAS, overflowY: "auto", padding: "32px 0" }}>
      <div className="files-pdf-wrapper" style={{ width: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        {pages.map((p, i) => (
          <div
            key={i}
            className="files-pdf-page"
            style={{
              background: "#fff",
              borderRadius: 4,
              padding: "64px 72px",
              minHeight: 880,
              boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 14px 32px -12px rgba(15,23,42,0.18)",
              fontFamily: '"Sora", system-ui',
              position: "relative",
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 500,
                color: C_INK,
                letterSpacing: "-0.02em",
                marginBottom: 24,
                paddingBottom: 14,
                borderBottom: `1px solid ${C_LINE}`,
              }}
            >
              {p.title}
            </div>
            {p.body.map((line, j) => (
              <div key={j} style={{ fontSize: 14, lineHeight: 1.8, color: C_INK2, margin: "10px 0" }}>
                {line}
              </div>
            ))}
            <div
              style={{
                position: "absolute",
                bottom: 20,
                right: 24,
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                color: C_MUTED2,
              }}
            >
              {i + 1} / {pages.length}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
