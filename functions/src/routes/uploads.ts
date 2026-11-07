// Large files (videos up to 200 MB) arrive in 8 MB chunks, one request each, so they fit under the
// ~32 MB request limit of Hosting + Functions and survive patchy signal at venues: the browser
// retries only the chunk that failed. The finished contribution then refers to the uploadId and the
// chunks are combined in Cloud Storage without passing through the function.
import { Hono } from "hono";
import { allowance, MAX_VIDEO_BYTES } from "../../../src/shared/plans";
import type { AppEnv } from "../auth";
import { randomToken, sha256 } from "../crypto";
import { bucket, db, memorialBySlug, roleOf } from "../db";
import { clientIp, overLimit } from "../limits";
import { pipeline } from "node:stream/promises";
import type { File as StorageFile } from "@google-cloud/storage";
import { AUDIO_TYPES, extFor, IMAGE_TYPES, VIDEO_TYPES } from "../media";
import { sniffMatches } from "../security";

export const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_CHUNKS = 32; // Cloud Storage compose takes at most 32 sources
const uploads = () => db.collection("uploads");
/** Upload ids are always randomToken(16); anything else never reaches Firestore or Storage paths. */
export const validUploadId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{22}$/.test(id);

export interface UploadDoc { memorialId: string; mime: string; size: number; chunks: number; received: number[]; ipHash: string; expiresAt: number; done?: boolean }

export const uploadRoutes = new Hono<AppEnv>()
  .post("/:slug/uploads", async (c) => {
    const m = await memorialBySlug(c.req.param("slug"));
    if (!m) return c.json({ error: "Not found" }, 404);
    const role = await roleOf(m.id, c.get("uid"));
    if (m.privacy === "private" && !role) return c.json({ error: "Not found" }, 404);
    const allow = allowance(m.plan);
    if (!allow.acceptingContributions) return c.json({ error: "This page isn't taking new memories at the moment." }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { size?: number; type?: string };
    const mime = (b.type ?? "").split(";")[0].trim().toLowerCase();
    const size = Number(b.size);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_BYTES) return c.json({ error: "Files can be up to 200 MB. Try a shorter clip." }, 413);
    const isVideo = VIDEO_TYPES.has(mime), isAudio = AUDIO_TYPES.has(mime);
    if (!isVideo && !isAudio && !IMAGE_TYPES.has(mime)) return c.json({ error: "That file type isn't supported." }, 415);
    if ((isVideo && !allow.video) || (isAudio && !allow.voice)) return c.json({ error: "Video and voice are part of the upgraded page." }, 402);
    const ip = clientIp(c.req.raw.headers);
    // The per-IP limit can be dodged by forging X-Forwarded-For, so the page also has a ceiling.
    if ((await overLimit(`upload:${m.id}:${ip}`, 40)) || (await overLimit(`upload-page:${m.id}`, 300)))
      return c.json({ error: "You've shared a lot in a short time. Please wait a bit." }, 429);
    const chunks = Math.ceil(size / CHUNK_BYTES);
    if (chunks > MAX_CHUNKS) return c.json({ error: "That file is too big." }, 413);
    const id = randomToken(16);
    await uploads().doc(id).set({ memorialId: m.id, mime, size, chunks, received: [], ipHash: sha256(ip), expiresAt: Date.now() + 24 * 3600_000 } satisfies UploadDoc);
    return c.json({ uploadId: id, chunkBytes: CHUNK_BYTES, chunks });
  })
  .put("/:slug/uploads/:uploadId/:index", async (c) => {
    const { uploadId, index } = c.req.param();
    const i = Number(index);
    if (!validUploadId(uploadId) || !/^\d{1,2}$/.test(index)) return c.json({ error: "This upload has expired. Please try again." }, 410);
    const ref = uploads().doc(uploadId);
    const u = (await ref.get()).data() as UploadDoc | undefined;
    if (!u || u.done || u.expiresAt < Date.now() || !Number.isInteger(i) || i < 0 || i >= u.chunks) return c.json({ error: "This upload has expired. Please try again." }, 410);
    const body = Buffer.from(await c.req.arrayBuffer());
    const expected = i === u.chunks - 1 ? u.size - CHUNK_BYTES * (u.chunks - 1) : CHUNK_BYTES;
    if (body.length !== expected) return c.json({ error: "Part of the file went missing. Retrying…" }, 400);
    // Photos are re-encoded later; video and audio are served as stored, so their bytes must match the type.
    if (i === 0 && !IMAGE_TYPES.has(u.mime) && !sniffMatches(u.mime, body.subarray(0, 64))) {
      await ref.update({ done: true });
      return c.json({ error: "That file doesn't look like a video or voice recording." }, 415);
    }
    await bucket().file(`tmp/${uploadId}/${String(i).padStart(3, "0")}`).save(body, { resumable: false, contentType: "application/octet-stream" });
    const { FieldValue } = await import("firebase-admin/firestore");
    await ref.update({ received: FieldValue.arrayUnion(i) });
    return c.json({ ok: true });
  });

/** Combines the chunks into the final object. Returns the stored path, or null if parts are missing. */
export async function finishUpload(uploadId: string, memorialId: string, prefix: string) {
  if (!validUploadId(uploadId)) return null;
  const ref = uploads().doc(uploadId);
  const u = (await ref.get()).data() as UploadDoc | undefined;
  if (!u || u.done || u.memorialId !== memorialId || u.received.length !== u.chunks) return null;
  const parts = Array.from({ length: u.chunks }, (_, i) => bucket().file(`tmp/${uploadId}/${String(i).padStart(3, "0")}`));
  const path = `${prefix}/original.${extFor(u.mime)}`;
  const target = bucket().file(path);
  if (parts.length === 1) await parts[0].copy(target);
  else {
    try {
      await bucket().combine(parts, target);
    } catch {
      // The Storage emulator has no compose; stream the parts into one object instead.
      await concatInto(parts, target, u.mime);
    }
  }
  await target.setMetadata({ contentType: u.mime });
  await ref.update({ done: true });
  await bucket().deleteFiles({ prefix: `tmp/${uploadId}/` }).catch(() => undefined);
  return { path, mime: u.mime, size: u.size };
}

async function concatInto(parts: StorageFile[], target: StorageFile, contentType: string) {
  const out = target.createWriteStream({ resumable: false, contentType });
  const done = new Promise<void>((resolve, reject) => out.on("finish", () => resolve()).on("error", reject));
  for (const part of parts) await pipeline(part.createReadStream(), out, { end: false });
  out.end();
  await done;
}
