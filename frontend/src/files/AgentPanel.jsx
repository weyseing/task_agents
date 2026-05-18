import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "../api";
import "../components/ChatMessages.css";
import ScrollBottomButton from "../components/ScrollBottomButton";
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
  onWorkbookDeleted,
  onWorkspaceChanged,
  onOpenFile,
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
        onWorkbookDeleted={onWorkbookDeleted}
        onWorkspaceChanged={onWorkspaceChanged}
        onOpenFile={onOpenFile}
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
  workbook_delete: "delete file",
  workbook_list_sheets: "list sheets",
  folder_create: "create folder",
  move_item: "move",
  sheet_set_formula: "set formula",
  sheet_add_formula_column: "add formula column",
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


// Same windowing trick the main chat uses: cap rendered messages so long
// threads don't choke on Markdown + tool-pill rerenders during streaming.
const MESSAGE_WINDOW = 30;

function ExcelChat({ file, fileTree, onWorkbookMutated, onWorkbookDeleted, onWorkspaceChanged, onOpenFile }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [convId, setConvId] = useState(null);
  // History: all threads for this workspace, newest first
  const [threads, setThreads] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const scrollRef = useRef(null);
  const historyRef = useRef(null);
  // Anchors the scroll position before older messages mount so the
  // viewport doesn't jump.
  const scrollAnchorRef = useRef(null);

  // Reset the visible window whenever we switch threads.
  useEffect(() => {
    setShowAllMessages(false);
  }, [convId]);

  // Auto-expand the message window when the user scrolls near the top.
  const hiddenMessages = Math.max(0, messages.length - MESSAGE_WINDOW);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || showAllMessages || hiddenMessages === 0) return;
    const onScroll = () => {
      if (el.scrollTop < 80) {
        scrollAnchorRef.current = {
          prevScrollHeight: el.scrollHeight,
          prevScrollTop: el.scrollTop,
        };
        setShowAllMessages(true);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [showAllMessages, hiddenMessages]);

  // Preserve visual anchor when older messages mount in.
  useLayoutEffect(() => {
    if (!showAllMessages || !scrollAnchorRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const { prevScrollHeight, prevScrollTop } = scrollAnchorRef.current;
    el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
    scrollAnchorRef.current = null;
  }, [showAllMessages]);

  // Derive workbooks once per tree change. `workbookList` powers @-mentions
  // in the composer; `workbookNamesForLinkify` powers the chat-reply file
  // links. Sorted longest-first so "orders_with_price.xlsx" matches before
  // "orders.xlsx".
  const workbookList = useMemo(() => collectWorkbooks(fileTree), [fileTree]);
  const workbookNamesForLinkify = useMemo(
    () => [...workbookList.map((w) => w.name)].sort((a, b) => b.length - a.length),
    [workbookList],
  );

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

  const [threadsHasMore, setThreadsHasMore] = useState(false);
  const [threadsNextBefore, setThreadsNextBefore] = useState(null);
  const [threadsLoadingMore, setThreadsLoadingMore] = useState(false);

  const loadThreadsList = async () => {
    try {
      const r = await apiFetch(`/api/workspace/excel/conversations?limit=50`);
      if (r.ok) {
        const data = await r.json();
        // Tolerate the legacy plain-array response so an older deployed
        // backend doesn't break a newer frontend (or vice versa).
        const items = Array.isArray(data) ? data : data.items || [];
        setThreads(items);
        setThreadsHasMore(!!(data && data.has_more));
        setThreadsNextBefore((data && data.next_before) || null);
      }
    } catch {
      // non-fatal
    }
  };

  const loadOlderThreads = async () => {
    if (!threadsHasMore || !threadsNextBefore || threadsLoadingMore) return;
    setThreadsLoadingMore(true);
    try {
      const r = await apiFetch(
        `/api/workspace/excel/conversations?limit=50&before=${encodeURIComponent(threadsNextBefore)}`,
      );
      if (r.ok) {
        const data = await r.json();
        const items = data.items || [];
        setThreads((prev) => [...prev, ...items]);
        setThreadsHasMore(!!data.has_more);
        setThreadsNextBefore(data.next_before || null);
      }
    } catch {
      /* non-fatal */
    } finally {
      setThreadsLoadingMore(false);
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

  // Load both the active thread and the history list on mount. If the URL
  // already pins a specific chat via ?chat=<id>, load that thread instead
  // of the most-recent one (so shareable links resolve to the right chat).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pinned = params.get("chat");
    if (pinned) {
      // Lightweight — same flow as switchToThread minus the streaming guard
      // and dropdown close (we're on mount, neither applies).
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const r = await apiFetch(`/api/workspace/excel/conversations/${pinned}`);
          if (!r.ok) throw new Error(`Failed to load shared chat (${r.status})`);
          const data = await r.json();
          setConvId(data.conversation_id);
          loadConversationMessages(data);
        } catch (e) {
          // Fall back to the most-recent so the panel isn't broken on a
          // bad/stale link.
          setError(`${e.message} — loading latest chat instead.`);
          loadActiveConversation();
        } finally {
          setLoading(false);
        }
      })();
    } else {
      loadActiveConversation();
    }
    loadThreadsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL's ?chat=<id> in sync with the active conversation so the
  // address bar is always copy-pastable.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (convId) {
      if (url.searchParams.get("chat") === convId) return;
      url.searchParams.set("chat", convId);
    } else {
      if (!url.searchParams.has("chat")) return;
      url.searchParams.delete("chat");
    }
    window.history.replaceState(window.history.state, "", url.toString());
  }, [convId]);

  const [copiedLink, setCopiedLink] = useState(false);
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1400);
    } catch {
      // Fallback for browsers without async clipboard (rare on https).
      const ta = document.createElement("textarea");
      ta.value = window.location.href;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1400);
    }
  };

  // Pattern matches the general chat: the only scroll the panel ever
  // triggers is a ONE-TIME jump to the user's just-sent message right
  // after submit (so they see what they just typed land at the top of
  // the viewport). After that we don't touch scroll — the user is free
  // to read, scroll up to history, etc. The floating "scroll to latest"
  // button is still there for when they want to jump back.
  const lastUserMsgRef = useRef(null);

  const sendMessage = async (text, mentions) => {
    const content = text?.trim();
    if (!content || streaming) return;
    setStreaming(true);
    setError(null);

    const userMsg = { role: "user", content };
    // Chronological segments: each entry is either {type:'text', text} or
    // {type:'tool', tc}. Renders inline in the order events arrived.
    let pending = {
      role: "assistant",
      segments: [],
      isThinking: true,
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, pending]);
    // Scroll the just-submitted user message to the top of the viewport
    // exactly once — same UX as the general chat. We use a microtask via
    // requestAnimationFrame so the DOM has rendered the new node.
    requestAnimationFrame(() => {
      const node = lastUserMsgRef.current;
      if (node && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });

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
      // Debounce the tree refresh: a single agent turn can spit out several
      // file_created events in quick succession; coalesce into one fetch.
      let treeRefreshTimer = null;
      const scheduleTreeRefresh = () => {
        if (!onWorkspaceChanged) return;
        if (treeRefreshTimer) return;
        treeRefreshTimer = setTimeout(() => {
          treeRefreshTimer = null;
          try {
            onWorkspaceChanged();
          } catch {
            /* non-fatal */
          }
        }, 150);
      };

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
            // Append to the trailing text segment, or start a new one if the
            // previous segment was a tool. Immutable update so React sees
            // the change.
            const segs = pending.segments;
            const last = segs[segs.length - 1];
            if (last && last.type === "text") {
              pending.segments = [
                ...segs.slice(0, -1),
                { type: "text", text: last.text + ev.content },
              ];
            } else {
              pending.segments = [...segs, { type: "text", text: ev.content }];
            }
            pending.isThinking = false;
            flush();
          }
          if (ev.tool_call) {
            pending.isThinking = false;
            pending.segments = [
              ...pending.segments,
              { type: "tool", tc: { ...ev.tool_call, status: "running" } },
            ];
            flush();
          }
          if (ev.tool_result) {
            pending.segments = pending.segments.map((s) =>
              s.type === "tool" && s.tc.id === ev.tool_result.id
                ? { ...s, tc: { ...s.tc, status: "done", data: ev.tool_result.data } }
                : s
            );
            flush();
          }
          if (ev.file_mutated) {
            // Reload any open tab that matches — keeps editors in sync as
            // the agent mutates workbooks mid-stream.
            if (onWorkbookMutated) {
              try {
                onWorkbookMutated([ev.file_mutated]);
              } catch {
                /* non-fatal */
              }
            }
          }
          if (ev.file_created) {
            // Refresh the file tree so the new workbook appears in the
            // sidebar immediately. Debounced so a burst of creations is
            // one fetch.
            scheduleTreeRefresh();
          }
          if (ev.file_deleted) {
            // Close any open tab for the deleted file, then refresh the
            // tree. Debounced same as creations.
            if (onWorkbookDeleted) {
              try {
                onWorkbookDeleted([ev.file_deleted.id]);
              } catch {
                /* non-fatal */
              }
            }
            scheduleTreeRefresh();
          }
          if (ev.done) {
            pending.isThinking = false;
            pending.streaming = false;
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
        <button
          type="button"
          onClick={copyShareLink}
          disabled={!convId || streaming}
          title={
            !convId
              ? "Start a chat first"
              : copiedLink
              ? "Copied!"
              : "Copy a link to this chat"
          }
          style={iconChipStyle(!convId || streaming)}
          className="agent-chip"
          aria-label="Copy share link"
        >
          {copiedLink ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
              <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
            </svg>
          )}
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
              hasMore={threadsHasMore}
              loadingMore={threadsLoadingMore}
              onLoadMore={loadOlderThreads}
            />
          )}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
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
          (() => {
            const hidden = hiddenMessages;
            const start = showAllMessages ? 0 : hidden;
            const visible = messages.slice(start);
            return (
              <>
                {hidden > 0 && !showAllMessages && (
                  <button
                    type="button"
                    className="chat-show-older"
                    onClick={() => {
                      const el = scrollRef.current;
                      if (el) {
                        scrollAnchorRef.current = {
                          prevScrollHeight: el.scrollHeight,
                          prevScrollTop: el.scrollTop,
                        };
                      }
                      setShowAllMessages(true);
                    }}
                  >
                    Show {hidden} earlier message{hidden === 1 ? "" : "s"}
                  </button>
                )}
                {(() => {
                  // Find the LAST user message in the visible slice — only
                  // that one gets the ref attached, since it's the one
                  // sendMessage just submitted and wants to scroll to.
                  let lastUserIdx = -1;
                  for (let j = visible.length - 1; j >= 0; j -= 1) {
                    if (visible[j].role === "user") { lastUserIdx = j; break; }
                  }
                  return visible.map((m, i) => (
                    <Message
                      key={start + i}
                      msg={m}
                      workbookNames={workbookNamesForLinkify}
                      onOpenFile={onOpenFile}
                      lastUserRef={i === lastUserIdx ? lastUserMsgRef : undefined}
                    />
                  ));
                })()}
              </>
            );
          })()
        )}
        {error && (
          <div style={{ fontSize: 12, color: "#b91c1c", padding: "8px 0" }}>
            {error}
          </div>
        )}
      </div>
        <ScrollBottomButton targetRef={scrollRef} dep={messages.length} />
      </div>
      <Composer
        disabled={streaming}
        onSend={sendMessage}
        workbooks={workbookList}
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


