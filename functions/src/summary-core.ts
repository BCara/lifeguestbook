// The owner's daily numbers: the portfolio summary feed (GET /api/admin/portfolio-summary, schema 1
// of the NAS SUMMARY-CONTRACT.md) and the owner's daily email are both built here from plain records.
// No imports with side effects, so the unit tests load this file directly. Firestore loading is in
// portfolio.ts.
//
// Privacy: only account holders' details (name, email) and page-level facts (the page name the
// family chose, its service date, counts) appear here. Nothing guests wrote (memories, names,
// emails, captions) is ever read for the report.
import { createHash, timingSafeEqual } from "node:crypto";

export const APP = "LifeGuestbook";
export const TIMEZONE = "Australia/Sydney";
export const UPCOMING_DAYS = 14;
const DAY = 86_400_000;

// ============================================================================ Sydney calendar days

const ymdFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The Sydney calendar date (YYYY-MM-DD) at instant `ms`. */
export const sydneyDate = (ms: number) => ymdFormat.format(new Date(ms));

/** `ymd` moved by `days` calendar days. */
export const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export function validYmd(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T12:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

const wallFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** Epoch ms of midnight at the start of `ymd` in Sydney (correct on daylight-saving change days). */
export function startOfSydneyDay(ymd: string) {
  const guess = Date.parse(`${ymd}T00:00:00Z`);
  let instant = guess;
  for (let i = 0; i < 3; i++) {
    const parts = wallFormat.formatToParts(new Date(instant));
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    const wall = Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`);
    const next = instant + guess - wall;
    if (next === instant) break;
    instant = next;
  }
  return instant;
}

/** Midnight-to-midnight Sydney window for `ymd`, plus the 7-day windows the contract asks for. */
export function windows(date: string) {
  const day = { from: startOfSydneyDay(date), to: startOfSydneyDay(addDays(date, 1)) };
  const last7 = { from: startOfSydneyDay(addDays(date, -6)), to: day.to };
  const prev7 = { from: startOfSydneyDay(addDays(date, -13)), to: last7.from };
  return { day, last7, prev7 };
}

// ============================================================================ Request auth

/** A key counts as configured unless it's empty or the repo's "none" switch-off value. */
export const keyConfigured = (key: string | undefined) => !!key && key.trim() !== "" && key !== "none";

/** Constant-time comparison (both sides hashed first, so different lengths don't leak either). */
export function keyMatches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** 404 when the feed isn't configured, 401 for a missing or wrong key, otherwise null (allowed). */
export function refuseSummary(authorization: string | null | undefined, key: string | undefined): 401 | 404 | null {
  if (!keyConfigured(key)) return 404;
  const m = /^Bearer (.+)$/.exec(authorization ?? "");
  if (!m || !keyMatches(m[1], key!)) return 401;
  return null;
}

// ============================================================================ Owner and test accounts

/**
 * The owner's own addresses. codebertcreations@gmail.com runs the Firebase project and the live
 * purchase check in GO-LIVE.md. ADMIN_EMAIL and REPORT_EXCLUDE_EMAILS are added at runtime.
 */
export const OWNER_EMAILS = ["codebertcreations@gmail.com"];
const RESERVED_DOMAINS = new Set(["example.com", "example.org", "example.net"]);

/**
 * The exclusion rule. An account is the owner's or a test account when any of these holds:
 * 1. its user record has `testAccount: true` (set by hand in the Firestore console);
 * 2. its email is one of OWNER_EMAILS, ADMIN_EMAIL or REPORT_EXCLUDE_EMAILS (comma-separated);
 * 3. its email uses a reserved test domain (example.com/.org/.net, or a .test, .example, .invalid or
 *    .localhost name, as the smoke test and emulators use);
 * 4. its email has a "+test" tag (owner+test1@gmail.com).
 * Pages owned by such an account, and payments made by it or for its pages, are left out too.
 */
export function isTestAccount(a: { email?: string | null; testAccount?: boolean }, extra: ReadonlySet<string>) {
  if (a.testAccount === true) return true;
  const email = (a.email ?? "").trim().toLowerCase();
  if (!email) return false;
  if (OWNER_EMAILS.includes(email) || extra.has(email)) return true;
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at), domain = email.slice(at + 1);
  if (local.includes("+test")) return true;
  return RESERVED_DOMAINS.has(domain) || /\.(test|example|invalid|localhost)$/.test(domain);
}

export const excludeList = (...lists: (string | undefined)[]) =>
  new Set(lists.flatMap((l) => (l ?? "").split(",")).map((e) => e.trim().toLowerCase()).filter(Boolean));

export const validEmail = (e: string | undefined): e is string => !!e && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e.trim());

// ============================================================================ Records

export interface AccountRec { uid: string; email: string; name?: string | null; createdAt: number; testAccount?: boolean }
export interface PageRec {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  mode?: string;
  /** The service date the family set (YYYY-MM-DD), the page's only meaningful event date. */
  serviceDate?: string | null;
  /** memorial.counts.total: memories added and not rejected. */
  contributions: number;
}
/** A `payments/{ref}` record (ref = Checkout Session id, renewal invoice id, or dev-… on the emulator). */
export interface PaymentRec {
  ref: string;
  memorialId?: string;
  product?: string;
  payerUid?: string;
  at?: number;
  /** "79.00 AUD" */
  amount?: string;
  revoked?: string;
  livemode?: boolean;
}
export interface UploadRec { memorialId: string; createdAt: number }
export interface SummaryInput {
  accounts: AccountRec[];
  pages: PageRec[];
  payments: PaymentRec[];
  /** Contributions created in the 14 days ending on `date`, or null when they couldn't be read. */
  uploads: UploadRec[] | null;
}

/** Live, test, or unknown (a renewal invoice recorded before payments stored `livemode`). */
export function paymentMode(p: Pick<PaymentRec, "ref" | "livemode">): "live" | "test" | "unknown" {
  if (p.livemode === true) return "live";
  if (p.livemode === false) return "test";
  if (p.ref.startsWith("cs_live_")) return "live";
  if (p.ref.startsWith("cs_test_") || p.ref.startsWith("dev-")) return "test";
  return "unknown";
}

/** "79.00 AUD" → { value: 79, currency: "AUD" } */
export function parseAmount(text: string | undefined) {
  const m = /^(\d+(?:\.\d+)?) ([A-Za-z]{3})\b/.exec((text ?? "").trim());
  return m ? { value: Number(m[1]), currency: m[2].toUpperCase() } : null;
}

/** A first purchase (Checkout Session) rather than a yearly renewal (invoice). */
const isUpgrade = (p: PaymentRec) => p.ref.startsWith("cs_");

// ============================================================================ The summary

export interface Counts {
  signUps: number;
  newEvents: number;
  uploads: number | null;
  upgrades: number;
  visits: null;
  errors: null;
  revenue: Record<string, number>;
  renewals: number;
  refundedOrDisputed: number;
}

export interface Summary {
  schema: 1;
  app: string;
  date: string;
  timezone: string;
  from: number;
  to: number;
  labels: { events: string };
  day: Counts;
  last7: Counts;
  prev7: Counts;
  totals: { accounts: number; events: number; uploads: number; upgrades: number };
  signUps: { name: string; email: string; createdAt: number }[];
  newEvents: { name: string; date: string | null; host: string; hostEmail: string; mode: string | null; createdAt: number }[];
  upcomingEvents: { name: string; date: string; host: string; hostEmail: string; uploads: number; paid: boolean; mode: string | null; createdAt: number }[];
  payments: { page: string; product: string; kind: "upgrade" | "renewal"; amount: number; currency: string; payer: string; at: number }[];
  testExcluded: { accounts: number; events: number; payments: number };
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildSummary(input: SummaryInput, opts: { date: string; now: number; exclude: ReadonlySet<string> }): Summary {
  const { date, now, exclude } = opts;
  const w = windows(date);
  const accounts = new Map(input.accounts.map((a) => [a.uid, a]));
  const testUids = new Set(input.accounts.filter((a) => isTestAccount(a, exclude)).map((a) => a.uid));
  const testPages = new Set(input.pages.filter((p) => testUids.has(p.ownerId)).map((p) => p.id));
  const realAccounts = input.accounts.filter((a) => !testUids.has(a.uid));
  const realPages = input.pages.filter((p) => !testPages.has(p.id));
  const pageById = new Map(input.pages.map((p) => [p.id, p]));
  const recorded = input.payments.filter((p) => typeof p.at === "number");
  const testPayment = (p: PaymentRec) =>
    paymentMode(p) !== "live" || (!!p.payerUid && testUids.has(p.payerUid)) || (!!p.memorialId && testPages.has(p.memorialId));
  const realPayments = recorded.filter((p) => !testPayment(p));
  const kept = realPayments.filter((p) => !p.revoked);
  const inside = (t: number, win: { from: number; to: number }) => t >= win.from && t < win.to;
  const person = (uid: string) => accounts.get(uid);

  const counts = (win: { from: number; to: number }): Counts => {
    const paid = kept.filter((p) => inside(p.at!, win));
    const revenue: Record<string, number> = {};
    for (const p of paid) {
      const a = parseAmount(p.amount);
      if (a) revenue[a.currency] = round2((revenue[a.currency] ?? 0) + a.value);
    }
    return {
      signUps: realAccounts.filter((a) => inside(a.createdAt, win)).length,
      newEvents: realPages.filter((p) => inside(p.createdAt, win)).length,
      uploads: input.uploads ? input.uploads.filter((u) => !testPages.has(u.memorialId) && inside(u.createdAt, win)).length : null,
      upgrades: paid.filter(isUpgrade).length,
      visits: null,
      errors: null,
      revenue,
      renewals: paid.filter((p) => !isUpgrade(p)).length,
      refundedOrDisputed: realPayments.filter((p) => p.revoked && inside(p.at!, win)).length,
    };
  };

  const today = sydneyDate(now);
  const until = addDays(today, UPCOMING_DAYS);
  const paidPages = new Set(kept.map((p) => p.memorialId));
  const host = (p: PageRec) => ({ host: person(p.ownerId)?.name || person(p.ownerId)?.email || "", hostEmail: person(p.ownerId)?.email ?? "" });
  const byTime = <T extends { createdAt: number }>(a: T, b: T) => a.createdAt - b.createdAt;

  const notes = [
    "Visits are not reported: Life Guestbook does not record site visits.",
    "Errors are not reported: server errors go to Cloud Logging only, and the app keeps no error count the report can read.",
    `Upcoming pages are those whose service date falls in the next ${UPCOMING_DAYS} days; pages without a service date (most Living Legacy pages) are not listed.`,
  ];
  if (!input.uploads) notes.push("Memories added could not be counted (the contributions index may still be building), so uploads are not reported.");
  const unknown = recorded.filter((p) => paymentMode(p) === "unknown" && inside(p.at!, w.last7)).length;
  if (unknown) notes.push(`${unknown} payment${unknown === 1 ? "" : "s"} this week recorded no Stripe mode and ${unknown === 1 ? "is" : "are"} left out of upgrades and revenue.`);
  const leftOutPayments = recorded.length - realPayments.length;

  return {
    schema: 1,
    app: APP,
    date,
    timezone: TIMEZONE,
    from: w.day.from,
    to: w.day.to,
    labels: { events: "pages" },
    day: counts(w.day),
    last7: counts(w.last7),
    prev7: counts(w.prev7),
    totals: {
      accounts: realAccounts.length,
      events: realPages.length,
      uploads: realPages.reduce((n, p) => n + (p.contributions || 0), 0),
      upgrades: kept.filter(isUpgrade).length,
    },
    signUps: realAccounts.filter((a) => inside(a.createdAt, w.day)).sort(byTime)
      .map((a) => ({ name: a.name ?? "", email: a.email, createdAt: a.createdAt })),
    newEvents: realPages.filter((p) => inside(p.createdAt, w.day)).sort(byTime)
      .map((p) => ({ name: p.name, date: p.serviceDate ?? null, ...host(p), mode: p.mode ?? null, createdAt: p.createdAt })),
    upcomingEvents: realPages.filter((p) => validYmd(p.serviceDate) && p.serviceDate >= today && p.serviceDate <= until)
      .sort((a, b) => a.serviceDate!.localeCompare(b.serviceDate!) || a.createdAt - b.createdAt)
      .map((p) => ({ name: p.name, date: p.serviceDate!, ...host(p), uploads: p.contributions || 0, paid: paidPages.has(p.id), mode: p.mode ?? null, createdAt: p.createdAt })),
    payments: kept.filter((p) => inside(p.at!, w.day)).sort((a, b) => a.at! - b.at!).map((p) => {
      const a = parseAmount(p.amount);
      return {
        page: pageById.get(p.memorialId ?? "")?.name ?? "",
        product: p.product ?? "",
        kind: isUpgrade(p) ? "upgrade" as const : "renewal" as const,
        amount: a?.value ?? 0,
        currency: a?.currency ?? "",
        payer: person(p.payerUid ?? "")?.name || person(p.payerUid ?? "")?.email || "",
        at: p.at!,
      };
    }),
    testExcluded: { accounts: testUids.size, events: testPages.size, payments: leftOutPayments },
    notes,
  };
}

// ============================================================================ Owner email

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const money = (r: Record<string, number>) => {
  const parts = Object.entries(r).sort().map(([c, v]) => `${c} ${v.toFixed(2)}`);
  return parts.length ? parts.join(", ") : "none";
};
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString("en-AU", { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const PRODUCTS: Record<string, string> = { tribute: "Tribute", forever: "Forever", hosting: "Yearly hosting", living: "Living Legacy" };

/** The owner's short daily email, built from the same summary the NAS reads. */
export function ownerEmail(s: Summary, appOrigin: string) {
  const d = s.day;
  const subject = `Life Guestbook ${fmtDay(s.date)}: ${plural(d.signUps, "sign-up")}, ${plural(d.newEvents, "new page")}, ${plural(d.upgrades, "upgrade")}`
    + (Object.keys(d.revenue).length ? ` (${money(d.revenue)})` : "");

  const rows: [string, string, string, string][] = [
    ["Sign-ups", ...[s.day, s.last7, s.prev7].map((c) => String(c.signUps))] as [string, string, string, string],
    ["New pages", ...[s.day, s.last7, s.prev7].map((c) => String(c.newEvents))] as [string, string, string, string],
    ["Memories added", ...[s.day, s.last7, s.prev7].map((c) => (c.uploads == null ? "–" : String(c.uploads)))] as [string, string, string, string],
    ["Upgrades (live)", ...[s.day, s.last7, s.prev7].map((c) => String(c.upgrades))] as [string, string, string, string],
    ["Renewals (live)", ...[s.day, s.last7, s.prev7].map((c) => String(c.renewals))] as [string, string, string, string],
    ["Revenue (live)", ...[s.day, s.last7, s.prev7].map((c) => money(c.revenue))] as [string, string, string, string],
    ["Refunded or disputed", ...[s.day, s.last7, s.prev7].map((c) => String(c.refundedOrDisputed))] as [string, string, string, string],
  ];
  const signUps = s.signUps.map((u) => `${u.name || "(no name)"} <${u.email}>, ${fmtTime(u.createdAt)}`);
  const pages = s.newEvents.map((p) => `${p.name} (${p.mode === "living" ? "Living Legacy" : "memorial"}${p.date ? `, service ${p.date}` : ""}) by ${p.host}${p.hostEmail && p.hostEmail !== p.host ? ` <${p.hostEmail}>` : ""}`);
  const payments = s.payments.map((p) => `${PRODUCTS[p.product] ?? p.product} ${p.kind === "renewal" ? "renewal " : ""}for ${p.page || "(deleted page)"}: ${p.currency} ${p.amount.toFixed(2)}, paid by ${p.payer || "unknown"}`);
  const upcoming = s.upcomingEvents.map((p) => `${p.date}: ${p.name} by ${p.host}, ${plural(p.uploads, "memory", "memories")}, ${p.paid ? "paid" : "free"}`);
  const t = s.testExcluded;
  const footer = [
    `Counts are for ${s.date}, midnight to midnight Sydney time. Left out as owner or test: ${plural(t.accounts, "account")}, ${plural(t.events, "page")}, ${plural(t.payments, "payment")} (test-mode or test-account).`,
    ...s.notes,
    "This email holds account holders' names and emails. Please don't forward it.",
  ];

  const section = (title: string, items: string[], empty: string) =>
    `<h2 style="font-size:16px;margin:24px 0 8px">${esc(title)}</h2>` +
    (items.length ? `<ul style="margin:0;padding-left:20px">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p style="margin:0;color:#8a7766">${esc(empty)}</p>`);
  const cell = "padding:4px 10px;border-bottom:1px solid #e8e0d8;text-align:right";
  const table = `<table style="border-collapse:collapse;font-size:14px"><tr><th style="${cell};text-align:left"></th><th style="${cell}">${esc(fmtDay(s.date))}</th><th style="${cell}">Last 7 days</th><th style="${cell}">7 days before</th></tr>`
    + rows.map((r) => `<tr><td style="${cell};text-align:left">${esc(r[0])}</td>${r.slice(1).map((v) => `<td style="${cell}">${esc(v)}</td>`).join("")}</tr>`).join("")
    + `</table><p style="font-size:13px;color:#8a7766">All time: ${plural(s.totals.accounts, "account")}, ${plural(s.totals.events, "page")}, ${plural(s.totals.uploads, "memory", "memories")}, ${plural(s.totals.upgrades, "upgrade")}.</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f7f3ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2f2721">
<div style="max-width:620px;margin:0 auto;padding:28px 20px;font-size:15px;line-height:1.55">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a7766;margin:0 0 12px">Life Guestbook · owner report</p>
<h1 style="font-size:22px;font-weight:normal;margin:0 0 16px">${esc(fmtDay(s.date))}</h1>
${table}
${section("Who signed up", signUps, "Nobody new.")}
${section("New pages", pages, "No new pages.")}
${section("Payments", payments, "No live payments.")}
${section(`Services in the next ${UPCOMING_DAYS} days`, upcoming, "None scheduled.")}
<p style="font-size:12px;color:#8a7766;margin-top:28px">${footer.map(esc).join("<br>")}</p>
<p style="font-size:12px;color:#8a7766"><a href="${esc(appOrigin)}" style="color:#8a7766">${esc(appOrigin.replace(/^https?:\/\//, ""))}</a></p>
</div></body></html>`;
  const list = (title: string, items: string[], empty: string) => `${title.toUpperCase()}\n${items.length ? items.map((i) => `- ${i}`).join("\n") : empty}`;
  const text = [
    `Life Guestbook owner report, ${fmtDay(s.date)}`,
    rows.map((r) => `${r[0]}: ${r[1]} (last 7 days ${r[2]}, 7 days before ${r[3]})`).join("\n"),
    `All time: ${plural(s.totals.accounts, "account")}, ${plural(s.totals.events, "page")}, ${plural(s.totals.uploads, "memory", "memories")}, ${plural(s.totals.upgrades, "upgrade")}.`,
    list("Who signed up", signUps, "Nobody new."),
    list("New pages", pages, "No new pages."),
    list("Payments", payments, "No live payments."),
    list(`Services in the next ${UPCOMING_DAYS} days`, upcoming, "None scheduled."),
    footer.join("\n"),
  ].join("\n\n");
  return { subject, html, text };
}
