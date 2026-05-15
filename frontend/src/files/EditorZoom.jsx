import { useCallback, useEffect, useRef, useState } from "react";
import "./EditorZoom.css";

const MIN = 0.5;
const MAX = 3.0;
const STEP = 0.1;

export default function EditorZoom({ fileId, children }) {
  const [scale, setScale] = useState(1);
  const viewportRef = useRef(null);
  const pinchRef = useRef(null); // { startDist, startScale }

  // Reset zoom when the active file changes so each file opens at 100%.
  useEffect(() => {
    setScale(1);
  }, [fileId]);

  const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

  const zoomIn = useCallback(() => setScale((s) => clamp(+(s + STEP).toFixed(2))), []);
  const zoomOut = useCallback(() => setScale((s) => clamp(+(s - STEP).toFixed(2))), []);
  const zoomReset = useCallback(() => setScale(1), []);

  // Cmd/Ctrl-+ / -− / -0 keyboard shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        zoomReset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut, zoomReset]);

  // Two-finger pinch on mobile. We listen at the viewport level so the
  // gesture works anywhere over the editor content, not just on a control.
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { startDist: dist, startScale: scale };
    }
  };

  const onTouchMove = (e) => {
    if (pinchRef.current && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist / pinchRef.current.startDist;
      setScale(clamp(pinchRef.current.startScale * ratio));
    }
  };

  const onTouchEnd = (e) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  // The viewport element needs a non-passive touchmove listener so we can
  // call preventDefault — React's synthetic onTouchMove is passive by default
  // in modern React, so wire it manually.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const handler = (e) => onTouchMove(e);
    node.addEventListener("touchmove", handler, { passive: false });
    return () => node.removeEventListener("touchmove", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  return (
    <div className="editor-zoom-shell">
      <div
        ref={viewportRef}
        className="editor-zoom-viewport"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="editor-zoom-content" style={{ zoom: scale }}>
          {children}
        </div>
      </div>

      <div className="editor-zoom-controls" role="toolbar" aria-label="Zoom">
        <button
          type="button"
          className="editor-zoom-btn"
          onClick={zoomOut}
          disabled={scale <= MIN + 0.001}
          title="Zoom out  ⌘−"
          aria-label="Zoom out"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          className="editor-zoom-label"
          onClick={zoomReset}
          title="Reset zoom  ⌘0"
          aria-label="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          className="editor-zoom-btn"
          onClick={zoomIn}
          disabled={scale >= MAX - 0.001}
          title="Zoom in  ⌘+"
          aria-label="Zoom in"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
