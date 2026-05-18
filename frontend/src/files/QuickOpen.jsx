import { useEffect, useMemo, useRef, useState } from "react";
import { FileChip } from "./FileChip";
import { C_BG, C_EASE, C_INK, C_INK2, C_LINE, C_MUTED, C_MUTED2, C_SURFACE2 } from "./tokens";

// Flatten a tree of {kind, children} into a list of files only, with each
// file's folder path attached for display + ranking secondary signal.
function flattenFiles(node, path = "") {
  const out = [];
  if (!node) return out;
  for (const c of node.children || []) {
    if (c.kind === "file") {
      // Keep `kind` so the caller's openFile() guard passes.
      out.push({ id: c.id, name: c.name, type: c.type, kind: "file", path });
    } else if (c.kind === "folder") {
      out.push(...flattenFiles(c, path ? `${path}/${c.name}` : c.name));
    }
  }
  return out;
}

// Light fuzzy match: each query char must appear in name, in order, case
// insensitive. Score = shorter spans + more consecutive matches first.
// Falls back to substring boost for the simple "I typed orders" case.
function fuzzyScore(query, candidate) {
  const q = query.toLowerCase();
  const s = candidate.toLowerCase();
  if (!q) return { score: 0, ranges: [] };
  // Substring fast path
  const idx = s.indexOf(q);
  if (idx >= 0) {
    return {
      score: 10000 - idx - (s.length - q.length),
      ranges: [[idx, idx + q.length]],
    };
  }
  // Fuzzy subsequence
  let si = 0;
  const hits = [];
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi];
    let found = -1;
    while (si < s.length) {
      if (s[si] === ch) {
        found = si;
        si += 1;
        break;
      }
      si += 1;
    }
    if (found === -1) return null; // missing char → no match
    hits.push(found);
  }
  // Score: penalise spread + reward consecutive runs
  const spread = hits[hits.length - 1] - hits[0];
  let runs = 0;
  for (let i = 1; i < hits.length; i += 1) {
    if (hits[i] === hits[i - 1] + 1) runs += 1;
  }
  const score = 5000 - spread + runs * 50;
  // Compact runs into highlight ranges
  const ranges = [];
  let start = hits[0];
  let prev = hits[0];
  for (let i = 1; i < hits.length; i += 1) {
    if (hits[i] === prev + 1) {
      prev = hits[i];
    } else {
      ranges.push([start, prev + 1]);
      start = hits[i];
      prev = hits[i];
    }
  }
  ranges.push([start, prev + 1]);
  return { score, ranges };
}

function Highlighted({ text, ranges }) {
  if (!ranges || ranges.length === 0) return <>{text}</>;
  const out = [];
  let cur = 0;
  ranges.forEach(([a, b], i) => {
    if (a > cur) out.push(<span key={`p-${i}`}>{text.slice(cur, a)}</span>);
    out.push(
      <span key={`h-${i}`} style={{ color: C_INK, fontWeight: 600 }}>
        {text.slice(a, b)}
      </span>,
    );
    cur = b;
  });
  if (cur < text.length) out.push(<span key="tail">{text.slice(cur)}</span>);
  return <>{out}</>;
}

export default function QuickOpen({ tree, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allFiles = useMemo(() => flattenFiles(tree), [tree]);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) {
      // Empty query → show all files alphabetically, capped.
      return allFiles
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 50)
        .map((f) => ({ ...f, score: 0, ranges: [] }));
    }
    const scored = [];
    for (const f of allFiles) {
      const r = fuzzyScore(q, f.name);
      if (!r) continue;
      scored.push({ ...f, score: r.score, ranges: r.ranges });
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, 50);
  }, [allFiles, query]);

  useEffect(() => {
    // Snap selection back to top whenever the query changes.
    setSelected(0);
  }, [query]);

  // Keep the selected item scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  const handleKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = matches[selected];
      if (m) {
        onPick(m);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick open file"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.30)",
        zIndex: 80,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "12vh",
        animation: `files-backdrop-in 0.12s ${C_EASE} both`,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 92vw)",
          maxHeight: "70vh",
          background: C_BG,
          border: `1px solid ${C_LINE}`,
          borderRadius: 12,
          boxShadow: "0 24px 60px -20px rgba(15, 23, 42, 0.5)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: '"Sora", system-ui',
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderBottom: `1px solid ${C_LINE}`,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C_MUTED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.5-4.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a file name…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 15,
              color: C_INK,
              fontFamily: "inherit",
            }}
          />
          <span
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              color: C_MUTED2,
              border: `1px solid ${C_LINE}`,
              borderRadius: 4,
              padding: "2px 6px",
            }}
          >
            esc
          </span>
        </div>

        <div ref={listRef} style={{ overflowY: "auto", padding: 6 }}>
          {matches.length === 0 ? (
            <div style={{ padding: "18px 14px", color: C_MUTED2, fontSize: 13, textAlign: "center" }}>
              No matching files.
            </div>
          ) : (
            matches.map((m, i) => {
              const active = i === selected;
              return (
                <button
                  key={m.id}
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => onPick(m)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    border: "none",
                    background: active ? C_SURFACE2 : "transparent",
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                    color: C_INK2,
                    fontFamily: "inherit",
                  }}
                >
                  <FileChip type={m.type} size={14} />
                  <span
                    style={{
                      fontSize: 13,
                      color: C_INK,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                      flex: "0 1 auto",
                    }}
                  >
                    <Highlighted text={m.name} ranges={m.ranges} />
                  </span>
                  {m.path && (
                    <span
                      style={{
                        fontSize: 11,
                        color: C_MUTED,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: "1 1 auto",
                        minWidth: 0,
                      }}
                    >
                      {m.path}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
            padding: "8px 14px",
            borderTop: `1px solid ${C_LINE}`,
            background: "#FBFCFD",
            fontSize: 11,
            color: C_MUTED,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
