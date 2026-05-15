import IconBtn from "./IconBtn";
import { FileChipLg } from "./FileChip";
import { C_BG, C_EASE, C_INK, C_INK2, C_LINE, C_MUTED, C_MUTED2, C_SURFACE2 } from "./tokens";

export default function FilesTopBar({
  file,
  dirty,
  onSave,
  onDiscuss,
  onMobileMenu,
  onMobileAgent,
}) {
  return (
    <header
      className="files-topbar"
      style={{
        height: 52,
        flexShrink: 0,
        padding: "0 22px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: C_BG,
        borderBottom: `1px solid ${C_LINE}`,
      }}
    >
      <button
        className="files-mobile-menu"
        onClick={onMobileMenu}
        title="Open files"
        aria-label="Open files"
        style={{
          width: 36,
          height: 36,
          border: 0,
          background: "transparent",
          color: C_INK2,
          cursor: "pointer",
          borderRadius: 8,
          placeItems: "center",
          flexShrink: 0,
          marginLeft: -8,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        {file ? (
          <>
            <span className="breadcrumb-root" style={{ fontSize: 13, color: C_MUTED, fontWeight: 400 }}>WFH Group</span>
            <span className="breadcrumb-sep">
              <Sep />
            </span>
            <FileChipLg type={file.type} />
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: C_INK,
                letterSpacing: "-0.005em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </span>
            {dirty && (
              <span
                style={{
                  fontSize: 10.5,
                  fontFamily: "ui-monospace, monospace",
                  color: C_MUTED,
                  letterSpacing: "0.06em",
                  padding: "2px 7px",
                  borderRadius: 4,
                  border: `1px solid ${C_LINE}`,
                  background: "#FBFCFD",
                }}
              >
                UNSAVED
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 13, color: C_MUTED }}>No file open</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          className="files-topbar-discuss"
          onClick={onDiscuss}
          title="Discuss this file with Lumen"
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 8,
            border: `1px solid ${C_LINE}`,
            background: C_BG,
            color: C_INK2,
            fontFamily: "inherit",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            transition: `background .12s ${C_EASE}, color .12s ${C_EASE}, border-color .12s ${C_EASE}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C_SURFACE2;
            e.currentTarget.style.color = C_INK;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = C_BG;
            e.currentTarget.style.color = C_INK2;
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          Discuss
        </button>
        <button
          onClick={onSave}
          disabled={!dirty}
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 8,
            border: dirty ? "1px solid #0F172A" : `1px solid ${C_LINE}`,
            background: dirty ? "#0F172A" : C_BG,
            color: dirty ? "#fff" : C_MUTED2,
            fontFamily: "inherit",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: dirty ? "pointer" : "default",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            transition: `background .12s ${C_EASE}`,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          Save
          <span
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 10,
              color: dirty ? "rgba(255,255,255,0.6)" : C_MUTED2,
              letterSpacing: "0.04em",
            }}
          >
            ⌘S
          </span>
        </button>
        <span className="files-topbar-share">
          <IconBtn title="Share">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" />
              <path d="M16 6l-4-4-4 4" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </IconBtn>
        </span>
        <span className="files-topbar-more">
          <IconBtn title="More">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="5" cy="12" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
            </svg>
          </IconBtn>
        </span>
        <button
          className="files-mobile-agent"
          onClick={onMobileAgent}
          title="Open agent"
          aria-label="Open agent panel"
          style={{
            width: 36,
            height: 36,
            border: 0,
            background: "transparent",
            color: C_INK2,
            cursor: "pointer",
            borderRadius: 8,
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function Sep() {
  return (
    <svg width="8" height="10" viewBox="0 0 8 10">
      <path d="M2 1L6 5L2 9" fill="none" stroke={C_MUTED2} strokeWidth="1.2" />
    </svg>
  );
}
