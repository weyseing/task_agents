import { useRef, useEffect, useLayoutEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AgentLogo from "./AgentLogo";
import ToolCall from "./ToolCall";
import "./ChatMessages.css";

function CodeBlock({ inline, className, children, ...rest }) {
  if (inline) {
    return <code className={className} {...rest}>{children}</code>;
  }
  const lang = /language-(\w+)/.exec(className || "")?.[1];
  return (
    <pre className="codeblock">
      {lang && <span className="codeblock-label">{lang}</span>}
      <code className={className} {...rest}>{children}</code>
    </pre>
  );
}

function TableWrap({ children }) {
  // Wrap markdown tables in a horizontally-scrollable container so wide
  // tables don't push the whole chat sideways on mobile. `overscroll-behavior:
  // contain` keeps the scroll chain from bubbling to the page when the user
  // hits either edge of the table.
  return (
    <div className="reply-table-scroll">
      <table>{children}</table>
    </div>
  );
}

const markdownComponents = {
  code: CodeBlock,
  table: TableWrap,
};

function ActionButton({ title, onClick, children }) {
  return (
    <button type="button" className="action-btn" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  );
}
function ThumbIcon({ rotate }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={rotate ? { transform: "rotate(180deg)" } : undefined}>
      <path d="M14 9V5a3 3 0 00-6 0v4H5a2 2 0 00-2 2v8a2 2 0 002 2h11.28a2 2 0 002-1.7l1.38-9A2 2 0 0017.66 9H14z" />
    </svg>
  );
}
function RegenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0115-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 01-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function currentStep(msg) {
  const last = msg?.steps && msg.steps.length > 0 ? msg.steps[msg.steps.length - 1] : null;
  if (last) return { n: last.n, label: last.label };
  // Fall back to derived state if backend hasn't emitted a step yet
  if (msg?.tool_calls && msg.tool_calls.length > 0) {
    const running = msg.tool_calls.find((tc) => tc.status === "running");
    if (running) return { n: msg.tool_calls.length, label: `Calling ${running.name}` };
    return { n: msg.tool_calls.length, label: "Composing" };
  }
  return { n: 1, label: "Thinking" };
}

function shimmerLabel(label) {
  if (!label) return "Thinking";
  if (label.startsWith("Calling")) return "Using tool";
  return label;
}

function StepMeta({ message }) {
  const { n, label } = currentStep(message);
  return (
    <div className="thinking-meta">
      <span>step {n} ·</span>
      <span className="stage">{label.toLowerCase()}</span>
    </div>
  );
}

function ThinkingRow({ message }) {
  const { label } = currentStep(message);
  return (
    <div className="thinking">
      <span className="think-shimmer">{shimmerLabel(label)}</span>
      <span className="think-dots"><span /><span /><span /></span>
    </div>
  );
}

