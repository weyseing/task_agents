import { C_BG, C_LINE, C_MUTED, C_MUTED2 } from "../tokens";
import MarkdownEditor from "./MarkdownEditor";
import TextEditor from "./TextEditor";
import SheetEditor from "./SheetEditor";
import DocxEditor from "./DocxEditor";
import PptxViewer from "./PptxViewer";
import PdfViewer from "./PdfViewer";
import ImageViewer from "./ImageViewer";

export default function FileEditor({ file, onChange, onCommitFormula }) {
  if (!file) return <EmptyEditor />;
  if (file.loading) return <LoadingEditor type={file.type} name={file.name} />;
  switch (file.type) {
    case "md":
      return <MarkdownEditor file={file} onChange={onChange} />;
    case "txt":
    case "json":
      return <TextEditor file={file} onChange={onChange} />;
    case "csv":
    case "xlsx":
      return <SheetEditor file={file} onChange={onChange} onCommitFormula={onCommitFormula} />;
    case "docx":
      return <DocxEditor file={file} onChange={onChange} />;
    case "pptx":
      return <PptxViewer file={file} />;
    case "pdf":
      return <PdfViewer file={file} />;
    case "png":
      return <ImageViewer file={file} />;
    default:
      return <TextEditor file={file} onChange={onChange} />;
  }
}

function LoadingEditor({ type, name }) {
  const isSheet = type === "csv" || type === "xlsx";
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: C_BG,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "16px 24px",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: '"Sora", system-ui',
          fontSize: 13,
          color: C_MUTED2,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: `2px solid ${C_LINE}`,
            borderTopColor: "#0F172A",
            animation: "files-spin 0.8s linear infinite",
          }}
        />
        <span>Opening {name || "file"}…</span>
      </div>
      {isSheet ? <SheetSkeleton /> : <BlockSkeleton />}
    </div>
  );
}

function SheetSkeleton() {
  const colCount = 6;
  const rowCount = 14;
  return (
    <div
      aria-hidden="true"
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        background: "#fff",
        border: `1px solid ${C_LINE}`,
        boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 8px 18px -10px rgba(15,23,42,0.12)",
        display: "grid",
        gridTemplateColumns: `repeat(${colCount}, 1fr)`,
      }}
    >
      {Array.from({ length: rowCount * colCount }).map((_, i) => {
        const isHeader = i < colCount;
        return (
          <div
            key={i}
            style={{
              height: 30,
              borderRight: `1px solid ${C_LINE}`,
              borderBottom: `1px solid ${C_LINE}`,
              background: isHeader ? "#F1F4F9" : "#fff",
              padding: "8px 10px",
            }}
          >
            <div
              className="files-skeleton-bar"
              style={{
                height: isHeader ? 8 : 10,
                width: `${40 + ((i * 13) % 50)}%`,
                borderRadius: 4,
                background: "linear-gradient(90deg, #EDF1F7 0%, #DDE3EE 50%, #EDF1F7 100%)",
                backgroundSize: "200% 100%",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function BlockSkeleton() {
  return (
    <div aria-hidden="true" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
      {[88, 64, 92, 70, 80, 55, 88, 72].map((w, i) => (
        <div
          key={i}
          className="files-skeleton-bar"
          style={{
            height: 14,
            width: `${w}%`,
            borderRadius: 6,
            background: "linear-gradient(90deg, #EDF1F7 0%, #DDE3EE 50%, #EDF1F7 100%)",
            backgroundSize: "200% 100%",
          }}
        />
      ))}
    </div>
  );
}


function EmptyEditor() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: C_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ width: 84, height: 84, opacity: 0.18 }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <rect x="8" y="32" width="54" height="54" rx="12" fill="#0F172A" />
          <rect
            x="38"
            y="8"
            width="54"
            height="54"
            rx="12"
            fill="#0F172A"
            opacity="0.15"
            stroke="#0F172A"
            strokeOpacity="0.35"
          />
        </svg>
      </div>
      <div style={{ fontSize: 15, color: C_MUTED, fontFamily: '"Sora", system-ui' }}>
        Select a file to start
      </div>
      <div style={{ fontSize: 12, color: C_MUTED2, fontFamily: '"Sora", system-ui' }}>
        Lumen will help you edit — soon
      </div>
    </div>
  );
}
