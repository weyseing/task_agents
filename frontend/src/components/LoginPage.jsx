import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import "./LoginPage.css";

export default function LoginPage({ onSignedIn }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (res.ok) {
        const user = await res.json();
        onSignedIn(user);
        return true;
      }
    } catch {}
    return false;
  }, [onSignedIn]);

  const signIn = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/google/start");
      const { auth_url } = await res.json();
      if (!auth_url) throw new Error("No auth_url returned");

      popupRef.current = window.open(
        auth_url,
        "google-sso",
        "width=520,height=640,menubar=no,toolbar=no"
      );

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const ok = await checkSession();
        const closed = popupRef.current?.closed;
        if (ok || closed) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.close();
          }
          setBusy(false);
        }
      }, 1000);
    } catch (err) {
      setError(err.message || "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/favicon.png" alt="" className="login-logo" />
        <h1 className="login-title">Task Agents</h1>
        <p className="login-subtitle">
          Sign in to continue. Gmail access is included so the assistant can
          read and send mail on your behalf.
        </p>
        <button
          type="button"
          className="login-google-btn"
          onClick={signIn}
          disabled={busy}
        >
          <GoogleIcon />
          {busy ? "Opening Google…" : "Sign in with Google"}
        </button>
        {error && <p className="login-error">{error}</p>}
        <p className="login-hint">
          You may see a "Google hasn't verified this app" notice — click
          Advanced and continue.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41.5 35.6 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
