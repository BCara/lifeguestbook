import { useState } from "react";
import { LENSES, STAGES, STAGE_META, type FutureCheck, type Idea, type LeanCanvas } from "../../shared/types";
import { api } from "../api";
import { useStudio } from "../studio";
import { Avatar, EMOJIS, Editable, Radar, ScoreRing, Thinking, scoreColor, svgSrc } from "../ui";
import { Coach } from "./Coach";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "future", label: "🛡️ Future-Safe" },
  { id: "canvas", label: "Canvas" },
  { id: "brand", label: "Brand" },
  { id: "coach", label: "Talk it through" },
  { id: "tasks", label: "Tasks" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function IdeaDrawer({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const { patchIdea, mutate } = useStudio();
  const [tab, setTab] = useState<Tab>("overview");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const meta = STAGE_META[idea.stage];

  const remove = async () => {
    if (!confirm(`Delete “${idea.title}”? This can't be undone.`)) return;
    onClose();
    await mutate(
      (w) => void (w.ideas = w.ideas.filter((i) => i.id !== idea.id)),
      () => api(`/ideas/${idea.id}`, { method: "DELETE" }),
    );
  };

  return (
    <aside className="drawer" style={{ ["--stage" as string]: meta.color }}>
      <header className="drawer-head idea-head">
        <div className="emoji-pick">
          <button className="big-emoji" onClick={() => setEmojiOpen(!emojiOpen)} aria-label="Change emoji">
            {idea.emoji}
          </button>
          {emojiOpen && (
            <div className="emoji-pop glass">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    patchIdea(idea.id, { emoji: e });
                    setEmojiOpen(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <Editable className="title-edit" value={idea.title} maxLength={120} onSave={(title) => title && patchIdea(idea.id, { title })} />
        <ScoreRing score={idea.future?.score} size={46} />
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="stage-row">
        {STAGES.map((s) => (
          <button
            key={s}
            className={`stage-btn ${idea.stage === s ? "on" : ""}`}
            style={{ ["--c" as string]: STAGE_META[s].color }}
            onClick={() => patchIdea(idea.id, { stage: s })}
            title={STAGE_META[s].hint}
          >
            {STAGE_META[s].label}
          </button>
        ))}
      </div>
      <nav className="subtabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="drawer-body">
        {tab === "overview" && <Overview idea={idea} />}
        {tab === "future" && <FuturePanel idea={idea} />}
        {tab === "canvas" && <CanvasPanel idea={idea} />}
        {tab === "brand" && <BrandPanel idea={idea} />}
        {tab === "coach" && <Coach idea={idea} />}
        {tab === "tasks" && <Tasks idea={idea} />}
      </div>
      {tab !== "coach" && (
        <footer className="drawer-foot">
          <button className="btn ghost small danger" onClick={remove}>
            Delete idea
          </button>
        </footer>
      )}
    </aside>
  );
}

function Overview({ idea }: { idea: Idea }) {
  const { patchIdea, mutate, ws, meId, memberById } = useStudio();
  const mine = idea.ratings[meId] ?? { excitement: 5, feasibility: 5 };
  const rate = (k: "excitement" | "feasibility", v: number) => {
    const r = { ...mine, [k]: v };
    mutate(
      (w) => {
        const i = w.ideas.find((x) => x.id === idea.id);
        if (i) i.ratings = { ...i.ratings, [meId]: r };
      },
      () => api(`/ideas/${idea.id}/rating`, { method: "PUT", body: r }),
    );
  };
  return (
    <div className="stack">
      <label className="field">
        <span>Pitch</span>
        <Editable multiline value={idea.pitch} placeholder="Who is it for, what do they get, why would they love it?" onSave={(pitch) => patchIdea(idea.id, { pitch })} />
      </label>
      <label className="field">
        <span>Tags</span>
        <Editable
          value={idea.tags.join(", ")}
          placeholder="food, local, subscription"
          onSave={(v) =>
            patchIdea(idea.id, {
              tags: v
                .split(",")
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean)
                .slice(0, 12),
            })
          }
        />
      </label>

      <section className="panel">
        <h4>How do you feel about it?</h4>
        <p className="muted small">Your ratings, plotted on the Future Map. Everyone rates separately.</p>
        {(["excitement", "feasibility"] as const).map((k) => (
          <label key={k} className="slider">
            <span>{k === "excitement" ? "🔥 Excitement" : "🧱 Feasibility"}</span>
            <input type="range" min={0} max={10} value={mine[k]} onChange={(e) => rate(k, Number(e.target.value))} />
            <b>{mine[k]}</b>
          </label>
        ))}
        <div className="others">
          {Object.entries(idea.ratings)
            .filter(([id]) => id !== meId)
            .map(([id, r]) => (
              <span key={id} className="other-rating">
                <Avatar m={memberById(id)} size={20} /> 🔥{r.excitement} 🧱{r.feasibility}
              </span>
            ))}
        </div>
      </section>

      <label className="field">
        <span>Notes</span>
        <Editable multiline value={idea.notes} placeholder="Anything: links, conversations, numbers, worries…" onSave={(notes) => patchIdea(idea.id, { notes })} />
      </label>
      <p className="muted small">
        Added by {memberById(idea.createdBy)?.name ?? "someone"} · {new Date(idea.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        {ws.vision.focusIdeaId === idea.id && " · ★ Our focus idea"}
      </p>
    </div>
  );
}

function useAi<T>(path: string) {
  const { toast, refresh } = useStudio();
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<T & { demo: boolean }>(path, { body: {} });
      setDemo(r.demo);
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, demo, run };
}

function FuturePanel({ idea }: { idea: Idea }) {
  const { busy, demo, run } = useAi<{ future: FutureCheck }>(`/ideas/${idea.id}/ai/future`);
  const f = idea.future;
  return (
    <div className="stack">
      <div className="explain">
        <strong>Will this business still matter in an AI world?</strong> The AI scores the idea on six lenses. The aim isn't to avoid AI. It's to build on things AI can't replace, and use AI for the rest.
      </div>
      <button className="btn ai" disabled={busy} onClick={run}>
        {busy ? <Thinking label="Stress-testing against the future" /> : f ? "↻ Re-run the Future-Safe check" : "🛡️ Run the Future-Safe check"}
      </button>
      {demo && <p className="demo-note">Demo scores. Connect the AI for a real assessment.</p>}
      {f && (
        <>
          <div className="future-hero">
            <Radar future={f} />
            <div>
              <div className="big-score" style={{ color: scoreColor(f.score) }}>
                {f.score}
                <small>/100</small>
              </div>
              <p className="verdict">{f.verdict}</p>
            </div>
          </div>
          <div className="lenses">
            {LENSES.map((l) => (
              <div key={l.key} className="lens">
                <div className="lens-top">
                  <span>{l.label}</span>
                  <b>{f.lenses[l.key].score}/10</b>
                </div>
                <div className="bar">
                  <i style={{ width: `${f.lenses[l.key].score * 10}%`, background: scoreColor(f.lenses[l.key].score * 10) }} />
                </div>
                <p>{f.lenses[l.key].why}</p>
              </div>
            ))}
          </div>
          <div className="two-col">
            <section className="panel threat">
              <h4>⚠️ How AI could erode it</h4>
              <ul>
                {f.threats.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
            <section className="panel moves">
              <h4>🛡️ Moves to future-proof it</h4>
              <ul>
                {f.moves.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

const CANVAS_BOXES: { key: keyof Omit<LeanCanvas, "at">; label: string; area: string }[] = [
  { key: "problem", label: "Problem", area: "p" },
  { key: "solution", label: "Solution", area: "s" },
  { key: "uniqueValue", label: "Unique value", area: "u" },
  { key: "unfairAdvantage", label: "Unfair advantage", area: "a" },
  { key: "customer", label: "Customers", area: "c" },
  { key: "metrics", label: "Key metrics", area: "m" },
  { key: "channels", label: "Channels", area: "h" },
  { key: "costs", label: "Costs", area: "k" },
  { key: "revenue", label: "Revenue", area: "r" },
];

function CanvasPanel({ idea }: { idea: Idea }) {
  const { patchIdea } = useStudio();
  const { busy, demo, run } = useAi(`/ideas/${idea.id}/ai/canvas`);
  const canvas: LeanCanvas = idea.canvas ?? {
    problem: "",
    customer: "",
    solution: "",
    uniqueValue: "",
    unfairAdvantage: "",
    channels: "",
    revenue: "",
    costs: "",
    metrics: "",
    at: "",
  };
  return (
    <div className="stack">
      <div className="explain">A one-page business plan. Let the AI draft it, then edit any box. It also adds first steps to your Tasks.</div>
      <button className="btn ai" disabled={busy} onClick={run}>
        {busy ? <Thinking label="Drafting the canvas" /> : idea.canvas ? "↻ Redraft with AI" : "✨ Draft the canvas with AI"}
      </button>
      {demo && <p className="demo-note">Demo canvas. Connect the AI for a real draft.</p>}
      <div className="lean">
        {CANVAS_BOXES.map((b) => (
          <div key={b.key} className="lean-box" style={{ gridArea: b.area }}>
            <h5>{b.label}</h5>
            <Editable multiline value={canvas[b.key]} placeholder="…" onSave={(v) => patchIdea(idea.id, { canvas: { ...canvas, [b.key]: v } })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandPanel({ idea }: { idea: Idea }) {
  const { busy, demo, run } = useAi(`/ideas/${idea.id}/ai/brand`);
  return (
    <div className="stack">
      <div className="explain">See it as a real business. The AI sketches three brand directions: name, tagline, colours and a logo mark.</div>
      <button className="btn ai" disabled={busy} onClick={run}>
        {busy ? <Thinking label="Sketching brands" /> : idea.brands?.length ? "↻ Three new directions" : "🎨 Sketch brand concepts"}
      </button>
      {demo && <p className="demo-note">Demo concepts. Connect the AI for real ones.</p>}
      <div className="brands">
        {(idea.brands ?? []).map((b, i) => (
          <article key={i} className="brand-card" style={{ animationDelay: `${i * 100}ms` }}>
            {b.svg ? <img src={svgSrc(b.svg)} alt={`${b.name} logo concept`} /> : <div className="logo-missing">No logo</div>}
            <h3>{b.name}</h3>
            <p>{b.tagline}</p>
            <div className="palette">
              {b.palette.map((c) => (
                <span key={c} style={{ background: c }} title={c} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Tasks({ idea }: { idea: Idea }) {
  const { patchIdea, ws, meId, memberById } = useStudio();
  const [text, setText] = useState("");
  const set = (tasks: Idea["tasks"]) => patchIdea(idea.id, { tasks });
  const add = () => {
    if (!text.trim()) return;
    set([...idea.tasks, { id: Math.random().toString(36).slice(2, 10), text: text.trim(), done: false, owner: meId }]);
    setText("");
  };
  const done = idea.tasks.filter((t) => t.done).length;
  return (
    <div className="stack">
      {idea.tasks.length > 0 && (
        <div className="progress">
          <div className="bar">
            <i style={{ width: `${(done / idea.tasks.length) * 100}%` }} />
          </div>
          <span>
            {done}/{idea.tasks.length} done
          </span>
        </div>
      )}
      <ul className="tasks">
        {idea.tasks.map((t) => (
          <li key={t.id} className={t.done ? "done" : ""}>
            <input type="checkbox" checked={t.done} onChange={() => set(idea.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} aria-label="Done" />
            <span>{t.text}</span>
            <button
              className="owner"
              title="Who's on it? Click to change"
              onClick={() => {
                const ids = ["", ...ws.members.map((m) => m.id)];
                const next = ids[(ids.indexOf(t.owner ?? "") + 1) % ids.length];
                set(idea.tasks.map((x) => (x.id === t.id ? { ...x, owner: next } : x)));
              }}
            >
              {t.owner ? <Avatar m={memberById(t.owner)} size={22} /> : "＋"}
            </button>
            <button className="icon-btn" onClick={() => set(idea.tasks.filter((x) => x.id !== t.id))} aria-label="Remove task">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a next step…" />
        <button className="btn small" onClick={add}>
          Add
        </button>
      </div>
      {!idea.tasks.length && <p className="muted small">Tip: draft the Canvas with AI and it'll suggest your first five steps.</p>}
    </div>
  );
}
