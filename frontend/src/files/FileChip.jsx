import { C_LINE, C_MUTED, TYPE_META } from "./tokens";

export function FileChip({ type, size = 18 }) {
  const meta = TYPE_META[type] || { label: type?.toUpperCase() || "·", tone: C_MUTED };
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: "#fff",
        border: `1px solid ${C_LINE}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative",
      }}
      title={meta.label}
    >
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: meta.tone }} />
    </div>
  );
}

export function FileChipLg({ type }) {
  const meta = TYPE_META[type] || { label: type?.toUpperCase() || "·", tone: C_MUTED };
  return (
    <div
      style={{
        height: 17,
        padding: "0 5px",
        borderRadius: 3,
        background: "#fff",
        border: `1px solid ${C_LINE}`,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
        fontFamily: 'ui-monospace, "SF Mono", monospace',
        fontSize: 9,
        fontWeight: 500,
        color: C_MUTED,
        letterSpacing: "0.06em",
      }}
    >
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: meta.tone }} />
      {meta.label}
    </div>
  );
}
