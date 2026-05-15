import "./Topbar.css";

function relativeTime(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Topbar({ conversation, messageCount }) {
  const title = conversation?.title || "New conversation";
  const started = conversation?.created_at
    ? relativeTime(conversation.created_at)
    : null;
  const subParts = [];
  if (messageCount) subParts.push(`${messageCount} message${messageCount === 1 ? "" : "s"}`);
  if (started) subParts.push(`started ${started}`);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div>
          <div className="title-line">{title}</div>
          {subParts.length > 0 && (
            <div className="title-sub">{subParts.join(" · ")}</div>
          )}
        </div>
      </div>
      <div className="topbar-right">
        <span className="pill">
          <span className="indicator" />
          Instant
        </span>
        <button type="button" className="icon-btn" title="Share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
        <button type="button" className="icon-btn" title="More">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
