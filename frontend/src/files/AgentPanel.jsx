import { useState } from "react";
import AgentLogo from "../components/AgentLogo";
import {
  C_BG,
  C_EASE,
  C_INK,
  C_INK2,
  C_LINE,
  C_LINE_SOFT,
  C_MUTED,
  C_MUTED2,
  C_SIDEBAR,
  C_SURFACE2,
} from "./tokens";

export default function AgentPanel({ file, mobileOpen, onMobileClose, onOpenFullChat }) {
  return (
    <aside
      className={`files-agent-panel${mobileOpen ? " mobile-open" : ""}`}
      style={{
        width: 360,
        flexShrink: 0,
        background: C_SIDEBAR,
        borderLeft: `1px solid ${C_LINE}`,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          height: 52,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px",
          borderBottom: `1px solid ${C_LINE}`,
          background: C_BG,
        }}
      >
        <AgentLogo size={22} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", lineHeight: 1.1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C_INK, letterSpacing: "-0.005em" }}>
            Agent
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: C_MUTED,
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {file ? (
              <>
                scoped to <span style={{ color: C_INK2, fontWeight: 500 }}>{file.name}</span>
              </>
            ) : (
              "scoped to this workspace"
            )}
          </div>
        </div>
        <button
          onClick={onOpenFullChat}
          title="Open in full chat"
          style={{
            height: 26,
            padding: "0 9px",
            borderRadius: 7,
            border: `1px solid ${C_LINE}`,
            background: C_BG,
            color: C_INK2,
            fontFamily: "inherit",
            fontSize: 11.5,
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            transition: `background .12s ${C_EASE}`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C_SURFACE2)}
          onMouseLeave={(e) => (e.currentTarget.style.background = C_BG)}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7" />
            <path d="M8 7h9v9" />
          </svg>
          Open
        </button>
        {onMobileClose && (
          <button
            className="files-mobile-agent-close"
            onClick={onMobileClose}
            title="Close"
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: "transparent",
              color: C_MUTED,
              cursor: "pointer",
              borderRadius: 8,
              placeItems: "center",
              marginLeft: 2,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 18px 6px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <AgentLogo size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: C_INK,
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 5,
              }}
            >
              Lumen
              <span style={{ fontSize: 10.5, color: C_MUTED2, fontWeight: 400 }}>· file thread</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: C_INK2 }}>
              {file ? (
                <>
                  Ask me anything about{" "}
                  <strong style={{ color: C_INK, fontWeight: 600 }}>{file.name}</strong>. This is a focused
                  thread — for cross-file work or general questions, switch to{" "}
                  <a
                    onClick={onOpenFullChat}
                    style={{
                      color: C_INK,
                      fontWeight: 500,
                      textDecoration: "none",
                      borderBottom: `1px solid ${C_LINE}`,
                      cursor: "pointer",
                    }}
                  >
                    full chat
                  </a>
                  .
                </>
              ) : (
                <>
                  Open a file from the sidebar to start a focused thread. For general questions, use{" "}
                  <a
                    onClick={onOpenFullChat}
                    style={{
                      color: C_INK,
                      fontWeight: 500,
                      textDecoration: "none",
                      borderBottom: `1px solid ${C_LINE}`,
                      cursor: "pointer",
                    }}
                  >
                    full chat
                  </a>
                  .
                </>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 10,
            color: C_MUTED,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 500,
            padding: "4px 2px 8px",
          }}
        >
          Suggestions
        </div>
        <Suggestion
          glyph={<EditGlyph />}
          title="Summarize this file"
          sub={file ? `Across ${file.name}` : "Open a file first"}
          disabled
        />
        <Suggestion
          glyph={<RefreshGlyph />}
          title="Rewrite for clarity"
          sub="Keep meaning, simplify language"
          disabled
        />
        <Suggestion
          glyph={<CheckGlyph />}
          title="Find inconsistencies"
          sub="Names, dates, totals across files"
          disabled
        />
        <Suggestion
          glyph={<LinkGlyph />}
          title="Cross-reference workspace"
          sub="Pull related context as you edit"
          disabled
        />
      </div>

      <Composer disabled file={file} />
    </aside>
  );
}

