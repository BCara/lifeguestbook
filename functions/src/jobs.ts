// Daily jobs: renewal reminders (30 days, 7 days, lapsed), the day-before checklist and the recap
// the day after the service.
import { adminEmails, bucket, contributions, db, limits, memorials, type ContributionDoc, type MemorialDoc } from "./db";
import { anniversaryEmail, dayBeforeEmail, recapEmail, renewalEmail, sendEmail } from "./email";
import { unsubscribeUrl } from "./notify";
import { logAudit, members, memberships, users, type UserDoc } from "./db";
import { RECOVERY_WAIT_DAYS } from "./routes/legacy";
import type { Env } from "./env";

const DAY = 24 * 3600_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function runDailyJobs(env: Env, now = Date.now()) {
  let sent = 0;
  const today = ymd(now);
  const tomorrow = ymd(now + DAY);
  const yesterday = ymd(now - DAY);

  // Renewals: only plans with an end date.
  const renewals = await memorials().where("plan.hostingUntil", "<=", now + 31 * DAY).get();
  for (const d of renewals.docs) {
    const m = d.data() as MemorialDoc;
    if (m.plan.hostingUntil == null) continue;
    const days = Math.ceil((m.plan.hostingUntil - now) / DAY);
    const stage = days <= 0 ? "lapsed" : days <= 7 ? "7" : days <= 30 ? "30" : null;
    if (!stage || m.reminders?.[stage]) continue;
    for (const a of await adminEmails(d.id, ["owner", "admin"])) {
      await sendEmail(env, renewalEmail(a.email, m.name, days, `${env.APP_ORIGIN}/dashboard/${d.id}?tab=plan`));
      sent++;
    }
    await d.ref.update({ [`reminders.${stage}`]: now });
  }

  // Day before the service.
  const tomorrowServices = await memorials().where("service.date", "==", tomorrow).get();
  for (const d of tomorrowServices.docs) {
    const m = d.data() as MemorialDoc;
    if (m.dayBeforeSentAt) continue;
    for (const a of await adminEmails(d.id)) {
      await sendEmail(env, dayBeforeEmail(a.email, m.name, `${env.APP_ORIGIN}/wall?k=${m.wallKey}`, `${env.APP_ORIGIN}/dashboard/${d.id}`));
      sent++;
    }
    await d.ref.update({ dayBeforeSentAt: now, notifyMode: "instant" });
  }

  // Recap the day after the service (and switch back to digest mode).
  const recapDue = await memorials().where("service.date", "in", [yesterday, today === yesterday ? today : yesterday]).get();
  for (const d of recapDue.docs) {
    const m = d.data() as MemorialDoc;
    if (m.recapSentAt || m.service?.date !== yesterday) continue;
    const snap = await contributions(d.id).where("status", "==", "approved").get();
    if (snap.empty) continue;
    const people = new Set(snap.docs.map((c) => (c.data() as ContributionDoc).authorName.toLowerCase())).size;
    for (const a of await adminEmails(d.id)) {
      await sendEmail(env, recapEmail(a.email, m.name, snap.size, people, `${env.APP_ORIGIN}/m/${m.slug}`));
      sent++;
    }
    await d.ref.update({ recapSentAt: now, notifyMode: "digest" });
  }
  // Anniversaries.
  const year = new Date(now).getUTCFullYear();
  const anniversaries = await memorials().where("diedMD", "==", today.slice(5)).get();
  for (const d of anniversaries.docs) {
    const m = d.data() as MemorialDoc;
    const years = m.died ? year - Number(m.died.slice(0, 4)) : 0;
    if (m.mode !== "memorial" || years < 1 || m.anniversarySentYear === year) continue;
    for (const a of await adminEmails(d.id)) {
      await sendEmail(env, anniversaryEmail(a.email, m.name, years, `${env.APP_ORIGIN}/m/${m.slug}`, unsubscribeUrl(env, a.uid)));
      sent++;
    }
    await d.ref.update({ anniversarySentYear: year });
  }

  // Ownership recovery: complete after the wait unless the owner came back.
  const recoveries = await memorials().where("recovery.at", "<", now).get();
  for (const d of recoveries.docs) {
    const m = d.data() as MemorialDoc;
    if (!m.recovery) continue;
    const owner = (await users().doc(m.ownerId).get()).data() as UserDoc | undefined;
    if (owner && (owner.lastSeenAt ?? 0) > m.recovery.at) {
      await d.ref.update({ recovery: null });
      await logAudit(d.id, m.ownerId, "recovery_cancelled_owner_returned");
      continue;
    }
    if (now - m.recovery.at < RECOVERY_WAIT_DAYS * DAY) continue;
    const to = m.recovery.requestedBy;
    await members(d.id).doc(to).update({ role: "owner" });
    await memberships(to).doc(d.id).set({ role: "owner" }, { merge: true });
    await members(d.id).doc(m.ownerId).update({ role: "admin" }).catch(() => undefined);
    await memberships(m.ownerId).doc(d.id).set({ role: "admin" }, { merge: true });
    await d.ref.update({ ownerId: to, recovery: null, pendingTransfer: null });
    await logAudit(d.id, to, "recovery_completed", m.ownerId);
  }

  await cleanUp(now);
  return sent;
}

/** Abandoned chunked uploads and old rate-limit counters. */
async function cleanUp(now: number) {
  const stale = await db.collection("uploads").where("expiresAt", "<", now).limit(200).get();
  for (const d of stale.docs) {
    await bucket().deleteFiles({ prefix: `tmp/${d.id}/` }).catch(() => undefined);
    await d.ref.delete();
  }
  const old = await limits().where("expiresAt", "<", now).limit(500).get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));
}
