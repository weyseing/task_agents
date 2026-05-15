import { C_EASE, C_INK2, C_MUTED } from "./tokens";

export default function IconBtn({ children, title, onClick, inline }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: inline ? 20 : 28,
        height: inline ? 20 : 28,
        border: "none",
        background: "transparent",
        color: C_MUTED,
        cursor: "pointer",
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        transition: `background .15s ${C_EASE}, color .15s ${C_EASE}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(15,23,42,0.05)";
        e.currentTarget.style.color = C_INK2;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = C_MUTED;
      }}
    >
      <span style={{ width: 15, height: 15, display: "grid", placeItems: "center" }}>
        {children}
      </span>
    </button>
  );
}
