import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDays, buildSummary, excludeList, isTestAccount, ownerEmail, paymentMode, refuseSummary, startOfSydneyDay, sydneyDate, windows,
  type SummaryInput,
} from "../functions/src/summary-core";

// Synthetic records only. The fake Firestore below serves them to portfolio.ts.
const state = vi.hoisted(() => ({
  input: { users: [] as any[], memorials: [] as any[], payments: [] as any[], contributions: [] as any[] },
  reports: new Map<string, any>(),
  sent: [] as { email: any; id?: string }[],
  failSend: 0,
}));
vi.mock("../functions/src/db", () => {
  const snap = (rows: any[]) => ({ docs: rows.map(({ id, ...data }) => ({ id, data: () => data, get: (k: string) => (data as any)[k], ref: { parent: { parent: { id: data.memorialId } } } })) });
  const coll = (name: string) => ({
    select: () => ({ get: async () => snap((state.input as any)[name]) }),
    doc: (id: string) => ({
      id, get: async () => ({ data: () => state.reports.get(id) }),
      set: async (v: any) => void state.reports.set(id, v),
      delete: async () => void state.reports.delete(id),
    }),
  });
  return {
    db: {
      collection: coll,
      collectionGroup: () => {
        const q: any = { where: () => q, select: () => q, get: async () => snap(state.input.contributions) };
        return q;
      },
      runTransaction: async (fn: any) => fn({
        get: (ref: any) => ref.get(),
        set: (ref: any, v: any) => state.reports.set(ref.id, v),
      }),
    },
    users: () => coll("users"),
    memorials: () => coll("memorials"),
  };
});
vi.mock("../functions/src/email", () => ({
  sendEmail: vi.fn(async (_env: any, email: any, id?: string) => {
    if (state.failSend > 0) { state.failSend--; throw new Error("Resend 500"); }
    state.sent.push({ email, id });
  }),
}));

import { portfolioSummaryResponse, runOwnerReport } from "../functions/src/portfolio";

const KEY = "synthetic-test-key-not-a-secret";
const env = { APP_ORIGIN: "https://lifeguestbook.com", PORTFOLIO_REPORT_KEY: KEY, ADMIN_EMAIL: "owner-report@example.org", REPORT_EXCLUDE_EMAILS: "" } as any;
const DATE = "2026-11-10";
const W = windows(DATE);
const NOW = W.day.to + 2 * 3600_000; // 02:00 Sydney on 11 Nov

const empty = (): SummaryInput => ({ accounts: [], pages: [], payments: [], uploads: [] });
const build = (input: SummaryInput, exclude = new Set<string>()) => buildSummary(input, { date: DATE, now: NOW, exclude });

describe("Sydney windows", () => {
  it("runs midnight to midnight Sydney time, never a rolling 24 hours", () => {
    // 10 Nov 2026 is daylight time (UTC+11).
    expect(W.day.from).toBe(Date.parse("2026-11-09T13:00:00Z"));
    expect(W.day.to).toBe(Date.parse("2026-11-10T13:00:00Z"));
    expect(W.last7.from).toBe(startOfSydneyDay("2026-11-04"));
    expect(W.prev7).toEqual({ from: startOfSydneyDay("2026-10-28"), to: W.last7.from });
  });
  it("handles the daylight-saving change days (23 and 25 hour days)", () => {
    const spring = windows("2026-10-04");
    expect(spring.day.to - spring.day.from).toBe(23 * 3600_000);
    const autumn = windows("2026-04-05");
    expect(autumn.day.to - autumn.day.from).toBe(25 * 3600_000);
  });
  it("matches the contract's example window", () => {
    expect(windows("2026-11-09").day.from).toBe(1794142800000);
    expect(windows("2026-11-09").day.to).toBe(1794229200000);
  });
  it("counts the first millisecond of the day and leaves out midnight at the end", () => {
    const at = (t: number, i: number) => ({ uid: `u${i}`, email: `person${i}@gmail.com`, createdAt: t });
    const s = build({ ...empty(), accounts: [at(W.day.from - 1, 1), at(W.day.from, 2), at(W.day.to - 1, 3), at(W.day.to, 4)] });
    expect(s.day.signUps).toBe(2);
    expect(s.signUps.map((u) => u.email)).toEqual(["person2@gmail.com", "person3@gmail.com"]);
    expect(s.from).toBe(W.day.from);
    expect(s.to).toBe(W.day.to);
    expect(sydneyDate(W.day.to - 1)).toBe(DATE);
  });
});

