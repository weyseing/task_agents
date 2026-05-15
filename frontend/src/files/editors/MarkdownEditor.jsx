import { useState } from "react";
import useMediaQuery from "../useMediaQuery";
import { C_BG, C_INK, C_INK2, C_LINE, C_MUTED, C_MUTED2 } from "../tokens";

export default function MarkdownEditor({ file, onChange }) {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [mode, setMode] = useState("split");
  // Split is awkward on a phone — fall back to edit when narrow.
  const effectiveMode = isMobile && mode === "split" ? "edit" : mode;

  const editorEl = (
    <textarea
      className="files-md-pane"
      value={file.content}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        background: "transparent",
        resize: "none",
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: 13.5,
        lineHeight: 1.7,
        color: C_INK,
        padding: "32px 40px",
      }}
    />
  );
  const previewEl = (
    <div
      className="files-md-pane files-md-preview"
      style={{
        flex: 1,
        padding: "32px 48px",
        overflowY: "auto",
        fontFamily: '"Sora", system-ui',
        color: C_INK,
        fontSize: 15,
        lineHeight: 1.7,
      }}
    >
      <MdRender source={file.content} />
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C_BG }}>
      <div
        style={{
          height: 36,
          borderBottom: `1px solid ${C_LINE}`,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 16px",
          background: "#FBFCFD",
        }}
      >
        <SegBtn active={effectiveMode === "edit"} onClick={() => setMode("edit")}>Edit</SegBtn>
        {!isMobile && (
          <SegBtn active={effectiveMode === "split"} onClick={() => setMode("split")}>Split</SegBtn>
        )}
        <SegBtn active={effectiveMode === "preview"} onClick={() => setMode("preview")}>Preview</SegBtn>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            fontSize: 11,
            color: C_MUTED2,
            letterSpacing: "0.04em",
          }}
        >
          {file.content.length} chars · markdown
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {effectiveMode === "edit" && editorEl}
        {effectiveMode === "preview" && previewEl}
        {effectiveMode === "split" && (
          <>
            {editorEl}
            <div style={{ width: 1, background: C_LINE }} />
            {previewEl}
          </>
        )}
      </div>
    </div>
  );
}

function SegBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 24,
        padding: "0 10px",
        borderRadius: 6,
        border: "none",
        background: active ? "#E8ECF3" : "transparent",
        color: active ? C_INK : C_MUTED,
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: active ? 500 : 400,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function MdRender({ source }) {
  const lines = source.split("\n");
  const out = [];
  let inList = false;
  const flushList = (key) => {
    if (inList) {
      const items = out.splice(out._listStart);
      out.push(
        <ul key={"ul" + key} style={{ paddingLeft: 22, margin: "4px 0 14px" }}>
          {items}
        </ul>
      );
      inList = false;
    }
  };
  lines.forEach((raw, i) => {
    const line = raw;
    if (/^# /.test(line)) {
      flushList(i);
      out.push(
        <h1 key={i} style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.025em", margin: "0 0 12px", color: C_INK }}>
          {inline(line.slice(2))}
        </h1>
      );
      return;
    }
    if (/^## /.test(line)) {
      flushList(i);
      out.push(
        <h2 key={i} style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em", margin: "24px 0 8px", color: C_INK }}>
          {inline(line.slice(3))}
        </h2>
      );
      return;
    }
    if (/^### /.test(line)) {
      flushList(i);
      out.push(
        <h3 key={i} style={{ fontSize: 16, fontWeight: 600, margin: "20px 0 6px", color: C_INK }}>
          {inline(line.slice(4))}
        </h3>
      );
      return;
    }
    if (/^> /.test(line)) {
      flushList(i);
      out.push(
        <blockquote
          key={i}
          style={{
            borderLeft: `2px solid ${C_LINE}`,
            padding: "2px 0 2px 14px",
            margin: "8px 0",
            color: C_MUTED,
          }}
        >
          {inline(line.slice(2))}
        </blockquote>
      );
      return;
    }
    if (/^- /.test(line) || /^\* /.test(line)) {
      if (!inList) {
        inList = true;
        out._listStart = out.length;
      }
      out.push(
        <li key={i} style={{ margin: "2px 0" }}>
          {inline(line.slice(2))}
        </li>
      );
      return;
    }
    if (/^\d+\. /.test(line)) {
      flushList(i);
      out.push(
        <div key={i} style={{ margin: "2px 0", paddingLeft: 18, textIndent: -18 }}>
          {line.match(/^\d+\. /)[0]}
          <span>{inline(line.replace(/^\d+\. /, ""))}</span>
        </div>
      );
      return;
    }
    if (line.trim() === "") {
      flushList(i);
      out.push(<div key={i} style={{ height: 8 }} />);
      return;
    }
    flushList(i);
    out.push(
      <p key={i} style={{ margin: "0 0 10px" }}>
        {inline(line)}
      </p>
    );
  });
  flushList("end");
  return <>{out}</>;
}

function inline(text) {
  const parts = [];
  let rest = text;
  let key = 0;
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/;
  while (rest) {
    const m = rest.match(re);
    if (!m) {
      parts.push(rest);
      break;
    }
    parts.push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={"k" + key++} style={{ fontWeight: 600 }}>
          {tok.slice(2, -2)}
        </strong>
      );
    } else if (tok.startsWith("`")) {
      parts.push(
        <code
          key={"k" + key++}
          style={{
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            fontSize: "0.92em",
            background: "#F1F4F9",
            padding: "1px 5px",
            borderRadius: 4,
          }}
        >
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("_")) {
      parts.push(
        <em key={"k" + key++} style={{ fontStyle: "italic", color: C_INK2 }}>
          {tok.slice(1, -1)}
        </em>
      );
    }
    rest = rest.slice(m.index + tok.length);
  }
  return parts;
}
