export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Per-browser pseudo-user-id. Replaced by real session id when auth lands.
export function getUserId() {
  let id = localStorage.getItem("task_agents_user_id");
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `user-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    localStorage.setItem("task_agents_user_id", id);
  }
  return id;
}

export function apiFetch(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("X-User-Id", getUserId());
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_URL}${path}`, { ...init, headers });
}
