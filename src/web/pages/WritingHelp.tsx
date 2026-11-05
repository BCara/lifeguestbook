import { useEffect, useState } from "react";
import type { MemorialAdmin } from "../../shared/types";
import { api, ApiError } from "../api";

type Kind = "life_story" | "eulogy" | "obituary" | "thank_you";
const KINDS: { kind: Kind; title: string; blurb: string; memorialOnly?: boolean }[] = [
  { kind: "life_story", title: "Life story", blurb: "For the top of the page. Built from everything people have shared." },
  { kind: "eulogy", title: "Eulogy", blurb: "A 4–6 minute tribute to read at the service, in your voice.", memorialOnly: true },
  { kind: "obituary", title: "Obituary or death notice", blurb: "Short and practical, for the newspaper or Facebook.", memorialOnly: true },
  { kind: "thank_you", title: "Thank-you message", blurb: "To everyone who shared a memory." },
];

interface Draft { id: string; kind: Kind; text: string; createdAt: number; memoryCount?: number }

export function WritingHelp({ m, onChange }: { m: MemorialAdmin; onChange: () => void }) {
  const [kind, setKind] = useState<Kind>("life_story");
  const [tone, setTone] = useState("warm");
  const [notes, setNotes] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<Draft>();
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Draft[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => void api.get<{ drafts: Draft[] }>(`/memorials/${m.id}/drafts`).then((r) => setHistory(r.drafts)), [m.id, draft]);
  const kinds = KINDS.filter((k) => !k.memorialOnly || m.mode === "memorial");
  const freeLeft = m.plan.tier === "free" ? Math.max(0, 3 - m.aiUses) : null;
  return (
    <section className="stack">
      <div className="card stack">
        <h3>Writing help</h3>
        <p className="muted small">
          We'll draft it from the {m.counts.approved} approved {m.counts.approved === 1 ? "memory" : "memories"} on the page and anything you add below. Nothing is made up: where we need a fact we don't have, you'll see a [placeholder] to fill in. Always read it through and make it yours.
          {freeLeft !== null && <> {freeLeft} free {freeLeft === 1 ? "draft" : "drafts"} left on the free plan.</>}
        </p>
        <div className="kind-grid">
          {kinds.map((k) => (
            <button key={k.kind} className={`kind ${kind === k.kind ? "on" : ""}`} onClick={() => setKind(k.kind)}>
              <strong>{k.title}</strong>
              <span className="muted small">{k.blurb}</span>
            </button>
          ))}
        </div>
        <div className="row gap wrap">
          <label className="grow">Tone
            <select value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="warm">Warm and heartfelt</option>
              <option value="light">Warm, with gentle humour</option>
              <option value="formal">Dignified and formal</option>
            </select>
          </label>
          {kind === "eulogy" && <label className="grow">Who's speaking?<input value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="e.g. Sarah, her eldest daughter" /></label>}
        </div>
        <label>Anything we should include? <span className="muted">(facts, names, stories only the family knows)</span>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Born in Bury, the youngest of five. Married Ted in 1971. Worked at the Co-op for 30 years. Grandchildren: Amy, Josh and Lily." />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy} onClick={async () => {
          setBusy(true); setError(undefined); setSaved(false);
          try {
            const r = await api.post<{ id: string; text: string; memoryCount: number }>(`/memorials/${m.id}/ai/draft`, { kind, tone, notes, speaker });
            setDraft({ id: r.id, kind, text: r.text, createdAt: Date.now(), memoryCount: r.memoryCount });
            setText(r.text);
            onChange();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't write a draft just now.");
          } finally { setBusy(false); }
        }}>{busy ? "Writing… this can take up to a minute" : "✦ Write a draft"}</button>
      </div>
      {draft && (
        <div className="card stack">
          <h3>Your draft</h3>
          <textarea className="draft" rows={18} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
          <div className="row gap wrap">
            <button className="btn secondary small" onClick={() => navigator.clipboard.writeText(text)}>Copy</button>
            {draft.kind === "life_story" && <button className="btn small" onClick={async () => { await api.patch(`/memorials/${m.id}`, { story: text }); setSaved(true); onChange(); }}>{saved ? "✓ On the page" : "Use as the life story"}</button>}
            {draft.kind === "eulogy" && <button className="btn secondary small" onClick={() => printText(`Eulogy for ${m.name}`, text)}>Print large type</button>}
          </div>
        </div>
      )}
      {history.length > 0 && (
        <details className="card">
          <summary>Earlier drafts ({history.length})</summary>
          <ul className="draft-history">
            {history.map((d) => (
              <li key={d.id}><button className="link" onClick={() => { setDraft(d); setText(d.text); setKind(d.kind); }}>{KINDS.find((k) => k.kind === d.kind)?.title}</button> <span className="muted small">{new Date(d.createdAt).toLocaleString()}</span></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function printText(title: string, text: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  w.document.write(`<!doctype html><title>${esc(title)}</title><body style="font:22px/1.7 Georgia,serif;max-width:720px;margin:40px auto;padding:0 24px">${text.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("")}</body>`);
  w.document.close();
  w.print();
}
