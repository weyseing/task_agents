import { useState } from "react";
import { apiFetch } from "../api";
import "./ToolCall.css";

const TOOL_LABELS = {
  gmail_read: "gmail_read",
  gmail_send: "gmail_send",
  web_search: "web_search",
};

function formatArgs(name, args) {
  if (!args) return "";
  switch (name) {
    case "gmail_read":
      if (args.message_id) return `message ${args.message_id}`;
      return args.query ? `"${args.query}"` : "in:inbox";
    case "gmail_send":
      if (args.reply_to_message_id) return "reply draft";
      return args.to ? `draft to: ${args.to}` : "draft";
    case "web_search":
      return args.query ? `"${args.query}"` : "";
    default:
      return Object.entries(args)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : v}`)
        .join(", ");
  }
}

function ToolIcon({ name }) {
  if (name === "web_search") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.5-4.5" />
      </svg>
    );
  }
  if (name?.startsWith("gmail")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M22 4l-10 8L2 4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Status({ status }) {
  if (status === "running") {
    return (
      <span className="tc-status running">
        <span className="dot" />
        running
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="tc-status error">
        <span className="dot" />
        error
      </span>
    );
  }
  return (
    <span className="tc-status">
      <span className="dot" />
      done
    </span>
  );
}

/* ============== Result renderers (preserved) ============== */

function EmailItem({ email }) {
  const [open, setOpen] = useState(false);
  const fromName = email.from?.split("<")[0]?.trim() || email.from;

  return (
    <div className={`email-row${email.unread ? " unread" : ""}`}>
      <button type="button" className="email-row-header" onClick={() => setOpen(!open)}>
        {email.unread && <span className="unread-dot" />}
        <span className="email-from">{fromName}</span>
        <span className="email-subject-text">{email.subject}</span>
        <svg
          className={`email-chevron${open ? " expanded" : ""}`}
          width="12" height="12" viewBox="0 0 24 24"
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
      return <div className="tc-empty">No emails found for &quot;{data.query}&quot;</div>;
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
  // Local UI state: "pending" -> "sending" -> "sent" | "error" | "cancelled"
  const initialState = data.status === "pending_confirmation" ? "pending" : "sent";
  const [state, setState] = useState(initialState);
  const [errorMsg, setErrorMsg] = useState("");
  const [sentTo, setSentTo] = useState(data.to);

  const handleSend = async () => {
    setState("sending");
    setErrorMsg("");
    try {
      const res = await apiFetch("/api/gmail/send", {
        method: "POST",
        body: JSON.stringify({
          to: data.to,
          cc: data.cc,
          bcc: data.bcc,
          subject: data.subject,
          body: data.body,
          thread_id: data.thread_id,
          in_reply_to: data.in_reply_to,
          references: data.references,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Send failed (${res.status})`);
      }
      const result = await res.json();
      setSentTo(result.to || data.to);
      setState("sent");
    } catch (e) {
      setErrorMsg(e.message || "Send failed");
      setState("error");
    }
  };

  const handleCancel = () => setState("cancelled");

  if (state === "sent") {
    return (
      <div className="send-result">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <div>
          <div>
            {data.is_reply ? "Replied to" : "Sent to"} <strong>{sentTo}</strong>
          </div>
          {data.cc && <div className="send-detail">Cc: {data.cc}</div>}
          <div className="send-detail">Subject: {data.subject}</div>
        </div>
      </div>
    );
  }

  if (state === "cancelled") {
    return <div className="tc-empty">Draft discarded.</div>;
  }

  // Pending / sending / error — show draft + buttons
  return (
    <div className="send-draft">
      <div className="send-draft-header">
        {data.is_reply ? "Reply draft" : "Email draft"}
      </div>
      <div className="send-draft-fields">
        <div className="send-draft-row">
          <span className="k">To</span>
          <span className="v">{data.to}</span>
        </div>
        {data.cc && (
          <div className="send-draft-row">
            <span className="k">Cc</span>
            <span className="v">{data.cc}</span>
          </div>
        )}
        {data.bcc && (
          <div className="send-draft-row">
            <span className="k">Bcc</span>
            <span className="v">{data.bcc}</span>
          </div>
        )}
        <div className="send-draft-row">
          <span className="k">Subject</span>
          <span className="v">{data.subject}</span>
        </div>
      </div>
      <div className="send-draft-body">{data.body}</div>
      {state === "error" && <div className="tc-error">{errorMsg}</div>}
      <div className="send-draft-actions">
        <button
          type="button"
          className="send-draft-btn cancel"
          onClick={handleCancel}
          disabled={state === "sending"}
        >
          Cancel
        </button>
        <button
          type="button"
          className="send-draft-btn primary"
          onClick={handleSend}
          disabled={state === "sending"}
        >
          {state === "sending" ? "Sending…" : state === "error" ? "Retry" : "Send"}
        </button>
      </div>
    </div>
  );
}

