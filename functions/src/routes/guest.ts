// Guest API: no account needed. View a memorial, add a memory, report something.
import { Hono } from "hono";
import { allowance } from "../../../src/shared/plans";
import { can } from "../../../src/shared/roles";
import { MAX_UPLOAD_BYTES } from "../../../src/shared/plans";
import { RELATIONS, type ContributionStatus, type ContributionType } from "../../../src/shared/types";
import type { AppEnv } from "../auth";
import { validEmail } from "../auth";
import { applyCountDelta } from "../counts";
import { sha256 } from "../crypto";
import { bucket, contributions, isSealed, logAudit, memorialBySlug, memorials, roleOf, type ContributionDoc, type MemorialDoc } from "../db";
import { clientIp, overLimit } from "../limits";
import { AUDIO_TYPES, extFor, IMAGE_TYPES, storeFile, storeImage, VIDEO_TYPES } from "../media";
import { queue } from "../notify";
import { combine, screenImage, screenText, type ScreeningResult } from "../screening";
import { contributionView, publicView } from "../views";
import { finishUpload } from "./uploads";
import { MEDIA_HEADERS, sniffMatches } from "../security";
import { Readable } from "node:stream";

export function decideStatus(m: Pick<MemorialDoc, "moderation">, screening: ScreeningResult, trusted: boolean): ContributionStatus {
  if (screening.outcome === "critical") return "hidden";
  if (screening.outcome === "review" || screening.outcome === "unavailable") return "pending";
  if (trusted) return "approved";
  if (m.moderation === "auto") return "approved";
  return "pending";
}

