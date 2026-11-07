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
 * Best-effort client address for rate limiting. X-Forwarded-For's first entry is supplied by the
 * client and can be forged, so every IP-keyed limit must be paired with a limit on something the
 * caller can't vary (the email address, the memorial, the signed-in user).
 */
export function clientIp(headers: Headers) {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}
