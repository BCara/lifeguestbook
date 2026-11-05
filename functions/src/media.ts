// Stores uploads in Firebase Storage. Photos are auto-rotated, stripped of EXIF/GPS (sharp drops
// metadata unless asked to keep it) and saved as a display copy and a thumbnail. Video and voice
// are stored as uploaded.
import sharp from "sharp";
import { bucket } from "./db";

export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif"]);
export const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
export const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/aac"]);

export async function storeImage(prefix: string, input: Buffer) {
  const base = sharp(input, { failOn: "none" }).rotate();
  const display = await base.clone().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  const thumb = await base.clone().resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  await Promise.all([
    bucket().file(`${prefix}/display.jpg`).save(display, { contentType: "image/jpeg", resumable: false }),
    bucket().file(`${prefix}/thumb.jpg`).save(thumb, { contentType: "image/jpeg", resumable: false }),
  ]);
  return { display: `${prefix}/display.jpg`, thumb: `${prefix}/thumb.jpg`, mime: "image/jpeg", bytes: display.length, displayBuffer: display };
}

export async function storeFile(prefix: string, input: Buffer, mime: string, ext: string) {
  const path = `${prefix}/original.${ext}`;
  await bucket().file(path).save(input, { contentType: mime, resumable: false });
  return { original: path, mime, bytes: input.length };
}

export const extFor = (mime: string) =>
  ({ "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/aac": "aac" })[mime] ?? "bin";

export async function deletePrefix(prefix: string) {
  await bucket().deleteFiles({ prefix }).catch(() => undefined);
}
