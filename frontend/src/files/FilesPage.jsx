import { useEffect, useMemo, useRef, useState } from "react";
import FilesSidebar from "./FilesSidebar";
import FilesTopBar from "./FilesTopBar";
import TabStrip from "./TabStrip";
import EditorFrame from "./EditorFrame";
import AgentPanel from "./AgentPanel";
import ConfirmDialog from "./ConfirmDialog";
import {
  loadTree,
  loadContent,
  saveContent,
  deleteFile,
  fsFind,
} from "./fsData";
import { C_BG, C_INK, C_PAGE } from "./tokens";
import "./FilesPage.css";

const EMPTY_TREE = { id: "root", name: "My Files", kind: "folder", children: [] };

// Agent-panel width clamps — narrow enough to tuck, wide enough for real replies.
const AGENT_MIN = 300;
const AGENT_MAX = 620;
const AGENT_DEFAULT = 360;
const AGENT_WIDTH_KEY = "lumen.agentWidth";
const SIDEBAR_COLLAPSED_KEY = "lumen.sidebarCollapsed";

// `/files/<file-id>` — match the pattern used in App.jsx
const FILE_URL_RE = /^\/files\/([a-f0-9-]+)\/?$/i;
const fileIdFromUrl = () => {
  const m = window.location.pathname.match(FILE_URL_RE);
  return m ? m[1] : null;
};
const syncUrl = (fileId) => {
  const target = fileId ? `/files/${fileId}` : "/files";
  if (window.location.pathname !== target) {
    window.history.replaceState({ files: true, fileId }, "", target);
  }
};

