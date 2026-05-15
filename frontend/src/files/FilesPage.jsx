import { useEffect, useMemo, useState } from "react";
import FilesSidebar from "./FilesSidebar";
import FilesTopBar from "./FilesTopBar";
import TabStrip from "./TabStrip";
import EditorFrame from "./EditorFrame";
import AgentPanel from "./AgentPanel";
import ConfirmDialog from "./ConfirmDialog";
import { INITIAL_FS, fsClone, fsDelete, fsFind, fsUpdate } from "./fsData";
import { C_BG, C_INK, C_PAGE } from "./tokens";
import "./FilesPage.css";

export default function FilesPage({ user, onNavChat }) {
  const [fs, setFs] = useState(() => fsClone(INITIAL_FS));
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [expanded, setExpanded] = useState(new Set(["d-proj", "d-policy", "d-data"]));
  const [confirm, setConfirm] = useState(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [mobileAgent, setMobileAgent] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeId) || null;

  const dirty = useMemo(() => {
    const s = new Set();
    tabs.forEach((t) => {
      if (JSON.stringify(t.content) !== JSON.stringify(t.savedContent)) s.add(t.id);
    });
    return s;
  }, [tabs]);

  const handleOpen = (id) => {
    const node = fsFind(fs, id);
    if (!node || node.kind !== "file") return;
    if (!tabs.some((t) => t.id === id)) {
      setTabs((prev) => [
        ...prev,
        {
          id,
          name: node.name,
          type: node.type,
          content: node.content,
          savedContent: node.content,
        },
      ]);
    }
    setActiveId(id);
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

  const handleSave = () => {
    if (!activeTab || !dirty.has(activeTab.id)) return;
    setFs((prev) => fsUpdate(prev, activeTab.id, activeTab.content));
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTab.id ? { ...t, savedContent: t.content } : t))
    );
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

  const performDelete = () => {
    if (!confirm) return;
    const id = confirm.id;
    setFs((prev) => fsDelete(prev, id));
    setTabs((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
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

  // Default open README on first mount.
  useEffect(() => {
    if (!activeId && tabs.length === 0) handleOpen("f-readme");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When opening a file from the sidebar drawer on mobile, close the drawer.
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
        gridTemplateColumns: "268px 1fr 360px",
        background: C_PAGE,
        color: C_INK,
        fontFamily: '"Sora", system-ui',
        position: "relative",
      }}
    >
      <FilesSidebar
        root={fs}
        activeId={activeId}
        expanded={expanded}
        user={user}
        mobileOpen={mobileSidebar}
        onMobileClose={() => setMobileSidebar(false)}
        onToggle={handleToggle}
        onOpen={handleOpenAndCloseDrawer}
        onDelete={handleDelete}
        onNavChat={onNavChat}
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
        <EditorFrame
          file={activeTab}
          onChange={handleChange}
          dirty={activeTab ? dirty.has(activeTab.id) : false}
        />
      </div>
      <AgentPanel
        file={activeTab}
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
