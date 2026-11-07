import { db, invites, members, memorials, users, type InviteDoc, type MemberDoc, type UserDoc } from "./db";
import { sendEmail, type Email } from "./email";
import type { Env } from "./env";

const deliveries = () => db.collection("guestbookEmailOutbox");
export const guestbookEmail = (memorialId: string, key: string) => deliveries().doc(`${memorialId}-${key}`);
const RETRY_MS = 5 * 60_000;

export async function deliverGuestbookEmails(env: Env, memorialId?: string) {
  const now = Date.now();
  const query = memorialId
    ? deliveries().where("memorialId", "==", memorialId)
    : deliveries().where("dueAt", "<=", now);
  const pending = await query.limit(100).get();
  for (const doc of pending.docs) {
    const email = await db.runTransaction(async (tx) => {
      const job = (await tx.get(doc.ref)).data() as { dueAt: number; memorialId: string; inviteId?: string; optOutUid?: string; email: Email } | undefined;
      if (!job || job.dueAt > now) return null;
      const memorial = await tx.get(memorials().doc(job.memorialId));
      const invite = job.inviteId ? (await tx.get(invites().doc(job.inviteId))).data() as InviteDoc | undefined : undefined;
      const user = job.optOutUid ? (await tx.get(users().doc(job.optOutUid))).data() as UserDoc | undefined : undefined;
      const member = job.optOutUid ? (await tx.get(members(job.memorialId).doc(job.optOutUid))).data() as MemberDoc | undefined : undefined;
      const ineligible = job.optOutUid && (user?.emailOptOut || !member || member.role === "trusted");
      if (ineligible || !memorial.exists || (job.inviteId && (!invite || invite.acceptedBy || invite.expiresAt <= now))) {
        tx.delete(doc.ref);
        return null;
      }
      tx.update(doc.ref, { dueAt: Date.now() + RETRY_MS });
      return job.email;
    });
    if (!email) continue;
    try {
      await sendEmail(env, email, doc.id);
      await doc.ref.delete();
    } catch {
      console.warn("Guestbook email delivery failed and will be retried", { deliveryId: doc.id });
    }
  }
}
