export default function AgentLogo({ animated = false, size = 38 }) {
  return (
    <svg
      className={`msg-mark${animated ? " loading" : ""}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
    >
      <circle className="ring r1" cx="50" cy="50" r="34" fill="none" stroke="#DCE7FB" strokeWidth="5" />
      <circle className="ring r2" cx="50" cy="50" r="24" fill="none" stroke="#5C92F5" strokeWidth="5" />
      <circle className="ring r3" cx="50" cy="50" r="14" fill="none" stroke="#3B7BF3" strokeWidth="5" />
      <circle className="core" cx="50" cy="50" r="9" fill="#0F172A" />
    </svg>
  );
}
