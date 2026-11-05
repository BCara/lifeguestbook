import { useState } from "react";
import { api, ApiError } from "../api";
import { Header } from "../components";
import { query } from "../router";

export function SignIn() {
  const next = query(location.search, "next") ?? "/dashboard";
  const expired = query(location.search, "expired");
  const [email, setEmail] = useState(query(location.search, "email") ?? "");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Header minimal />
      <main className="narrow">
        <h1>Sign in</h1>
        {expired && <p className="notice">That link has expired. We'll send you a new one.</p>}
        {sent ? (
          <div className="card">
            <p>We've emailed a sign-in link to <strong>{email}</strong>. Open it on this device to continue.</p>
            {devLink && (
              <p className="dev">
                Local test: <a href={devLink}>open the sign-in link</a>
              </p>
            )}
          </div>
        ) : (
          <form
            className="card stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              try {
                const r = await api.post<{ devLink?: string }>("/auth/email", { email, next });
                setDevLink(r.devLink);
                setSent(true);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Something went wrong.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Your email
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
            <p className="muted small">No password needed. Guests sharing memories never need to sign in.</p>
          </form>
        )}
      </main>
    </>
  );
}
