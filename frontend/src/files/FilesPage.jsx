import { useEffect, useMemo, useRef, useState } from "react";
import FilesSidebar from "./FilesSidebar";
import FilesTopBar from "./FilesTopBar";
import TabStrip from "./TabStrip";
import EditorFrame from "./EditorFrame";
import AgentPanel from "./AgentPanel";
import ConfirmDialog from "./ConfirmDialog";
import QuickOpen from "./QuickOpen";
import {
  loadTree,
  loadContent,
  saveContent,
  deleteFile,
  fsFind,
  uploadFiles,
  createFile,
} from "./fsData";
import { C_BG, C_INK, C_PAGE } from "./tokens";
import "./FilesPage.css";

const EMPTY_TREE = { id: "root", name: "My Files", kind: "folder", children: [] };

// Agent-panel width clamps — narrow enough to tuck, wide enough for real replies.
const AGENT_MIN = 300;
const AGENT_MAX = 620;
const AGENT_DEFAULT = 360;
const AGENT_WIDTH_KEY = "lumen.agentWidth";
// File-tree sidebar clamps — keep the tree readable but don't let it dominate.
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 268;
const SIDEBAR_WIDTH_KEY = "lumen.sidebarWidth";
const SIDEBAR_COLLAPSED_KEY = "lumen.sidebarCollapsed";

