import { C_CANVAS, C_MUTED } from "../tokens";

export default function ImageViewer({ file }) {
  const { w, h, label, palette } = file.content;
  const [a, b] = palette;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: C_CANVAS,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          className="files-image"
          style={{
            width: 600,
            height: Math.round((600 * h) / w),
            background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 22px 60px -16px rgba(15,23,42,0.25)",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontFamily: '"Sora", system-ui',
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.08,
              backgroundImage:
                "linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%), linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%)",
              backgroundSize: "24px 24px",
              backgroundPosition: "0 0, 12px 12px",
            }}
          />
          <div style={{ position: "relative", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em" }}>
            {label}
          </div>
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: C_MUTED,
            letterSpacing: "0.04em",
          }}
        >
          {w} × {h} · PNG · {palette.join(" · ")}
        </div>
      </div>
    </div>
  );
}
