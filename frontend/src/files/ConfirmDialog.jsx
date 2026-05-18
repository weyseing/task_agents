import { C_BG, C_INK, C_INK2, C_LINE } from "./tokens";

export default function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(15,23,42,0.32)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
        // Gutter so the dialog never butts against the viewport on small screens.
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          // Desktop: 400px. Mobile: shrink to whatever fits in the gutters.
          width: "100%",
          maxWidth: 400,
          background: C_BG,
          borderRadius: 14,
          boxShadow: "0 30px 60px -20px rgba(15,23,42,0.4)",
          padding: "22px 22px 18px",
          border: `1px solid ${C_LINE}`,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: C_INK, letterSpacing: "-0.015em" }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: C_INK2, marginTop: 8, lineHeight: 1.55 }}>{body}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button
            onClick={onCancel}
            style={{
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              border: `1px solid ${C_LINE}`,
              background: C_BG,
              fontFamily: "inherit",
              fontSize: 12.5,
              color: C_INK2,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid #B0413E",
              background: "#B0413E",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
