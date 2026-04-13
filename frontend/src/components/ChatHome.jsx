import "./ChatHome.css";

const suggestions = [
  { icon: "search", text: "Explain a piece of code" },
  { icon: "feedback", text: "Debug an error message" },
  { icon: "diagram", text: "Write a new function" },
  { icon: "report", text: "Refactor existing code" },
];

const icons = {
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  ),
  feedback: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  diagram: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  report: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
};

export default function ChatHome({ onSend }) {
  return (
    <div className="chat-home">
      <h1 className="chat-home-title">What can I help you build?</h1>

      <div className="chat-home-chips">
        <button className="chip" onClick={() => onSend("Explain code")}>Explain code</button>
        <button className="chip" onClick={() => onSend("Debug error")}>Debug error</button>
        <button className="chip" onClick={() => onSend("Write code")}>Write code</button>
        <button className="chip" onClick={() => onSend("Review code")}>Review code</button>
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
