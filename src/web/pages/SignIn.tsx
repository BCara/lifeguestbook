import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Link, query } from "../router";
import { PublicLayout } from "./Home";
import "./AuthPage.css";

export function SignIn() {
  const next = query(location.search, "next") ?? "/dashboard";
  const expired = query(location.search, "expired");
  const [email, setEmail] = useState(query(location.search, "email") ?? "");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"google" | "email">();
  const [google, setGoogle] = useState<{ signIn?: () => Promise<string>; unavailable?: boolean }>({});

  useEffect(() => {
    let active = true;
    import("../google-sign-in").then(({ loadGoogleSignIn }) => loadGoogleSignIn()).then(
      (signIn) => { if (active) setGoogle({ signIn }); },
      () => { if (active) setGoogle({ unavailable: true }); },
    );
    return () => { active = false; };
  }, []);

  async function continueWithGoogle() {
    if (!google.signIn) return;
    setBusy("google");
    setError(undefined);
    try {
      const idToken = await google.signIn();
      const result = await api.post<{ next: string }>("/auth/google", { idToken, next });
      location.assign(result.next);
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? err.code : undefined;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError(err instanceof ApiError ? err.message : code === "auth/popup-blocked"
          ? "Your browser blocked the Google window. Allow pop-ups and try again."
          : "Google sign-in is unavailable right now. Try again or use your email.");
      }
      setBusy(undefined);
    }
  }

  return (
    <PublicLayout>
      <main className="public-auth">
        <section className="public-auth-intro">
          <p className="public-auth-kicker">Your guestbooks</p>
          <h1>{sent ? "Check your inbox" : "Sign in to Life Guestbook"}</h1>
          <p>{sent ? "Your sign-in link is on its way." : "Create a guestbook, invite family to help, and keep all the memories in one place."}</p>
          <p className="public-auth-guest">Here to leave a memory? Open the link or scan the QR code the family shared with you.</p>
        </section>
        <section className="public-auth-card" aria-label={sent ? "Email sent" : "Sign-in options"}>
          {expired && !sent && <p className="notice">That link has expired. You can request a new one below.</p>}
          {sent ? (
            <div className="stack">
              <h2>Open your sign-in link</h2>
              <p role="status">We sent a link to <strong>{email}</strong>. Open it on this device to continue. It expires in 30 minutes.</p>
              <p className="public-auth-note">If it doesn’t arrive, check spam or try again.</p>
              {devLink && <p className="dev">Local test <a href={devLink}>Open the sign-in link</a></p>}
              <button type="button" className="public-auth-secondary" onClick={() => { setSent(false); setError(undefined); }}>Use another email or send again</button>
            </div>
          ) : (
            <>
              <button type="button" className="public-auth-secondary public-auth-google" disabled={!google.signIn || !!busy} onClick={() => void continueWithGoogle()}>
                <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
                  <path fill="#4285f4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.5 6.1-8.7 6.1-14.9Z"/>
                  <path fill="#34a853" d="M24 44c5.5 0 10.1-1.8 13.5-4.6l-6.6-5a12.4 12.4 0 0 1-18.5-6.5H5.6v5.2A20 20 0 0 0 24 44Z"/>
                  <path fill="#fbbc05" d="M12.4 27.9a12 12 0 0 1 0-7.8v-5.2H5.6a20 20 0 0 0 0 18.2l6.8-5.2Z"/>
                  <path fill="#ea4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9A19.2 19.2 0 0 0 24 4 20 20 0 0 0 5.6 14.9l6.8 5.2A12 12 0 0 1 24 11.9Z"/>
                </svg>
                {busy === "google" ? "Opening Google…" : "Continue with Google"}
              </button>
              {google.unavailable && <p className="public-auth-note">Google sign-in is unavailable on this address. You can use your email below.</p>}
              <div className="public-auth-divider">or use email</div>
              <form className="stack" onSubmit={async (event) => {
                event.preventDefault();
                setBusy("email");
                setError(undefined);
                try {
                  const result = await api.post<{ devLink?: string }>("/auth/email", { email, next });
                  setDevLink(result.devLink);
                  setSent(true);
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "We couldn’t send a link. Please try again.");
                } finally {
                  setBusy(undefined);
                }
              }}>
                <label>Email address
                  <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" />
                </label>
                {error && <p role="alert" className="error">{error}</p>}
                <button className="home-start public-auth-submit" disabled={!!busy}>{busy === "email" ? "Sending…" : "Email me a sign-in link"}</button>
                <p className="public-auth-note">New here? Sign in either way to get started. <Link to="/privacy">Privacy</Link></p>
              </form>
            </>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}
