import { FileChip } from "./FileChip";
import { C_BG, C_EASE, C_INK, C_LINE, C_LINE_SOFT, C_MUTED } from "./tokens";

export default function TabStrip({ tabs, activeId, dirty, onActivate, onClose }) {
  return (
    <div
      style={{
        height: 38,
        display: "flex",
        alignItems: "stretch",
        background: C_BG,
        borderBottom: `1px solid ${C_LINE}`,
        paddingLeft: 12,
        gap: 0,
        flexShrink: 0,
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <div
            key={t.id}
            onClick={() => onActivate(t.id)}
            className="tab-strip-item"
            title={t.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              cursor: "pointer",
              position: "relative",
              fontSize: 12.5,
              color: active ? C_INK : C_MUTED,
              fontWeight: active ? 500 : 400,
              flex: "1 1 0",
              minWidth: 0,
              maxWidth: 220,
              borderRight: `1px solid ${C_LINE_SOFT}`,
            }}
          >
            <FileChip type={t.type} size={14} />
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.name}
            </span>
            {t.loading ? (
              <span className="tab-strip-loading-dot" aria-label="Loading" />
            ) : dirty.has(t.id) ? (
              <span
                title="Unsaved"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: active ? C_INK : C_MUTED,
                  opacity: 0.85,
                }}
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                title="Close tab"
                className="tab-close"
                style={{
                  opacity: active ? 0.6 : 0,
                  width: 18,
                  height: 18,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  borderRadius: 4,
                  color: C_MUTED,
                  display: "grid",
                  placeItems: "center",
                  transition: `opacity .12s ${C_EASE}, background .12s ${C_EASE}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(15,23,42,0.06)";
                  e.currentTarget.style.opacity = 1;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.opacity = active ? 0.6 : 0;
                }}
              >
                <svg width="9" height="9" viewBox="0 0 9 9">
                  <path d="M1 1L8 8M8 1L1 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            )}
            {active && (
              <div
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: C_INK,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
