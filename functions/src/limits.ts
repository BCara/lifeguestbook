import { limits } from "./db";
import { sha256 } from "./crypto";

/** Counts an action for a key in the current hour window; returns true if the limit is exceeded. */
export async function overLimit(key: string, max: number, windowMs = 3600_000): Promise<boolean> {
  const bucketStart = Math.floor(Date.now() / windowMs) * windowMs;
  const ref = limits().doc(sha256(`${key}:${bucketStart}`));
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  let count = 0;
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    count = ((snap.data()?.count as number) ?? 0) + 1;
    tx.set(ref, { count: FieldValue.increment(1), expiresAt: bucketStart + windowMs * 2 }, { merge: true });
  });
  return count > max;
}

/**
 * The caller's IP, for per-IP limits. X-Forwarded-For is appended to by every proxy, so its first
 * entries are whatever the caller sent (Google's front end keeps them and "does not verify" them).
 * Through the Firebase Hosting rewrite, Hosting appends the caller's address and Google's front end
 * then appends Hosting's own, so the caller is the entry one before the end.
 */
export function clientIp(headers: Headers) {
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return hops.length ? hops[Math.max(0, hops.length - 2)] : "unknown";
}
