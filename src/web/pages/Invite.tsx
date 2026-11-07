import { useEffect, useState } from "react";
import { ROLE_LABELS, type Role } from "../../shared/roles";
import { api, ApiError } from "../api";
import { PublicLayout } from "./Home";
import "./AuthPage.css";
import { Link, navigate, query } from "../router";
import { useSession } from "../session";

export function Invite() {
  const token = query(location.search, "t") ?? "";
  const { me, loading } = useSession();
  const [inv, setInv] = useState<{ memorialName: string; role: Role; email: string }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    api.get<typeof inv>(`/invites/${token}`).then(setInv).catch((e) => setError(e instanceof ApiError ? e.message : "Invalid invitation"));
  }, [token]);
  const signInUrl = inv ? `/signin?email=${encodeURIComponent(inv.email)}&next=${encodeURIComponent(`/invite?t=${token}`)}` : "/signin";
  return (
    <PublicLayout>
      <main className="public-auth public-auth-invite">
        {error ? <p className="error">{error}</p> : !inv || loading ? <p className="muted">Loading…</p> : (
          <div className="public-auth-card stack">
            <h1>Help look after {inv.memorialName}'s page</h1>
            <p>You've been invited as <strong>{ROLE_LABELS[inv.role]}</strong>.</p>
            {me?.email === inv.email ? (
                <button className="home-start public-auth-submit" onClick={async () => {
                  try {
                    const r = await api.post<{ memorialId: string }>(`/invites/${token}/accept`);
                    navigate(`/dashboard/${r.memorialId}`);
                  } catch (e) {
                    setError(e instanceof ApiError ? e.message : "Couldn't accept.");
                  }
                }}>Accept invitation</button>
            ) : (
              <>
                {me && <p className="public-auth-note">You’re signed in as {me.email}. Use {inv.email} to accept this invitation.</p>}
                <Link to={signInUrl} className="home-start public-auth-submit">{me ? "Switch account" : "Sign in to accept"}</Link>
              </>
            )}
          </div>
        )}
      </main>
    </PublicLayout>
  );
}