export const guestRoutes = new Hono<AppEnv>()
  .get("/:slug", async (c) => {
    const m = await memorialBySlug(c.req.param("slug"));
    if (!m) return c.json({ error: "Not found" }, 404);
    const role = await roleOf(m.id, c.get("uid"));
    if (m.privacy === "private" && !role) return c.json({ error: "Not found" }, 404);
    const [snap, ch] = await Promise.all([
      contributions(m.id).where("status", "==", "approved").orderBy("createdAt", "desc").limit(500).get(),
      memorials().doc(m.id).collection("chapters").orderBy("order").get(),
    ]);
    // Letters are for the family only, even once opened.
    const visible = snap.docs.filter((d) => !(d.data() as ContributionDoc).sealed);
    return c.json({
      memorial: publicView(m.id, m),
      role,
      chapters: ch.docs.map((d) => ({ id: d.id, title: d.data().title as string, order: d.data().order as number, era: d.data().era as string | undefined })),
      contributions: visible.map((d) => contributionView(m.id, d.id, d.data() as ContributionDoc, false)),
    });
  })
  .post("/:slug/contributions", async (c) => {
    const m = await memorialBySlug(c.req.param("slug"));
    if (!m) return c.json({ error: "Not found" }, 404);
    const uid = c.get("uid");
    const role = await roleOf(m.id, uid);
    if (m.privacy === "private" && !role) return c.json({ error: "Not found" }, 404);
    const allow = allowance(m.plan);
    if (!allow.acceptingContributions) return c.json({ error: "This page isn't taking new memories at the moment." }, 403);
    if (allow.contributionLimit != null && m.counts.total >= allow.contributionLimit)
      return c.json({ error: "This page has reached its free limit. The family can upgrade to add more." }, 402);
    const ip = clientIp(c.req.raw.headers);
    // The per-IP limit can be dodged by forging X-Forwarded-For, so the page also has a ceiling.
    if ((await overLimit(`contrib:${m.id}:${ip}`, 60)) || (await overLimit(`contrib-page:${m.id}`, 500)))
      return c.json({ error: "You've shared a lot in a short time. Please wait a bit." }, 429);

    const form = await c.req.parseBody();
    const authorName = (typeof form.name === "string" ? form.name.trim() : "").slice(0, 80);
    const text = (typeof form.text === "string" ? form.text.trim() : "").slice(0, 5000);
    const relation = typeof form.relation === "string" && (RELATIONS as readonly string[]).includes(form.relation) ? form.relation : undefined;
    const era = typeof form.era === "string" ? form.era.trim().slice(0, 20) || undefined : undefined;
    const email = typeof form.email === "string" && validEmail(form.email) ? form.email.trim().toLowerCase() : undefined;
    const source = form.source === "event" ? "event" : "online";
    const file = form.file instanceof File && form.file.size > 0 ? form.file : null;
    // Family members can file stories under a chapter, answer an interview question, or seal a letter.
    const chapterId = role && typeof form.chapterId === "string" && form.chapterId ? form.chapterId.slice(0, 40) : undefined;
    const prompt = role && typeof form.prompt === "string" ? form.prompt.trim().slice(0, 300) || undefined : undefined;
    const sealUntil = role && typeof form.sealUntil === "string" && (form.sealUntil === "passing" || /^\d{4}-\d{2}-\d{2}$/.test(form.sealUntil)) ? form.sealUntil : undefined;
    const sealed = sealUntil ? { until: sealUntil, to: typeof form.sealTo === "string" ? form.sealTo.trim().slice(0, 120) || undefined : undefined } : undefined;
    if (!authorName) return c.json({ error: "Please add your name so the family knows who shared this." }, 400);
    const uploadId = typeof form.uploadId === "string" ? form.uploadId : undefined;
    if (!file && !text && !uploadId) return c.json({ error: "Please add a photo, a recording or a few words." }, 400);
    if (file && file.size > MAX_UPLOAD_BYTES) return c.json({ error: "That file is too big (30 MB max). Try a shorter video." }, 413);

    let type: ContributionType = "text";
    // Browsers report recordings as e.g. "audio/webm;codecs=opus".
    const mime = file ? file.type.split(";")[0].trim().toLowerCase() : "";
    if (file) {
      if (IMAGE_TYPES.has(mime)) type = "photo";
      else if (VIDEO_TYPES.has(mime)) type = "video";
      else if (AUDIO_TYPES.has(mime)) type = "voice";
      else return c.json({ error: "That file type isn't supported. Please share a photo, video or voice recording." }, 415);
      if (type === "video" && !allow.video) return c.json({ error: "Video is part of the upgraded page. You can share photos and written memories." }, 402);
      if (type === "voice" && !allow.voice) return c.json({ error: "Voice messages are part of the upgraded page." }, 402);
    }

    const ref = contributions(m.id).doc();
    const prefix = `media/${m.id}/${ref.id}`;
    const checks: Promise<ScreeningResult>[] = [screenText(c.env, `${authorName}\n${text}`)];
    let media: ContributionDoc["media"];
    if (file) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (type === "photo") {
        try {
          const stored = await storeImage(prefix, buf);
          media = { display: stored.display, thumb: stored.thumb, mime: stored.mime, bytes: stored.bytes };
          checks.push(screenImage(c.env, stored.displayBuffer, file.name));
        } catch {
          return c.json({ error: "We couldn't read that photo. If it's from an iPhone, try 'Most Compatible' or a screenshot." }, 415);
        }
      } else {
        if (!sniffMatches(mime, buf.subarray(0, 64))) return c.json({ error: "That file doesn't look like a video or voice recording." }, 415);
        media = await storeFile(prefix, buf, mime, extFor(mime));
      }
    }
    if (uploadId && !file) {
      const done = await finishUpload(uploadId, m.id, prefix);
      if (!done) return c.json({ error: "The upload didn't finish. Please try again." }, 400);
      type = VIDEO_TYPES.has(done.mime) ? "video" : AUDIO_TYPES.has(done.mime) ? "voice" : "photo";
      if (type === "photo") {
        // A very large photo: process it like any other.
        const [buf] = await bucket().file(done.path).download();
        let stored: Awaited<ReturnType<typeof storeImage>>;
        try {
          stored = await storeImage(prefix, buf);
        } catch {
          return c.json({ error: "We couldn't read that photo. If it's from an iPhone, try 'Most Compatible' or a screenshot." }, 415);
        } finally {
          await bucket().file(done.path).delete().catch(() => undefined);
        }
        media = { display: stored.display, thumb: stored.thumb, mime: stored.mime, bytes: stored.bytes };
        checks.push(screenImage(c.env, stored.displayBuffer));
      } else {
        media = { original: done.path, mime: done.mime, bytes: done.size };
      }
    }
    const screening = combine(await Promise.all(checks));
    const trusted = !!role; // any member (trusted contributor and up) skips the queue
    const status = decideStatus(m, screening, trusted);
    const doc: ContributionDoc = JSON.parse(JSON.stringify({
      type, text: text || undefined, authorName, relation, era, authorEmail: email, authorUid: uid,
      status, screening, media, source, createdAt: Date.now(), ipHash: sha256(ip), chapterId, prompt, sealed,
      notifiedApproved: status === "approved",
    }));
    await ref.set(doc);
    await applyCountDelta(m.id, null, status);
    if (!trusted) await queue("new_contribution", m.id, ref.id);
    return c.json({ id: ref.id, status });
  })
  .post("/:slug/contributions/:cid/report", async (c) => {
    const m = await memorialBySlug(c.req.param("slug"));
    if (!m) return c.json({ error: "Not found" }, 404);
    if (m.privacy === "private" && !await roleOf(m.id, c.get("uid"))) return c.json({ error: "Not found" }, 404);
    const ip = clientIp(c.req.raw.headers);
    // Bounded reporting (DigiStayBook decideReport): a few reports per person, and a circuit breaker per page.
    if ((await overLimit(`report:${ip}`, 5, 24 * 3600_000)) || (await overLimit(`report-page:${m.id}`, 10)))
      return c.json({ ok: true, message: "Report received. It will be reviewed." });
    const ref = contributions(m.id).doc(c.req.param("cid"));
    const snap = await ref.get();
    const cur = snap.data() as ContributionDoc | undefined;
    if (cur && cur.status === "approved") {
      await ref.update({ status: "pending", reported: true });
      await applyCountDelta(m.id, "approved", "pending");
      await queue("report", m.id, ref.id);
      await logAudit(m.id, "guest", "reported", ref.id);
    }
    return c.json({ ok: true, message: "Report received. It will be reviewed." });
  });

