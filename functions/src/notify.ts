// Guest activity goes into `notificationOutbox` (DigiStayBook pattern). A worker drains it into one
// digest per admin per memorial, so 200 guests never mean 200 emails. In "instant" mode (the day of
// the service) the worker runs every few minutes from the scheduled function anyway; the digest
// just covers a shorter window.
import { adminEmails, db, getMemorial, outbox, type OutboxDoc } from "./db";
import { hmac } from "./crypto";
import { digestEmail } from "./email";
import { guestbookEmail } from "./guestbook-email";
import type { Env } from "./env";

export async function queue(kind: OutboxDoc["kind"], memorialId: string, contributionId: string) {
  await outbox().add({ kind, memorialId, contributionId, status: "pending", createdAt: Date.now() } satisfies OutboxDoc);
}

const DIGEST_EVERY_MS = 60 * 60_000;
const INSTANT_EVERY_MS = 5 * 60_000;

export function unsubscribeUrl(env: Env, uid: string) {
  return `${env.APP_ORIGIN}/api/email/unsubscribe?u=${uid}&s=${hmac(env.RESEND_API_KEY || "dev", uid)}`;
}

export async function runDigests(env: Env, now = Date.now(), force = false) {
  const snap = await outbox().where("status", "==", "pending").limit(100).get();
  const byMemorial = new Map<string, { docs: FirebaseFirestore.QueryDocumentSnapshot[]; oldest: number; reports: number }>();
  for (const d of snap.docs) {
    const o = d.data() as OutboxDoc;
    const g = byMemorial.get(o.memorialId) ?? { docs: [], oldest: Infinity, reports: 0 };
    g.docs.push(d);
    g.oldest = Math.min(g.oldest, o.createdAt);
    if (o.kind === "report") g.reports++;
    byMemorial.set(o.memorialId, g);
  }
  let sent = 0;
  for (const [mid, g] of byMemorial) {
    const m = await getMemorial(mid);
    if (!m) {
      await Promise.all(g.docs.map((d) => d.ref.update({ status: "sent" })));
      continue;
    }
    const serviceDate = Date.parse(m.service?.date ?? "");
    const serviceWindow = now >= serviceDate - 24 * 3600_000 && now < serviceDate + 24 * 3600_000;
    const wait = g.reports > 0 || m.notifyMode === "instant" || serviceWindow ? INSTANT_EVERY_MS : DIGEST_EVERY_MS;
    if (!force && now - g.oldest < wait) continue;
    const recipients = await adminEmails(mid);
    const reviewUrl = `${env.APP_ORIGIN}/dashboard/${mid}`;
    sent += await db.runTransaction(async (tx) => {
      const docs = await tx.getAll(...g.docs.map((doc) => doc.ref));
      const pending = docs.filter((doc) => doc.get("status") === "pending");
      if (!pending.length) return 0;
      const reports = pending.filter((doc) => doc.get("kind") === "report").length;
      const digestId = pending[0].id;
      for (const r of recipients) {
        const email = digestEmail(r.email, m.name, pending.length - reports, m.counts.pending, reports, reviewUrl, unsubscribeUrl(env, r.uid));
        tx.create(guestbookEmail(mid, `digest-${digestId}-${r.uid}`), { memorialId: mid, optOutUid: r.uid, email, dueAt: Date.now() });
      }
      for (const doc of pending) tx.update(doc.ref, { status: "sent", sentAt: now });
      return recipients.length;
    });
  }
  return sent;
}
