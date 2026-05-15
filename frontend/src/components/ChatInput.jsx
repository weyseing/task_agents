import { useRef, useState, useEffect } from "react";
import "./ChatInput.css";

const MODES = [
  { id: "instant", label: "Instant", title: "Quick answers" },
  { id: "deep", label: "Deep", title: "Reasoned, multi-step" },
  { id: "auto", label: "Auto", title: "Lumen picks the right depth" },
];

function WebIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export default function ChatInput({ input, setInput, onSend, isLoading }) {
  const textareaRef = useRef(null);
  const [mode, setMode] = useState("auto");

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  useEffect(() => {
    autosize();
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) onSend();
    }
  };

  const canSend = !!input.trim() && !isLoading;

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="composer-input-row">
          <textarea
            ref={textareaRef}
            className="composer-input"
            rows={1}
            placeholder="Ask Lumen anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
        </div>

        <div className="composer-toolbar">
          <button type="button" className="tool-btn" title="Search the web">
            <WebIcon />
            <span>Web</span>
          </button>

          <div className="spacer" />

          <div className="mode-group" role="tablist" aria-label="Response mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                className={`mode-btn${mode === m.id ? " active" : ""}`}
                title={m.title}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`composer-send${canSend ? "" : " empty"}`}
            onClick={onSend}
            disabled={!canSend}
            title="Send"
          >
            <SendIcon />
          </button>
        </div>
      </div>

      <div className="composer-foot">
        <span className="hint">
          <kbd>Enter</kbd> to send · <kbd>⇧↵</kbd> for new line
        </span>
        <span>Lumen can make mistakes — verify important info.</span>
      </div>
    </div>
  );
}
