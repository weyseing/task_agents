import { useEffect, useRef, useState } from "react";
import IconBtn from "./IconBtn";
import { FileChip } from "./FileChip";
import "../components/Sidebar.css";
import {
  C_EASE,
  C_INK,
  C_INK2,
  C_LINE,
  C_MUTED,
  C_MUTED2,
  C_SIDEBAR,
  C_SURFACE2,
} from "./tokens";

function SidebarToggleIcon() {
  return (
    <svg className="sidebar-toggle-svg" viewBox="0 0 32 32" fill="none">
      <path d="M8.875 9.875a1 1 0 0 1 1 1v10.25a1 1 0 1 1-2 0v-10.25a1 1 0 0 1 1-1z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M20.6 6.125c1.105 0 1.988 0 2.699.058.72.059 1.342.182 1.914.473a4.877 4.877 0 0 1 2.13 2.131c.292.572.416 1.193.474 1.914.058.711.058 1.594.058 2.7V18.6c0 1.105 0 1.988-.058 2.699-.058.72-.182 1.342-.473 1.914a4.877 4.877 0 0 1-2.131 2.13c-.572.292-1.193.416-1.914.474-.711.058-1.594.058-2.7.058H11.4c-1.105 0-1.988 0-2.699-.058-.72-.058-1.342-.182-1.914-.473a4.877 4.877 0 0 1-2.13-2.131c-.292-.572-.415-1.193-.474-1.914-.058-.711-.058-1.594-.058-2.7V13.4c0-1.105 0-1.988.058-2.699.059-.72.182-1.342.473-1.914a4.877 4.877 0 0 1 2.131-2.13c.572-.292 1.193-.415 1.914-.474.711-.058 1.594-.058 2.7-.058H20.6zm-9.2 1.75c-1.134 0-1.933 0-2.556.052-.613.05-.98.144-1.263.289-.588.3-1.066.777-1.365 1.365-.145.284-.24.65-.29 1.263-.05.623-.051 1.422-.051 2.556v5.2c0 1.134 0 1.933.052 2.556.05.613.144.98.289 1.263.3.588.777 1.066 1.365 1.365.284.145.65.24 1.263.29.623.05 1.422.051 2.556.051h9.2c1.134 0 1.933 0 2.556-.052.613-.05.98-.144 1.263-.289a3.125 3.125 0 0 0 1.365-1.365c.145-.284.24-.65.29-1.263.05-.623.051-1.422.051-2.556v-5.2c0-1.134 0-1.933-.052-2.556-.05-.613-.144-.98-.289-1.263a3.125 3.125 0 0 0-1.365-1.365c-.284-.145-.65-.24-1.263-.29-.623-.05-1.422-.051-2.556-.051h-9.2z" fill="currentColor" />
    </svg>
  );
}

export default function FilesSidebar({
  root,
  activeId,
  expanded,
  collapsed,
  user,
  mobileOpen,
  onMobileClose,
  onToggleCollapse,
  onToggle,
  onOpen,
  onDelete,
  onNavChat,
  onLogout,
  onUpload,
}) {
  const fileInputRef = useRef(null);
  const handlePickFiles = () => fileInputRef.current?.click();
  const handleFilesChosen = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length && onUpload) onUpload(files);
    // Reset so picking the same file twice in a row still fires onChange.
    e.target.value = "";
  };

  if (collapsed) {
    return (
      <aside className="files-sidebar sidebar collapsed">
        <button
          type="button"
          className="brand-collapsed-toggle"
          onClick={onToggleCollapse}
          title="Expand sidebar"
        >
          <span className="brand-collapsed-logo">
            <img src="/favicon.svg" alt="Lumen" className="brand-favicon" />
          </span>
          <span className="brand-collapsed-icon">
            <SidebarToggleIcon />
          </span>
        </button>
        <button type="button" className="icon-btn" onClick={onNavChat} title="New chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button type="button" className="icon-btn" title="Search" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.5-4.5" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`files-sidebar sidebar${mobileOpen ? " mobile-open" : ""}`}
    >
      <div className="sidebar-top">
        <div className="brand">
          <img src="/favicon.svg" alt="Lumen" className="brand-favicon" />
          <div className="brand-text">
            <div className="brand-name">Lumen</div>
            <div className="brand-sub">task agents</div>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-collapse-btn sidebar-mobile-close"
          onClick={onMobileClose}
          aria-label="Close menu"
          title="Close menu"
        >
          <SidebarToggleIcon />
        </button>
        <button
          type="button"
          className="sidebar-collapse-btn sidebar-desktop-collapse"
          onClick={onToggleCollapse}
          title="Collapse sidebar"
        >
          <SidebarToggleIcon />
        </button>
      </div>

      <div className="nav-group">
        <button type="button" className="nav-item" onClick={onNavChat}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>New chat</span>
          <span className="kbd">⌘N</span>
        </button>
        <button type="button" className="nav-item" disabled title="Coming soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.5-4.5" />
          </svg>
          <span>Search</span>
          <span className="kbd">⌘K</span>
        </button>
        <button type="button" className="nav-item" disabled title="Coming soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="4" y="6" width="16" height="13" rx="2" />
            <path d="M8 3v6M16 3v6M4 11h16" />
          </svg>
          <span>Tasks</span>
        </button>
        <button type="button" className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
          </svg>
          <span>Files</span>
        </button>
        <button type="button" className="nav-item" disabled title="Coming soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M12 2L3 7l9 5 9-5-9-5z" />
            <path d="M3 12l9 5 9-5M3 17l9 5 9-5" />
          </svg>
          <span>Agents</span>
        </button>
      </div>

      <div className="recent">
        <div
          className="nav-section-title"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Files</span>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              onChange={handleFilesChosen}
              style={{ display: "none" }}
            />
            <IconBtn title="Upload csv/xlsx" inline onClick={handlePickFiles}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4" />
                <path d="M7 9l5-5 5 5" />
                <path d="M5 20h14" />
              </svg>
            </IconBtn>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
          <TreeNode
            node={root}
            depth={0}
            isRoot
            activeId={activeId}
            expanded={expanded}
            onToggle={onToggle}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        </div>
      </div>

      {user && <SidebarFoot user={user} onLogout={onLogout} />}
    </aside>
  );
}

