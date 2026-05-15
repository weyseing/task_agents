import { C_MUTED, TYPE_META } from "./tokens";

// File-type "icon" — small uppercase monospace label (MD, TXT, CSV, …)
// in a single muted slate. The label IS the icon — no shell, no dot.
// Matches the chip from `Lumen Files.html` design.
function FileLabel({ type, size, fontWeight = 600, padded = false }) {
  const meta = TYPE_META[type] || {
    label: (type || "·").toString().toUpperCase().slice(0, 4),
    tone: C_MUTED,
  };
  const fontSize = Math.max(8.5, Math.round(size * 0.62));
  return (
    <span
      title={meta.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-start",
        height: size,
        minWidth: padded ? Math.round(size * 1.9) : undefined,
        color: meta.tone,
        fontFamily: 'ui-monospace, "SF Mono", "Roboto Mono", monospace',
        fontSize,
        fontWeight,
        letterSpacing: "0.04em",
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {meta.label}
    </span>
  );
}

export function FileChip({ type, size = 16 }) {
  return <FileLabel type={type} size={size} padded />;
}

export function FileChipLg({ type }) {
  return <FileLabel type={type} size={18} padded />;
}
