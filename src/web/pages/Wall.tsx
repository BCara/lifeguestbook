import { useEffect, useRef, useState } from "react";
import type { ContributionView } from "../../shared/types";
import { lifeDates } from "../components";
import { query } from "../router";

interface WallData { name: string; born?: string; died?: string; slug: string; coverUrl: string | null; wall: { paused?: boolean; pinnedId?: string | null; skip?: number }; items: ContributionView[] }

const SLIDE_MS = 8000;

export function Wall() {
  const key = query(location.search, "k") ?? "";
  const [data, setData] = useState<WallData>();
  const [error, setError] = useState<string>();
  const [index, setIndex] = useState(0);
  const seen = useRef(new Set<string>());
  const fresh = useRef<string[]>([]);
  const lastSkip = useRef<number | undefined>(undefined);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/wall?k=${encodeURIComponent(key)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Slideshow unavailable");
        if (stop) return;
        const d = body as WallData;
        // Newly approved memories jump the queue so people see theirs quickly.
        for (const it of d.items) {
          if (!seen.current.has(it.id)) {
            if (seen.current.size > 0) fresh.current.push(it.id);
            seen.current.add(it.id);
          }
        }
        if (lastSkip.current !== undefined && d.wall.skip !== lastSkip.current) setIndex((i) => i + 1);
        lastSkip.current = d.wall.skip ?? 0;
        setData(d);
        setError(undefined);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [key]);

  const items = data?.items ?? [];
  const paused = !!data?.wall.paused;
  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setTimeout(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [index, paused, items.length]);

  if (error && !data) return <div className="wall"><div className="wall-title"><p>{error}</p></div></div>;
  if (!data) return <div className="wall" />;
  if (!items.length)
    return (
      <div className="wall">
        <div className="wall-title">
          {data.coverUrl && <img src={data.coverUrl} alt="" />}
          <h1>{data.name}</h1>
          <p>{lifeDates(data.born, data.died)}</p>
          <p className="wall-hint">Scan the QR code on your table to share a photo or memory</p>
        </div>
      </div>
    );
  let current: ContributionView | undefined;
  if (data.wall.pinnedId) current = items.find((x) => x.id === data.wall.pinnedId);
  if (!current && fresh.current.length) {
    const id = fresh.current[0];
    current = items.find((x) => x.id === id);
    // Show each fresh one once, then continue the loop.
    setTimeout(() => (fresh.current = fresh.current.filter((x) => x !== id)), SLIDE_MS - 100);
  }
  current ??= items[index % items.length];
  return (
    <div className="wall" onDoubleClick={() => document.documentElement.requestFullscreen?.()}>
      <div className="wall-slide" key={current.id}>
        {current.type === "photo" && <img src={current.mediaUrl} alt="" className="wall-photo" />}
        {current.type === "video" && <video src={current.mediaUrl} autoPlay muted playsInline className="wall-photo" />}
        {(current.text || current.type === "voice") && (
          <blockquote className={current.type === "photo" || current.type === "video" ? "wall-caption" : "wall-quote"}>
            {current.text && <p>{current.text.length > 400 ? current.text.slice(0, 400) + "…" : current.text}</p>}
            <cite>{current.authorName}{current.relation ? ` · ${current.relation}` : ""}</cite>
          </blockquote>
        )}
        {!current.text && current.type !== "voice" && <p className="wall-byline">{current.authorName}</p>}
      </div>
      <div className="wall-footer">{data.name} · {lifeDates(data.born, data.died)}{paused ? " · paused" : ""}</div>
    </div>
  );
}