function Suggestion({ glyph, title, sub, disabled }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 9,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: `background .12s ${C_EASE}`,
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: "#fff",
          border: `1px solid ${C_LINE}`,
          color: C_MUTED,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        {glyph}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: C_INK, fontWeight: 500, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 11, color: C_MUTED, lineHeight: 1.4, marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

function Composer({ disabled, file }) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState("auto");
  const has = value.trim().length > 0;

  return (
    <div style={{ padding: "8px 16px 18px" }}>
      <div
        style={{
          background: C_BG,
          border: `1px solid ${C_LINE}`,
          borderRadius: 18,
          padding: "12px 14px 10px",
          boxShadow: "0 1px 0 rgba(15,23,42,.02), 0 18px 40px -28px rgba(15,23,42,.18)",
          transition: `border-color .15s ${C_EASE}, box-shadow .15s ${C_EASE}`,
          opacity: disabled ? 0.85 : 1,
        }}
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={file ? `Ask Lumen to edit ${file.name}…` : "Ask Lumen to edit a file…"}
          rows={1}
          style={{
            width: "100%",
            border: 0,
            outline: 0,
            background: "transparent",
            fontFamily: "inherit",
            fontSize: 13.5,
            lineHeight: 1.5,
            color: C_INK,
            resize: "none",
            padding: "4px 2px 6px",
            minHeight: 22,
            maxHeight: 140,
            overflowY: "auto",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingTop: 8,
            marginTop: 4,
            borderTop: `1px solid ${C_LINE_SOFT}`,
          }}
        >
          <button disabled={disabled} title="Attach a file from the workspace" style={toolBtnStyle(disabled)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
            <span>File</span>
          </button>
          <button disabled={disabled} title="Attach context" style={toolBtnStyle(disabled)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: "inline-flex",
              background: C_SURFACE2,
              borderRadius: 9,
              padding: 3,
              gap: 2,
              opacity: disabled ? 0.7 : 1,
            }}
          >
            {["quick", "full", "auto"].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={disabled}
                style={{
                  border: 0,
                  background: mode === m ? C_BG : "transparent",
                  fontFamily: "inherit",
                  fontSize: 11,
                  fontWeight: 500,
                  color: mode === m ? C_INK : C_MUTED,
                  padding: "4px 9px",
                  borderRadius: 7,
                  cursor: disabled ? "not-allowed" : "pointer",
                  boxShadow:
                    mode === m
                      ? "0 1px 2px rgba(15,23,42,.08), 0 0 0 1px rgba(15,23,42,.04)"
                      : "none",
                  textTransform: "capitalize",
                  transition: `background .12s ${C_EASE}, color .12s ${C_EASE}`,
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            disabled={disabled || !has}
            title="Send"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: has && !disabled ? "#0F172A" : C_SURFACE2,
              color: has && !disabled ? "#fff" : C_MUTED2,
              border: 0,
              cursor: has && !disabled ? "pointer" : "not-allowed",
              display: "grid",
              placeItems: "center",
              transition: `background .12s ${C_EASE}`,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 10,
          color: C_MUTED2,
          fontFamily: 'ui-monospace, "SF Mono", monospace',
          letterSpacing: "0.05em",
        }}
      >
        MESSAGES SYNC TO CHAT · v4.3
      </div>
    </div>
  );
}

function toolBtnStyle(disabled) {
  return {
    height: 28,
    padding: "0 9px",
    borderRadius: 8,
    background: "transparent",
    border: 0,
    fontFamily: "inherit",
    fontSize: 12,
    color: C_MUTED,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: `background .12s ${C_EASE}, color .12s ${C_EASE}`,
  };
}

function EditGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function RefreshGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
function CheckGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function LinkGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" />
    </svg>
  );
}