describe("request auth", () => {
  it("answers 404 when the key isn't configured", () => {
    expect(refuseSummary(`Bearer ${KEY}`, "")).toBe(404);
    expect(refuseSummary(`Bearer none`, "none")).toBe(404);
    expect(refuseSummary(`Bearer x`, undefined)).toBe(404);
  });
  it("answers 401 for a missing, malformed or wrong key", () => {
    expect(refuseSummary(null, KEY)).toBe(401);
    expect(refuseSummary(KEY, KEY)).toBe(401);
    expect(refuseSummary(`Basic ${KEY}`, KEY)).toBe(401);
    expect(refuseSummary(`Bearer ${KEY}x`, KEY)).toBe(401);
    expect(refuseSummary(`Bearer ${KEY.slice(0, -1)}`, KEY)).toBe(401);
  });
  it("allows the right key", () => {
    expect(refuseSummary(`Bearer ${KEY}`, KEY)).toBeNull();
  });
});

describe("GET /api/admin/portfolio-summary", () => {
  beforeEach(() => {
    state.input = { users: [], memorials: [], payments: [], contributions: [] };
  });
  const get = (auth?: string, query = "", e = env) =>
    portfolioSummaryResponse(e, new Request(`https://lifeguestbook.com/api/admin/portfolio-summary${query}`, { headers: auth ? { Authorization: auth } : {} }), NOW);

  it("refuses with no body and no-store, noindex headers", async () => {
    for (const [res, status] of [[await get(), 401], [await get("Bearer wrong"), 401], [await get(`Bearer ${KEY}`, "", { ...env, PORTFOLIO_REPORT_KEY: "" }), 404]] as const) {
      expect(res.status).toBe(status);
      expect(await res.text()).toBe("");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    }
  });
  it("defaults to yesterday in Sydney and follows schema 1", async () => {
    const res = await get(`Bearer ${KEY}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ schema: 1, app: "LifeGuestbook", date: DATE, timezone: "Australia/Sydney", labels: { events: "pages" }, upcomingEvents: [] });
    expect(body.day).toMatchObject({ signUps: 0, newEvents: 0, uploads: 0, upgrades: 0, visits: null, errors: null, revenue: {} });
  });
  it("reports the day it's asked for and rejects a bad date", async () => {
    expect((await (await get(`Bearer ${KEY}`, "?date=2026-11-01")).json()).date).toBe("2026-11-01");
    expect((await get(`Bearer ${KEY}`, "?date=2026-13-01")).status).toBe(400);
  });
});

describe("owner and test accounts", () => {
  const extra = excludeList("me@gmail.com", "a@b.co, Other@Gmail.com");
  it("follows the documented rule", () => {
    expect(isTestAccount({ email: "codebertcreations@gmail.com" }, extra)).toBe(true);
    expect(isTestAccount({ email: "ME@gmail.com" }, extra)).toBe(true);
    expect(isTestAccount({ email: "other@gmail.com" }, extra)).toBe(true);
    expect(isTestAccount({ email: "owner-abc@example.test" }, extra)).toBe(true);
    expect(isTestAccount({ email: "x@example.com" }, extra)).toBe(true);
    expect(isTestAccount({ email: "sam+test2@gmail.com" }, extra)).toBe(true);
    expect(isTestAccount({ email: "sam@gmail.com", testAccount: true }, extra)).toBe(true);
    expect(isTestAccount({ email: "sam@gmail.com" }, extra)).toBe(false);
    expect(isTestAccount({ email: "sam@testing.com.au" }, extra)).toBe(false);
  });
  it("leaves test accounts, their pages, uploads and payments out of every number and list", () => {
    const t = W.day.from + 3600_000;
    const s = build({
      accounts: [
        { uid: "real", email: "sam@gmail.com", name: "Sam Lee", createdAt: t },
        { uid: "owner", email: "codebertcreations@gmail.com", name: "Owner", createdAt: t },
        { uid: "smoke", email: "owner-1@example.test", createdAt: t },
      ],
      pages: [
        { id: "p1", name: "Real page", ownerId: "real", createdAt: t, serviceDate: "2026-11-15", contributions: 4 },
        { id: "p2", name: "Owner test page", ownerId: "owner", createdAt: t, serviceDate: "2026-11-15", contributions: 9 },
      ],
      payments: [
        { ref: "cs_live_a", memorialId: "p1", payerUid: "real", product: "tribute", at: t, amount: "79.00 AUD" },
        { ref: "cs_live_b", memorialId: "p2", payerUid: "owner", product: "tribute", at: t, amount: "79.00 AUD" },
        { ref: "cs_live_c", memorialId: "p1", payerUid: "owner", product: "forever", at: t, amount: "195.00 AUD" },
      ],
      uploads: [{ memorialId: "p1", createdAt: t }, { memorialId: "p2", createdAt: t }, { memorialId: "p2", createdAt: t }],
    });
    expect(s.day).toMatchObject({ signUps: 1, newEvents: 1, uploads: 1, upgrades: 1, revenue: { AUD: 79 } });
    expect(s.totals).toEqual({ accounts: 1, events: 1, uploads: 4, upgrades: 1 });
    expect(s.signUps).toEqual([{ name: "Sam Lee", email: "sam@gmail.com", createdAt: t }]);
    expect(s.newEvents.map((e) => e.name)).toEqual(["Real page"]);
    expect(s.upcomingEvents.map((e) => e.name)).toEqual(["Real page"]);
    expect(s.testExcluded).toEqual({ accounts: 2, events: 1, payments: 2 });
  });
});

describe("payments and revenue", () => {
  const t = W.day.from + 60_000;
  const base = { memorialId: "p1", payerUid: "u1", product: "tribute", at: t, amount: "49.00 USD" };
  const input = (payments: any[]): SummaryInput => ({
    ...empty(),
    accounts: [{ uid: "u1", email: "jo@gmail.com", name: "Jo", createdAt: 0 }],
    pages: [{ id: "p1", name: "Page", ownerId: "u1", createdAt: 0, contributions: 0 }],
    payments,
  });
  it("counts live payments only, in major units by currency", () => {
    const s = build(input([
      { ...base, ref: "cs_live_1" },
      { ...base, ref: "cs_live_2", amount: "79.00 AUD" },
      { ...base, ref: "cs_test_3" },
      { ...base, ref: "dev-4", amount: "49.00 USD (test, no charge)" },
      { ...base, ref: "cs_x", livemode: false },
    ]));
    expect(s.day.upgrades).toBe(2);
    expect(s.day.revenue).toEqual({ USD: 49, AUD: 79 });
    expect(s.testExcluded.payments).toBe(3);
    expect(s.payments.map((p) => [p.page, p.amount, p.currency, p.payer])).toEqual([["Page", 49, "USD", "Jo"], ["Page", 79, "AUD", "Jo"]]);
  });
  it("counts a live renewal invoice as revenue but not as an upgrade", () => {
    const s = build(input([{ ...base, ref: "in_1", product: "hosting", amount: "24.00 AUD", livemode: true }]));
    expect(s.day).toMatchObject({ upgrades: 0, renewals: 1, revenue: { AUD: 24 } });
  });
  it("leaves out refunded or disputed payments and says so", () => {
    const s = build(input([{ ...base, ref: "cs_live_1", revoked: "refunded" }]));
    expect(s.day).toMatchObject({ upgrades: 0, revenue: {}, refundedOrDisputed: 1 });
  });
  it("never guesses the mode of an old record without one", () => {
    expect(paymentMode({ ref: "in_1" })).toBe("unknown");
    const s = build(input([{ ...base, ref: "in_1" }]));
    expect(s.day.revenue).toEqual({});
    expect(s.notes.join(" ")).toMatch(/no Stripe mode/);
  });
  it("counts a 100% off promotion as an upgrade with no revenue", () => {
    const s = build(input([{ ...base, ref: "cs_live_1", amount: "0.00 GBP" }]));
    expect(s.day).toMatchObject({ upgrades: 1, revenue: { GBP: 0 } });
  });
});

describe("nulls and upcoming pages", () => {
  it("reports visits and errors as null with notes, never 0", () => {
    const s = build(empty());
    for (const c of [s.day, s.last7, s.prev7]) expect([c.visits, c.errors]).toEqual([null, null]);
    expect(s.notes.join(" ")).toMatch(/Visits are not reported/);
    expect(s.notes.join(" ")).toMatch(/Errors are not reported/);
  });
  it("reports uploads as null when contributions can't be read", () => {
    const s = build({ ...empty(), uploads: null });
    expect(s.day.uploads).toBeNull();
    expect(s.notes.join(" ")).toMatch(/could not be counted/);
  });
  it("lists services from today to 14 days ahead, soonest first, with paid status", () => {
    const today = sydneyDate(NOW); // 2026-11-11
    const page = (id: string, serviceDate: string | null) => ({ id, name: id, ownerId: "u1", createdAt: 0, serviceDate, contributions: 2 });
    const s = build({
      ...empty(),
      accounts: [{ uid: "u1", email: "jo@gmail.com", name: "Jo", createdAt: 0 }],
      pages: [page("later", addDays(today, 14)), page("too-late", addDays(today, 15)), page("past", addDays(today, -1)), page("today", today), page("undated", null), page("bad", "soon")],
      payments: [{ ref: "cs_live_1", memorialId: "today", payerUid: "u1", at: 1, amount: "79.00 AUD" }],
    });
    expect(s.upcomingEvents.map((e) => [e.name, e.paid])).toEqual([["today", true], ["later", false]]);
    expect(s.upcomingEvents[0]).toMatchObject({ date: today, host: "Jo", hostEmail: "jo@gmail.com", uploads: 2 });
  });
});

describe("owner email", () => {
  it("lists who signed up and escapes what account holders typed", () => {
    const t = W.day.from + 60_000;
    const s = build({ ...empty(), accounts: [{ uid: "u1", email: "jo@gmail.com", name: "<b>Jo</b>", createdAt: t }],
      pages: [{ id: "p1", name: "Mum & Dad", ownerId: "u1", createdAt: t, serviceDate: null, contributions: 0 }] });
    const e = ownerEmail(s, env.APP_ORIGIN);
    expect(e.subject).toMatch(/^Life Guestbook Tue,? 10 Nov: 1 sign-up, 1 new page, 0 upgrades$/);
    expect(e.html).toContain("&lt;b&gt;Jo&lt;/b&gt; &lt;jo@gmail.com&gt;");
    expect(e.html).not.toContain("<b>Jo</b>");
    expect(e.text).toContain("Mum & Dad (memorial) by <b>Jo</b> <jo@gmail.com>");
  });
});

describe("daily owner email delivery", () => {
  beforeEach(() => {
    state.input = { users: [{ id: "u1", email: "jo@gmail.com", name: "Jo", createdAt: W.day.from + 1 }], memorials: [], payments: [], contributions: [] };
    state.reports.clear();
    state.sent = [];
    state.failSend = 0;
  });
  it("sends nothing without ADMIN_EMAIL", async () => {
    expect(await runOwnerReport({ ...env, ADMIN_EMAIL: "" }, NOW)).toMatchObject({ sent: false });
    expect(await runOwnerReport({ ...env, ADMIN_EMAIL: undefined }, NOW)).toMatchObject({ sent: false });
    expect(state.sent).toEqual([]);
  });
  it("sends yesterday's report once a day, however often it runs", async () => {
    expect(await runOwnerReport(env, NOW)).toMatchObject({ sent: true, date: DATE });
    expect(await runOwnerReport(env, NOW + 3600_000)).toMatchObject({ sent: false, reason: "already sent" });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].id).toBe(`owner-report-${DATE}`);
    expect(state.sent[0].email.to).toBe("owner-report@example.org");
    expect(state.sent[0].email.text).toContain("Jo <jo@gmail.com>");
    expect(await runOwnerReport(env, NOW + 86_400_000)).toMatchObject({ sent: true, date: "2026-11-11" });
  });
  it("lets a retry send after a failed attempt, but not while another run is sending", async () => {
    state.failSend = 1;
    await expect(runOwnerReport(env, NOW)).rejects.toThrow("Resend 500");
    expect(state.reports.has(DATE)).toBe(false);
    expect(await runOwnerReport(env, NOW + 60_000)).toMatchObject({ sent: true });
    state.reports.set("2026-11-11", { status: "sending", claimedAt: NOW + 86_400_000 });
    expect(await runOwnerReport(env, NOW + 86_400_000 + 60_000)).toMatchObject({ sent: false });
    expect(state.sent).toHaveLength(1);
  });
});
