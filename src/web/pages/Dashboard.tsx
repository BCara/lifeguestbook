import { useEffect, useState } from "react";
import { ROLE_LABELS } from "../../shared/roles";
import type { MemorialAdmin } from "../../shared/types";
import { api } from "../api";
import { Header, lifeDates, RequireSignIn } from "../components";
import { Link } from "../router";

export function Dashboard() {
  return (
    <RequireSignIn>
      <DashboardInner />
    </RequireSignIn>
  );
}

function DashboardInner() {
  const [list, setList] = useState<MemorialAdmin[]>();
  useEffect(() => {
    api.get<{ memorials: MemorialAdmin[] }>("/memorials").then((r) => setList(r.memorials));
  }, []);
  return (
    <>
      <Header />
      <main className="wide">
        <div className="row between wrap">
          <h1>Your pages</h1>
          <Link to="/new" className="btn">Create a page</Link>
        </div>
        {!list ? (
          <p className="muted">Loading…</p>
        ) : list.length === 0 ? (
          <div className="card">
            <p>You don't look after any pages yet.</p>
            <Link to="/new" className="btn">Create the first one</Link>
          </div>
        ) : (
          <div className="grid">
            {list.map((m) => (
              <Link key={m.id} to={`/dashboard/${m.id}`} className="card memorial-card">
                {m.coverUrl ? <img src={m.coverUrl} alt="" /> : <div className="cover-placeholder">{m.name[0]}</div>}
                <div>
                  <h3>{m.name}</h3>
                  <p className="muted small">{lifeDates(m.born, m.died)} {m.mode === "living" ? "· Living Legacy" : ""}</p>
                  <p className="small">
                    {ROLE_LABELS[m.role]} · {m.counts.approved} memories
                    {m.counts.pending > 0 && <strong className="badge">{m.counts.pending} to review</strong>}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