// remark plugin: rewrite plain-text occurrences of known file names into
// `lumen-file:<name>` links. Skips inline code and fenced code blocks so we
// don't mangle backticked snippets the agent prints.
function remarkLinkifyFiles({ names } = {}) {
  if (!names || names.length === 0) return () => {};
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Word-ish boundaries so we don't grab "orders.xlsx" inside something
  // like "orders.xlsxbackup". Filenames legitimately end in a dot+ext so
  // \b at the right edge would fail — use a manual lookbehind/lookahead.
  const re = new RegExp(
    `(?<![A-Za-z0-9_])(${escaped.join("|")})(?![A-Za-z0-9_])`,
    "g",
  );

  const splitTextNode = (text) => {
    const out = [];
    let last = 0;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
      out.push({
        type: "link",
        url: `lumen-file:${m[1]}`,
        children: [{ type: "text", value: m[1] }],
      });
      last = m.index + m[1].length;
    }
    if (last === 0) return null; // no match
    if (last < text.length) out.push({ type: "text", value: text.slice(last) });
    return out;
  };

  const visit = (node) => {
    if (!node || !node.children) return;
    const next = [];
    for (const child of node.children) {
      if (child.type === "text") {
        const replaced = splitTextNode(child.value);
        if (replaced) next.push(...replaced);
        else next.push(child);
      } else if (child.type === "inlineCode" || child.type === "code") {
        next.push(child); // never touch code
      } else if (
        child.type === "link" &&
        typeof child.url === "string" &&
        child.url.startsWith("lumen-file:")
      ) {
        next.push(child); // avoid double-walking links we just created
      } else {
        visit(child);
        next.push(child);
      }
    }
    node.children = next;
  };

  return (tree) => visit(tree);
}


