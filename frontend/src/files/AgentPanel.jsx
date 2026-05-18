import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "../api";
import "../components/ChatMessages.css";
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


// Thin invisible hit-zone for resizing the agent panel.
function ResizeHandle({ onResizeStart }) {
  const [hot, setHot] = useState(false);
  return (
    <div
      className="files-agent-resize"
      onMouseDown={(e) => {
        setHot(true);
        onResizeStart(e);
      }}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: -3,
        width: 6,
        cursor: "col-resize",
        zIndex: 5,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 1,
          height: "100%",
          background: hot ? C_INK : "transparent",
          opacity: hot ? 0.35 : 0,
          transition: `opacity .15s ${C_EASE}, background .15s ${C_EASE}`,
        }}
      />
    </div>
  );
}


// Walk the file tree and return a flat list of mention-eligible workbooks.
// Sheets only (csv/xlsx); folder paths preserved for display.
function collectWorkbooks(node, path = "") {
  const out = [];
  if (!node) return out;
  for (const c of node.children || []) {
    if (c.kind === "file" && (c.type === "csv" || c.type === "xlsx")) {
      out.push({
        id: c.id,
        name: c.name,
        type: c.type,
        path: path ? `${path}/${c.name}` : c.name,
      });
    } else if (c.kind === "folder") {
      out.push(
        ...collectWorkbooks(c, path ? `${path}/${c.name}` : c.name)
      );
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}


export default function AgentPanel({
  file,
  fileTree,
  width,
  onResizeStart,
  mobileOpen,
  onMobileClose,
  onWorkbookMutated,
  onWorkspaceChanged,
}) {
  return (
    <aside
      className={`files-agent-panel${mobileOpen ? " mobile-open" : ""}`}
      style={{
        width,
        flexShrink: 0,
        background: C_SIDEBAR,
        borderLeft: `1px solid ${C_LINE}`,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative",
      }}
    >
      {onResizeStart && <ResizeHandle onResizeStart={onResizeStart} />}
      <Header
        file={file}
        onMobileClose={onMobileClose}
      />
      <ExcelChat
        file={file}
        fileTree={fileTree}
        onWorkbookMutated={onWorkbookMutated}
        onWorkspaceChanged={onWorkspaceChanged}
      />
    </aside>
  );
}


function Header({ file, onMobileClose }) {
  return (
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
      <img
        src="/favicon.svg"
        alt="Lumen"
        style={{
          width: 22,
          height: 22,
          flex: "0 0 22px",
          borderRadius: 6,
          objectFit: "cover",
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", lineHeight: 1.1, minWidth: 0 }}>
        <div className="agent-panel-title" style={{ fontSize: 13, fontWeight: 600, color: C_INK, letterSpacing: "-0.005em" }}>
          Excel agent
        </div>
        <div
          className="agent-panel-scope"
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
            <>viewing <span style={{ color: C_INK2, fontWeight: 500 }}>{file.name}</span> · works across all workbooks</>
          ) : (
            "works across all your workbooks"
          )}
        </div>
      </div>
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
  );
}


// ============== Excel chat (workspace-wide) ==============

const SHEET_TOOL_NAMES = {
  sheet_read: "read",
  sheet_set_cells: "set cells",
  sheet_add_rows: "add rows",
  sheet_delete_rows: "delete rows",
  sheet_add_columns: "add column",
  sheet_delete_columns: "delete column",
  sheet_set_headers: "rename header",
  sheet_replace_all: "replace sheet",
  sheet_compute: "compute",
  sheet_sort: "sort",
  sheet_filter: "filter",
  sheet_describe: "describe",
  sheet_correlate: "correlate",
  sheet_value_counts: "value counts",
  sheet_histogram: "histogram",
  sheet_pivot: "pivot",
  workbook_list: "list workbooks",
  workbook_peek: "peek",
  workbook_create: "create file",
  workbook_join: "join",
  workbook_concat: "concat",
};

const SUGGESTIONS_NO_FILE = [
  { title: "What workbooks do I have?", body: "List all my workbooks with their row and column counts." },
  { title: "Summarise the sales sheet", body: "Summarise the sales sheet — totals, top products, top regions." },
  { title: "Find pending expenses", body: "List all pending expenses across my workbooks." },
];

const SUGGESTIONS_WITH_FILE = (name) => [
  { title: `Describe ${name}`, body: `Run descriptive statistics on ${name}.` },
  { title: "Spot inconsistencies", body: `Look for blanks, duplicates, or outliers in ${name}.` },
  { title: "Pivot to a report", body: `Create a pivot report from ${name} and save as a new file.` },
];


function ExcelChat({ file, fileTree, onWorkbookMutated, onWorkspaceChanged }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [convId, setConvId] = useState(null);
  // History: all threads for this workspace, newest first
  const [threads, setThreads] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef(null);
  const historyRef = useRef(null);

  // Close history dropdown when clicking elsewhere
  useEffect(() => {
    if (!historyOpen) return;
    const h = (e) => {
      if (historyRef.current && !historyRef.current.contains(e.target)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [historyOpen]);

  const loadThreadsList = async () => {
    try {
      const r = await apiFetch(`/api/workspace/excel/conversations`);
      if (r.ok) {
        const data = await r.json();
        setThreads(data || []);
      }
    } catch {
      // non-fatal
    }
  };

  const loadConversationMessages = (data) => {
    setMessages(
      (data.messages || []).map((m) => ({
        ...m,
        tool_calls: m.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
          status: "done",
          data: tc.result,
        })),
      }))
    );
  };

  const loadActiveConversation = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/workspace/excel/conversation`);
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      const data = await r.json();
      setConvId(data.conversation_id);
      loadConversationMessages(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const switchToThread = async (threadId) => {
    if (streaming) return;
    setHistoryOpen(false);
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/workspace/excel/conversations/${threadId}`);
      if (!r.ok) throw new Error(`Failed to load thread (${r.status})`);
      const data = await r.json();
      setConvId(data.conversation_id);
      loadConversationMessages(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startNewThread = async () => {
    if (streaming) return;
    setHistoryOpen(false);
    try {
      const r = await apiFetch(`/api/workspace/excel/conversations`, {
        method: "POST",
      });
      if (!r.ok) throw new Error(`Could not start new chat (${r.status})`);
      const data = await r.json();
      setConvId(data.conversation_id);
      setMessages([]);
      await loadThreadsList();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteThread = async (threadId) => {
    if (streaming) return;
    try {
      await apiFetch(`/api/workspace/excel/conversations/${threadId}`, {
        method: "DELETE",
      });
      await loadThreadsList();
      // If the deleted one was active, drop to most-recent or empty.
      if (threadId === convId) {
        await loadActiveConversation();
      }
    } catch (e) {
      setError(e.message);
    }
  };

  // Load both the active thread and the history list on mount.
  useEffect(() => {
    loadActiveConversation();
    loadThreadsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = async (text, mentions) => {
    const content = text?.trim();
    if (!content || streaming) return;
    setStreaming(true);
    setError(null);

    const userMsg = { role: "user", content };
    let pending = {
      role: "assistant",
      content: "",
      tool_calls: [],
      isThinking: true,
    };
    setMessages((prev) => [...prev, userMsg, pending]);

    try {
      const res = await apiFetch(`/api/workspace/excel/chat`, {
        method: "POST",
        body: JSON.stringify({
          content,
          conversation_id: convId || undefined,
          mentions: (mentions && mentions.length) ? mentions : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let mutatedFiles = [];
      let createdFiles = [];

      const flush = () => {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...pending };
          return next;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          let ev;
          try {
            ev = JSON.parse(data);
          } catch {
            continue;
          }
          if (ev.conversation_id) {
            setConvId(ev.conversation_id);
            continue;
          }
          if (ev.content) {
            pending.content += ev.content;
            pending.isThinking = false;
            flush();
          }
          if (ev.tool_call) {
            pending.isThinking = false;
            pending.tool_calls = [
              ...(pending.tool_calls || []),
              { ...ev.tool_call, status: "running" },
            ];
            flush();
          }
          if (ev.tool_result) {
            pending.tool_calls = (pending.tool_calls || []).map((tc) =>
              tc.id === ev.tool_result.id
                ? { ...tc, status: "done", data: ev.tool_result.data }
                : tc
            );
            flush();
          }
          if (ev.done) {
            pending.isThinking = false;
            mutatedFiles = ev.mutated_files || [];
            createdFiles = ev.created_files || [];
            flush();
          }
        }
      }

      if (mutatedFiles.length > 0 && onWorkbookMutated) {
        onWorkbookMutated(mutatedFiles);
      }
      if (createdFiles.length > 0 && onWorkspaceChanged) {
        onWorkspaceChanged(createdFiles);
      }
      // Refresh history list (title may have auto-updated, ordering changed).
      loadThreadsList();
    } catch (e) {
      setError(e.message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  if (loading) {
    return <ChatLoadingState />;
  }

  const empty = messages.length === 0;
  const suggestions = file ? SUGGESTIONS_WITH_FILE(file.name) : SUGGESTIONS_NO_FILE;
  const otherThreads = threads.filter((t) => t.id !== convId);

  return (
    <>
      <div
        style={{
          padding: "10px 16px 0",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 4,
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={startNewThread}
          disabled={streaming}
          title="Start a new chat"
          style={chipButtonStyle(streaming)}
          className="agent-chip"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
        <span ref={historyRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            disabled={streaming || threads.length === 0}
            title={threads.length ? `${threads.length} past chat${threads.length === 1 ? "" : "s"}` : "No past chats yet"}
            style={iconChipStyle(streaming || threads.length === 0)}
            className="agent-chip"
            aria-label="Chat history"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 13.5" />
            </svg>
            {threads.length > 1 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 15,
                  height: 15,
                  padding: "0 4px",
                  borderRadius: 8,
                  background: "#0F172A",
                  color: "#fff",
                  fontSize: 9.5,
                  fontWeight: 600,
                  lineHeight: "15px",
                  textAlign: "center",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {threads.length}
              </span>
            )}
          </button>
          {historyOpen && (
            <HistoryDropdown
              threads={threads}
              activeId={convId}
              onPick={switchToThread}
              onDelete={deleteThread}
              onClose={() => setHistoryOpen(false)}
            />
          )}
        </span>
      </div>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "12px 16px 6px",
        }}
      >
        {empty ? (
          <EmptyState file={file} suggestions={suggestions} onPick={sendMessage} disabled={streaming} />
        ) : (
          messages.map((m, i) => <Message key={i} msg={m} />)
        )}
        {error && (
          <div style={{ fontSize: 12, color: "#b91c1c", padding: "8px 0" }}>
            {error}
          </div>
        )}
      </div>
      <Composer
        disabled={streaming}
        onSend={sendMessage}
        workbooks={collectWorkbooks(fileTree)}
      />
    </>
  );
}


function EmptyState({ file, suggestions, onPick, disabled }) {
  return (
    <div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: C_INK2, marginBottom: 18 }}>
        {file ? (
          <>
            Looking at <strong style={{ color: C_INK, fontWeight: 600 }}>{file.name}</strong>.
            Ask anything about this or any other workbook — the agent decides which files to read.
          </>
        ) : (
          <>
            Ask anything about your workbooks. The agent can read, edit, analyse,
            join, and create new sheets — it picks the right files for the job.
          </>
        )}
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
      {suggestions.map((s) => (
        <button
          key={s.title}
          type="button"
          onClick={() => onPick(s.body)}
          disabled={disabled}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            border: `1px solid ${C_LINE}`,
            background: C_BG,
            padding: "10px 12px",
            borderRadius: 10,
            marginBottom: 6,
            cursor: disabled ? "not-allowed" : "pointer",
            color: C_INK,
            fontFamily: "inherit",
            fontSize: 12.5,
            lineHeight: 1.4,
            transition: `background .12s ${C_EASE}`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C_SURFACE2)}
          onMouseLeave={(e) => (e.currentTarget.style.background = C_BG)}
        >
          <div style={{ fontWeight: 500 }}>{s.title}</div>
          <div style={{ fontSize: 11, color: C_MUTED, marginTop: 2 }}>{s.body}</div>
        </button>
      ))}
    </div>
  );
}


function Message({ msg }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <div
          style={{
            maxWidth: "85%",
            background: "#0F172A",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 14,
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  const hasContent = !!msg.content;
  const hasTools = msg.tool_calls && msg.tool_calls.length > 0;
  const pending = msg.isThinking && !hasContent && !hasTools;

  return (
    <div style={{ marginBottom: 14 }}>
      {hasTools && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {msg.tool_calls.map((tc) => (
            <SheetToolPill key={tc.id} tc={tc} />
          ))}
        </div>
      )}
      {hasContent && (
        <div
          className="reply"
          style={{ fontSize: 13.5, lineHeight: 1.55, color: C_INK }}
        >
          <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
        </div>
      )}
      {pending && <PendingBubble />}
    </div>
  );
}


function PendingBubble() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 14,
        border: `1px solid ${C_LINE}`,
        background: "#FBFCFD",
      }}
    >
      <PulseDots />
      <span
        className="agent-shimmer-label"
        style={{
          fontSize: 12.5,
          fontWeight: 500,
          color: C_INK2,
          letterSpacing: "0.01em",
        }}
      >
        Thinking
      </span>
    </div>
  );
}


function SheetToolPill({ tc }) {
  const [open, setOpen] = useState(false);
  const label = SHEET_TOOL_NAMES[tc.name] || tc.name;
  const running = tc.status === "running";
  const isError = tc.data?.error;
  const fileArg = tc.args?.file ? ` · ${tc.args.file}` : "";

  const summary = (() => {
    if (running) return "running";
    if (isError) return "error";
    const d = tc.data || {};
    if (d.type === "compute_result") {
      if (d.groups) return `${d.op}(${d.column || ""}) grouped`;
      return `${d.op}(${d.column || ""}) = ${d.result}`;
    }
    if (d.type === "describe_result") return `${(d.columns || []).length} cols`;
    if (d.type === "correlation_result") return `r = ${d.r} (${d.strength})`;
    if (d.type === "value_counts_result") return `${d.distinct} distinct`;
    if (d.type === "histogram_result") return `${(d.bins || []).length} bins`;
    if (d.type === "pivot_result") {
      const shape = d.shape || [];
      const saved = d.saved_as ? ` → ${d.saved_as.name}` : "";
      return `${shape[0] || 0}×${shape[1] || 0}${saved}`;
    }
    if (d.type === "sheet_update") {
      if (d.applied !== undefined) return `${d.applied} cells`;
      if (d.added !== undefined && d.row_count !== undefined) return `+${d.added} rows`;
      if (d.deleted !== undefined && d.row_count !== undefined) return `−${d.deleted} rows`;
      if (d.column_count !== undefined && d.added !== undefined) return `+${d.added} cols`;
      if (d.column_count !== undefined && d.deleted !== undefined) return `−${d.deleted} cols`;
      if (d.sorted_by) return `by ${d.sorted_by} ${d.order || ""}`;
      return "updated";
    }
    if (d.type === "sheet_view") return `${d.row_count} rows`;
    if (d.type === "filter_result") return `${d.match_count} matches`;
    if (d.type === "workbook_list") return `${(d.workbooks || []).length} workbooks`;
    if (d.type === "workbook_peek") return `${d.row_count} rows`;
    if (d.type === "workbook_create") return `→ ${d.name}`;
    if (d.type === "workbook_join_result")
      return `${d.row_count} rows → ${d.saved_as?.name || ""}`;
    if (d.type === "workbook_concat_result")
      return `${d.row_count} rows → ${d.saved_as?.name || ""}`;
    return "done";
  })();

  return (
    <div
      style={{
        border: `1px solid ${C_LINE}`,
        borderRadius: 8,
        background: C_BG,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          border: 0,
          background: "transparent",
          padding: "6px 10px",
          fontFamily: "inherit",
          fontSize: 12,
          color: isError ? "#b91c1c" : C_INK2,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: running ? "#EAB308" : isError ? "#b91c1c" : "#1F8A5B",
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 500 }}>{label}{fileArg}</span>
        <span style={{ color: C_MUTED }}>· {summary}</span>
        <span style={{ flex: 1 }} />
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "none", color: C_MUTED }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            borderTop: `1px solid ${C_LINE_SOFT}`,
            padding: "8px 10px",
            background: "#FBFCFD",
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            fontSize: 11,
            color: C_INK2,
            overflowX: "auto",
          }}
        >
          {Object.keys(tc.args || {}).length > 0 && (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(tc.args, null, 2)}
            </pre>
          )}
          {tc.data && (
            <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
              → {JSON.stringify(tc.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}


// Match an active "@query" right before the cursor. Returns {start, query}
// or null when there's no in-progress mention.
function detectMentionQuery(text, caret) {
  // Walk backwards from the cursor until a whitespace or @.
  let i = caret - 1;
  while (i >= 0 && !/\s/.test(text[i]) && text[i] !== "@") {
    i -= 1;
  }
  if (i < 0 || text[i] !== "@") return null;
  // Must be preceded by start-of-string or whitespace
  if (i > 0 && !/\s/.test(text[i - 1])) return null;
  return { start: i, query: text.slice(i + 1, caret) };
}


// Pull a set of mentioned workbook names out of the final message text.
function extractMentions(text, workbooks) {
  const found = new Set();
  // Token-by-token: @ followed by non-whitespace
  const re = /@([^\s@]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const ref = m[1];
    // Try exact match, then case-insensitive
    const wb = workbooks.find((w) => w.name === ref) ||
               workbooks.find((w) => w.name.toLowerCase() === ref.toLowerCase());
    if (wb) found.add(wb.name);
  }
  return Array.from(found);
}


function Composer({ disabled, onSend, workbooks }) {
  const [value, setValue] = useState("");
  const [mentionState, setMentionState] = useState(null); // {start, query, selectedIdx}
  const textareaRef = useRef(null);
  const has = value.trim().length > 0;

  // Filter workbook list by the in-progress query
  const filteredBooks = (() => {
    if (!mentionState) return [];
    const q = (mentionState.query || "").toLowerCase();
    const list = (workbooks || []).filter((w) =>
      !q || w.name.toLowerCase().includes(q)
    );
    return list.slice(0, 8);
  })();

  // Recompute mention popup when value or caret changes. Preserve the
  // current selectedIdx when the query/start are unchanged — otherwise
  // keyup events from arrow navigation would reset selection to 0 right
  // after the keydown handler advanced it.
  const refreshMention = () => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const m = detectMentionQuery(value, caret);
    setMentionState((prev) => {
      if (!m) return null;
      if (prev && prev.start === m.start && prev.query === m.query) {
        return prev; // no change — keep selectedIdx
      }
      return { ...m, selectedIdx: 0 };
    });
  };

  useEffect(() => {
    // After value change, recompute
    refreshMention();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const insertMention = (wbName) => {
    if (!mentionState) return;
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, mentionState.start);
    const after = value.slice(caret);
    // Replace the @query with @name + space
    const insertion = `@${wbName} `;
    const next = before + insertion + after;
    setValue(next);
    setMentionState(null);
    // Move caret to just after the inserted mention
    const newCaret = (before + insertion).length;
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(newCaret, newCaret);
      }
    });
  };

  const submit = () => {
    if (!has || disabled) return;
    const mentions = extractMentions(value, workbooks || []);
    onSend(value, mentions);
    setValue("");
    setMentionState(null);
  };

  const onKeyDown = (e) => {
    if (mentionState && filteredBooks.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionState((s) => ({
          ...s,
          selectedIdx: (s.selectedIdx + 1) % filteredBooks.length,
        }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionState((s) => ({
          ...s,
          selectedIdx:
            (s.selectedIdx - 1 + filteredBooks.length) % filteredBooks.length,
        }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = filteredBooks[mentionState.selectedIdx] || filteredBooks[0];
        if (pick) insertMention(pick.name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionState(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer" style={{ padding: "8px 16px 18px", position: "relative" }}>
      <div
        style={{
          background: C_BG,
          border: `1px solid ${C_LINE}`,
          borderRadius: 18,
          padding: "12px 14px 10px",
          boxShadow: "0 1px 0 rgba(15,23,42,.02), 0 18px 40px -28px rgba(15,23,42,.18)",
          transition: `border-color .15s ${C_EASE}, box-shadow .15s ${C_EASE}`,
          opacity: disabled ? 0.85 : 1,
          position: "relative",
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onKeyUp={refreshMention}
          onClick={refreshMention}
          disabled={disabled}
          placeholder="Ask anything about your workbooks…  (type @ to tag a file)"
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
        {mentionState && filteredBooks.length > 0 && (
          <MentionPopup
            books={filteredBooks}
            selectedIdx={mentionState.selectedIdx}
            onPick={insertMention}
          />
        )}
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
          <div style={{ flex: 1, fontSize: 11, color: C_MUTED }}>
            {disabled ? "Working…" : "Press Enter to send · @ to tag a file"}
          </div>
          <button
            type="button"
            onClick={submit}
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
    </div>
  );
}


function MentionPopup({ books, selectedIdx, onPick }) {
  return (
    <div
      role="listbox"
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        bottom: "calc(100% + 6px)",
        background: C_BG,
        border: `1px solid ${C_LINE}`,
        borderRadius: 10,
        boxShadow: "0 -8px 24px -8px rgba(15,23,42,.18)",
        overflow: "hidden",
        zIndex: 30,
      }}
    >
      <div
        style={{
          padding: "6px 10px",
          fontSize: 10,
          color: C_MUTED,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 500,
          borderBottom: `1px solid ${C_LINE_SOFT}`,
        }}
      >
        Tag a workbook · ↑↓ to choose · Enter to insert
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {books.map((w, i) => {
          const active = i === selectedIdx;
          return (
            <div
              key={w.id}
              role="option"
              aria-selected={active}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(w.name);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                cursor: "pointer",
                background: active ? C_SURFACE2 : "transparent",
              }}
            >
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 9.5,
                  color: C_MUTED2,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "1px 4px",
                  border: `1px solid ${C_LINE}`,
                  borderRadius: 3,
                  background: "#fff",
                }}
              >
                {w.type}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 12.5,
                  color: C_INK,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {w.name}
              </span>
              {w.path && w.path !== w.name && (
                <span
                  style={{
                    fontSize: 10.5,
                    color: C_MUTED,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 140,
                  }}
                  title={w.path}
                >
                  {w.path.replace(`/${w.name}`, "")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// Skeleton lines + soft caption while the chat history is loading.
function ChatLoadingState() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "24px 18px",
      }}
    >
      <SkeletonLine width="58%" />
      <SkeletonLine width="42%" align="right" />
      <SkeletonLine width="72%" />
      <SkeletonLine width="36%" align="right" />
      <SkeletonLine width="50%" />
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 11.5,
          color: C_MUTED,
          letterSpacing: "0.02em",
        }}
      >
        <PulseDots />
        <span>Loading your conversation</span>
      </div>
    </div>
  );
}


function SkeletonLine({ width = "60%", align = "left" }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      }}
    >
      <div
        className="agent-skel-line"
        style={{
          width,
          height: 12,
          borderRadius: 6,
          background:
            "linear-gradient(90deg, #EEF1F6 0%, #F8FAFD 50%, #EEF1F6 100%)",
          backgroundSize: "200% 100%",
          animation: "agent-skel 1.4s ease-in-out infinite",
        }}
      />
    </div>
  );
}


function PulseDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      <span style={dotStyle(0)} />
      <span style={dotStyle(160)} />
      <span style={dotStyle(320)} />
      <style>{`
        @keyframes agent-skel {
          0%   { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes agent-dot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40%           { opacity: 1;    transform: translateY(-2px); }
        }
      `}</style>
    </span>
  );
}


function dotStyle(delayMs) {
  return {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: C_MUTED,
    display: "inline-block",
    animation: `agent-dot 1.1s ease-in-out ${delayMs}ms infinite`,
  };
}


function chipButtonStyle(disabled) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 30,
    padding: "0 12px",
    fontSize: 12.5,
    fontFamily: "inherit",
    fontWeight: 500,
    color: C_INK2,
    background: C_BG,
    border: `1px solid ${C_LINE}`,
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: `background .12s cubic-bezier(.22,.61,.36,1), color .12s`,
  };
}


function iconChipStyle(disabled) {
  return {
    position: "relative",
    display: "inline-grid",
    placeItems: "center",
    width: 30,
    height: 30,
    color: C_INK2,
    background: C_BG,
    border: `1px solid ${C_LINE}`,
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: `background .12s cubic-bezier(.22,.61,.36,1)`,
  };
}


function relTime(iso) {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}


function HistoryDropdown({ threads, activeId, onPick, onDelete, onClose }) {
  if (!threads || threads.length === 0) {
    return (
      <div style={historyPanelStyle()}>
        <div style={{ padding: "10px 12px", fontSize: 12, color: C_MUTED }}>
          No past chats yet.
        </div>
      </div>
    );
  }
  return (
    <div style={historyPanelStyle()} role="menu">
      <div
        style={{
          padding: "8px 10px",
          fontSize: 10,
          color: C_MUTED,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 500,
          borderBottom: `1px solid ${C_LINE_SOFT}`,
        }}
      >
        Past chats
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        {threads.map((t) => {
          const active = t.id === activeId;
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
                padding: "8px 10px",
                borderBottom: `1px solid ${C_LINE_SOFT}`,
                background: active ? C_SURFACE2 : "transparent",
                cursor: active ? "default" : "pointer",
              }}
              onClick={() => {
                if (!active) onPick(t.id);
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: C_INK,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={t.title}
                >
                  {t.title || "Untitled chat"}
                </div>
                <div style={{ fontSize: 10.5, color: C_MUTED, marginTop: 2 }}>
                  {t.message_count} message{t.message_count === 1 ? "" : "s"} · {relTime(t.updated_at)}
                  {active ? " · active" : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    window.confirm(
                      `Delete this chat? "${t.title || "Untitled chat"}"`
                    )
                  ) {
                    onDelete(t.id);
                  }
                }}
                title="Delete this chat"
                style={{
                  width: 22,
                  height: 22,
                  border: 0,
                  background: "transparent",
                  color: C_MUTED,
                  cursor: "pointer",
                  borderRadius: 4,
                  flexShrink: 0,
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function historyPanelStyle() {
  return {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    minWidth: 280,
    background: C_BG,
    border: `1px solid ${C_LINE}`,
    borderRadius: 10,
    boxShadow: "0 12px 32px -8px rgba(15,23,42,.18)",
    zIndex: 30,
    overflow: "hidden",
  };
}
