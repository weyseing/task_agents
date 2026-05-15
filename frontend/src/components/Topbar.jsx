import { useEffect, useRef } from "react";
import "./Topbar.css";

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" />
      <path d="M16 6l-4-4-4 4" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  );
}

export default function Topbar({ conversation, onRename }) {
  const titleRef = useRef(null);
  const title = conversation?.title || "New conversation";
  const editable = !!conversation?.id;

  useEffect(() => {
    if (titleRef.current && titleRef.current.textContent !== title) {
      titleRef.current.textContent = title;
    }
  }, [title]);

  const commit = () => {
    if (!editable || !titleRef.current) return;
    const next = titleRef.current.textContent.trim();
    if (!next) {
      titleRef.current.textContent = title;
      return;
    }
    if (next !== title) onRename?.(conversation.id, next);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.textContent = title;
      e.currentTarget.blur();
    }
  };

  return (
    <div className="topbar">
      <div className="topbar-row">
        <div className="topbar-left">
          <div className="title-wrap">
            <div
              ref={titleRef}
              className="title-line"
              contentEditable={editable}
              suppressContentEditableWarning
              spellCheck={false}
              onBlur={commit}
              onKeyDown={handleKeyDown}
            >
              {title}
            </div>
          </div>
        </div>
        <div className="topbar-right">
          <button type="button" className="icon-btn" title="Share">
            <ShareIcon />
          </button>
          <button type="button" className="icon-btn" title="More">
            <MoreIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
