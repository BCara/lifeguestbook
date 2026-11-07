// Daily jobs: renewal reminders (30 days, 7 days, lapsed), the day-before checklist and the recap
// the day after the service.
import { adminEmails, bucket, contributions, db, limits, memorials, type ContributionDoc, type MemorialDoc } from "./db";
import { anniversaryEmail, dayBeforeEmail, recapEmail, renewalEmail, sendEmail } from "./email";
import { unsubscribeUrl } from "./notify";
import { audit, members, memberships, users, type MemberDoc, type UserDoc } from "./db";
import { RECOVERY_WAIT_DAYS } from "./routes/legacy";
import type { Env } from "./env";
import { allowance } from "../../src/shared/plans";

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
      await sendEmail(env, dayBeforeEmail(a.email, m.name, allowance(m.plan, now).slideshow ? `${env.APP_ORIGIN}/wall?k=${m.wallKey}` : undefined, `${env.APP_ORIGIN}/dashboard/${d.id}`));
      sent++;
    }
    await d.ref.update({ dayBeforeSentAt: now });
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
    await d.ref.update({ recapSentAt: now });
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
    await db.runTransaction(async (tx) => {
      const m = (await tx.get(d.ref)).data() as MemorialDoc | undefined;
      if (!m?.recovery) return;
      const owner = (await tx.get(users().doc(m.ownerId))).data() as UserDoc | undefined;
      const requester = m.recovery.requestedBy;
      const nextOwner = (await tx.get(members(d.id).doc(requester))).data() as MemberDoc | undefined;
      const ownerReturned = (owner?.lastSeenAt ?? 0) > m.recovery.at;
      if (ownerReturned || nextOwner?.role !== "admin") {
        tx.update(d.ref, { recovery: null });
        tx.set(audit(d.id).doc(), {
          actor: m.ownerId, action: ownerReturned ? "recovery_cancelled_owner_returned" : "recovery_cancelled_requester_ineligible",
          target: requester, detail: null, at: now,
        });
        return;
      }
      if (now - m.recovery.at < RECOVERY_WAIT_DAYS * DAY) return;
      tx.update(members(d.id).doc(requester), { role: "owner" });
      tx.set(memberships(requester).doc(d.id), { role: "owner" }, { merge: true });
      tx.update(members(d.id).doc(m.ownerId), { role: "admin" });
      tx.set(memberships(m.ownerId).doc(d.id), { role: "admin" }, { merge: true });
      tx.update(d.ref, { ownerId: requester, recovery: null, pendingTransfer: null });
      tx.set(audit(d.id).doc(), { actor: requester, action: "recovery_completed", target: m.ownerId, detail: null, at: now });
    });
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