function Message({ msg, workbookNames, onOpenFile, lastUserRef }) {
  if (msg.role === "user") {
    return (
      <div
        ref={lastUserRef}
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}
      >
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

  // Render order: chronological segments if present (new streams), else
  // legacy shape (historical messages from DB: all tools, then content).
  const segments = buildSegments(msg);
  const showThinking = msg.isThinking && segments.length === 0;
  // Working pill: agent is still streaming and we already have something to
  // show. Sits at the bottom so the user knows more is coming.
  const showWorking = msg.streaming && !msg.isThinking && segments.length > 0;
  // Surface what the agent is currently doing in the pill: name the most
  // recent running tool, else fall back to a generic label.
  const runningTool = (() => {
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const s = segments[i];
      if (s.type === "tool" && s.tc?.status === "running") return s.tc;
    }
    return null;
  })();

  const remarkPlugins = useMemo(
    () =>
      workbookNames && workbookNames.length > 0
        ? [remarkGfm, [remarkLinkifyFiles, { names: workbookNames }]]
        : [remarkGfm],
    [workbookNames],
  );

  const mdComponents = useMemo(
    () => ({
      a({ href, children, ...rest }) {
        if (typeof href === "string" && href.startsWith("lumen-file:")) {
          const name = decodeURIComponent(href.slice("lumen-file:".length));
          return (
            <button
              type="button"
              className="chat-file-link"
              onClick={(e) => {
                e.preventDefault();
                onOpenFile && onOpenFile(name);
              }}
              title={`Open ${name}`}
            >
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
          </a>
        );
      },
      // Wrap markdown tables in a horizontally-scrollable container — same
      // treatment as the general chat — so wide outputs (joined workbooks,
      // pivot dumps) don't push the panel sideways on mobile.
      table({ children }) {
        return (
          <div className="reply-table-scroll">
            <table>{children}</table>
          </div>
        );
      },
    }),
    [onOpenFile],
  );

  // Layout: prose flows left-aligned with no permanent avatar column.
  // The Lumen mark + "Lumen" name + typing bubble all live INSIDE the
  // loading indicator, so they appear together while the turn is in
  // progress and all vanish once the reply is done.
  return (
    <div style={{ marginBottom: 14 }}>
      {segments.map((seg, i) => {
        if (seg.type === "tool") {
          return (
            <div key={seg.tc.id || `t-${i}`} style={{ margin: "6px 0" }}>
              <SheetToolPill tc={seg.tc} />
            </div>
          );
        }
        return (
          <div
            key={`x-${i}`}
            className="reply"
            style={{ fontSize: 13.5, lineHeight: 1.55, color: C_INK, margin: "6px 0" }}
          >
            <Markdown
              remarkPlugins={remarkPlugins}
              urlTransform={(url) =>
                typeof url === "string" && url.startsWith("lumen-file:") ? url : url
              }
              components={mdComponents}
            >
              {seg.text}
            </Markdown>
          </div>
        );
      })}
      {showThinking && <PendingBubble />}
      {showWorking && <WorkingBubble />}
    </div>
  );
}


function buildSegments(msg) {
  if (Array.isArray(msg.segments)) return msg.segments;
  // Historical-message fallback: the DB doesn't preserve event ordering,
  // so we surface tools first (in insertion order), then the final text.
  const out = [];
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) out.push({ type: "tool", tc });
  }
  if (msg.content) out.push({ type: "text", text: msg.content });
  return out;
}


