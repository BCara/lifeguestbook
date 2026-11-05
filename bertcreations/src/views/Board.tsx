import { useEffect, useRef, useState } from "react";
import { STAGE_META, type Idea, type IdeaSuggestion } from "../../shared/types";
import { api, local } from "../api";
import { useStudio } from "../studio";
import { Avatar, Modal, ScoreRing, Thinking } from "../ui";
import { SparkModal, SuggestionGrid, freeSpots, useAddIdeas } from "./Spark";

interface View {
  x: number;
  y: number;
  k: number;
}

const CARD_W = 230;

export function Board({ onOpen }: { onOpen: (id: string) => void }) {
  const { ws, patchIdea, mutate, toast } = useStudio();
  const wrap = useRef<HTMLDivElement>(null);
  const hadView = useRef(!!local.get("bc.view"));
  const [view, setView] = useState<View>(() => {
    try {
      return JSON.parse(local.get("bc.view")) as View;
    } catch {
      return { x: 0, y: 0, k: 1 };
    }
  });
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [spark, setSpark] = useState(false);
  const [mashMode, setMashMode] = useState<string[] | null>(null);
  const [mash, setMash] = useState<{ busy: boolean; ideas?: IdeaSuggestion[]; demo?: boolean } | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ x: number; y: number } | null>(null);
  const addIdeas = useAddIdeas();

  useEffect(() => local.set("bc.view", JSON.stringify(view)), [view]);

  const toWorld = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };
  const centre = () => {
    const r = wrap.current!.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  };

  // ---- pan & zoom
  const panStart = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const onBgDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("world")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStart.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
  };
  const onBgMove = (e: React.PointerEvent) => {
    const p = panStart.current;
    if (p) setView((v) => ({ ...v, x: p.vx + e.clientX - p.px, y: p.vy + e.clientY - p.py }));
  };
  const onBgUp = () => (panStart.current = null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2) {
        setView((v) => {
          const k = Math.min(2, Math.max(0.3, v.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
          const mx = e.clientX - r.left;
          const my = e.clientY - r.top;
          return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
        });
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const zoom = (f: number) => {
    const r = wrap.current!.getBoundingClientRect();
    setView((v) => {
      const k = Math.min(2, Math.max(0.3, v.k * f));
      const mx = r.width / 2;
      const my = r.height / 2;
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
    });
  };

  const fit = () => {
    if (!ws.ideas.length || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    const xs = ws.ideas.map((i) => i.x);
    const ys = ws.ideas.map((i) => i.y);
    const minX = Math.min(...xs) - 40;
    const maxX = Math.max(...xs) + CARD_W + 40;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + 200;
    const k = Math.min(1.2, Math.max(0.3, Math.min(r.width / (maxX - minX), r.height / (maxY - minY))));
    setView({ k, x: (r.width - (maxX - minX) * k) / 2 - minX * k, y: (r.height - (maxY - minY) * k) / 2 - minY * k });
  };

  // First visit on this device: show everything, or centre the origin on an empty board.
  useEffect(() => {
    if (hadView.current || !wrap.current) return;
    hadView.current = true;
    if (ws.ideas.length) fit();
    else {
      const r = wrap.current.getBoundingClientRect();
      setView({ x: r.width / 2, y: r.height / 2, k: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- card dragging
  const cardStart = useRef<{ id: string; px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onCardDown = (e: React.PointerEvent, idea: Idea) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    cardStart.current = { id: idea.id, px: e.clientX, py: e.clientY, ox: idea.x, oy: idea.y, moved: false };
  };
  const onCardMove = (e: React.PointerEvent) => {
    const s = cardStart.current;
    if (!s) return;
    const dx = (e.clientX - s.px) / view.k;
    const dy = (e.clientY - s.py) / view.k;
    if (!s.moved && Math.hypot(dx, dy) < 4) return;
    s.moved = true;
    setDrag({ id: s.id, x: Math.round(s.ox + dx), y: Math.round(s.oy + dy) });
  };
  const onCardUp = (idea: Idea) => {
    const s = cardStart.current;
    cardStart.current = null;
    if (!s) return;
    if (s.moved && drag) {
      patchIdea(idea.id, { x: drag.x, y: drag.y });
      setDrag(null);
    } else if (mashMode) {
      const sel = mashMode.includes(idea.id) ? mashMode.filter((x) => x !== idea.id) : [...mashMode, idea.id].slice(-2);
      setMashMode(sel);
    } else onOpen(idea.id);
  };

  const runMash = async () => {
    if (!mashMode || mashMode.length !== 2) return;
    setMash({ busy: true });
    try {
      const r = await api<{ ideas: IdeaSuggestion[]; demo: boolean }>("/ai/mashup", { body: { a: mashMode[0], b: mashMode[1] } });
      setMash({ busy: false, ...r });
    } catch (e) {
      toast((e as Error).message, "error");
      setMash(null);
    }
  };

  const heart = (idea: Idea) =>
    mutate(
      () => undefined,
      () => api(`/ideas/${idea.id}/heart`, { body: {} }),
    );

  return (
    <div className="board">
      <div className="board-tools glass">
        <button className="btn primary small" onClick={() => setQuickAdd(centre())}>
          + Idea
        </button>
        <button className="btn ai small" onClick={() => setSpark(true)}>
          ✨ Spark with AI
        </button>
        {ws.ideas.length >= 2 &&
          (mashMode ? (
            <>
              <span className="mash-hint">Pick 2 ideas ({mashMode.length}/2)</span>
              <button className="btn ai small" disabled={mashMode.length !== 2} onClick={runMash}>
                🧪 Mash!
              </button>
              <button className="btn ghost small" onClick={() => setMashMode(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn ghost small" onClick={() => setMashMode([])}>
              🧪 Mash-up
            </button>
          ))}
      </div>
      <div className="zoom-tools glass">
        <button onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">
          −
        </button>
        <span>{Math.round(view.k * 100)}%</span>
        <button onClick={() => zoom(1.2)} aria-label="Zoom in">
          +
        </button>
        <button onClick={fit} aria-label="Fit all ideas">
          ⤢
        </button>
      </div>
      <div className="legend glass">
        {Object.entries(STAGE_META).map(([k, m]) => (
          <span key={k}>
            <i style={{ background: m.color }} />
            {m.label}
          </span>
        ))}
      </div>

      <div
        ref={wrap}
        className={`canvas ${panStart.current ? "panning" : ""}`}
        style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${28 * view.k}px ${28 * view.k}px` }}
        onPointerDown={onBgDown}
        onPointerMove={onBgMove}
        onPointerUp={onBgUp}
        onDoubleClick={(e) => e.target === e.currentTarget && setQuickAdd(toWorld(e.clientX, e.clientY))}
      >
        <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          {ws.ideas.map((idea) => {
            const pos = drag?.id === idea.id ? drag : idea;
            const meta = STAGE_META[idea.stage];
            const sel = mashMode?.includes(idea.id);
            return (
              <div
                key={idea.id}
                className={`card ${drag?.id === idea.id ? "dragging" : ""} ${sel ? "selected" : ""} stage-${idea.stage}`}
                style={{ left: pos.x, top: pos.y, width: CARD_W, ["--stage" as string]: meta.color }}
                onPointerDown={(e) => onCardDown(e, idea)}
                onPointerMove={onCardMove}
                onPointerUp={() => onCardUp(idea)}
              >
                <div className="card-top">
                  <span className="card-emoji">{idea.emoji}</span>
                  <span className="stage-pill">{meta.label}</span>
                  <ScoreRing score={idea.future?.score} size={36} />
                </div>
                <h3>{idea.title}</h3>
                {idea.pitch && <p>{idea.pitch}</p>}
                <div className="card-foot">
                  <button className={`heart ${idea.hearts.length ? "on" : ""}`} onClick={() => heart(idea)} aria-label="Love this idea">
                    ♥ {idea.hearts.length || ""}
                  </button>
                  <div className="hearts">
                    {idea.hearts.map((h) => (
                      <Avatar key={h} m={ws.members.find((m) => m.id === h)} size={20} />
                    ))}
                  </div>
                  {idea.tasks.length > 0 && (
                    <span className="mini">
                      ✓ {idea.tasks.filter((t) => t.done).length}/{idea.tasks.length}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!ws.ideas.length && (
          <div className="empty-board">
            <div className="logo-orb big" />
            <h2>Your idea board is empty</h2>
            <p>Double-click anywhere to drop an idea, or let the AI get you started.</p>
            <button className="btn ai" onClick={() => setSpark(true)}>
              ✨ Spark some ideas
            </button>
          </div>
        )}
      </div>

      {spark && <SparkModal onClose={() => setSpark(false)} at={centre()} />}
      {quickAdd && <QuickAdd at={quickAdd} onClose={() => setQuickAdd(null)} onCreated={onOpen} />}
      {mash && (
        <Modal
          title="🧪 Mash-up"
          wide
          onClose={() => {
            setMash(null);
            setMashMode(null);
          }}
        >
          {mash.busy ? (
            <div className="big-thinking">
              <Thinking label="Mixing ideas together" />
            </div>
          ) : (
            <SuggestionGrid items={mash.ideas ?? []} demo={!!mash.demo} onAdd={(s) => addIdeas(s, centre())} />
          )}
        </Modal>
      )}
    </div>
  );
}

function QuickAdd({ at, onClose, onCreated }: { at: { x: number; y: number }; onClose: () => void; onCreated: (id: string) => void }) {
  const { mutate, ws } = useStudio();
  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const save = async () => {
    if (!title.trim()) return;
    let id = "";
    await mutate(
      () => undefined,
      async () => {
        const spot = freeSpots(ws.ideas, at, 1)[0] ?? at;
        const r = await api<{ idea: Idea }>("/ideas", { body: { title, pitch, ...spot } });
        id = r.idea.id;
      },
    );
    onClose();
    if (id) onCreated(id);
  };
  return (
    <Modal title="💡 New idea" onClose={onClose}>
      <label className="field">
        <span>What's the idea?</span>
        <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="e.g. Dog-friendly brunch club" />
      </label>
      <label className="field">
        <span>One-line pitch (optional)</span>
        <textarea value={pitch} rows={3} onChange={(e) => setPitch(e.target.value)} placeholder="Who is it for and why would they love it?" />
      </label>
      <button className="btn primary wide" disabled={!title.trim()} onClick={save}>
        Drop it on the board
      </button>
    </Modal>
  );
}