function AssistantMessage({ msg }) {
  const hasContent = !!msg.content;
  const hasTools = msg.tool_calls && msg.tool_calls.length > 0;
  const isPending = !hasContent && (msg.isThinking || msg.tool_calls?.some((tc) => tc.status === "running"));
  const animateLogo = isPending && !hasContent;

  const handleCopy = () => {
    if (msg.content) navigator.clipboard?.writeText(msg.content).catch(() => {});
  };

  return (
    <div className="msg assistant">
      <AgentLogo animated={animateLogo} />
      <div className="assistant-block">
        <div className="assistant-name">Lumen</div>
        <div className="reply">
          {hasTools && msg.tool_calls.map((tc) => <ToolCall key={tc.id} toolCall={tc} />)}
          {hasContent && (
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {msg.content}
            </Markdown>
          )}
          {isPending && (
            <>
              <ThinkingRow message={msg} />
              <StepMeta message={msg} />
            </>
          )}
        </div>
        {hasContent && (
          <div className="actions">
            <ActionButton title="Copy" onClick={handleCopy}><CopyIcon /></ActionButton>
            <ActionButton title="Good"><ThumbIcon /></ActionButton>
            <ActionButton title="Bad"><ThumbIcon rotate /></ActionButton>
            <ActionButton title="Regenerate"><RegenIcon /></ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="msg assistant enter">
      <AgentLogo animated />
      <div className="assistant-block">
        <div className="assistant-name">Lumen</div>
        <div className="thinking">
          <span className="think-shimmer">Thinking</span>
          <span className="think-dots"><span /><span /><span /></span>
        </div>
        <div className="thinking-meta">
          <span>step 1 ·</span>
          <span className="stage">reading prior context</span>
        </div>
      </div>
    </div>
  );
}

import ScrollBottomButton from "./ScrollBottomButton";

// Render only the most recent N messages by default; the user can expand
// to load older ones. Markdown + tool pills are heavy enough that letting
// the DOM grow unbounded on a long thread visibly lags streaming.
const MESSAGE_WINDOW = 30;

export default function ChatMessages({ messages, isLoading, isStreaming, lastUserRef }) {
  const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
  const containerRef = useRef(null);
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [showAll, setShowAll] = useState(false);
  // Anchor pre-expand scroll metrics so we can restore viewport position
  // after older messages mount in (Slack-style).
  const scrollAnchorRef = useRef(null);
  // Reset the window whenever the conversation actually changes (length
  // dropped or first user message id swapped). Keep it expanded as new
  // messages stream in.
  const firstId = messages[0]?.id ?? messages[0]?.content;
  useEffect(() => {
    setShowAll(false);
  }, [firstId]);

  const hiddenCount = Math.max(0, messages.length - MESSAGE_WINDOW);
  const visibleStart = showAll ? 0 : hiddenCount;
  const visibleMessages = messages.slice(visibleStart);

  // Auto-expand when the user scrolls within 80px of the top of the
  // windowed view. Mirrors Slack/Telegram "infinite scroll up" UX.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || showAll || hiddenCount === 0) return;
    const onScroll = () => {
      if (el.scrollTop < 80) {
        scrollAnchorRef.current = {
          prevScrollHeight: el.scrollHeight,
          prevScrollTop: el.scrollTop,
        };
        setShowAll(true);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [showAll, hiddenCount]);

  // After older messages mount, keep the visual anchor where it was so
  // the user isn't jolted to the top of the freshly-mounted history.
  useLayoutEffect(() => {
    if (!showAll || !scrollAnchorRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const { prevScrollHeight, prevScrollTop } = scrollAnchorRef.current;
    el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
    scrollAnchorRef.current = null;
  }, [showAll]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading, isStreaming]);

  return (
    <div className="chat-messages-wrap">
      <div className="conv chat-messages" ref={containerRef}>
        <div className="conv-inner">
          {hiddenCount > 0 && !showAll && (
            <button
              type="button"
              className="chat-show-older"
              onClick={() => {
                const el = containerRef.current;
                if (el) {
                  scrollAnchorRef.current = {
                    prevScrollHeight: el.scrollHeight,
                    prevScrollTop: el.scrollTop,
                  };
                }
                setShowAll(true);
              }}
            >
              Show {hiddenCount} earlier message{hiddenCount === 1 ? "" : "s"}
            </button>
          )}
          {visibleMessages.map((msg, i) => {
            const absoluteIdx = visibleStart + i;
            const isLastUser =
              msg.role === "user" && absoluteIdx === lastUserIndex;
            if (msg.role === "user") {
              return (
                <div key={absoluteIdx} className="msg user" ref={isLastUser ? lastUserRef : null}>
                  <div className="bubble">{msg.content}</div>
                </div>
              );
            }
            return <AssistantMessage key={absoluteIdx} msg={msg} />;
          })}
          {isLoading && <LoadingBubble />}
          {spacerHeight > 0 && <div className="chat-spacer" style={{ minHeight: spacerHeight }} />}
        </div>
      </div>
      <ScrollBottomButton
        targetRef={containerRef}
        dep={`${messages.length}:${isStreaming ? 1 : 0}`}
      />
    </div>
  );
}
