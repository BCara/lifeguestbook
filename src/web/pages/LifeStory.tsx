// The "Life story" tab: chapters of a life, AI-suggested interview questions, recorded answers and
// sealed letters. Works for Living Legacy pages (the person tells their own story) and memorials
// (the family builds a timeline).
import { useCallback, useEffect, useState } from "react";
import type { ChapterView, ContributionView, MemorialAdmin } from "../../shared/types";
import { can } from "../../shared/roles";
import { api, ApiError, sendContribution } from "../api";
import { timeAgo } from "../components";
import { canRecord, Recorder } from "../Recorder";
import { Media } from "./Manage";

export function LifeStory({ m, onChange }: { m: MemorialAdmin; onChange: () => void }) {
  const [list, setList] = useState<ChapterView[]>();
  const [open, setOpen] = useState<string>();
  const [title, setTitle] = useState("");
  const load = useCallback(() => void api.get<{ chapters: ChapterView[] }>(`/memorials/${m.id}/chapters`).then((r) => setList(r.chapters)), [m.id]);
  useEffect(load, [load]);
  const move = async (i: number, dir: -1 | 1) => {
    if (!list) return;
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + dir, 0, x);
    setList(next);
    await api.post(`/memorials/${m.id}/chapters-order`, { ids: next.map((c) => c.id) });
  };
  const admin = can(m.role, "manage_settings");
  return (
    <section className="stack">
      <div className="card">
        <h3>{m.mode === "living" ? `${m.name.split(" ")[0]}'s story, in their own words` : "Chapters of a life"}</h3>
        <p className="muted small">
          {m.mode === "living"
            ? "Sit down together, pick a chapter and work through the suggested questions. Record answers as voice notes or video, or type them. Some things can be sealed as letters that only open later."
            : "Group memories into the chapters of their life. Use the suggested questions to ask relatives what they remember."}
        </p>
      </div>
      {!list ? <p className="muted">Loading…</p> : (
        <div className="chapters">
          {list.map((c, i) => (
            <div key={c.id} className={`card chapter ${open === c.id ? "open" : ""}`}>
              <div className="row between">
                <button className="chapter-title" onClick={() => setOpen(open === c.id ? undefined : c.id)}>
                  <span className="chapter-num">{i + 1}</span> {c.title}{c.era && <span className="muted small"> · {c.era}</span>}
                  <span className="muted small"> · {c.stories ?? 0} {c.stories === 1 ? "story" : "stories"}</span>
                </button>
                {admin && (
                  <span className="row gap-sm">
                    <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button className="icon-btn" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  </span>
                )}
              </div>
              {open === c.id && <Chapter m={m} chapter={c} onChange={() => { load(); onChange(); }} />}
            </div>
          ))}
        </div>
      )}
      {admin && (
        <form className="row gap wrap" onSubmit={async (e) => { e.preventDefault(); await api.post(`/memorials/${m.id}/chapters`, { title }); setTitle(""); load(); }}>
          <input className="grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a chapter, e.g. 'The Navy years'" required />
          <button className="btn secondary">Add chapter</button>
        </form>
      )}
    </section>
  );
}