/** Streams stored media after checking the viewer may see it. */
export const mediaRoutes = new Hono<AppEnv>().get("/:mid/:cid/:variant", async (c) => {
  const { mid, cid, variant } = c.req.param();
  const { getMemorial } = await import("../db");
  const m = await getMemorial(mid);
  if (!m) return c.notFound();
  const role = await roleOf(mid, c.get("uid"));
  const wallKey = c.req.query("k");
  const wallOk = !!wallKey && wallKey === m.wallKey;
  if (m.privacy === "private" && !role && !wallOk) return c.notFound();
  let path: string | undefined;
  if (cid === "cover") path = m.coverPath;
  else {
    const snap = await contributions(mid).doc(cid).get();
    const cdoc = snap.data() as ContributionDoc | undefined;
    if (!cdoc?.media) return c.notFound();
    if (cdoc.status !== "approved" && !can(role, "moderate")) return c.notFound();
    if (cdoc.sealed && (!role || (isSealed(cdoc) && cdoc.authorUid !== c.get("uid")))) return c.notFound();
    path = variant === "thumb" ? cdoc.media.thumb : variant === "display" ? cdoc.media.display : cdoc.media.original;
    path ??= cdoc.media.display ?? cdoc.media.original;
  }
  if (!path) return c.notFound();
  const file = bucket().file(path);
  const [meta] = await file.getMetadata().catch(() => [null]);
  if (!meta) return c.notFound();
  const size = Number(meta.size);
  const type = String(meta.contentType ?? "application/octet-stream");
  const headers = { ...MEDIA_HEADERS, "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" };
  // Range support so videos and audio can seek on iPhone.
  const range = parseRange(c.req.header("range"), size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  // Stream rather than buffer: a 200 MB video read into memory per request would exhaust the instance.
  const stream = (opts?: { start: number; end: number }) => Readable.toWeb(file.createReadStream(opts)) as ReadableStream;
  if (range) {
    return new Response(stream(range), { status: 206, headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(range.end - range.start + 1) } });
  }
  return new Response(stream(), { headers: { ...headers, "Content-Length": String(size) } });
});

/** A single byte range from a Range header: null when absent or ignorable, "invalid" when unsatisfiable. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null; // multi-range or malformed: send the whole file
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]); // bytes=-500 means the last 500 bytes
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return "invalid";
  return { start, end };
}