export default function FilesPage({ user, onNavChat, onLogout }) {
  const [fs, setFs] = useState(EMPTY_TREE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [confirm, setConfirm] = useState(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [mobileAgent, setMobileAgent] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const [agentWidth, setAgentWidth] = useState(() => {
    const stored = parseInt(
      typeof localStorage !== "undefined" ? localStorage.getItem(AGENT_WIDTH_KEY) || "" : "",
      10,
    );
    return Number.isFinite(stored)
      ? Math.max(AGENT_MIN, Math.min(AGENT_MAX, stored))
      : AGENT_DEFAULT;
  });
  const [resizing, setResizing] = useState(false);

  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = agentWidth;
    setResizing(true);
    const onMove = (ev) => {
      // Dragging LEFT widens — delta is negated.
      const next = Math.max(
        AGENT_MIN,
        Math.min(AGENT_MAX, startW - (ev.clientX - startX)),
      );
      setAgentWidth(next);
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    localStorage.setItem(AGENT_WIDTH_KEY, String(agentWidth));
  }, [agentWidth]);

  // Capture the URL's file ID at component init, BEFORE any effect runs.
  // The syncUrl effect would otherwise fire first (activeId=null) and wipe
  // the URL before the tree-load effect gets to read it.
  const initialUrlFileId = useRef(fileIdFromUrl());

  const activeTab = tabs.find((t) => t.id === activeId) || null;

  const dirty = useMemo(() => {
    const s = new Set();
    tabs.forEach((t) => {
      if (JSON.stringify(t.content) !== JSON.stringify(t.savedContent)) s.add(t.id);
    });
    return s;
  }, [tabs]);

  // Initial tree load. Open the file from the URL if present; otherwise
  // open the first file in the tree (first-time visit).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tree = await loadTree();
        if (cancelled) return;
        setFs(tree);
        // Expand all folders on first load so the user sees their files.
        const allFolderIds = new Set();
        const collect = (n) => {
          if (n.kind === "folder" && n.id !== "root") allFolderIds.add(n.id);
          (n.children || []).forEach(collect);
        };
        collect(tree);
        setExpanded(allFolderIds);

        const urlId = initialUrlFileId.current;
        const urlNode = urlId ? fsFind(tree, urlId) : null;
        if (urlNode && urlNode.kind === "file") {
          await openFile(urlNode);
        }
        // No URL file ID (or it's stale) — leave the editor empty; the user
        // picks what to open.
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with the active tab.
  useEffect(() => {
    syncUrl(activeId);
  }, [activeId]);

  // Browser back/forward landed us on a different /files/<id> — react.
  useEffect(() => {
    const onPop = () => {
      const urlId = fileIdFromUrl();
      if (urlId && urlId !== activeId) {
        const node = fsFind(fs, urlId);
        if (node) openFile(node);
      } else if (!urlId && activeId) {
        setActiveId(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, fs]);

  async function openFile(node) {
    if (!node || node.kind !== "file") return;
    if (tabs.some((t) => t.id === node.id)) {
      setActiveId(node.id);
      return;
    }
    let content = "";
    try {
      content = await loadContent(node.id);
    } catch (e) {
      setError(`Failed to load ${node.name}: ${e.message}`);
      return;
    }
    setTabs((prev) => [
      ...prev,
      {
        id: node.id,
        name: node.name,
        type: node.type,
        content,
        savedContent: content,
      },
    ]);
    setActiveId(node.id);
  }

  const handleOpen = (id) => {
    const node = fsFind(fs, id);
    if (node) openFile(node);
  };

  const handleClose = (id) => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeId === id) {
      setActiveId(next.length ? next[Math.min(idx, next.length - 1)].id : null);
    }
  };

  const handleChange = (content) => {
    if (!activeTab) return;
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTab.id ? { ...t, content } : t))
    );
  };

  const handleSave = async () => {
    if (!activeTab || !dirty.has(activeTab.id)) return;
    const id = activeTab.id;
    const content = activeTab.content;
    try {
      await saveContent(id, content);
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, savedContent: content } : t))
      );
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const handleDelete = (id, name) => setConfirm({ id, name });

  const performDelete = async () => {
    if (!confirm) return;
    const id = confirm.id;
    try {
      await deleteFile(id);
      setTabs((prev) => prev.filter((t) => t.id !== id));
      if (activeId === id) setActiveId(null);
      // Refetch tree to reflect deletion (handles folder cascades).
      const tree = await loadTree();
      setFs(tree);
    } catch (e) {
      setError(`Delete failed: ${e.message}`);
    }
    setConfirm(null);
  };

  const handleToggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenAndCloseDrawer = (id) => {
    handleOpen(id);
    setMobileSidebar(false);
  };

  return (
    <div
      className="files-page-grid"
      style={{
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: `${sidebarCollapsed ? 60 : 268}px 1fr ${agentWidth}px`,
        background: C_PAGE,
        color: C_INK,
        fontFamily: '"Sora", system-ui',
        position: "relative",
        cursor: resizing ? "col-resize" : "auto",
        userSelect: resizing ? "none" : "auto",
      }}
    >
      <FilesSidebar
        root={fs}
        activeId={activeId}
        expanded={expanded}
        collapsed={sidebarCollapsed}
        user={user}
        mobileOpen={mobileSidebar}
        onMobileClose={() => setMobileSidebar(false)}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onToggle={handleToggle}
        onOpen={handleOpenAndCloseDrawer}
        onDelete={handleDelete}
        onNavChat={onNavChat}
        onLogout={onLogout}
      />
      <div
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: C_BG,
        }}
      >
        <FilesTopBar
          file={activeTab}
          dirty={activeTab ? dirty.has(activeTab.id) : false}
          onSave={handleSave}
          onDiscuss={onNavChat}
          onMobileMenu={() => setMobileSidebar(true)}
          onMobileAgent={() => setMobileAgent(true)}
        />
        {tabs.length > 0 && (
          <TabStrip
            tabs={tabs}
            activeId={activeId}
            dirty={dirty}
            onActivate={setActiveId}
            onClose={handleClose}
          />
        )}
        {loading ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#9aa3b2" }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#b91c1c", padding: 24, textAlign: "center" }}>
            {error}
          </div>
        ) : !activeTab && (fs.children || []).length === 0 ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#9aa3b2" }}>
            No files yet.
          </div>
        ) : (
          <EditorFrame
            file={activeTab}
            onChange={handleChange}
            dirty={activeTab ? dirty.has(activeTab.id) : false}
          />
        )}
      </div>
      <AgentPanel
        file={activeTab}
        width={agentWidth}
        onResizeStart={startResize}
        mobileOpen={mobileAgent}
        onMobileClose={() => setMobileAgent(false)}
        onOpenFullChat={onNavChat}
      />

      {(mobileSidebar || mobileAgent) && (
        <div
          className="files-backdrop"
          onClick={() => {
            setMobileSidebar(false);
            setMobileAgent(false);
          }}
          aria-hidden="true"
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title="Delete file"
        body={
          confirm ? (
            <>
              Permanently delete{" "}
              <strong style={{ color: C_INK, fontWeight: 600 }}>{confirm.name}</strong>? This action
              cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        onConfirm={performDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
