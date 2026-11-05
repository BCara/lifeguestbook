import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { LENSES, type FutureCheck, type Member } from "../shared/types";

export function scoreColor(score: number) {
  if (score >= 70) return "var(--good)";
  if (score >= 45) return "var(--warn)";
  return "var(--bad)";
}

export function ScoreRing({ score, size = 44, label = true }: { score: number | undefined; size?: number; label?: boolean }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const has = typeof score === "number";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring" role="img" aria-label={has ? `Future-Safe ${score} out of 100` : "Not checked yet"}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
      {has && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(c * score) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      {label && (
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.3} fill="var(--ink)" fontWeight="600">
          {has ? score : "?"}
        </text>
      )}
    </svg>
  );
}

/** Six-lens radar for the Future-Safe score. */
export function Radar({ future, size = 280 }: { future: FutureCheck; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 46;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / LENSES.length - Math.PI / 2;
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v] as const;
  };
  const poly = LENSES.map((l, i) => pt(i, future.lenses[l.key].score / 10).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="Future-Safe radar chart">
      <defs>
        <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a59" stopOpacity=".55" />
          <stop offset="1" stopColor="#5aa9ff" stopOpacity=".55" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={LENSES.map((_, i) => pt(i, k).join(",")).join(" ")} fill="none" stroke="var(--line)" />
      ))}
      {LENSES.map((l, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.22);
        return (
          <Fragment key={l.key}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize="11" fill="var(--muted)">
              {l.label.split(" ")[0]}
            </text>
          </Fragment>
        );
      })}
      <polygon points={poly} fill="url(#radarFill)" stroke="#ffb199" strokeWidth="2" className="radar-shape" />
      {LENSES.map((l, i) => {
        const [x, y] = pt(i, future.lenses[l.key].score / 10);
        return <circle key={l.key} cx={x} cy={y} r="4" fill="#fff" />;
      })}
    </svg>
  );
}

export function Avatar({ m, size = 28 }: { m: Member | undefined; size?: number }) {
  if (!m) return null;
  return (
    <span className="avatar" title={m.name} style={{ width: size, height: size, background: m.color, fontSize: size * 0.5 }}>
      {m.emoji || m.name[0]}
    </span>
  );
}

/** Minimal, safe markdown: **bold**, *italic*, bullet and numbered lists, paragraphs. */
export function Markdown({ text }: { text: string }) {
  const inline = (s: string, key: number) => {
    const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return (
      <Fragment key={key}>
        {parts.map((p, i) =>
          p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
            <strong key={i}>{p.slice(2, -2)}</strong>
          ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
            <em key={i}>{p.slice(1, -1)}</em>
          ) : (
            p
          ),
        )}
      </Fragment>
    );
  };
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, i)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const b = line.match(/^\s*[-*•]\s+(.*)/);
    const n = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (b || n) {
      const ordered = !!n;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((b ?? n)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)/);
    blocks.push(h ? <h4 key={blocks.length}>{inline(h[1], 0)}</h4> : <p key={blocks.length}>{inline(line, 0)}</p>);
  }
  flush();
  return <div className="md">{blocks}</div>;
}

/** Text that edits in place and saves on blur, without being clobbered by live updates while focused. */
export function Editable({
  value,
  onSave,
  multiline,
  placeholder,
  className,
  maxLength,
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const props = {
    value: draft,
    placeholder,
    maxLength,
    className: `editable ${className ?? ""}`,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      if (draft.trim() !== value.trim()) onSave(draft.trim());
    },
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
  };
  return multiline ? (
    <textarea {...props} rows={Math.min(14, Math.max(3, draft.split("\n").length + 1))} />
  ) : (
    <input {...props} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Thinking({ label = "Thinking" }: { label?: string }) {
  return (
    <span className="thinking">
      <span className="orb" />
      {label}…
    </span>
  );
}

export function svgSrc(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const EMOJIS = ["💡", "🚀", "🌱", "🛠️", "🍽️", "🎨", "🏕️", "📖", "🧶", "🐾", "🏡", "🎧", "☕", "🧘", "🔧", "🛍️", "🎉", "🌍", "🤝", "💷"];
