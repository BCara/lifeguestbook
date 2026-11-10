// Loads the records for the owner's daily numbers from Firestore, serves the portfolio summary feed
// and sends the owner's daily email. The numbers themselves are worked out in summary-core.ts.
import { db, memorials, users, type MemorialDoc, type UserDoc } from "./db";
import { sendEmail } from "./email";
import type { Env } from "./env";
import {
  addDays, buildSummary, excludeList, ownerEmail, refuseSummary, sydneyDate, validEmail, validYmd, windows,
  type AccountRec, type PageRec, type PaymentRec, type SummaryInput, type UploadRec,
} from "./summary-core";

/**
 * Whole-collection reads of users, memorials and payments, limited to the fields the report needs.
 * Fine at this app's size (hundreds of records); revisit with count() aggregates if it grows large.
 */
export async function loadInput(uploadsFrom: number, uploadsTo: number): Promise<SummaryInput> {
  const [u, m, p, uploads] = await Promise.all([
    users().select("email", "name", "createdAt", "testAccount").get(),
    memorials().select("name", "ownerId", "createdAt", "mode", "service", "counts").get(),
    db.collection("payments").select("memorialId", "product", "payerUid", "at", "amount", "revoked", "livemode").get(),
    // Contributions only by time and page. Never their text, names or emails.
    db.collectionGroup("contributions").where("createdAt", ">=", uploadsFrom).where("createdAt", "<", uploadsTo).select("createdAt").get()
      .then((s) => s.docs.map((d): UploadRec => ({ memorialId: d.ref.parent.parent?.id ?? "", createdAt: d.get("createdAt") as number })))
      .catch((e: unknown) => {
        console.error("owner report: could not count contributions", e instanceof Error ? e.message : e);
        return null;
      }),
  ]);
  return {
    accounts: u.docs.map((d) => {
      const x = d.data() as Partial<UserDoc> & { testAccount?: boolean };
      return { uid: d.id, email: x.email ?? "", name: x.name ?? null, createdAt: x.createdAt ?? 0, testAccount: x.testAccount === true } satisfies AccountRec;
    }),
    pages: m.docs.map((d) => {
      const x = d.data() as Partial<MemorialDoc>;
      return { id: d.id, name: x.name ?? "", ownerId: x.ownerId ?? "", createdAt: x.createdAt ?? 0, mode: x.mode, serviceDate: x.service?.date ?? null, contributions: x.counts?.total ?? 0 } satisfies PageRec;
    }),
    payments: p.docs.map((d) => ({ ref: d.id, ...(d.data() as Omit<PaymentRec, "ref">) })),
    uploads,
  };
}

const excluded = (env: Env) => excludeList(env.ADMIN_EMAIL, env.REPORT_EXCLUDE_EMAILS);

export async function portfolioSummary(env: Env, date: string, now = Date.now()) {
  const w = windows(date);
  return buildSummary(await loadInput(w.prev7.from, w.day.to), { date, now, exclude: excluded(env) });
}

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

/** GET /api/admin/portfolio-summary?date=YYYY-MM-DD with `Authorization: Bearer <PORTFOLIO_REPORT_KEY>`. */
export async function portfolioSummaryResponse(env: Env, req: Request, now = Date.now()): Promise<Response> {
  const refused = refuseSummary(req.headers.get("authorization"), env.PORTFOLIO_REPORT_KEY);
  if (refused) return new Response(null, { status: refused, headers: HEADERS });
  const asked = new URL(req.url).searchParams.get("date");
  if (asked !== null && !validYmd(asked)) {
    return new Response(JSON.stringify({ error: "date must be YYYY-MM-DD" }), { status: 400, headers: { ...HEADERS, "Content-Type": "application/json" } });
  }
  const date = asked ?? addDays(sydneyDate(now), -1);
  // Never log the body: it holds account holders' names and emails.
  const body = await portfolioSummary(env, date, now);
  return new Response(JSON.stringify(body), { status: 200, headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" } });
}

const reports = () => db.collection("ownerDailyReports");
const CLAIM_MS = 15 * 60_000;

/**
 * Emails yesterday's (Sydney) numbers to ADMIN_EMAIL, at most once per day: `ownerDailyReports/{date}`
 * is claimed before sending and marked sent after, and Resend gets the same idempotency key on a
 * retry. A failed send releases the claim so the scheduler's retry can try again. No ADMIN_EMAIL, no email.
 */
export async function runOwnerReport(env: Env, now = Date.now()) {
  const to = env.ADMIN_EMAIL?.trim();
  if (!validEmail(to)) return { sent: false as const, reason: "no ADMIN_EMAIL" };
  const date = addDays(sydneyDate(now), -1);
  const ref = reports().doc(date);
  const claimed = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as { status?: string; claimedAt?: number } | undefined;
    if (cur?.status === "sent") return false;
    if (cur?.status === "sending" && now - (cur.claimedAt ?? 0) < CLAIM_MS) return false;
    tx.set(ref, { status: "sending", claimedAt: now });
    return true;
  });
  if (!claimed) return { sent: false as const, reason: "already sent", date };
  try {
    const summary = await portfolioSummary(env, date, now);
    const email = ownerEmail(summary, env.APP_ORIGIN);
    await sendEmail(env, { to, ...email }, `owner-report-${date}`);
    await ref.set({ status: "sent", claimedAt: now, sentAt: Date.now() });
    console.info(`owner report sent for ${date}`);
    return { sent: true as const, date, subject: email.subject };
  } catch (e) {
    await ref.delete().catch(() => undefined);
    throw e;
  }
}
