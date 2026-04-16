import { useState } from "react";
import "./ToolCall.css";

const TOOL_LABELS = {
  gmail_read: "Read Email",
  gmail_send: "Send Email",
  web_search: "Web Search",
};

function formatArgs(name, args) {
  if (!args) return "";
  switch (name) {
    case "gmail_read":
      if (args.message_id) return `Message ${args.message_id}`;
      return args.query || "in:inbox";
    case "gmail_send":
      return `To: ${args.to}`;
    case "web_search":
      return args.query || "";
    default:
      return Object.entries(args)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
  }
}

function EmailItem({ email }) {
  const [open, setOpen] = useState(false);
  const fromName = email.from?.split("<")[0]?.trim() || email.from;

  return (
    <div className={`email-row ${email.unread ? "unread" : ""}`}>
      <button className="email-row-header" onClick={() => setOpen(!open)}>
        {email.unread && <span className="unread-dot" />}
        <span className="email-from">{fromName}</span>
        <span className="email-subject-text">{email.subject}</span>
        <svg
          className={`email-chevron ${open ? "expanded" : ""}`}
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="email-row-body">
          <div className="email-meta">
            <span>{email.from}</span>
            <span className="email-date">{email.date}</span>
          </div>
          {email.snippet && <div className="email-snippet">{email.snippet}</div>}
          {email.body && <div className="email-body">{email.body}</div>}
        </div>
      )}
    </div>
  );
}

function GmailReadResult({ data }) {
  if (data.type === "email_list") {
    if (data.emails.length === 0) {
      return <div className="email-empty">No emails found for &quot;{data.query}&quot;</div>;
    }
    return (
      <div className="email-list">
        {data.emails.map((email) => (
          <EmailItem key={email.id} email={email} />
        ))}
      </div>
    );
  }

  if (data.type === "email_detail") {
    return <EmailItem email={data.email} />;
  }

  return <pre className="tool-raw">{JSON.stringify(data, null, 2)}</pre>;
}

function GmailSendResult({ data }) {
  return (
    <div className="send-result">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <div>
        <div>Email sent to <strong>{data.to}</strong></div>
        <div className="send-detail">Subject: {data.subject}</div>
      </div>
    </div>
  );
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function getFavicon(url) {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
  } catch {
    return null;
  }
}

function WebSearchResult({ data }) {
  const hasImages = data.images && data.images.length > 0;
  const hasResults = data.results && data.results.length > 0;

  if (!hasImages && !hasResults) {
    return <div className="email-empty">No results found for &quot;{data.query}&quot;</div>;
  }

  return (
    <div className="search-combined">
      {hasImages && (
        <div className="image-carousel">
          {data.images.map((r, i) => (
            <a key={i} className="image-card" href={r.url} target="_blank" rel="noopener noreferrer">
              <img src={r.thumbnail || r.image} alt={r.title} loading="lazy" />
              <div className="image-card-overlay">
                <span>{r.title}</span>
              </div>
            </a>
          ))}
        </div>
      )}
      {hasResults && (
        <div className="search-results">
          {data.results.map((r, i) => (
            <a key={i} className="search-card" href={r.url} target="_blank" rel="noopener noreferrer">
              <div className="search-card-site">
                {getFavicon(r.url) && <img className="search-card-favicon" src={getFavicon(r.url)} alt="" />}
                <span className="search-card-domain">{getDomain(r.url)}</span>
              </div>
              <div className="search-card-title">{r.title}</div>
              <div className="search-card-snippet">{r.snippet}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolResult({ name, data }) {
  if (!data) return null;
  if (data.error) return <div className="tool-error">{data.error}</div>;

  switch (name) {
    case "gmail_read":
      return <GmailReadResult data={data} />;
    case "gmail_send":
      return <GmailSendResult data={data} />;
    case "web_search":
      return <WebSearchResult data={data} />;
    default:
      return <pre className="tool-raw">{JSON.stringify(data, null, 2)}</pre>;
  }
}

export default function ToolCall({ toolCall }) {
  const [expanded, setExpanded] = useState(true);
  const { name, args, status, data } = toolCall;
  const isRunning = status === "running";
  const label = TOOL_LABELS[name] || name;

  // Web search: render result directly without expander wrapper
  if (name === "web_search") {
    if (isRunning) {
      return (
        <div className="tool-call running">
          <div className="tool-call-header">
            <div className="tool-call-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <span className="tool-call-name">{label}</span>
            <span className="tool-call-summary">{formatArgs(name, args)}</span>
            <div className="tool-call-status"><div className="tool-call-spinner" /></div>
          </div>
        </div>
      );
    }
    return data ? <ToolResult name={name} data={data} /> : null;
  }

  // Other tools: standard expander
  return (
    <div className={`tool-call ${isRunning ? "running" : "done"}`}>
      <button className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <div className="tool-call-icon">
          {name.startsWith("gmail") ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 4l-10 8L2 4" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          )}
        </div>
        <span className="tool-call-name">{label}</span>
        <span className="tool-call-summary">{formatArgs(name, args)}</span>
        <div className="tool-call-status">
          {isRunning ? (
            <div className="tool-call-spinner" />
          ) : (
            <svg className="tool-call-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        {!isRunning && (
          <svg
            className={`tool-call-chevron ${expanded ? "expanded" : ""}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      {expanded && !isRunning && data && (
        <div className="tool-call-result">
          <ToolResult name={name} data={data} />
        </div>
      )}
    </div>
  );
}