function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}
function getFavicon(url) {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
  } catch { return null; }
}

function WebSearchResult({ data }) {
  const hasImages = data.images && data.images.length > 0;
  const hasResults = data.results && data.results.length > 0;
  if (!hasImages && !hasResults) {
    return <div className="tc-empty">No results found for &quot;{data.query}&quot;</div>;
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
        <div className="tc-results">
          {data.results.map((r, i) => (
            <a key={i} className="tc-result" href={r.url} target="_blank" rel="noopener noreferrer">
              <span className="tc-rank">{i + 1}</span>
              <div className="tc-body-text">
                <div className="tc-title">{r.title}</div>
                <div className="tc-source">
                  {getFavicon(r.url) && <img className="tc-favicon" src={getFavicon(r.url)} alt="" />}
                  {getDomain(r.url)}
                </div>
                {r.snippet && <div className="tc-snippet">{r.snippet}</div>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolResult({ name, data }) {
  if (!data) return null;
  if (data.error) return <div className="tc-error">{data.error}</div>;
  switch (name) {
    case "gmail_read": return <GmailReadResult data={data} />;
    // gmail_send: the interactive draft widget is rendered OUTSIDE the
    // tool-call box (see ToolCall below). The box itself shows raw JSON
    // for inspection — single source of state lives in the widget.
    case "gmail_send": return <pre className="tool-raw">{JSON.stringify(data, null, 2)}</pre>;
    case "web_search": return <WebSearchResult data={data} />;
    default: return <pre className="tool-raw">{JSON.stringify(data, null, 2)}</pre>;
  }
}

function ArgsInput({ name, args }) {
  if (!args || Object.keys(args).length === 0) return null;
  const longestKey = Math.max(...Object.keys(args).map((k) => k.length));
  return (
    <div className="tc-input">
      {Object.entries(args).map(([k, v]) => (
        <div key={k} className="tc-input-row">
          <span className="k">{k.padEnd(longestKey, " ")}</span>
          <span className="v">
            {typeof v === "string" ? `"${v}"` : JSON.stringify(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ToolCall({ toolCall }) {
  const [open, setOpen] = useState(false);
  const { id, name, args, status, data } = toolCall;
  const isRunning = status === "running";
  const isError = status === "error" || data?.error;
  const label = TOOL_LABELS[name] || name;

  const toolcallBox = (
    <details
      className="toolcall"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <span className="tc-icon"><ToolIcon name={name} /></span>
        <span className="tc-meta">
          <span className="tc-badge">TOOL</span>
          <span className="tc-name">{label}</span>
          {formatArgs(name, args) && (
            <span className="tc-arg">· {formatArgs(name, args)}</span>
          )}
        </span>
        <Status status={isError ? "error" : status} />
        <span className="tc-chevron"><ChevronIcon /></span>
      </summary>
      <div className="tc-body">
        {args && Object.keys(args).length > 0 && (
          <div>
            <div className="tc-section-label">Input</div>
            <ArgsInput name={name} args={args} />
          </div>
        )}
        {!isRunning && data && (
          <div>
            <div className="tc-section-label">Output</div>
            <ToolResult name={name} data={data} />
          </div>
        )}
        {id && (
          <div className="tc-foot">
            <span>tool_id: {id}</span>
            <span>{isRunning ? "in progress" : isError ? "error" : "done"}</span>
          </div>
        )}
      </div>
    </details>
  );

  // For gmail_send, also surface the interactive draft widget as a
  // primary chat element so the user can click Send/Cancel without
  // having to expand the tool-call box.
  if (name === "gmail_send" && !isError) {
    return (
      <>
        {toolcallBox}
        {isRunning || !data ? (
          <div className="draft-preparing">Preparing draft…</div>
        ) : (
          <GmailSendResult data={data} />
        )}
      </>
    );
  }

  return toolcallBox;
}
