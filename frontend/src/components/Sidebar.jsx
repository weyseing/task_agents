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
    <svg className="sidebar-toggle-svg" viewBox="0 0 32 32" fill="none">
      <path d="M8.875 9.875a1 1 0 0 1 1 1v10.25a1 1 0 1 1-2 0v-10.25a1 1 0 0 1 1-1z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M20.6 6.125c1.105 0 1.988 0 2.699.058.72.059 1.342.182 1.914.473a4.877 4.877 0 0 1 2.13 2.131c.292.572.416 1.193.474 1.914.058.711.058 1.594.058 2.7V18.6c0 1.105 0 1.988-.058 2.699-.058.72-.182 1.342-.473 1.914a4.877 4.877 0 0 1-2.131 2.13c-.572.292-1.193.416-1.914.474-.711.058-1.594.058-2.7.058H11.4c-1.105 0-1.988 0-2.699-.058-.72-.058-1.342-.182-1.914-.473a4.877 4.877 0 0 1-2.13-2.131c-.292-.572-.415-1.193-.474-1.914-.058-.711-.058-1.594-.058-2.7V13.4c0-1.105 0-1.988.058-2.699.059-.72.182-1.342.473-1.914a4.877 4.877 0 0 1 2.131-2.13c.572-.292 1.193-.415 1.914-.474.711-.058 1.594-.058 2.7-.058H20.6zm-9.2 1.75c-1.134 0-1.933 0-2.556.052-.613.05-.98.144-1.263.289-.588.3-1.066.777-1.365 1.365-.145.284-.24.65-.29 1.263-.05.623-.051 1.422-.051 2.556v5.2c0 1.134 0 1.933.052 2.556.05.613.144.98.289 1.263.3.588.777 1.066 1.365 1.365.284.145.65.24 1.263.29.623.05 1.422.051 2.556.051h9.2c1.134 0 1.933 0 2.556-.052.613-.05.98-.144 1.263-.289a3.125 3.125 0 0 0 1.365-1.365c.145-.284.24-.65.29-1.263.05-.623.051-1.422.051-2.556v-5.2c0-1.134 0-1.933-.052-2.556-.05-.613-.144-.98-.289-1.263a3.125 3.125 0 0 0-1.365-1.365c-.284-.145-.65-.24-1.263-.29-.623-.05-1.422-.051-2.556-.051h-9.2z" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.5-4.5" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="4" y="6" width="16" height="13" rx="2" />
      <path d="M8 3v6M16 3v6M4 11h16" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 2L3 7l9 5 9-5-9-5z" />
      <path d="M3 12l9 5 9-5M3 17l9 5 9-5" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
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
      <button className="conv-dropdown-item" role="menuitem" onClick={() => setRenaming(true)}>
        <span>Rename</span>
      </button>
      <div className="conv-dropdown-separator" />
      <button
        className="conv-dropdown-item destructive"
        role="menuitem"
        onClick={() => { onDelete(conv.id); onClose(); }}
      >
        <span>Delete</span>
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

function SidebarFoot({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
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
        <CogIcon />
      </button>
      {open && (
        <div className="sidebar-foot-menu" role="menu">
          <button
            type="button"
            className="sidebar-foot-menu-item"
            onClick={() => { setOpen(false); onLogout(); }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  conversations,
  activeId,
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onMobileClose,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  onNavFiles,
  user,
  onLogout,
}) {
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);

  const filtered = search
    ? conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const grouped = groupConversations(filtered);

  const handleMenuOpen = (convId, e) => {
    e.stopPropagation();
    e.preventDefault();
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
        <button
          type="button"
          className="brand-collapsed-toggle"
          onClick={onToggleCollapse}
          title="Expand sidebar"
        >
          <span className="brand-collapsed-logo">
            <img src="/favicon.svg" alt="Task Agents" className="brand-favicon" />
          </span>
          <span className="brand-collapsed-icon">
            <SidebarToggleIcon />
          </span>
        </button>
        <button type="button" className="icon-btn" onClick={onNewChat} title="New chat">
          <PlusIcon />
        </button>
        <button type="button" className="icon-btn" onClick={() => setShowSearch((s) => !s)} title="Search">
          <SearchIcon />
        </button>
      </aside>
    );
  }

  return (
    <aside className={`sidebar${mobileOpen ? " mobile-open" : ""}`}>
      <div className="sidebar-top">
        <div className="brand">
          <img src="/favicon.svg" alt="Task Agents" className="brand-favicon" />
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
        <button type="button" className="sidebar-collapse-btn sidebar-desktop-collapse" onClick={onToggleCollapse} title="Collapse sidebar">
          <SidebarToggleIcon />
        </button>
      </div>

      <div className="nav-group">
        <button type="button" className="nav-item" onClick={onNewChat}>
          <PlusIcon />
          <span>New chat</span>
          <span className="kbd">⌘N</span>
        </button>
        <button
          type="button"
          className={`nav-item${showSearch ? " active" : ""}`}
          onClick={() => setShowSearch((s) => !s)}
        >
          <SearchIcon />
          <span>Search</span>
          <span className="kbd">⌘K</span>
        </button>
        <button type="button" className="nav-item" disabled title="Coming soon">
          <TasksIcon />
          <span>Tasks</span>
        </button>
        <button type="button" className="nav-item" onClick={onNavFiles}>
          <FilesIcon />
          <span>Files</span>
        </button>
        <button type="button" className="nav-item" disabled title="Coming soon">
          <AgentsIcon />
          <span>Agents</span>
        </button>
      </div>

      {showSearch && (
        <input
          className="sidebar-search"
          type="text"
          placeholder="Search conversations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      )}

      <div className="recent">
        <div className="nav-section-title">Recent</div>
        <div className="chats">
          {grouped.length === 0 && (
            <div className="chats-empty">
              {search ? "No matches" : "No conversations yet"}
            </div>
          )}
          {grouped.map(([label, items]) => (
            <div key={label} className="chats-group">
              {grouped.length > 1 && <div className="chats-group-label">{label}</div>}
              {items.map((conv) => (
                <div key={conv.id} className="chat-row-wrapper">
                  <button
                    type="button"
                    className={`chat-row${conv.id === activeId ? " active" : ""}${openMenu?.id === conv.id ? " menu-open" : ""}`}
                    onClick={() => onSelect(conv.id)}
                    title={conv.title}
                  >
                    <span className="dot" />
                    <span className="label">{conv.title}</span>
                    <span
                      className="chat-row-menu-trigger"
                      onClick={(e) => handleMenuOpen(conv.id, e)}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <circle cx="5" cy="12" r="1.4" />
                        <circle cx="12" cy="12" r="1.4" />
                        <circle cx="19" cy="12" r="1.4" />
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
      </div>

      {user && <SidebarFoot user={user} onLogout={onLogout} />}
    </aside>
  );
}
