import { useState } from "react";
import { api } from "../api";

export function Lock({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/login", { body: { passcode: code } });
      onUnlock();
    } catch (err) {
      setError((err as Error).message);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock">
      <div className="lock-orbs" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <form className={`glass lock-card ${shake ? "shake" : ""}`} onSubmit={submit}>
        <div className="logo-orb big" />
        <h1>Bert Creations</h1>
        <p className="muted">A private studio for dreaming up what's next.</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Passcode"
          aria-label="Passcode"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button className="btn primary wide" disabled={busy}>
          {busy ? "Unlocking…" : "Enter the studio"}
        </button>
      </form>
    </div>
  );
}
