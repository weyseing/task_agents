// API client for the Lumen Files page.
// Tree shape mirrors what the backend returns:
//   { id, name, kind: "folder"|"file", type?, children?: [...] }
// Files have no `content` in the tree — content is fetched on open.

import { apiFetch } from "../api";

export async function loadTree() {
  const r = await apiFetch("/api/files");
  if (!r.ok) throw new Error(`loadTree failed: ${r.status}`);
  return r.json();
}

export async function loadContent(fileId) {
  const r = await apiFetch(`/api/files/${fileId}/content`);
  if (!r.ok) throw new Error(`loadContent failed: ${r.status}`);
  const { content } = await r.json();
  return content;
}

export async function saveContent(fileId, content) {
  const r = await apiFetch(`/api/files/${fileId}/content`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
  if (!r.ok) throw new Error(`saveContent failed: ${r.status}`);
  return r.json();
}

export async function createFile({ name, kind, type, parentId = null, content = "" }) {
  const r = await apiFetch("/api/files", {
    method: "POST",
    body: JSON.stringify({ name, kind, type, parent_id: parentId, content }),
  });
  if (!r.ok) throw new Error(`createFile failed: ${r.status}`);
  return r.json();
}

export async function deleteFile(fileId) {
  const r = await apiFetch(`/api/files/${fileId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`deleteFile failed: ${r.status}`);
  return r.json();
}

// Multipart upload. `files` is a FileList or array of File. Backend
// only accepts .csv and .xlsx — anything else lands in `skipped`.
export async function uploadFiles(files, parentId = null) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  if (parentId) fd.append("parent_id", parentId);
  const r = await apiFetch("/api/files/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`upload failed: ${r.status}`);
  return r.json();
}

// --- Pure helpers ---

export function fsFind(node, id) {
  if (node.id === id) return node;
  if (node.children) {
    for (const c of node.children) {
      const r = fsFind(c, id);
      if (r) return r;
    }
  }
  return null;
}

// Find the first file (depth-first) for default-open behavior.
export function fsFirstFile(node) {
  if (node.kind === "file") return node;
  if (node.children) {
    for (const c of node.children) {
      const r = fsFirstFile(c);
      if (r) return r;
    }
  }
  return null;
}
