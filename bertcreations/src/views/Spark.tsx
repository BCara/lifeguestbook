import { useState } from "react";
import type { IdeaSuggestion } from "../../shared/types";
import { api } from "../api";
import { useStudio } from "../studio";
import { Modal, Thinking } from "../ui";

const PROMPTS = [
  "Something we could start on weekends with under £2k",
  "Businesses that get MORE valuable as AI spreads",
  "Ideas that bring people together in real life",
  "Uses our skills, recurring revenue, low stock",
  "Calm, creative, could run from anywhere",
  "Fix something that annoys us every week",
];

/** Finds free grid slots near a point so new cards never land on top of existing ones. */
export function freeSpots(taken: { x: number; y: number }[], at: { x: number; y: number }, n: number) {
  const W = 260;
  const H = 230;
  const out: { x: number; y: number }[] = [];
  const clash = (p: { x: number; y: number }) => [...taken, ...out].some((t) => Math.abs(t.x - p.x) < W - 10 && Math.abs(t.y - p.y) < H - 20);
  for (let ring = 0; out.length < n && ring < 30; ring++) {
    for (let gy = -ring; gy <= ring && out.length < n; gy++) {
      for (let gx = -ring; gx <= ring && out.length < n; gx++) {
        if (Math.max(Math.abs(gx), Math.abs(gy)) !== ring) continue;
        const p = { x: Math.round(at.x - 115 + gx * W), y: Math.round(at.y - 90 + gy * H) };
        if (!clash(p)) out.push(p);
      }
    }
  }
  return out;
}

export function useAddIdeas() {
  const { mutate, ws } = useStudio();
  return async (items: IdeaSuggestion[], at: { x: number; y: number }) => {
    const spots = freeSpots(ws.ideas, at, items.length);
    for (const [n, s] of items.entries()) {
      const body = {
        title: s.title,
        pitch: s.pitch,
        emoji: s.emoji || "💡",
        tags: s.tags.slice(0, 4),
        notes: [s.whyUs && `Why us: ${s.whyUs}`, s.futureHook && `Future hook: ${s.futureHook}`].filter(Boolean).join("\n\n"),
        ...spots[n],
      };
      await mutate(() => undefined, () => api("/ideas", { body }));
    }
  };
}

export function SuggestionGrid({ items, onAdd, demo }: { items: IdeaSuggestion[]; onAdd: (s: IdeaSuggestion[]) => void; demo: boolean }) {
  const [added, setAdded] = useState<Set<number>>(new Set());
  const add = (i: number) => {
    setAdded(new Set([...added, i]));
    onAdd([items[i]]);
  };
  return (
    <>
      {demo && <p className="demo-note">Demo mode: these are sample ideas. Connect the AI for ideas made for you.</p>}
      <div className="suggestions">
        {items.map((s, i) => (
          <article key={i} className={`suggestion ${added.has(i) ? "added" : ""}`} style={{ animationDelay: `${i * 80}ms` }}>
            <div className="sug-emoji">{s.emoji}</div>
            <h3>{s.title}</h3>
            <p>{s.pitch}</p>
            {s.whyUs && (
              <p className="small">
                <strong>Why us:</strong> {s.whyUs}
              </p>
            )}
            {s.futureHook && (
              <p className="small future-hook">
                <strong>🛡️ Future-safe:</strong> {s.futureHook}
              </p>
            )}
            <div className="tags">
              {s.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
            <button className="btn small" disabled={added.has(i)} onClick={() => add(i)}>
              {added.has(i) ? "On the board ✓" : "+ Add to board"}
            </button>
          </article>
        ))}
      </div>
      {items.length > 1 && added.size < items.length && (
        <button
          className="btn ghost wide"
          onClick={() => {
            const rest = items.filter((_, i) => !added.has(i));
            setAdded(new Set(items.map((_, i) => i)));
            onAdd(rest);
          }}
        >
          Add all to the board
        </button>
      )}
    </>
  );
}

export function SparkModal({ onClose, at }: { onClose: () => void; at: { x: number; y: number } }) {
  const { toast } = useStudio();
  const addIdeas = useAddIdeas();
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ideas: IdeaSuggestion[]; demo: boolean } | null>(null);

  const go = async (b = brief) => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await api<{ ideas: IdeaSuggestion[]; demo: boolean }>("/ai/spark", { body: { brief: b, count } }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="✨ Spark ideas with AI" onClose={onClose} wide>
      <p className="muted">Tell the AI what you're in the mood for, or leave it blank to be surprised. It knows who you are from the Us page.</p>
      <div className="spark-input">
        <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. something with food, dogs, and weekends" onKeyDown={(e) => e.key === "Enter" && go()} />
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many">
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} ideas
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={busy} onClick={() => go()}>
          {busy ? "…" : "Spark"}
        </button>
      </div>
      <div className="chips">
        {PROMPTS.map((p) => (
          <button
            key={p}
            className="chip"
            onClick={() => {
              setBrief(p);
              go(p);
            }}
          >
            {p}
          </button>
        ))}
      </div>
      {busy && (
        <div className="big-thinking">
          <Thinking label="Dreaming up ideas" />
        </div>
      )}
      {result && <SuggestionGrid items={result.ideas} demo={result.demo} onAdd={(s) => addIdeas(s, at)} />}
    </Modal>
  );
}
