import { useRef, useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AgentLogo from "./AgentLogo";
import ToolCall from "./ToolCall";
import "./ChatMessages.css";

function MarkdownContent({ children, className }) {
  return (
    <div className={className}>
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}

function ThinkingBlock({ thinking, isThinking, thinkDuration }) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    if (isThinking && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinking, isThinking]);

  if (!thinking) return null;

  const duration = thinkDuration ? `${thinkDuration}s` : null;

  return (
    <div className={`thinking-block ${isThinking ? "active" : "done"}`}>
      <button
        className="thinking-toggle"
        onClick={() => !isThinking && setExpanded(!expanded)}
      >
        <div className="thinking-indicator">
          {isThinking ? (
            <AgentLogo animated />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          )}
        </div>
        <div className="thinking-header">
          <span className="thinking-label">
            {isThinking ? "Thinking" : duration ? `Thought for ${duration}` : "Thought process"}
          </span>
          {isThinking && <span className="thinking-dots"><span /><span /><span /></span>}
        </div>
        {!isThinking && (
          <svg
            className={`thinking-chevron ${expanded ? "expanded" : ""}`}
            width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      <div
        className={`thinking-content ${isThinking || expanded ? "show" : ""}`}
        ref={contentRef}
      >
        <Markdown remarkPlugins={[remarkGfm]}>{thinking}</Markdown>
      </div>
    </div>
  );
}

export default function ChatMessages({ messages, isLoading, isStreaming, lastUserRef }) {
  const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
  const containerRef = useRef(null);
  const [spacerHeight, setSpacerHeight] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !lastUserRef.current) {
      setSpacerHeight(0);
      return;
    }

    const container = containerRef.current;
    const viewportHeight = container.clientHeight;
    const userMsgTop = lastUserRef.current.offsetTop;
    const contentHeight = container.scrollHeight - spacerHeight;
    const contentBelowUser = contentHeight - userMsgTop;
    const needed = viewportHeight - contentBelowUser;

    setSpacerHeight(Math.max(0, needed));
  }, [messages, isLoading, isStreaming]);

  return (
    <div className="chat-messages" ref={containerRef}>
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`message ${msg.role}`}
          ref={msg.role === "user" && i === lastUserIndex ? lastUserRef : null}
        >
          {msg.role === "assistant" && (
            <div className="message-content">
              {msg.thinking && (
                <ThinkingBlock thinking={msg.thinking} isThinking={msg.isThinking} thinkDuration={msg.thinkDuration} />
              )}
              {msg.tool_calls && (
                <div className="tool-calls">
                  {msg.tool_calls.map((tc) => (
                    <ToolCall key={tc.id} toolCall={tc} />
                  ))}
                </div>
              )}
              {msg.content && (
                <MarkdownContent className="message-bubble">{msg.content}</MarkdownContent>
              )}
              {!msg.thinking && !msg.tool_calls && !msg.content && (
                <div className="message-logo">
                  <AgentLogo />
                </div>
              )}
            </div>
          )}
          {msg.role === "user" && (
            <div className="message-bubble">{msg.content}</div>
          )}
        </div>
      ))}
      {isLoading && (
        <div className="message assistant loading">
          <AgentLogo animated />
          <span className="thinking-text">Thinking...</span>
        </div>
      )}
      {spacerHeight > 0 && (
        <div className="chat-spacer" style={{ minHeight: spacerHeight }} />
      )}
    </div>
  );
}
