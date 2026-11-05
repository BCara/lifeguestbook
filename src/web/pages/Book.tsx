// A printable memory book: cover, life story, chapters, every approved memory and a "with love
// from" page. Families print it at home or save it as a PDF for a print shop.
import { useEffect, useState } from "react";
import type { ChapterView, ContributionView, MemorialAdmin } from "../../shared/types";
import { api } from "../api";
import { lifeDates, RequireSignIn } from "../components";
import { Link } from "../router";

export function Book({ id }: { id: string }) {
  return <RequireSignIn><BookInner id={id} /></RequireSignIn>;
}

function BookInner({ id }: { id: string }) {
  const [m, setM] = useState<MemorialAdmin>();
  const [items, setItems] = useState<ContributionView[]>();
  const [chapters, setChapters] = useState<ChapterView[]>([]);
  const [size, setSize] = useState<"a4" | "a5">("a5");
  useEffect(() => {
    api.get<{ memorial: MemorialAdmin }>(`/memorials/${id}`).then((r) => setM(r.memorial));
    api.get<{ contributions: ContributionView[] }>(`/memorials/${id}/contributions?status=approved`).then((r) => setItems(r.contributions.filter((c) => !c.sealed).sort((a, b) => a.createdAt - b.createdAt)));
    api.get<{ chapters: ChapterView[] }>(`/memorials/${id}/chapters`).then((r) => setChapters(r.chapters)).catch(() => undefined);
  }, [id]);
  if (!m || !items) return <div className="page-center muted">Putting the book together…</div>;
  const byChapter = chapters.map((ch) => ({ ch, stories: items.filter((c) => c.chapterId === ch.id) })).filter((x) => x.stories.length);
  const filed = new Set(byChapter.flatMap((x) => x.stories.map((s) => s.id)));
  const rest = items.filter((c) => !filed.has(c.id) && c.type !== "voice");
  const people = [...new Set(items.map((c) => c.authorName.trim()))].sort((a, b) => a.localeCompare(b));
  return (
    <div className={`book book-${size}`}>
      <style>{`@page { size: ${size === "a5" ? "A5" : "A4"}; margin: 14mm; }`}</style>
      <div className="no-print row gap wrap toolbar book-toolbar">
        <Link to={`/dashboard/${id}?tab=settings`}>← Back</Link>
        <div className="segmented">
          <button className={size === "a5" ? "on" : ""} onClick={() => setSize("a5")}>A5 book</button>
          <button className={size === "a4" ? "on" : ""} onClick={() => setSize("a4")}>A4</button>
        </div>
        <button className="btn" onClick={() => window.print()}>Print or save as PDF</button>
        <span className="muted small">{items.length} memories from {people.length} people. Tip: choose "Save as PDF" to send it to a print shop.</span>
      </div>
      <section className="book-page book-cover">
        {m.coverUrl && <img src={m.coverUrl} alt="" />}
        <p className="eyebrow">{m.mode === "memorial" ? "In loving memory of" : "The life and stories of"}</p>
        <h1>{m.name}</h1>
        <p className="book-dates">{lifeDates(m.born, m.died)}</p>
      </section>
      {(m.intro || m.story) && (
        <section className="book-page">
          <h2>{m.story ? "A life" : "Welcome"}</h2>
          {(m.story || m.intro || "").split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        </section>
      )}
      {byChapter.map(({ ch, stories }) => (
        <section key={ch.id} className="book-page">
          <h2>{ch.title}</h2>
          {stories.map((s) => <BookMemory key={s.id} c={s} />)}
        </section>
      ))}
      {rest.length > 0 && (
        <section className="book-page">
          <h2>Memories</h2>
          {rest.map((c) => <BookMemory key={c.id} c={c} />)}
        </section>
      )}
      <section className="book-page book-end">
        <h2>With love from</h2>
        <p className="book-people">{people.join(" · ")}</p>
        <p className="muted small">Made with Life Guestbook</p>
      </section>
    </div>
  );
}

function BookMemory({ c }: { c: ContributionView }) {
  return (
    <article className="book-memory">
      {c.type === "photo" && c.mediaUrl && <img src={c.mediaUrl} alt="" />}
      {c.type === "video" && <p className="muted small">[A video message: watch it on the page]</p>}
      {c.prompt && <p className="q">{c.prompt}</p>}
      {c.text && <p className="book-text">{c.text}</p>}
      <p className="book-by">{c.authorName}{c.relation ? `, ${c.relation.toLowerCase()}` : ""}{c.era ? ` · ${c.era}` : ""}</p>
    </article>
  );
}