function SidebarFoot({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const name = user?.name || user?.email || "You";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");
  const sub = user?.email && user?.name ? user.email : "Internal access";

  return (
    <div className="sidebar-foot" ref={menuRef}>
      {user?.picture ? (
        <img src={user.picture} alt="" className="avatar avatar-img" referrerPolicy="no-referrer" />
      ) : (
        <div className="avatar">{initials || "?"}</div>
      )}
      <div className="sidebar-foot-text">
        <div className="me-name">{name}</div>
        <div className="me-meta">{sub}</div>
      </div>
      <button
        type="button"
        className="icon-btn foot-cog"
        onClick={() => setOpen((o) => !o)}
        title="Settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="sidebar-foot-menu" role="menu">
          <button
            type="button"
            className="sidebar-foot-menu-item"
            onClick={() => { setOpen(false); onLogout?.(); }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}


function TreeNode({ node, depth, isRoot, activeId, expanded, onToggle, onOpen, onDelete }) {
  const isOpen = expanded.has(node.id) || isRoot;

  if (node.kind === "folder") {
    const childCount = (node.children || []).length;
    return (
      <div>
        {!isRoot && (
          <Row depth={depth} active={false} onClick={() => onToggle(node.id)}>
            <Chevron open={isOpen} />
            <FolderGlyph open={isOpen} />
            <span
              style={{
                flex: 1,
                color: C_INK,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {node.name}
            </span>
            <span
              className="row-count"
              style={{ fontSize: 10, color: C_MUTED2, fontFamily: "ui-monospace, monospace" }}
            >
              {childCount}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id, node.name, { kind: "folder", childCount });
              }}
              title="Delete folder"
              className="row-del"
              style={{
                width: 20,
                height: 20,
                border: "none",
                background: "transparent",
                color: C_MUTED,
                cursor: "pointer",
                borderRadius: 5,
                display: "grid",
                placeItems: "center",
                transition: `opacity .12s ${C_EASE}, background .12s ${C_EASE}`,
              }}
            >
              <TrashGlyph />
            </button>
          </Row>
        )}
        {isOpen &&
          (node.children || []).map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + (isRoot ? 0 : 1)}
              activeId={activeId}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
      </div>
    );
  }

  return (
    <Row depth={depth} active={node.id === activeId} onClick={() => onOpen(node.id)}>
      <span style={{ width: 10, flexShrink: 0 }} />
      <FileChip type={node.type} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          color: node.id === activeId ? C_INK : C_INK2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontWeight: node.id === activeId ? 500 : 400,
        }}
      >
        {node.name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(node.id, node.name, { kind: "file", type: node.type });
        }}
        title="Delete"
        className="row-del"
        style={{
          width: 20,
          height: 20,
          border: "none",
          background: "transparent",
          color: C_MUTED,
          cursor: "pointer",
          borderRadius: 5,
          display: "grid",
          placeItems: "center",
          transition: `opacity .12s ${C_EASE}, background .12s ${C_EASE}`,
        }}
      >
        <TrashGlyph />
      </button>
    </Row>
  );
}

function Row({ depth, active, onClick, children }) {
  return (
    <div
      onClick={onClick}
      className="tree-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: `6px 10px 6px ${10 + depth * 14}px`,
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 12.5,
        color: C_INK2,
        background: active ? C_SURFACE2 : "transparent",
        transition: `background .12s ${C_EASE}`,
        marginBottom: 1,
      }}
    >
      {children}
    </div>
  );
}

function Chevron({ open }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 9 9"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0)",
        transition: `transform .12s ${C_EASE}`,
        flexShrink: 0,
      }}
    >
      <path
        d="M3 1.5L6 4.5L3 7.5"
        fill="none"
        stroke={C_MUTED}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderGlyph({ open }) {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" style={{ flexShrink: 0 }}>
      <path
        d={
          open
            ? "M1 2.5C1 1.7 1.6 1 2.4 1H5L6.5 2.5H11.6C12.4 2.5 13 3.2 13 4V4.5H2.2L1 10V2.5Z"
            : "M1 2.5C1 1.7 1.6 1 2.4 1H5L6.5 2.5H11.6C12.4 2.5 13 3.2 13 4V9.5C13 10.3 12.4 11 11.6 11H2.4C1.6 11 1 10.3 1 9.5V2.5Z"
        }
        fill="#D7DEE9"
        stroke={C_MUTED2}
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 13 13">
      <path
        d="M3 4h7l-.5 7.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1L3 4Z M5 4V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4 M2 4h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
