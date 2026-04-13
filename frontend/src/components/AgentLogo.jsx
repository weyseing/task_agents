export default function AgentLogo({ animated = false }) {
  if (animated) {
    return (
      <div className="wave-bars">
        <span /><span /><span /><span /><span />
      </div>
    );
  }

  // Static wave - bars frozen at different heights
  return (
    <div className="wave-bars static">
      <span /><span /><span /><span /><span />
    </div>
  );
}
