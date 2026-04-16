import "./ChatHome.css";

const suggestions = [
  { icon: "mail", text: "Check my unread emails" },
  { icon: "search", text: "Search emails from this week" },
  { icon: "send", text: "Draft an email for me" },
  { icon: "diagram", text: "Write a new function" },
];

const icons = {
  mail: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 4l-10 8L2 4" />
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  ),
  send: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  ),
  diagram: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
};

export default function ChatHome({ onSend }) {
  return (
    <div className="chat-home">
      <h1 className="chat-home-title">What can I help you with?</h1>

      <div className="chat-home-chips">
        <button className="chip" onClick={() => onSend("Check my inbox")}>Inbox</button>
        <button className="chip" onClick={() => onSend("Show my unread emails")}>Unread</button>
        <button className="chip" onClick={() => onSend("Search emails from today")}>Today's mail</button>
        <button className="chip" onClick={() => onSend("Help me write an email")}>Compose</button>
      </div>

      <div className="chat-home-suggestions">
        {suggestions.map((s) => (
          <button key={s.text} className="suggestion" onClick={() => onSend(s.text)}>
            <span className="suggestion-icon">{icons[s.icon]}</span>
            <span className="suggestion-text">{s.text}</span>
            <svg className="suggestion-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
