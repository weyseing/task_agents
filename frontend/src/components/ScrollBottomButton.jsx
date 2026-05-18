import { useEffect, useState } from "react";

// Floating "scroll to bottom" pill. Subscribes to scroll events on the
// given `targetRef` and shows itself only when the user is more than
// `threshold` pixels from the bottom. Click → smooth-scroll to the end.
//
// `dep` is anything that changes when new content arrives (the messages
// array, isStreaming, etc.) — bumping it re-runs the "near bottom?" check
// so the pill auto-hides when content catches up to the user's position.
export default function ScrollBottomButton({
  targetRef,
  threshold = 80,
  dep,
  style,
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const recompute = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShow(distance > threshold);
    };
    recompute();
    el.addEventListener("scroll", recompute, { passive: true });
    // Layout changes (new messages, font sizing) also matter — watch them.
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(recompute)
        : null;
    if (ro) ro.observe(el);
    return () => {
      el.removeEventListener("scroll", recompute);
      if (ro) ro.disconnect();
    };
    // Intentionally include `dep` so callers can force a recheck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRef, threshold, dep]);

  const onClick = () => {
    const el = targetRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`scroll-bottom-btn${show ? " visible" : ""}`}
      title="Scroll to latest"
      aria-label="Scroll to latest"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      style={style}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}
