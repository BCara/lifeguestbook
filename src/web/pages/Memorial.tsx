import { useEffect, useMemo, useState } from "react";
import { can, type Role } from "../../shared/roles";
import type { ContributionView, MemorialPublic } from "../../shared/types";
import { api, ApiError } from "../api";
import { Footer, Header, lifeDates } from "../components";
import { Link } from "../router";
import { Media } from "./Manage";

export function MemorialPage({ slug }: { slug: string }) {
  const [data, setData] = useState<{ memorial: MemorialPublic; role: Role | null; contributions: ContributionView[] }>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<ContributionView>();
  useEffect(() => {
    api.get<typeof data>(`/m/${slug}`).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this page."));
  }, [slug]);
  const eras = useMemo(() => [...new Set((data?.contributions ?? []).map((c) => c.era).filter(Boolean) as string[])].sort(), [data]);
  if (error) return (<><Header /><main className="narrow"><p>{error}</p></main></>);
  if (!data) return <div className="page-center muted">Loading…</div>;
  const { memorial: m, contributions } = data;
  const shown = contributions.filter((c) => filter === "all" || (filter === "photos" ? c.type === "photo" || c.type === "video" : filter === "words" ? !!c.text : c.era === filter));
  const s = m.service;
  return (
    <>
      <Header />
      <main className="memorial">
        <section className="memorial-hero">
          {m.coverUrl && <img src={m.coverUrl} alt={m.name} className="memorial-cover" />}
          <div>
            {m.mode === "memorial" && <p className="eyebrow">In loving memory</p>}
            <h1>{m.name}</h1>
            <p className="dates">{lifeDates(m.born, m.died)}</p>
            {m.intro && <p className="lead">{m.intro}</p>}
            <div className="row gap wrap">
              {m.allowance.acceptingContributions && <Link to={`/m/${m.slug}/add`} className="btn">Add a memory</Link>}
              {can(data.role, "view_dashboard") && <Link to={`/dashboard/${m.id}`} className="btn secondary">Manage page</Link>}
            </div>
          </div>
        </section>
        {s && (s.date || s.place) && (
          <section className="card service">
            <h3>{m.mode === "memorial" ? "The service" : "Celebration"}</h3>
            <p>{s.date && new Date(s.date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{s.time && ` at ${s.time}`}</p>
            {s.place && <p>{s.place}</p>}
            {s.livestreamUrl && <p><a href={s.livestreamUrl} target="_blank" rel="noreferrer">Watch the livestream</a></p>}
          </section>
        )}
        {m.story && (
          <section className="story">
            <h2>Life story</h2>
            {m.story.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </section>
        )}
        <section>
          <div className="row between wrap">
            <h2>Memories <span className="muted">({contributions.length})</span></h2>
            <div className="segmented small">
              {["all", "photos", "words", ...eras].map((f) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="card empty">
              <p>No memories yet. Be the first to share a photo or a story.</p>
              {m.allowance.acceptingContributions && <Link to={`/m/${m.slug}/add`} className="btn">Add a memory</Link>}
            </div>
          ) : (
            <div className="masonry">
              {shown.map((c) => (
                <article key={c.id} className="memory" onClick={() => c.type === "photo" && setOpen(c)}>
                  <Media c={c} />
                  {c.text && <p className="memory-text">{c.text}</p>}
                  <p className="byline">{c.authorName}{c.relation && <span className="muted"> · {c.relation}</span>}{c.era && <span className="muted"> · {c.era}</span>}</p>
                  <button className="report" title="Report this" onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm("Report this to the family? It will be hidden until they review it.")) return;
                    const r = await api.post<{ message: string }>(`/m/${m.slug}/contributions/${c.id}/report`);
                    alert(r.message);
                  }}>⚑</button>
                </article>
              ))}
            </div>
          )}
        </section>
        {open && (
          <div className="lightbox" onClick={() => setOpen(undefined)}>
            <img src={open.mediaUrl} alt="" />
            {open.text && <p>{open.text}</p>}
            <p className="byline">{open.authorName}</p>
          </div>
        )}
      </main>
      {m.allowance.branding && <p className="branding"><Link to="/">Made with Life Guestbook</Link></p>}
      <Footer />
    </>
  );
}
