import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./Sidebar.css";

function groupConversations(conversations) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const last7 = new Date(today);
  last7.setDate(last7.getDate() - 7);

  const groups = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };

  for (const conv of conversations) {
    const d = new Date(conv.updated_at);
    if (d >= today) groups.Today.push(conv);
    else if (d >= yesterday) groups.Yesterday.push(conv);
    else if (d >= last7) groups["Previous 7 days"].push(conv);
    else groups.Older.push(conv);
  }

  return Object.entries(groups).filter(([, items]) => items.length > 0);
}

function SidebarToggleIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" width="24" height="24">
      <path d="M8.875 9.875a1 1 0 0 1 1 1v10.25a1 1 0 1 1-2 0v-10.25a1 1 0 0 1 1-1z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M20.6 6.125c1.105 0 1.988 0 2.699.058.72.059 1.342.182 1.914.473a4.877 4.877 0 0 1 2.13 2.131c.292.572.416 1.193.474 1.914.058.711.058 1.594.058 2.7V18.6c0 1.105 0 1.988-.058 2.699-.058.72-.182 1.342-.473 1.914a4.877 4.877 0 0 1-2.131 2.13c-.572.292-1.193.416-1.914.474-.711.058-1.594.058-2.7.058H11.4c-1.105 0-1.988 0-2.699-.058-.72-.058-1.342-.182-1.914-.473a4.877 4.877 0 0 1-2.13-2.131c-.292-.572-.415-1.193-.474-1.914-.058-.711-.058-1.594-.058-2.7V13.4c0-1.105 0-1.988.058-2.699.059-.72.182-1.342.473-1.914a4.877 4.877 0 0 1 2.131-2.13c.572-.292 1.193-.415 1.914-.474.711-.058 1.594-.058 2.7-.058H20.6zm-9.2 1.75c-1.134 0-1.933 0-2.556.052-.613.05-.98.144-1.263.289-.588.3-1.066.777-1.365 1.365-.145.284-.24.65-.29 1.263-.05.623-.051 1.422-.051 2.556v5.2c0 1.134 0 1.933.052 2.556.05.613.144.98.289 1.263.3.588.777 1.066 1.365 1.365.284.145.65.24 1.263.29.623.05 1.422.051 2.556.051h9.2c1.134 0 1.933 0 2.556-.052.613-.05.98-.144 1.263-.289a3.125 3.125 0 0 0 1.365-1.365c.145-.284.24-.65.29-1.263.05-.623.051-1.422.051-2.556v-5.2c0-1.134 0-1.933-.052-2.556-.05-.613-.144-.98-.289-1.263a3.125 3.125 0 0 0-1.365-1.365c-.284-.145-.65-.24-1.263-.29-.623-.05-1.422-.051-2.556-.051h-9.2z" fill="currentColor" />
    </svg>
  );
}

