import AgentLogo from "../components/AgentLogo";
import IconBtn from "./IconBtn";
import { FileChip } from "./FileChip";
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

export default function FilesSidebar({
  root,
  activeId,
  expanded,
  user,
  mobileOpen,
  onMobileClose,
  onToggle,
  onOpen,
  onDelete,
  onNavChat,
}) {
  const displayName = user?.name || user?.email || "You";
  const initials = (() => {
    const src = user?.name || user?.email || "U";
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  })();

  return (
    <aside
      className={`files-sidebar${mobileOpen ? " mobile-open" : ""}`}
      style={{
        width: 268,
        flexShrink: 0,
        background: C_SIDEBAR,
        borderRight: `1px solid ${C_LINE}`,
        padding: "16px 14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AgentLogo size={30} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C_INK, letterSpacing: "-0.01em" }}>
              Lumen
            </div>
            <div style={{ fontSize: 10, color: C_MUTED, letterSpacing: "0.04em" }}>files</div>
          </div>
        </div>
        <IconBtn title="Close" onClick={onMobileClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </IconBtn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <NavItem
          onClick={onNavChat}
          glyph={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          }
        >
          Chat
        </NavItem>
        <NavItem
          glyph={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.5-4.5" />
            </svg>
          }
          kbd="⌘K"
        >
          Search
        </NavItem>
        <NavItem
          glyph={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <rect x="4" y="6" width="16" height="13" rx="2" />
              <path d="M8 3v6M16 3v6M4 11h16" />
            </svg>
          }
        >
          Tasks
        </NavItem>
        <NavItem
          active
          glyph={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
          }
        >
          Files
        </NavItem>
        <NavItem
          glyph={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M12 2L3 7l9 5 9-5-9-5z" />
              <path d="M3 12l9 5 9-5M3 17l9 5 9-5" />
            </svg>
          }
        >
          Agents
        </NavItem>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: 10,
            color: C_MUTED,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "10px 10px 6px",
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Files</span>
          <IconBtn title="New file" inline>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </IconBtn>
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

      <div
        style={{
          marginTop: "auto",
          padding: "10px 8px 6px",
          borderTop: `1px solid ${C_LINE}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            flexShrink: 0,
            background: "linear-gradient(135deg, #1B263B, #334155)",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontSize: 10.5,
            fontWeight: 600,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: C_INK, lineHeight: 1.2 }}>
            {displayName}
          </div>
          <div style={{ fontSize: 10.5, color: C_MUTED, lineHeight: 1.2 }}>
            {user?.email || ""}
          </div>
        </div>
        <IconBtn title="Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </IconBtn>
      </div>
    </aside>
  );
}

function NavItem({ glyph, kbd, active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="files-nav-item"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 9,
        border: "none",
        textAlign: "left",
        cursor: "pointer",
        background: active ? C_SURFACE2 : "transparent",
        color: active ? C_INK : C_INK2,
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: active ? 500 : 400,
        transition: `background .12s ${C_EASE}, color .12s ${C_EASE}`,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(15,23,42,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          width: 15,
          height: 15,
          color: active ? C_INK : C_MUTED,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        {glyph}
      </span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {children}
      </span>
      {kbd && (
        <span
          style={{
            fontSize: 10.5,
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            color: C_MUTED2,
            letterSpacing: "0.04em",
          }}
        >
          {kbd}
        </span>
      )}
    </button>
  );
}

function TreeNode({ node, depth, isRoot, activeId, expanded, onToggle, onOpen, onDelete }) {
  const isOpen = expanded.has(node.id) || isRoot;

  if (node.kind === "folder") {
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
            <span style={{ fontSize: 10, color: C_MUTED2, fontFamily: "ui-monospace, monospace" }}>
              {(node.children || []).length}
            </span>
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
          onDelete(node.id, node.name);
        }}
        title="Delete"
        className="row-del"
        style={{
          opacity: 0,
          transition: `opacity .12s ${C_EASE}`,
          width: 20,
          height: 20,
          border: "none",
          background: "transparent",
          color: C_MUTED,
          cursor: "pointer",
          borderRadius: 5,
          display: "grid",
          placeItems: "center",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(15,23,42,0.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
