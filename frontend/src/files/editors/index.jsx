import { C_BG, C_LINE, C_MUTED, C_MUTED2 } from "../tokens";
import { FileChip } from "../FileChip";
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
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: C_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          fontFamily: '"Sora", system-ui',
          animation: "files-loader-in 0.18s ease both",
        }}
      >
        <FileChip type={type} size={26} />
        <div
          style={{
            fontSize: 13,
            color: "#0F172A",
            fontWeight: 500,
            maxWidth: 320,
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={name}
        >
          {name || "file"}
        </div>
        <div
          aria-hidden="true"
          style={{
            width: 160,
            height: 2,
            borderRadius: 2,
            background: C_LINE,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "40%",
              borderRadius: 2,
              background: "#0F172A",
              animation: "files-progress-slide 1.1s ease-in-out infinite",
            }}
          />
        </div>
        <div style={{ fontSize: 11.5, color: C_MUTED2, letterSpacing: "0.02em" }}>
          Opening…
        </div>
      </div>
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
