import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LumenSvgDefs from "./components/LumenSvgDefs";
import "./index.css";

// Block iOS Safari pinch / double-tap zoom — the viewport meta's
// `user-scalable=no` is ignored on iOS 10+, so we also block gesture events
// and double-tap timing at the document level.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener("gestureend", (e) => e.preventDefault());

let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LumenSvgDefs />
    <App />
  </React.StrictMode>
);
