import { useEffect, useState } from "react";
import "./LoadingScreen.css";

export default function LoadingScreen() {
  const [phase, setPhase] = useState("loading");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("slow"), 2500);
    const t2 = setTimeout(() => setPhase("cold"), 7000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const message =
    phase === "cold"
      ? "Still warming up. The server spins down when idle — this only takes a few more seconds."
      : phase === "slow"
      ? "Waking the server…"
      : "Loading";

  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-mark" aria-hidden="true">
          <svg viewBox="0 0 100 100" width="64" height="64">
            <rect
              className="loading-tile-back"
              x="8"
              y="32"
              width="54"
              height="54"
              rx="12"
              fill="#0F172A"
            />
            <rect
              className="loading-tile-front"
              x="38"
              y="8"
              width="54"
              height="54"
              rx="12"
              fill="#0F172A"
              opacity="0.18"
              stroke="#0F172A"
              strokeOpacity="0.35"
            />
          </svg>
        </div>

        <div className="loading-wordmark">Lumen</div>

        <div className="loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className={`loading-status loading-status-${phase}`}>{message}</div>
      </div>

      <div className="loading-footer">Internal · WFH Group</div>
    </div>
  );
}