function ConvDropdown({ conv, anchorRect, onRename, onDelete, onClose }) {
  const menuRef = useRef(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conv.title);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const handleRenameSubmit = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== conv.title) {
      onRename(conv.id, trimmed);
    }
    onClose();
  };

  const style = {
    top: anchorRect.top,
    left: anchorRect.right + 8,
  };

  const content = renaming ? (
    <div className="conv-dropdown-rename">
      <input
        ref={inputRef}
        className="conv-dropdown-rename-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleRenameSubmit();
          if (e.key === "Escape") onClose();
        }}
      />
      <div className="conv-dropdown-rename-actions">
        <button className="conv-dropdown-rename-btn" onClick={handleRenameSubmit}>Save</button>
        <button className="conv-dropdown-rename-btn cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  ) : (
    <>
      <button
        className="conv-dropdown-item"
        role="menuitem"
        onClick={() => setRenaming(true)}
      >
        <div className="conv-dropdown-icon">
          <svg viewBox="0 0 32 32" fill="none" width="20" height="20">
            <path fillRule="evenodd" clipRule="evenodd" d="M20.63 6.631a3.35 3.35 0 0 1 4.74 4.738L13.402 23.334a5.878 5.878 0 0 1-2.146 1.367l-4.458 1.622a.876.876 0 0 1-1.12-1.123l1.62-4.458a5.882 5.882 0 0 1 1.368-2.146L20.631 6.63zM9.904 19.834a4.129 4.129 0 0 0-.96 1.508l-.98 2.694 2.695-.98a4.128 4.128 0 0 0 1.508-.96l9.781-9.782a7.026 7.026 0 0 0-2.261-2.262l-9.783 9.782zM24.131 7.87a1.599 1.599 0 0 0-2.262 0l-.74.74a9.04 9.04 0 0 1 2.262 2.261l.74-.739a1.6 1.6 0 0 0 0-2.262z" fill="currentColor" />
          </svg>
        </div>
        <span className="conv-dropdown-label">Rename</span>
      </button>
      <div className="conv-dropdown-separator" />
      <button
        className="conv-dropdown-item destructive"
        role="menuitem"
        onClick={() => { onDelete(conv.id); onClose(); }}
      >
        <div className="conv-dropdown-icon">
          <svg viewBox="0 0 32 32" fill="none" width="20" height="20">
            <path fillRule="evenodd" clipRule="evenodd" d="M18.368 4.125c1.06 0 1.993.703 2.284 1.723l.508 1.777H26a.875.875 0 0 1 0 1.75h-1.172l-.618 11.129c-.058 1.05-.105 1.887-.196 2.562-.093.686-.242 1.276-.543 1.814a4.876 4.876 0 0 1-2.115 2c-.554.27-1.15.386-1.84.441-.68.054-1.52.054-2.57.054h-1.891c-1.051 0-1.891 0-2.57-.054-.69-.055-1.287-.17-1.841-.441a4.876 4.876 0 0 1-2.115-2c-.3-.538-.45-1.128-.543-1.814-.091-.675-.138-1.513-.196-2.562L7.172 9.375H6a.875.875 0 1 1 0-1.75h4.84l.508-1.777a2.376 2.376 0 0 1 2.284-1.723h4.736zm-8.83 16.281c.06 1.078.102 1.835.183 2.425.078.58.185.926.336 1.194.31.556.784 1.003 1.355 1.283.277.135.628.223 1.211.27.594.047 1.353.047 2.432.047h1.89c1.08 0 1.838 0 2.432-.048.583-.046.934-.134 1.21-.27a3.128 3.128 0 0 0 1.356-1.282c.15-.268.258-.615.336-1.194.08-.59.123-1.347.183-2.425l.612-11.031H8.926l.612 11.031zm4.094-14.531a.626.626 0 0 0-.602.453l-.37 1.297h6.68l-.37-1.297a.626.626 0 0 0-.602-.453h-4.736z" fill="currentColor" />
          </svg>
        </div>
        <span className="conv-dropdown-label">Delete</span>
      </button>
    </>
  );

  return createPortal(
    <div className="conv-dropdown" ref={menuRef} role="menu" style={style}>
      {content}
    </div>,
    document.body
  );
}

export default function Sidebar({ conversations, activeId, collapsed, onToggleCollapse, onNewChat, onSelect, onRename, onDelete }) {
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);

  const filtered = search
    ? conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const grouped = groupConversations(filtered);

  const handleMenuOpen = (convId, e) => {
    e.stopPropagation();
    if (openMenu && openMenu.id === convId) {
      setOpenMenu(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setOpenMenu({ id: convId, rect });
    }
  };

  if (collapsed) {
    return (
      <aside className="sidebar collapsed">
        <div className="sidebar-top-collapsed">
          <button className="sidebar-collapsed-logo" onClick={onToggleCollapse} title="Expand sidebar">
            <img src="/favicon.png" alt="Task Agents" className="sidebar-logo-icon-collapsed" />
            <span className="sidebar-collapsed-expand-icon">
              <SidebarToggleIcon />
            </span>
          </button>
          <button className="sidebar-icon-btn" onClick={onNewChat} title="New chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-logo-row">
          <div className="sidebar-logo">
            <img src="/favicon.png" alt="Task Agents" className="sidebar-logo-icon" />
            <span>Task Agents</span>
          </div>
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Collapse sidebar">
            <SidebarToggleIcon />
          </button>
        </div>
        <button className="sidebar-btn new-chat" onClick={onNewChat}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          New chat
        </button>
        <button className="sidebar-btn" onClick={() => setShowSearch((s) => !s)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          Search
        </button>
        {showSearch && (
          <input
            className="sidebar-search"
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        )}
      </div>

      <div className="sidebar-history">
        {grouped.length === 0 && (
          <span className="sidebar-empty">
            {search ? "No matches" : "No conversations yet"}
          </span>
        )}
        {grouped.map(([label, items]) => (
          <div key={label} className="sidebar-group">
            <span className="sidebar-label">{label}</span>
            {items.map((conv) => (
              <div key={conv.id} className="sidebar-conv-wrapper">
                <button
                  className={`sidebar-conv${conv.id === activeId ? " active" : ""}${openMenu?.id === conv.id ? " menu-open" : ""}`}
                  onClick={() => onSelect(conv.id)}
                  title={conv.title}
                >
                  <span className="sidebar-conv-title">{conv.title}</span>
                  <span
                    className="sidebar-conv-menu-trigger"
                    onClick={(e) => handleMenuOpen(conv.id, e)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="6" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="18" r="1.5" />
                    </svg>
                  </span>
                </button>
                {openMenu?.id === conv.id && (
                  <ConvDropdown
                    conv={conv}
                    anchorRect={openMenu.rect}
                    onRename={onRename}
                    onDelete={onDelete}
                    onClose={() => setOpenMenu(null)}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
