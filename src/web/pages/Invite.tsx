import { useEffect, useState } from "react";
import { ROLE_LABELS, type Role } from "../../shared/roles";
import { api, ApiError } from "../api";
import { Header } from "../components";
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
  return (
    <>
      <Header minimal />
      <main className="narrow">
        {error ? <p className="error">{error}</p> : !inv || loading ? <p className="muted">Loading…</p> : (
          <div className="card stack">
            <h1>Help look after {inv.memorialName}'s page</h1>
            <p>You've been invited as <strong>{ROLE_LABELS[inv.role]}</strong>.</p>
            {me ? (
              <>
                {me.email !== inv.email && <p className="muted small">You're signed in as {me.email}. The invitation was sent to {inv.email}; you can still accept it.</p>}
                <button className="btn" onClick={async () => {
                  try {
                    const r = await api.post<{ memorialId: string }>(`/invites/${token}/accept`);
                    navigate(`/dashboard/${r.memorialId}`);
                  } catch (e) {
                    setError(e instanceof ApiError ? e.message : "Couldn't accept.");
                  }
                }}>Accept invitation</button>
              </>
            ) : (
              <Link to={`/signin?email=${encodeURIComponent(inv.email)}&next=${encodeURIComponent(`/invite?t=${token}`)}`} className="btn">Sign in to accept</Link>
            )}
          </div>
        )}
      </main>
    </>
  );
}
