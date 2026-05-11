import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import "./GmailConnect.css";

export default function GmailConnect() {
  const [status, setStatus] = useState({ loaded: false, connected: false, email: null });
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);
  const popupRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/gmail/status");
      const data = await res.json();
      setStatus({ loaded: true, connected: !!data.connected, email: data.email });
      return !!data.connected;
    } catch {
      setStatus((s) => ({ ...s, loaded: true }));
      return false;
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/gmail/oauth/start");
      const { auth_url } = await res.json();
      if (!auth_url) throw new Error("No auth_url returned");

      popupRef.current = window.open(
        auth_url,
        "gmail-oauth",
        "width=520,height=640,menubar=no,toolbar=no"
      );

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const connected = await refresh();
        const closed = popupRef.current?.closed;
        if (connected || closed) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.close();
          }
          setBusy(false);
        }
      }, 1000);
    } catch (err) {
      console.error(err);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    if (!window.confirm("Disconnect Gmail from this account?")) return;
    setBusy(true);
    try {
      await apiFetch("/api/gmail/disconnect", { method: "POST" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!status.loaded) return null;

  return (
    <div className="gmail-connect">
      {status.connected ? (
        <>
          <div className="gmail-connect-row">
            <span className="gmail-connect-icon" aria-hidden>✓</span>
            <span className="gmail-connect-email" title={status.email}>
              {status.email}
            </span>
          </div>
          <button
            type="button"
            className="gmail-connect-btn secondary"
            onClick={disconnect}
            disabled={busy}
          >
            Disconnect Gmail
          </button>
        </>
      ) : (
        <button
          type="button"
          className="gmail-connect-btn"
          onClick={connect}
          disabled={busy}
        >
          {busy ? "Connecting…" : "Connect Gmail"}
        </button>
      )}
    </div>
  );
}
