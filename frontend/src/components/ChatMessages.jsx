import "./ChatMessages.css";

export default function ChatMessages({ messages, isLoading, messagesEndRef }) {
  return (
    <div className="chat-messages">
      {messages.map((msg, i) => (
        <div key={i} className={`message ${msg.role}`}>
          {msg.role === "assistant" && <div className="message-avatar">TA</div>}
          <div className="message-bubble">{msg.content}</div>
        </div>
      ))}
      {isLoading && (
        <div className="message assistant">
          <div className="message-avatar">TA</div>
          <div className="message-bubble">
            <div className="typing-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
