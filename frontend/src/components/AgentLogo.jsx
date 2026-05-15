export default function AgentLogo({ animated = false, size = 38 }) {
  return (
    <svg
      className={`msg-mark${animated ? " loading" : ""}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
    >
      {/* Back tile: opaque ink — anchors the mark */}
      <rect
        className="tile tile-back"
        x="8"
        y="32"
        width="54"
        height="54"
        rx="12"
        fill="#0F172A"
      />

      {/* Front tile: vertical glass gradient, dark outer border */}
      <rect
        className="tile tile-front"
        x="38"
        y="8"
        width="54"
        height="54"
        rx="12"
        fill="url(#lumen-glass)"
        stroke="rgba(15,23,42,0.22)"
        strokeWidth="1"
      />

      {/* Sheen group, clipped to the front-tile shape */}
      <g className="tile tile-shine" clipPath="url(#lumen-front-clip)">
        {/* Soft top glow */}
        <ellipse cx="62" cy="14" rx="32" ry="11" fill="rgba(255,255,255,0.55)" />
        {/* Sharp rim sliver */}
        <rect x="46" y="14" width="22" height="1.6" rx="0.8" fill="rgba(255,255,255,0.95)" />
      </g>

      {/* Inner white rim outline (offset inside the front tile) */}
      <rect
        className="tile tile-rim"
        x="38.6"
        y="8.6"
        width="52.8"
        height="52.8"
        rx="11.5"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="0.8"
        pointerEvents="none"
      />
    </svg>
  );
}