// Loading state for the files-chat agent reply. Option 3: iMessage-style
// three-dot typing bubble, paired with the breathing Lumen mark + the
// "Lumen" name. All three appear together while the turn is in progress
// and all vanish once the reply is done.
function WorkingBubble() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: 10,
        marginTop: 6,
      }}
    >
      <AgentLogo animated size={28} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="assistant-name" style={{ marginBottom: 0 }}>Lumen</div>
        <div className="typing-bubble" aria-label="Lumen is thinking">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}


// Same visual treatment as WorkingBubble so the chat's progress states
// all read as one family: spinner + soft pill + shimmering label.
function PendingBubble() {
  return <WorkingBubble runningTool={null} />;
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
    if (d.type === "workbook_delete_result") {
      const n = d.deleted_count ?? (d.deleted || []).length;
      const skipped = (d.skipped || []).length;
      return `−${n} file${n === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped` : ""}`;
    }
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

  // Auto-grow the textarea on newlines up to MAX_COMPOSER_PX, then scroll
  // inside. Mirrors the main chat composer in components/ChatInput.jsx.
  const MAX_COMPOSER_PX = 180;
  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_PX)}px`;
  };

  useEffect(() => {
    // After value change, recompute mention popup AND resize the textarea.
    refreshMention();
    autosize();
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
            maxHeight: MAX_COMPOSER_PX,
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


function HistoryDropdown({ threads, activeId, onPick, onDelete, onClose, hasMore, loadingMore, onLoadMore }) {
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
        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            style={{
              width: "100%",
              border: 0,
              borderTop: `1px solid ${C_LINE_SOFT}`,
              background: "transparent",
              padding: "10px 12px",
              fontSize: 12,
              color: C_MUTED,
              cursor: loadingMore ? "default" : "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => {
              if (!loadingMore) e.currentTarget.style.background = C_SURFACE2;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {loadingMore ? "Loading…" : "Load older chats"}
          </button>
        )}
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
