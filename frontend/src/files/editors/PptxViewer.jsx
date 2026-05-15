import { useState } from "react";
import { C_CANVAS, C_INK, C_INK2, C_LINE, C_MUTED, C_MUTED2 } from "../tokens";

export default function PptxViewer({ file }) {
  const { slides } = file.content;
  const [active, setActive] = useState(0);
  const slide = slides[active] || slides[0];

  return (
    <div className="files-pptx-row" style={{ flex: 1, minHeight: 0, display: "flex", background: C_CANVAS }}>
      <div
        className="files-pptx-rail"
        style={{
          width: 200,
          borderRight: `1px solid ${C_LINE}`,
          background: "#FBFCFD",
          padding: "16px 12px",
          overflowY: "auto",
        }}
      >
        <div
          className="files-pptx-rail-header"
          style={{
            fontSize: 11,
            color: C_MUTED2,
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 10,
            paddingLeft: 4,
          }}
        >
          {slides.length} slides
        </div>
        {slides.map((s, i) => (
          <div
            key={i}
            className="files-pptx-thumb"
            onClick={() => setActive(i)}
            style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", marginBottom: 10 }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                color: C_MUTED2,
                width: 14,
                paddingTop: 8,
                textAlign: "right",
              }}
            >
              {i + 1}
            </span>
            <div
              style={{
                flex: 1,
                aspectRatio: "16/9",
                background: "#fff",
                borderRadius: 6,
                border: i === active ? "2px solid #0F172A" : `1px solid ${C_LINE}`,
                padding: 8,
                fontSize: 7,
                color: C_INK,
                overflow: "hidden",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 7.5, marginBottom: 4 }}>{s.title}</div>
              {s.bullets.slice(0, 3).map((b, j) => (
                <div key={j} style={{ color: C_MUTED, lineHeight: 1.4 }}>
                  • {b}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
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
          <span style={{ fontSize: 12, color: C_MUTED, fontWeight: 500 }}>
            Slide {active + 1} of {slides.length}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setActive(Math.max(0, active - 1))} style={pptBtn}>
            ← Prev
          </button>
          <button onClick={() => setActive(Math.min(slides.length - 1, active + 1))} style={pptBtn}>
            Next →
          </button>
        </div>
        <div className="files-pptx-stage" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div
            className="files-pptx-slide"
            style={{
              width: "min(900px, 100%)",
              aspectRatio: "16/9",
              background: "#fff",
              borderRadius: 10,
              padding: "56px 64px",
              boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 22px 60px -16px rgba(15,23,42,0.25)",
              fontFamily: '"Sora", system-ui',
              color: C_INK,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div className="files-pptx-slide-title" style={{ fontSize: 42, fontWeight: 500, letterSpacing: "-0.025em", marginBottom: 24 }}>
              {slide.title}
            </div>
            {slide.bullets.map((b, i) => (
              <div key={i} className="files-pptx-bullet" style={{ fontSize: 20, color: C_INK2, margin: "8px 0", display: "flex", gap: 14 }}>
                <span style={{ color: C_MUTED2 }}>—</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const pptBtn = {
  height: 26,
  padding: "0 10px",
  borderRadius: 6,
  border: `1px solid ${C_LINE}`,
  background: "#fff",
  fontFamily: "inherit",
  fontSize: 12,
  color: C_INK2,
  cursor: "pointer",
};
