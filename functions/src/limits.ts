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
    const expiresAt = bucketStart + windowMs * 2;
    // deleteAt is a Timestamp so the Firestore TTL policy (firestore.indexes.json) can remove old counters.
    tx.set(ref, { count: FieldValue.increment(1), expiresAt, deleteAt: new Date(expiresAt + 24 * 3600_000) }, { merge: true });
  });
  return count > max;
}

export function clientIp(headers: Headers) {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}
