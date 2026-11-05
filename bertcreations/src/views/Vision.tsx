import { useState } from "react";
import { STAGES, STAGE_META, type Milestone, type Vision } from "../../shared/types";
import { api } from "../api";
import { useStudio } from "../studio";
import { Avatar, Editable, Modal, ScoreRing, Thinking } from "../ui";

const rid = () => Math.random().toString(36).slice(2, 10);

export function VisionView({ onOpen }: { onOpen: (id: string) => void }) {
  const { ws, mutate, toast, memberById } = useStudio();
  const v = ws.vision;
  const [word, setWord] = useState("");
  const [draft, setDraft] = useState<{ busy: boolean; northStar?: string; milestones?: Omit<Milestone, "id">[]; demo?: boolean } | null>(null);
  const focus = ws.ideas.find((i) => i.id === v.focusIdeaId);

  const save = (patch: Partial<Vision>) =>
    mutate(
      (w) => Object.assign(w.vision, patch),
      () => api("/vision", { method: "PUT", body: patch }),
    );

  const days = v.targetDate ? Math.ceil((new Date(v.targetDate).getTime() - Date.now()) / 86400000) : null;
  const ms = [...v.milestones].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const doneCount = ms.filter((m) => m.done).length;
  const pct = ms.length ? Math.round((doneCount / ms.length) * 100) : 0;
  const nextUp = ms.find((m) => !m.done);

  const draftRoadmap = async () => {
    setDraft({ busy: true });
    try {
      setDraft({ busy: false, ...(await api<{ northStar: string; milestones: Omit<Milestone, "id">[]; demo: boolean }>("/ai/roadmap", { body: {} })) });
    } catch (e) {
      toast((e as Error).message, "error");
      setDraft(null);
    }
  };

  return (
    <div className="vision">
      <section className="vision-hero">
        <div className="hero-orbs" aria-hidden>
          <span />
          <span />
        </div>
        <p className="eyebrow">Our north star</p>
        <Editable
          className="north-star"
          multiline
          value={v.northStar}
          placeholder="One sentence that describes the business we're building and the life it gives us…"
          onSave={(northStar) => save({ northStar })}
          maxLength={500}
        />
        <div className="hero-stats">
          <div className="stat">
            <b>{days === null ? "—" : days >= 0 ? days : "🎉"}</b>
            <span>{days === null ? "set a target date" : days >= 0 ? "days to go" : "target date passed"}</span>
            <input type="date" value={v.targetDate} onChange={(e) => save({ targetDate: e.target.value })} aria-label="Target date" />
          </div>
          <div className="stat">
            <b>{pct}%</b>
            <span>
              of the roadmap done ({doneCount}/{ms.length})
            </span>
            <div className="bar">
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="stat">
            <b>{ws.ideas.length}</b>
            <span>ideas on the board</span>
            <div className="stage-bar">
              {STAGES.map((s) => {
                const n = ws.ideas.filter((i) => i.stage === s).length;
                return n ? <i key={s} style={{ flex: n, background: STAGE_META[s].color }} title={`${STAGE_META[s].label}: ${n}`} /> : null;
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="vision-grid">
        <section className="panel">
          <h3>💛 Why we're doing this</h3>
          <Editable multiline value={v.why} placeholder="Freedom? Family? Doing work we're proud of? Write it down, it'll keep you going." onSave={(why) => save({ why })} />
        </section>

        <section className="panel">
          <h3>🎨 The vibe</h3>
          <p className="muted small">Words that describe the business and life you want. The AI uses these too.</p>
          <div className="words">
            {v.words.map((w) => (
              <button key={w} className="word" onClick={() => save({ words: v.words.filter((x) => x !== w) })} title="Remove">
                {w} <span>✕</span>
              </button>
            ))}
            <input
              value={word}
              placeholder="+ add a word"
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && word.trim() && !v.words.includes(word.trim())) {
                  save({ words: [...v.words, word.trim()].slice(0, 20) });
                  setWord("");
                }
              }}
            />
          </div>
        </section>

        <section className="panel focus">
          <h3>★ Focus idea</h3>
          {focus ? (
            <div className="focus-card" onClick={() => onOpen(focus.id)}>
              <span className="big-emoji">{focus.emoji}</span>
              <div>
                <strong>{focus.title}</strong>
                <p>{focus.pitch}</p>
              </div>
              <ScoreRing score={focus.future?.score} size={44} />
            </div>
          ) : (
            <p className="muted small">Pick the idea you're betting on. The roadmap will be built around it.</p>
          )}
          <select value={v.focusIdeaId} onChange={(e) => save({ focusIdeaId: e.target.value })} aria-label="Focus idea">
            <option value="">— none yet —</option>
            {ws.ideas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.emoji} {i.title}
              </option>
            ))}
          </select>
        </section>
      </div>

      <section className="panel roadmap">
        <div className="roadmap-head">
          <div>
            <h3>🗺️ The road from here</h3>
            {nextUp && (
              <p className="muted small">
                Next up: <strong>{nextUp.title}</strong>
                {nextUp.due && ` · ${new Date(nextUp.due).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
              </p>
            )}
          </div>
          <div className="row">
            <button className="btn ai small" onClick={draftRoadmap}>
              ✨ Draft with AI
            </button>
            <button
              className="btn ghost small"
              onClick={() => save({ milestones: [...v.milestones, { id: rid(), title: "New milestone", detail: "", due: "", done: false }] })}
            >
              + Milestone
            </button>
          </div>
        </div>
        {ms.length ? (
          <ol className="timeline">
            {ms.map((m, i) => (
              <li key={m.id} className={`${m.done ? "done" : ""} ${m === nextUp ? "next" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
                <button
                  className="node"
                  onClick={() => save({ milestones: v.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })}
                  aria-label={m.done ? "Mark not done" : "Mark done"}
                >
                  {m.done ? "✓" : i + 1}
                </button>
                <div className="ms-body">
                  <Editable className="ms-title" value={m.title} onSave={(title) => save({ milestones: v.milestones.map((x) => (x.id === m.id ? { ...x, title } : x)) })} />
                  <Editable className="ms-detail" value={m.detail} placeholder="Details…" onSave={(detail) => save({ milestones: v.milestones.map((x) => (x.id === m.id ? { ...x, detail } : x)) })} />
                  <div className="ms-foot">
                    <input type="date" value={m.due} onChange={(e) => save({ milestones: v.milestones.map((x) => (x.id === m.id ? { ...x, due: e.target.value } : x)) })} aria-label="Due date" />
                    <button className="icon-btn" onClick={() => save({ milestones: v.milestones.filter((x) => x.id !== m.id) })} aria-label="Remove milestone">
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No milestones yet. Pick a focus idea and let the AI draft a roadmap, or add your own.</p>
        )}
      </section>

      <section className="panel activity">
        <h3>📡 Recent activity</h3>
        <ul>
          {[...ws.activity].reverse().slice(0, 12).map((a) => (
            <li key={a.id}>
              <Avatar m={memberById(a.who)} size={22} />
              <span>
                <strong>{memberById(a.who)?.name ?? "Someone"}</strong> {a.text}
              </span>
              <time>{new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
            </li>
          ))}
          {!ws.activity.length && <li className="muted">Nothing yet.</li>}
        </ul>
      </section>

      {draft && (
        <Modal title="✨ Draft roadmap" onClose={() => setDraft(null)} wide>
          {draft.busy ? (
            <div className="big-thinking">
              <Thinking label="Plotting the route" />
            </div>
          ) : (
            <>
              {draft.demo && <p className="demo-note">Demo roadmap. Connect the AI for one built around your idea.</p>}
              <p className="eyebrow">Suggested north star</p>
              <p className="draft-star">{draft.northStar}</p>
              <ol className="timeline preview">
                {draft.milestones!.map((m, i) => (
                  <li key={i}>
                    <span className="node">{i + 1}</span>
                    <div className="ms-body">
                      <strong>{m.title}</strong>
                      <p className="muted small">
                        {m.detail} · {new Date(m.due).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="row">
                <button
                  className="btn primary"
                  onClick={() => {
                    save({
                      northStar: v.northStar || draft.northStar!,
                      milestones: [...v.milestones.filter((m) => m.done), ...draft.milestones!.map((m) => ({ ...m, id: rid() }))],
                    });
                    setDraft(null);
                  }}
                >
                  Use this roadmap
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    save({ milestones: [...v.milestones, ...draft.milestones!.map((m) => ({ ...m, id: rid() }))] });
                    setDraft(null);
                  }}
                >
                  Add to what we have
                </button>
                {v.northStar && (
                  <button className="btn ghost" onClick={() => save({ northStar: draft.northStar! })}>
                    Use the new north star
                  </button>
                )}
              </div>
              <p className="muted small">“Use this roadmap” keeps milestones you've already completed and replaces the rest.</p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
