export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function apiFetch(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
}
