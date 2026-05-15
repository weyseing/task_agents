// Shared visual tokens for the Lumen Files page.
// Mirrors the values in :root in index.css (kept inline for fast access from JSX).

export const C_INK = "#0F172A";
export const C_INK2 = "#334155";
export const C_MUTED = "#7B8597";
export const C_MUTED2 = "#9AA3B2";
export const C_LINE = "#E4E9F1";
export const C_LINE_SOFT = "#EEF1F6";
export const C_BG = "#FFFFFF";
export const C_PAGE = "#EEF1F6";
export const C_SIDEBAR = "#F8FAFD";
export const C_CANVAS = "#F8FAFD";
export const C_SURFACE2 = "#EEF1F6";
export const C_SURFACE3 = "#E4E9F1";
export const C_EASE = "cubic-bezier(.22,.61,.36,1)";

// All file types render in a single muted slate — the label text itself
// ("MD", "PDF", "CSV") is the signal. No color coding, so the tree reads
// as one quiet column.
const TYPE_LABEL_TONE = "#9098A6";
export const TYPE_META = {
  md: { label: "MD", tone: TYPE_LABEL_TONE },
  txt: { label: "TXT", tone: TYPE_LABEL_TONE },
  json: { label: "JSON", tone: TYPE_LABEL_TONE },
  csv: { label: "CSV", tone: TYPE_LABEL_TONE },
  xlsx: { label: "XLSX", tone: TYPE_LABEL_TONE },
  docx: { label: "DOC", tone: TYPE_LABEL_TONE },
  pptx: { label: "PPT", tone: TYPE_LABEL_TONE },
  pdf: { label: "PDF", tone: TYPE_LABEL_TONE },
  png: { label: "PNG", tone: TYPE_LABEL_TONE },
  jpg: { label: "JPG", tone: TYPE_LABEL_TONE },
  svg: { label: "SVG", tone: TYPE_LABEL_TONE },
};
