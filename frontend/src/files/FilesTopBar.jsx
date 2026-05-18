import { useEffect, useRef, useState } from "react";
import IconBtn from "./IconBtn";
import { FileChipLg } from "./FileChip";
import { apiFetch } from "../api";
import { C_BG, C_EASE, C_INK, C_INK2, C_LINE, C_MUTED, C_MUTED2, C_SURFACE2 } from "./tokens";


function ExportMenu({ file }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // 'csv' | 'gs' | null
  const [error, setError] = useState(null);
  const [link, setLink] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Clear the success link when the active file changes
  useEffect(() => {
    setLink(null);
    setError(null);
  }, [file?.id]);

  if (!file || (file.type !== "csv" && file.type !== "xlsx")) {
    return null;
  }

  const downloadCsv = async () => {
    setBusy("csv");
    setError(null);
    try {
      const r = await apiFetch(`/api/files/${file.id}/export/csv`);
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(body || `Download failed (${r.status})`);
      }
      const blob = await r.blob();
      const filename = (file.name || "export").replace(/\.(xlsx|csv)$/i, "") + ".csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const exportSheets = async () => {
    setBusy("gs");
    setError(null);
    setLink(null);
    try {
      const r = await apiFetch(`/api/files/${file.id}/export/google_sheets`, {
        method: "POST",
      });
      if (r.status === 409) {
        const body = await r.json().catch(() => ({}));
        setError(
          (body.detail || "Reconnect Google account to enable Sheets export.") +
            " (Sign out → sign back in with Google.)"
        );
        return;
      }
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(body || `Export failed (${r.status})`);
      }
      const data = await r.json();
      setLink(data.url);
      // Open in a new tab as well
      window.open(data.url, "_blank", "noopener");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <span style={{ position: "relative" }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Export"
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
          gap: 6,
          transition: `background .12s ${C_EASE}, color .12s ${C_EASE}`,
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
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 280,
            background: C_BG,
            border: `1px solid ${C_LINE}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px -8px rgba(15,23,42,.18), 0 0 0 1px rgba(15,23,42,.02)",
            padding: 6,
            zIndex: 30,
          }}
        >
          <MenuRow
            icon={<GoogleIcon />}
            title="Open in Google Sheets"
            sub="Creates a new Sheet in your Google Drive"
            disabled={busy !== null}
            onClick={exportSheets}
            running={busy === "gs"}
          />
          <MenuRow
            icon={<CsvIcon />}
            title="Download as CSV"
            sub="Plain comma-separated values"
            disabled={busy !== null}
            onClick={downloadCsv}
            running={busy === "csv"}
          />
          {(error || link) && (
            <div
              style={{
                marginTop: 6,
                padding: "8px 10px",
                fontSize: 11.5,
                color: error ? "#b91c1c" : C_INK2,
                background: error ? "#FEF2F2" : "#F0FDF4",
                borderRadius: 6,
                lineHeight: 1.4,
              }}
            >
              {error}
              {link && (
                <span>
                  Opened in a new tab.{" "}
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: C_INK, fontWeight: 500 }}
                  >
                    Open again
                  </a>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}


function MenuRow({ icon, title, sub, disabled, running, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        background: "transparent",
        border: 0,
        borderRadius: 7,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        opacity: disabled && !running ? 0.5 : 1,
        transition: `background .12s ${C_EASE}`,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = C_SURFACE2;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
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
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, color: C_INK, fontWeight: 500 }}>
          {running ? "Working…" : title}
        </span>
        <span style={{ display: "block", fontSize: 11, color: C_MUTED, marginTop: 1 }}>
          {sub}
        </span>
      </span>
    </button>
  );
}


function GoogleIcon() {
  // Google "G" — official multicolour rendering.
  return (
    <svg width="13" height="13" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.35 11.1H12v2.96h5.39c-.22 1.34-1.55 3.93-5.39 3.93-3.24 0-5.89-2.69-5.89-6s2.65-6 5.89-6c1.85 0 3.08.79 3.79 1.47l2.59-2.5C16.86 3.43 14.65 2.5 12 2.5 6.93 2.5 2.85 6.58 2.85 11.6S6.93 20.7 12 20.7c6.89 0 9.45-4.83 9.45-7.32 0-.49-.05-.86-.1-1.28z" />
    </svg>
  );
}

function CsvIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}


export default function FilesTopBar({
  file,
  dirty,
  onSave,
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
        <ExportMenu file={file} />
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
