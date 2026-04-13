import "./ChatInput.css";

export default function ChatInput({ input, setInput, onSend, isLoading }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="chat-input-wrapper">
      <div className="chat-input-container">
        <button className="chat-input-add" title="Attach file">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <input
          className="chat-input"
          type="text"
          placeholder="Ask Task Agents..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className={`chat-input-send ${input.trim() ? "active" : ""}`}
          onClick={onSend}
          disabled={!input.trim() || isLoading}
        >
          <svg viewBox="0 0 32 32" fill="none" width="20" height="20">
            <path d="M16 6.125a.89.89 0 0 0-.265.04l-.014.006a.869.869 0 0 0-.273.15l-.067.06-7.5 7.5a.876.876 0 0 0 1.239 1.238l6.005-6.006V25a.875.875 0 1 0 1.75 0V9.113l6.006 6.006a.876.876 0 0 0 1.239-1.238l-7.5-7.5a.89.89 0 0 0-.414-.232.874.874 0 0 0-.15-.021l-.027-.002L16 6.125z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
