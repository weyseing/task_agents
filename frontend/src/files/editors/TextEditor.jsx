import { C_BG, C_INK } from "../tokens";

export default function TextEditor({ file, onChange }) {
  const mono = file.type === "json";
  return (
    <div
      className="files-text-editor"
      style={{
        flex: 1,
        minHeight: 0,
        padding: "40px 56px",
        background: C_BG,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <textarea
        value={file.content}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          resize: "none",
          fontFamily: mono
            ? 'ui-monospace, "SF Mono", Menlo, monospace'
            : '"Sora", system-ui, sans-serif',
          fontSize: mono ? 13.5 : 15,
          lineHeight: mono ? 1.65 : 1.7,
          color: C_INK,
          letterSpacing: mono ? 0 : "-0.005em",
          whiteSpace: "pre-wrap",
        }}
      />
    </div>
  );
}
