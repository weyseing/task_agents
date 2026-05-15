// Shared SVG defs (gradients + clip path) referenced by AgentLogo across the
// app. Lives once in the React tree so every AgentLogo can `url(#lumen-glass)`
// without duplicating the gradient. Rendered absolutely-positioned at 0x0 so
// it doesn't affect layout.
export default function LumenSvgDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="lumen-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="lumen-glass-highlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id="lumen-front-clip">
          <rect x="38" y="8" width="54" height="54" rx="12" />
        </clipPath>
      </defs>
    </svg>
  );
}