function Chapter({ m, chapter, onChange }: { m: MemorialAdmin; chapter: ChapterView; onChange: () => void }) {
  const [stories, setStories] = useState<ContributionView[]>();
  const [questions, setQuestions] = useState(chapter.questions ?? []);
  const [asking, setAsking] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const load = useCallback(() => void api.get<{ stories: ContributionView[] }>(`/memorials/${m.id}/chapters/${chapter.id}/stories`).then((r) => setStories(r.stories)), [m.id, chapter.id]);
  useEffect(load, [load]);
  const answered = new Set((stories ?? []).map((s) => s.prompt).filter(Boolean));
  return (
    <div className="stack chapter-body">
      <div className="stack">
        <div className="row between wrap">
          <h4>Questions to ask</h4>
          <button className="btn secondary small" disabled={asking} onClick={async () => {
            setAsking(true); setError(undefined);
            try { const r = await api.post<{ questions: typeof questions }>(`/memorials/${m.id}/chapters/${chapter.id}/questions`); setQuestions(r.questions); }
            catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't suggest questions."); }
            finally { setAsking(false); }
          }}>{asking ? "Thinking…" : questions.length ? "✦ Suggest new questions" : "✦ Suggest questions"}</button>
        </div>
        {error && <p className="error small">{error}</p>}
        {questions.length > 0 && (
          <ul className="questions">
            {questions.map((q) => (
              <li key={q.question} className={answered.has(q.question) ? "answered" : ""}>
                <div>
                  <p className="q">{q.question}</p>
                  <p className="muted small">{q.why}</p>
                </div>
                {answered.has(q.question) ? <span className="muted small">✓ answered</span> : <button className="btn small" onClick={() => setAnswering(q.question)}>Answer</button>}
              </li>
            ))}
          </ul>
        )}
        <div className="row gap wrap">
          <button className="btn small secondary" onClick={() => setAnswering("")}>Add a story to this chapter</button>
          {m.mode === "living" && <button className="btn small ghost" onClick={() => setAnswering("__letter__")}>✉ Write a sealed letter</button>}
        </div>
      </div>
      {answering !== null && (
        <Composer m={m} chapterId={chapter.id} prompt={answering === "__letter__" ? "" : answering} letter={answering === "__letter__"} onDone={() => { setAnswering(null); load(); onChange(); }} onCancel={() => setAnswering(null)} />
      )}
      {stories && stories.length > 0 && (
        <div className="stories">
          {stories.map((s) => (
            <article key={s.id} className={`story-item ${s.sealed ? "letter" : ""}`}>
              {s.sealed && <p className="seal">✉ Letter{s.sealed.to ? ` to ${s.sealed.to}` : ""} · {s.sealed.open ? "opened" : s.sealed.until === "passing" ? "opens when the page becomes a memorial" : `opens ${new Date(s.sealed.until).toLocaleDateString()}`}</p>}
              {s.prompt && <p className="q">{s.prompt}</p>}
              <Media c={s} />
              {s.text ? <p className="memory-text">{s.text}</p> : s.sealed && !s.sealed.open && !s.mediaUrl ? <p className="muted small">Sealed. Only the writer can read it until it opens.</p> : null}
              <p className="muted small">{s.authorName} · {timeAgo(s.createdAt)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function Composer({ m, chapterId, prompt, letter, onDone, onCancel }: { m: MemorialAdmin; chapterId?: string; prompt?: string; letter?: boolean; onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState<"audio" | "video" | null>(null);
  const [name, setName] = useState(m.mode === "living" ? m.name.split(" ")[0] : "");
  const [sealTo, setSealTo] = useState("");
  const [sealUntil, setSealUntil] = useState("passing");
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();
  const canMedia = m.allowance.voice;
  return (
    <form className="card stack composer" onSubmit={async (e) => {
      e.preventDefault();
      setError(undefined);
      const fields: Record<string, string> = { name, text, relation: "Family" };
      if (chapterId) fields.chapterId = chapterId;
      if (prompt) fields.prompt = prompt;
      if (letter) { fields.sealUntil = sealUntil; fields.sealTo = sealTo; }
      try {
        await sendContribution(m.slug, fields, file, (p) => setProgress(`Saving… ${Math.round(p * 100)}%`));
        onDone();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't save.");
      } finally {
        setProgress(undefined);
      }
    }}>
      {letter ? <h4>A letter to be opened later</h4> : prompt ? <p className="q">{prompt}</p> : <h4>Add a story</h4>}
      {letter && (
        <div className="row gap wrap">
          <label className="grow">To<input value={sealTo} onChange={(e) => setSealTo(e.target.value)} placeholder="e.g. my grandchildren" /></label>
          <label className="grow">Opens
            <select value={sealUntil === "passing" ? "passing" : "date"} onChange={(e) => setSealUntil(e.target.value === "passing" ? "passing" : new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10))}>
              <option value="passing">When the page becomes a memorial</option>
              <option value="date">On a date</option>
            </select>
          </label>
          {sealUntil !== "passing" && <label>Date<input type="date" value={sealUntil} onChange={(e) => setSealUntil(e.target.value)} /></label>}
        </div>
      )}
      {recording ? (
        <Recorder kind={recording} onCancel={() => setRecording(null)} onDone={(f) => { setFile(f); setRecording(null); }} />
      ) : file ? (
        <div className="row gap"><span className="file-chip">{file.name}</span><button type="button" className="link small" onClick={() => setFile(null)}>Remove</button></div>
      ) : (
        <div className="row gap wrap">
          {canRecord() && canMedia && <button type="button" className="btn secondary small" onClick={() => setRecording("audio")}>🎙 Record voice</button>}
          {canRecord() && canMedia && <button type="button" className="btn secondary small" onClick={() => setRecording("video")}>🎥 Record video</button>}
          <label className="btn ghost small">📷 Add a photo<input type="file" hidden accept={canMedia ? "image/*,video/*,audio/*" : "image/*"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          {!canMedia && <span className="muted small">Voice and video recording come with the upgraded page.</span>}
        </div>
      )}
      <label>{file ? "Anything to add in writing?" : "Write it here"}<textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <label>Told by<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      {error && <p className="error">{error}</p>}
      <div className="row gap">
        <button className="btn" disabled={!!progress || (!text.trim() && !file)}>{progress ?? (letter ? "Seal the letter" : "Save")}</button>
        <button type="button" className="link" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