// `/files/<file-id>` — match the pattern used in App.jsx
const FILE_URL_RE = /^\/files\/([a-f0-9-]+)\/?$/i;
const fileIdFromUrl = () => {
  const m = window.location.pathname.match(FILE_URL_RE);
  return m ? m[1] : null;
};
const syncUrl = (fileId) => {
  const target = fileId ? `/files/${fileId}` : "/files";
  // Preserve the existing query string (?chat=<id>) so the AgentPanel can
  // own that key without us clobbering it.
  const search = window.location.search || "";
  const fullTarget = target + search;
  if (window.location.pathname !== target) {
    window.history.replaceState({ files: true, fileId }, "", fullTarget);
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
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = parseInt(
      typeof localStorage !== "undefined" ? localStorage.getItem(SIDEBAR_WIDTH_KEY) || "" : "",
      10,
    );
    return Number.isFinite(stored)
      ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, stored))
      : SIDEBAR_DEFAULT;
  });
  const [resizing, setResizing] = useState(false);
  // Upload toast state: null = hidden; otherwise { phase: 'uploading'|'done', count, names }
  const [uploadStatus, setUploadStatus] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);

  // Generic edge-drag resize. `direction` decides which side widens: 'left'
  // grows when the mouse moves right (sidebar edge); 'right' grows when the
  // mouse moves left (agent-panel edge).
  const makeResizer = (getStart, setWidth, min, max, direction) => (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = getStart();
    setResizing(true);
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const signed = direction === "right" ? -delta : delta;
      setWidth(Math.max(min, Math.min(max, startW + signed)));
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startResize = makeResizer(
    () => agentWidth, setAgentWidth, AGENT_MIN, AGENT_MAX, "right",
  );
  const startSidebarResize = makeResizer(
    () => sidebarWidth, setSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX, "left",
  );

  useEffect(() => {
    localStorage.setItem(AGENT_WIDTH_KEY, String(agentWidth));
  }, [agentWidth]);
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

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
    // Optimistically add the tab in a loading state so the editor shows a
    // skeleton/spinner immediately instead of an empty pane while content
    // streams in from R2.
    setTabs((prev) => [
      ...prev,
      {
        id: node.id,
        name: node.name,
        type: node.type,
        content: null,
        savedContent: null,
        loading: true,
      },
    ]);
    setActiveId(node.id);
    let content = "";
    try {
      content = await loadContent(node.id);
    } catch (e) {
      // Remove the placeholder tab on failure.
      setTabs((prev) => prev.filter((t) => t.id !== node.id));
      setError(`Failed to load ${node.name}: ${e.message}`);
      return;
    }
    setTabs((prev) =>
      prev.map((t) =>
        t.id === node.id
          ? { ...t, content, savedContent: content, loading: false }
          : t
      )
    );
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
      // For sheet files, the backend recomputes formula cells on save —
      // pull the fresh content so computed values appear without a reload.
      const isSheet = activeTab.type === "csv" || activeTab.type === "xlsx";
      const hasFormulas =
        isSheet &&
        content &&
        typeof content === "object" &&
        content.formulas &&
        Object.keys(content.formulas).length > 0;
      let next = content;
      if (hasFormulas) {
        try {
          next = await loadContent(id);
        } catch {
          // Save succeeded; refetch failed — keep local content.
          next = content;
        }
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, content: next, savedContent: next } : t
        )
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
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "P")) {
        // VS Code-style quick open. Don't swallow Cmd+Shift+P (that's
        // command-palette territory) — only the plain Cmd/Ctrl+P.
        if (e.shiftKey) return;
        e.preventDefault();
        setQuickOpen(true);
      } else if (e.key === "Escape" && quickOpen) {
        setQuickOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Auto-save + refetch when a formula was just committed in the editor.
  // We accept the new content directly so we don't race React state batching.
  const handleCommitFormula = async (content) => {
    if (!activeTab) return;
    const id = activeTab.id;
    try {
      await saveContent(id, content);
      const fresh = await loadContent(id);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, content: fresh, savedContent: fresh } : t
        )
      );
    } catch (e) {
      setError(`Formula save failed: ${e.message}`);
    }
  };

  const handleDelete = (id, name, meta = {}) =>
    setConfirm({ id, name, ...meta });

  // Recursively count all file descendants of a folder so the confirm
  // dialog can tell the user what they're about to nuke.
  const countDescendants = (node) => {
    let files = 0;
    let folders = 0;
    for (const c of node?.children || []) {
      if (c.kind === "file") files += 1;
      else if (c.kind === "folder") {
        folders += 1;
        const sub = countDescendants(c);
        files += sub.files;
        folders += sub.folders;
      }
    }
    return { files, folders };
  };

  const performDelete = async () => {
    if (!confirm) return;
    const id = confirm.id;
    const wasFolder = confirm.kind === "folder";
    try {
      await deleteFile(id);
      // Close any open tabs that belonged to the deleted file/folder.
      if (wasFolder) {
        const folderNode = fsFind(fs, id);
        const descendantIds = new Set();
        const walk = (n) => {
          if (n?.kind === "file") descendantIds.add(n.id);
          (n?.children || []).forEach(walk);
        };
        walk(folderNode);
        setTabs((prev) => prev.filter((t) => !descendantIds.has(t.id)));
        if (descendantIds.has(activeId)) setActiveId(null);
      } else {
        setTabs((prev) => prev.filter((t) => t.id !== id));
        if (activeId === id) setActiveId(null);
      }
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

  // Resolve a file by its display name (case-insensitive) and open it.
  // Used by chat replies that mention a workbook by name, and by Cmd+P.
  const findByName = (root, name) => {
    if (!root) return null;
    const target = (name || "").toLowerCase();
    let hit = null;
    const walk = (n) => {
      if (hit) return;
      if (n.kind === "file" && (n.name || "").toLowerCase() === target) {
        hit = n;
        return;
      }
      for (const c of n.children || []) walk(c);
    };
    walk(root);
    return hit;
  };
  const handleOpenByName = (name) => {
    const node = findByName(fs, name);
    if (node) openFile(node);
  };

  const handleNewFolder = async () => {
    const name = window.prompt("Folder name")?.trim();
    if (!name) return;
    try {
      await createFile({ name, kind: "folder" });
      const tree = await loadTree();
      setFs(tree);
      // Expand all folders so the new one is visible.
      const allFolderIds = new Set();
      const collect = (n) => {
        if (n.kind === "folder" && n.id !== "root") allFolderIds.add(n.id);
        (n.children || []).forEach(collect);
      };
      collect(tree);
      setExpanded((prev) => {
        const next = new Set(prev);
        allFolderIds.forEach((id) => next.add(id));
        return next;
      });
    } catch (e) {
      setError(`Create folder failed: ${e.message}`);
    }
  };

  const handleUpload = async (files, parentId = null) => {
    const names = Array.from(files || []).map((f) => f.name);
    setUploadStatus({ phase: "uploading", count: names.length, names });
    try {
      const res = await uploadFiles(files, parentId);
      if (res.skipped?.length) {
        const msg = res.skipped
          .map((s) => `${s.name}: ${s.reason}`)
          .join("; ");
        setError(`Skipped: ${msg}`);
      }
      // Refresh the tree so newly-uploaded files appear.
      const tree = await loadTree();
      setFs(tree);
      const allFolderIds = new Set();
      const collect = (n) => {
        if (n.kind === "folder" && n.id !== "root") allFolderIds.add(n.id);
        (n.children || []).forEach(collect);
      };
      collect(tree);
      setExpanded((prev) => {
        const next = new Set(prev);
        allFolderIds.forEach((id) => next.add(id));
        return next;
      });
      // Auto-open the first uploaded file so the user sees something.
      if (res.created?.length) {
        const first = res.created[0];
        const node = fsFind(tree, first.id);
        if (node) openFile(node);
      }
      setUploadStatus({
        phase: "done",
        count: res.created?.length || 0,
        skipped: res.skipped?.length || 0,
      });
      // Auto-dismiss the "done" toast — matches the CSS fade-out delay.
      setTimeout(() => setUploadStatus(null), 1900);
    } catch (e) {
      setError(`Upload failed: ${e.message}`);
      setUploadStatus(null);
    }
  };

  // Called when the agent deletes one or more workbooks. Drop matching
  // tabs (the underlying file is gone — keeping the tab would 404 on
  // any save attempt) and clear active selection if needed.
  const handleWorkbookDeleted = (deletedIds) => {
    const idSet = new Set(deletedIds || []);
    if (idSet.size === 0) return;
    setTabs((prev) => prev.filter((t) => !idSet.has(t.id)));
    setActiveId((cur) => (cur && idSet.has(cur) ? null : cur));
  };

  // Called when the Excel agent reports it mutated one or more workbooks.
  // Reload any of those that are open in tabs. Discards any unsaved local
  // edits in matching tabs — intentional since the agent's change has
  // already been persisted to R2.
  const handleWorkbookMutated = async (mutatedFileIds) => {
    const idSet = new Set(mutatedFileIds || []);
    if (idSet.size === 0) return;
    const toRefresh = tabs.filter((t) => idSet.has(t.id));
    for (const tab of toRefresh) {
      try {
        const fresh = await loadContent(tab.id);
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tab.id ? { ...t, content: fresh, savedContent: fresh } : t
          )
        );
      } catch (e) {
        setError(`Failed to refresh ${tab.name}: ${e.message}`);
      }
    }
  };

  // Called when the agent CREATES new workbooks. Refresh the tree so
  // the new files show up in the sidebar.
  const handleWorkspaceChanged = async () => {
    try {
      const tree = await loadTree();
      setFs(tree);
      // Auto-expand all folders so new files are visible.
      const allFolderIds = new Set();
      const collect = (n) => {
        if (n.kind === "folder" && n.id !== "root") allFolderIds.add(n.id);
        (n.children || []).forEach(collect);
      };
      collect(tree);
      setExpanded((prev) => {
        const next = new Set(prev);
        allFolderIds.forEach((id) => next.add(id));
        return next;
      });
    } catch (e) {
      setError(`Failed to refresh tree: ${e.message}`);
    }
  };

  return (
    <div
      className="files-page-grid"
      style={{
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: `${sidebarCollapsed ? 60 : sidebarWidth}px 1fr ${agentWidth}px`,
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
        onUpload={handleUpload}
        onNewFolder={handleNewFolder}
        onResizeStart={!sidebarCollapsed ? startSidebarResize : undefined}
        onQuickOpen={() => setQuickOpen(true)}
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
            onCommitFormula={handleCommitFormula}
            dirty={activeTab ? dirty.has(activeTab.id) : false}
          />
        )}
      </div>
      <AgentPanel
        file={activeTab}
        fileTree={fs}
        width={agentWidth}
        onResizeStart={startResize}
        mobileOpen={mobileAgent}
        onMobileClose={() => setMobileAgent(false)}
        onWorkbookMutated={handleWorkbookMutated}
        onWorkbookDeleted={handleWorkbookDeleted}
        onWorkspaceChanged={handleWorkspaceChanged}
        onOpenFile={handleOpenByName}
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

      {uploadStatus && (
        <div
          className={`files-upload-toast${uploadStatus.phase === "done" ? " done" : ""}`}
          role="status"
          aria-live="polite"
        >
          {uploadStatus.phase === "uploading" ? (
            <>
              <span className="spinner" aria-hidden="true" />
              <span>
                Uploading {uploadStatus.count} file{uploadStatus.count === 1 ? "" : "s"}…
              </span>
            </>
          ) : (
            <>
              <span className="check" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5l3.2 3L13 4.5" />
                </svg>
              </span>
              <span>
                Uploaded {uploadStatus.count} file{uploadStatus.count === 1 ? "" : "s"}
                {uploadStatus.skipped ? ` · skipped ${uploadStatus.skipped}` : ""}
              </span>
            </>
          )}
        </div>
      )}

      {quickOpen && (
        <QuickOpen
          tree={fs}
          onPick={(node) => {
            setQuickOpen(false);
            openFile(node);
          }}
          onClose={() => setQuickOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === "folder" ? "Delete folder" : "Delete file"}
        body={
          confirm ? (
            confirm.kind === "folder" ? (
              (() => {
                const node = fsFind(fs, confirm.id);
                const counts = node ? countDescendants(node) : { files: 0, folders: 0 };
                const parts = [];
                if (counts.files) parts.push(`${counts.files} file${counts.files === 1 ? "" : "s"}`);
                if (counts.folders) parts.push(`${counts.folders} folder${counts.folders === 1 ? "" : "s"}`);
                const contents = parts.length ? ` and everything inside (${parts.join(", ")})` : "";
                return (
                  <>
                    Permanently delete folder{" "}
                    <strong style={{ color: C_INK, fontWeight: 600 }}>{confirm.name}</strong>
                    {contents}? This cannot be undone.
                  </>
                );
              })()
            ) : (
              <>
                Permanently delete{" "}
                <strong style={{ color: C_INK, fontWeight: 600 }}>{confirm.name}</strong>? This action
                cannot be undone.
              </>
            )
          ) : null
        }
        confirmLabel="Delete"
        onConfirm={performDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
