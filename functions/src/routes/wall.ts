// Live slideshow for screens at the service. Authorised by the wall key in the URL, so venue
// laptops don't need an account. Polled every few seconds.
import { Hono } from "hono";
import { allowance } from "../../../src/shared/plans";
import type { AppEnv } from "../auth";
import { sha256 } from "../crypto";
import { contributions, getMemorial, walls, type ContributionDoc } from "../db";
import { contributionView } from "../views";

export const wallRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const key = c.req.query("k") ?? "";
  const w = await walls().doc(sha256(key)).get();
  const mid = (w.data() as { memorialId: string } | undefined)?.memorialId;
  const m = mid ? await getMemorial(mid) : null;
  if (!m || !mid || !key || m.wallKey !== key) return c.json({ error: "This slideshow link isn't valid any more." }, 404);
  if (!allowance(m.plan).slideshow) return c.json({ error: "The live slideshow is part of the upgraded page.", name: m.name, locked: true }, 402);
  const snap = await contributions(mid).where("status", "==", "approved").orderBy("createdAt", "desc").limit(400).get();
  const items = snap.docs.filter((d) => !(d.data() as ContributionDoc).sealed).map((d) => {
    const v = contributionView(mid, d.id, d.data() as ContributionDoc, false);
    const k = `k=${encodeURIComponent(key)}`;
    return { ...v, mediaUrl: v.mediaUrl && `${v.mediaUrl}?${k}`, thumbUrl: v.thumbUrl && `${v.thumbUrl}?${k}` };
  });
  return c.json({
    name: m.name,
    born: m.born,
    died: m.died,
    slug: m.slug,
    coverUrl: m.coverPath ? `/api/media/${mid}/cover/display?k=${encodeURIComponent(key)}` : null,
    wall: m.wall ?? {},
    items,
  });
});
