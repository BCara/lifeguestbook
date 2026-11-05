import { useState } from "react";
import { STAGE_META, averageRating, type Idea } from "../../shared/types";
import { api } from "../api";
import { useStudio } from "../studio";
import { ScoreRing, Thinking } from "../ui";

/**
 * Scatter of every idea: across = Future-Safe score, up = how excited we are,
 * bubble size = how feasible we think it is. Top-right is the sweet spot.
 */
export function FutureMap({ onOpen }: { onOpen: (id: string) => void }) {
  const { ws, toast, refresh } = useStudio();
  const [hover, setHover] = useState<Idea | null>(null);
  const [checking, setChecking] = useState(false);

  const W = 1000;
  const H = 640;
  const pad = { l: 70, r: 30, t: 30, b: 60 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const placed = ws.ideas
    .filter((i) => i.stage !== "parked")
    .map((i) => ({ idea: i, avg: averageRating(i), score: i.future?.score }))
    .filter((p) => p.avg && typeof p.score === "number");
  const missing = ws.ideas.filter((i) => i.stage !== "parked" && (!i.future || !averageRating(i)));
  const unchecked = missing.filter((i) => !i.future);

  const checkAll = async () => {
    setChecking(true);
    try {
      for (const i of unchecked) await api(`/ideas/${i.id}/ai/future`, { body: {} });
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setChecking(false);
    }
  };

  const ranked = [...placed].sort(
    (a, b) => b.score! * 0.5 + b.avg!.excitement * 3 + b.avg!.feasibility * 2 - (a.score! * 0.5 + a.avg!.excitement * 3 + a.avg!.feasibility * 2),
  );

  return (
    <div className="map-view">
      <div className="map-head">
        <div>
          <h1>Future Map</h1>
          <p className="muted">
            Across: how future-safe the AI thinks it is. Up: how excited you are. Bigger bubble: more doable. Aim for the top right.
          </p>
        </div>
        {unchecked.length > 0 && (
          <button className="btn ai" disabled={checking} onClick={checkAll}>
            {checking ? <Thinking label={`Checking ${unchecked.length} ideas`} /> : `🛡️ Future-check ${unchecked.length} idea${unchecked.length > 1 ? "s" : ""}`}
          </button>
        )}
      </div>
      <div className="map-layout">
        <div className="map-wrap glass">
          <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label="Ideas plotted by Future-Safe score and excitement">
            <defs>
              <radialGradient id="sweet" cx="1" cy="0" r="1">
                <stop offset="0" stopColor="#3ed49b" stopOpacity=".22" />
                <stop offset="1" stopColor="#3ed49b" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="url(#sweet)" rx="12" />
            <line x1={pad.l + iw / 2} y1={pad.t} x2={pad.l + iw / 2} y2={pad.t + ih} stroke="var(--line)" strokeDasharray="4 6" />
            <line x1={pad.l} y1={pad.t + ih / 2} x2={pad.l + iw} y2={pad.t + ih / 2} stroke="var(--line)" strokeDasharray="4 6" />
            <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="none" stroke="var(--line)" rx="12" />
            {[
              ["🌋 Exciting but exposed", pad.l + 16, pad.t + 28, "start"],
              ["🎯 Sweet spot", pad.l + iw - 16, pad.t + 28, "end"],
              ["🫥 Let go", pad.l + 16, pad.t + ih - 16, "start"],
              ["🧱 Solid but meh", pad.l + iw - 16, pad.t + ih - 16, "end"],
            ].map(([t, x, y, a]) => (
              <text key={t as string} x={x as number} y={y as number} textAnchor={a as "start"} className="quad">
                {t}
              </text>
            ))}
            {[0, 25, 50, 75, 100].map((v) => (
              <text key={v} x={pad.l + (iw * v) / 100} y={H - pad.b + 22} textAnchor="middle" className="tick">
                {v}
              </text>
            ))}
            {[0, 5, 10].map((v) => (
              <text key={v} x={pad.l - 14} y={pad.t + ih - (ih * v) / 10} textAnchor="end" dominantBaseline="central" className="tick">
                {v}
              </text>
            ))}
            <text x={pad.l + iw / 2} y={H - 10} textAnchor="middle" className="axis">
              🛡️ Future-Safe score →
            </text>
            <text x={18} y={pad.t + ih / 2} textAnchor="middle" className="axis" transform={`rotate(-90 18 ${pad.t + ih / 2})`}>
              🔥 Excitement →
            </text>
            {placed.map(({ idea, avg, score }) => {
              const x = pad.l + (iw * score!) / 100;
              const y = pad.t + ih - (ih * avg!.excitement) / 10;
              const r = 16 + avg!.feasibility * 2.6;
              const c = STAGE_META[idea.stage].color;
              return (
                <g
                  key={idea.id}
                  className="bubble-g"
                  transform={`translate(${x} ${y})`}
                  onClick={() => onOpen(idea.id)}
                  onMouseEnter={() => setHover(idea)}
                  onMouseLeave={() => setHover(null)}
                >
                  <circle r={r} fill={c} fillOpacity=".22" stroke={c} strokeWidth="2" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={Math.max(16, r * 0.7)}>
                    {idea.emoji}
                  </text>
                  <text y={r + 15} textAnchor="middle" className="bubble-label">
                    {idea.title.length > 26 ? `${idea.title.slice(0, 24)}…` : idea.title}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover && (
            <div className="map-tip glass">
              <strong>
                {hover.emoji} {hover.title}
              </strong>
              <p>{hover.future?.verdict}</p>
            </div>
          )}
          {!placed.length && (
            <div className="map-empty">
              <p>Ideas appear here once they have a Future-Safe score and at least one rating (open an idea → Overview).</p>
            </div>
          )}
        </div>
        <aside className="ranking glass">
          <h3>🏆 Front-runners</h3>
          <p className="muted small">Ranked on excitement, then feasibility, then future-safety.</p>
          <ol>
            {ranked.slice(0, 8).map(({ idea, score }) => (
              <li key={idea.id} onClick={() => onOpen(idea.id)}>
                <span className="card-emoji">{idea.emoji}</span>
                <span className="rank-title">{idea.title}</span>
                <ScoreRing score={score} size={30} />
              </li>
            ))}
          </ol>
          {missing.length > 0 && (
            <>
              <h4>Not on the map yet</h4>
              <ul className="missing">
                {missing.map((i) => (
                  <li key={i.id} onClick={() => onOpen(i.id)}>
                    {i.emoji} {i.title}{" "}
                    <span className="muted small">{!i.future ? "needs a check" : "needs a rating"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
