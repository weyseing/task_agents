import { useEffect, useRef } from "react";
import { FileChip } from "./FileChip";
import { C_BG, C_EASE, C_INK, C_LINE, C_LINE_SOFT, C_MUTED } from "./tokens";

export default function TabStrip({ tabs, activeId, dirty, onActivate, onClose }) {
  const stripRef = useRef(null);

  // When the active tab changes, scroll it into view so the user never
  // has to manually pan the strip to find what they just opened.
  useEffect(() => {
    if (!activeId || !stripRef.current) return;
    const el = stripRef.current.querySelector(`[data-tab-id="${activeId}"]`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }, [activeId]);

  return (
    <div
      ref={stripRef}
      className="tab-strip"
      style={{
        height: 38,
        display: "flex",
        alignItems: "stretch",
        background: C_BG,
        borderBottom: `1px solid ${C_LINE}`,
        paddingLeft: 12,
        gap: 0,
        flexShrink: 0,
        // Horizontal scroll once there are more tabs than the strip can hold,
        // instead of crushing every tab into a sliver. The active tab gets
        // scrolled into view via the effect below.
        overflowX: "auto",
        overflowY: "hidden",
        minWidth: 0,
        scrollbarWidth: "thin",
      }}
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <div
            key={t.id}
            data-tab-id={t.id}
            data-active={active ? "true" : "false"}
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
              // Natural-width tabs that don't shrink. `min-width` keeps short
              // names readable; `max-width` caps absurdly long names so a
              // single tab can't dominate the whole strip.
              flex: "0 0 auto",
              minWidth: 120,
              maxWidth: 240,
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
