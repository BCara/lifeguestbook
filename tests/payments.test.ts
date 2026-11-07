import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  memorial: {} as any, paid: false,
  writes: [] as { kind: string; ref: string; value: any }[],
  retrieve: vi.fn(), cancel: vi.fn(), update: vi.fn(),
  lock: undefined as any, constructEvent: vi.fn(), sessionsCreate: vi.fn(), sessionsRetrieve: vi.fn(),
}));
vi.mock("../functions/node_modules/stripe/esm/stripe.esm.node.js", () => ({ default: class {
  subscriptions = { retrieve: state.retrieve, cancel: state.cancel, update: state.update };
  checkout = { sessions: { create: state.sessionsCreate, retrieve: state.sessionsRetrieve } };
  webhooks = { constructEvent: state.constructEvent };
} }));
vi.mock("../functions/src/db", () => ({
  db: {
    collection: (name: string) => ({ doc: (id: string) => `${name}/${id}` }),
    runTransaction: async (fn: any) => fn({
      get: async (ref: string) => ref.startsWith("checkoutAttempts/")
        ? { exists: !!state.lock, data: () => state.lock }
        : ({ exists: ref.startsWith("payments/") ? state.paid : true, data: () => ref.startsWith("memorials/") ? state.memorial : { email: "payer@example.com" } }),
      delete: (ref: string) => state.writes.push({ kind: "delete", ref, value: null }),
      update: (ref: string, value: any) => state.writes.push({ kind: "update", ref, value }),
      set: (ref: string, value: any) => state.writes.push({ kind: "set", ref, value }),
    }),
  },
  memorials: () => ({ doc: (id: string) => ({ toString: () => `memorials/${id}`, startsWith: (s: string) => `memorials/${id}`.startsWith(s), update: state.update }) }),
  users: () => ({ doc: (id: string) => `users/${id}` }),
  audit: (id: string) => ({ doc: () => `audit/${id}` }),
  getMemorial: async () => state.memorial,
  roleOf: vi.fn(),
}));
vi.mock("../functions/src/guestbook-email", () => ({ guestbookEmail: (mid: string, key: string) => `email/${mid}/${key}` }));

import { applyPurchase, checkoutAllowed, stopRecurringBilling } from "../functions/src/payments";
const env = { APP_ORIGIN: "https://lifeguestbook.com", STRIPE_SECRET_KEY: "sk_live_synthetic", STRIPE_WEBHOOK_SECRET: "whsec_synthetic" } as any;
beforeEach(() => {
  vi.clearAllMocks(); state.paid = false; state.writes = []; state.lock = undefined;
  state.memorial = { name: "Synthetic page", mode: "living", plan: { tier: "free", hostingUntil: null } };
  state.retrieve.mockResolvedValue({ id: "sub_synthetic", metadata: { memorialId: "m1" }, status: "active" });
});

describe("payment fulfilment", () => {
  it("commits the plan, payment record, audit and retryable receipt together", async () => {
    await applyPurchase(env, "m1", "tribute", "u1", "cs_synthetic", "40.00 USD");
    expect(state.writes).toHaveLength(4);
    expect(state.writes.find(w => String(w.ref).startsWith("memorials/"))?.value.plan.tier).toBe("tribute");
    expect(state.writes.find(w => String(w.ref).startsWith("email/"))?.value.email.to).toBe("payer@example.com");
  });
  it("does not apply or queue a receipt twice when checkout and webhook both confirm", async () => {
    state.paid = true;
    await applyPurchase(env, "m1", "tribute", "u1", "cs_synthetic", "40.00 USD");
    expect(state.writes).toEqual([]);
  });
  it("uses a paid renewal period without stacking an extra year", async () => {
    state.memorial.plan = { tier: "living", hostingUntil: 2000 };
    state.memorial.stripeSubscriptionId = "sub_synthetic";
    await applyPurchase(env, "m1", "living", "u1", "in_synthetic", "40.00 USD", { subscriptionId: "sub_synthetic", periodEnd: 3000, renewal: true });
    expect(state.writes[0].value.plan.hostingUntil).toBe(3000);
  });
  it("does not revive a converted page from a late Living Legacy renewal", async () => {
    state.memorial.mode = "memorial"; state.memorial.plan.tier = "tribute";
    state.memorial.stripeSubscriptionId = "sub_synthetic";
    await applyPurchase(env, "m1", "living", "u1", "in_synthetic", "40.00 USD", { subscriptionId: "sub_synthetic", periodEnd: 3000, renewal: true });
    expect(state.writes).toEqual([]);
  });
});

describe("subscription cancellation", () => {
  beforeEach(() => { state.memorial.stripeSubscriptionId = "sub_synthetic"; state.memorial.plan.tier = "living"; });
  it("stops renewal while retaining the paid entitlement", async () => {
    await stopRecurringBilling(env, "m1");
    expect(state.update).toHaveBeenCalledWith("sub_synthetic", { cancel_at_period_end: true });
    expect(state.memorial.plan.tier).toBe("living");
  });
  it("cancels immediately without another invoice on conversion", async () => {
    await stopRecurringBilling(env, "m1", true);
    expect(state.cancel).toHaveBeenCalledWith("sub_synthetic", { prorate: false, invoice_now: false });
  });
  it("rejects a subscription that belongs to another page", async () => {
    state.retrieve.mockResolvedValue({ id: "sub_synthetic", metadata: { memorialId: "other" }, status: "active" });
    await expect(stopRecurringBilling(env, "m1", true)).rejects.toThrow("does not belong");
    expect(state.cancel).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
  });
  it("does not mark cancellation successful when Stripe fails", async () => {
    state.cancel.mockRejectedValueOnce(new Error("temporary provider failure"));
    await expect(stopRecurringBilling(env, "m1", true)).rejects.toThrow("temporary provider failure");
    expect(state.update).not.toHaveBeenCalled();
  });
});

describe("eligible purchases", () => {
  it("rejects early renewal and cheaper hosting as a free upgrade", () => {
    expect(checkoutAllowed({ mode: "memorial", plan: { tier: "free", hostingUntil: null } }, "hosting")).toBe(false);
    expect(checkoutAllowed({ mode: "memorial", plan: { tier: "tribute", hostingUntil: Date.now() + 86400000 } }, "hosting")).toBe(false);
    expect(checkoutAllowed({ mode: "memorial", plan: { tier: "tribute", hostingUntil: Date.now() - 1 } }, "hosting")).toBe(true);
  });
  it("keeps Living Legacy purchases on living pages", () => {
    expect(checkoutAllowed({ mode: "memorial", plan: { tier: "free", hostingUntil: null } }, "living")).toBe(false);
    expect(checkoutAllowed({ mode: "living", plan: { tier: "free", hostingUntil: null } }, "living")).toBe(true);
  });
});

// ---- Free-launch mode ------------------------------------------------------------------------
import { Hono } from "../functions/node_modules/hono/dist/index.js";
import { roleOf } from "../functions/src/db";
import { paymentsStatus } from "../functions/src/env";
import { handleStripeEvent, paymentRoutes, stripeWebhook } from "../functions/src/payments";
import Stripe from "../functions/node_modules/stripe/esm/stripe.esm.node.js";

const freeEnv = { ...env, STRIPE_SECRET_KEY: "none", STRIPE_WEBHOOK_SECRET: "none" };
const signedIn = (e: any) => {
  const app = new Hono<any>();
  app.use("*", async (c: any, next: any) => { c.set("uid", "u1"); c.set("user", { uid: "u1", email: "payer@example.com" }); await next(); });
  app.route("/payments", paymentRoutes as any);
  return (path: string, body: object) => app.request(`/payments${path}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, e);
};

describe("payments status", () => {
  it("treats a missing or 'none' key as a deliberate free launch", () => {
    expect(paymentsStatus(freeEnv)).toBe("free-launch");
    expect(paymentsStatus({ ...env, STRIPE_SECRET_KEY: "" })).toBe("free-launch");
  });
  it("lets the FREE_LAUNCH flag switch paid upgrades off even with valid keys", () => {
    expect(paymentsStatus(env)).toBe("on");
    expect(paymentsStatus({ ...env, FREE_LAUNCH: true })).toBe("free-launch");
  });
  it("reports a wrong-mode or malformed key as unavailable, not free", () => {
    expect(paymentsStatus({ ...env, STRIPE_SECRET_KEY: "sk_test_synthetic" })).toBe("unavailable");
    expect(paymentsStatus({ ...env, STRIPE_SECRET_KEY: "not-a-key-at-all" })).toBe("unavailable");
  });
});

describe("free-launch API", () => {
  it("answers checkout with a clear 503 before touching the page or Stripe", async () => {
    const r = await signedIn(freeEnv)("/checkout", { memorialId: "m1", product: "tribute", currency: "gbp" });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ code: "free_launch", error: expect.stringContaining("free while we launch") });
    expect(roleOf).not.toHaveBeenCalled();
    expect(state.sessionsCreate).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });
  it("blocks checkout when FREE_LAUNCH is set, even with live keys", async () => {
    const r = await signedIn({ ...env, FREE_LAUNCH: true })("/checkout", { memorialId: "m1", product: "forever" });
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("free_launch");
  });
  it("marks a misconfigured key as payments_unavailable", async () => {
    const r = await signedIn({ ...env, STRIPE_SECRET_KEY: "sk_test_synthetic" })("/checkout", { memorialId: "m1", product: "tribute" });
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("payments_unavailable");
  });
  it("refuses confirm and cancel-renewal with 503 instead of an internal error", async () => {
    vi.mocked(roleOf).mockResolvedValue("owner" as any);
    expect((await signedIn(freeEnv)("/confirm", { sessionId: "cs_synthetic" })).status).toBe(503);
    expect((await signedIn(freeEnv)("/cancel-renewal", { memorialId: "m1" })).status).toBe(503);
    expect(state.sessionsRetrieve).not.toHaveBeenCalled();
  });
  it("never grants a paid plan without valid Stripe keys", async () => {
    await expect(applyPurchase(freeEnv, "m1", "tribute", "u1", "cs_synthetic", "40.00 USD")).rejects.toThrow("Payments are off");
    expect(state.writes).toEqual([]);
  });
  it("keeps the webhook closed (503 so Stripe retries) and never verifies with a 'none' secret", async () => {
    const r = await stripeWebhook(freeEnv, new Request("https://x/api/stripe/webhook", { method: "POST", body: "{}" }));
    expect(r.status).toBe(503);
    expect(state.constructEvent).not.toHaveBeenCalled();
  });
});

// ---- Webhook -----------------------------------------------------------------------------------
const stripe = new (Stripe as any)("sk_live_synthetic");
const evt = (type: string, object: any) => ({ id: `evt_${type}`, type, data: { object } }) as any;
const session = (over: any = {}) => ({
  id: "cs_synthetic", payment_status: "paid", amount_total: 4900, currency: "usd", customer: "cus_synthetic", subscription: null,
  metadata: { memorialId: "m1", product: "tribute", uid: "u1", attempt: "att_1" }, ...over,
});
const memorialUpdate = () => state.writes.find(w => w.kind === "update" && String(w.ref).startsWith("memorials/"))?.value;

describe("stripe webhook", () => {
  beforeEach(() => { state.memorial.mode = "memorial"; });

  it("rejects an unsigned or forged request", async () => {
    state.constructEvent.mockImplementation(() => { throw new Error("No signatures found"); });
    const r = await stripeWebhook(env, new Request("https://x/api/stripe/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=forged" } }));
    expect(r.status).toBe(400);
    expect(state.writes).toEqual([]);
  });
  it("verifies the raw body with the endpoint secret, then fulfils", async () => {
    state.constructEvent.mockReturnValue(evt("checkout.session.completed", session()));
    const r = await stripeWebhook(env, new Request("https://x/api/stripe/webhook", { method: "POST", body: "raw-body", headers: { "stripe-signature": "t=1,v1=ok" } }));
    expect(r.status).toBe(200);
    expect(state.constructEvent).toHaveBeenCalledWith("raw-body", "t=1,v1=ok", "whsec_synthetic");
    expect(memorialUpdate().plan.tier).toBe("tribute");
  });
  it("waits for async_payment_succeeded when checkout completes unpaid (bank debit)", async () => {
    await handleStripeEvent(env, stripe, evt("checkout.session.completed", session({ payment_status: "unpaid" })));
    expect(state.writes).toEqual([]);
    await handleStripeEvent(env, stripe, evt("checkout.session.async_payment_succeeded", session()));
    expect(memorialUpdate().plan.tier).toBe("tribute");
  });
  it("ignores a duplicate delivery of an already-applied session", async () => {
    state.paid = true;
    await handleStripeEvent(env, stripe, evt("checkout.session.completed", session()));
    expect(state.writes.filter(w => w.kind !== "delete")).toEqual([]);
  });
  it("releases the page's checkout lock after fulfilment so another purchase can start", async () => {
    state.lock = { key: "att_1" };
    await handleStripeEvent(env, stripe, evt("checkout.session.completed", session()));
    expect(state.writes.some(w => w.kind === "delete" && w.ref === "checkoutAttempts/m1")).toBe(true);
  });
  it("releases the lock on expiry only if it is still the same attempt", async () => {
    state.lock = { key: "att_newer" };
    await handleStripeEvent(env, stripe, evt("checkout.session.expired", session({ payment_status: "unpaid" })));
    expect(state.writes).toEqual([]);
    state.lock = { key: "att_1" };
    await handleStripeEvent(env, stripe, evt("checkout.session.expired", session({ payment_status: "unpaid" })));
    expect(state.writes).toEqual([{ kind: "delete", ref: "checkoutAttempts/m1", value: null }]);
  });
  it("turns a Living Legacy checkout into Tribute if the page was converted meanwhile, and stops the subscription", async () => {
    await handleStripeEvent(env, stripe, evt("checkout.session.completed", session({
      subscription: "sub_new", metadata: { memorialId: "m1", product: "living", uid: "u1" },
    })));
    expect(state.cancel).toHaveBeenCalledWith("sub_new", { prorate: false, invoice_now: false });
    expect(memorialUpdate().plan.tier).toBe("tribute");
    expect(memorialUpdate().stripeSubscriptionId).toBeUndefined();
  });
  it("cancels the old subscription immediately when Forever is bought", async () => {
    state.memorial.stripeSubscriptionId = "sub_synthetic";
    await handleStripeEvent(env, stripe, evt("checkout.session.completed", session({ metadata: { memorialId: "m1", product: "forever", uid: "u1" } })));
    expect(state.cancel).toHaveBeenCalledWith("sub_synthetic", { prorate: false, invoice_now: false });
    expect(memorialUpdate().plan).toEqual({ tier: "forever", hostingUntil: null });
  });

  const invoice = (over: any = {}) => ({
    id: "in_synthetic", billing_reason: "subscription_cycle", amount_paid: 1500, currency: "usd", hosted_invoice_url: "https://invoice.stripe.com/i/synthetic",
    lines: { data: [{ period: { end: 4_000_000 } }] },
    parent: { subscription_details: { subscription: "sub_synthetic", metadata: { memorialId: "m1", product: "hosting", uid: "u1" } } },
    ...over,
  });
  it("extends hosting to the paid period on a renewal and clears a failed-renewal flag", async () => {
    state.memorial.plan = { tier: "tribute", hostingUntil: 1000 };
    state.memorial.stripeSubscriptionId = "sub_synthetic";
    state.memorial.stripeRenewalFailed = { at: 1, invoiceId: "in_old" };
    await handleStripeEvent(env, stripe, evt("invoice.paid", invoice()));
    expect(memorialUpdate().plan.hostingUntil).toBe(4_000_000_000);
    expect(memorialUpdate().stripeRenewalFailed).toBeNull();
  });
  it("ignores the first subscription invoice (checkout already covered it)", async () => {
    state.memorial.stripeSubscriptionId = "sub_synthetic";
    await handleStripeEvent(env, stripe, evt("invoice.paid", invoice({ billing_reason: "subscription_create" })));
    expect(state.writes).toEqual([]);
  });
  it("flags a failed renewal without changing the plan", async () => {
    state.memorial.plan = { tier: "tribute", hostingUntil: 1000 };
    state.memorial.stripeSubscriptionId = "sub_synthetic";
    await handleStripeEvent(env, stripe, evt("invoice.payment_failed", invoice()));
    const u = memorialUpdate();
    expect(u.stripeRenewalFailed).toMatchObject({ invoiceId: "in_synthetic", invoiceUrl: "https://invoice.stripe.com/i/synthetic" });
    expect(u.plan).toBeUndefined();
  });
  it("ignores a failed invoice for a subscription the page no longer uses", async () => {
    state.memorial.stripeSubscriptionId = "sub_other";
    await handleStripeEvent(env, stripe, evt("invoice.payment_failed", invoice()));
    expect(state.writes).toEqual([]);
  });
  it("records an ended subscription from Stripe's current state and leaves the page to freeze, never delete", async () => {
    state.memorial.plan = { tier: "tribute", hostingUntil: 1000 };
    state.memorial.stripeSubscriptionId = "sub_synthetic";
    // The event is stale ("active"); the handler trusts the re-read subscription instead.
    state.retrieve.mockResolvedValue({ id: "sub_synthetic", metadata: { memorialId: "m1" }, status: "canceled", cancel_at_period_end: false });
    await handleStripeEvent(env, stripe, evt("customer.subscription.deleted", { id: "sub_synthetic", status: "active" }));
    expect(state.writes).toHaveLength(1);
    expect(memorialUpdate()).toEqual({ stripeSubscriptionCancelled: true, stripeRenewalFailed: null });
    expect(state.writes.some(w => w.kind === "delete")).toBe(false);
  });
  it("shows renewal as active again when cancellation is undone", async () => {
    state.memorial.stripeSubscriptionId = "sub_synthetic";
    state.retrieve.mockResolvedValue({ id: "sub_synthetic", metadata: { memorialId: "m1" }, status: "active", cancel_at_period_end: false, cancel_at: null });
    await handleStripeEvent(env, stripe, evt("customer.subscription.updated", { id: "sub_synthetic" }));
    expect(memorialUpdate()).toEqual({ stripeSubscriptionCancelled: false });
  });
  it("acknowledges unrelated event types without side effects", async () => {
    await handleStripeEvent(env, stripe, evt("charge.refunded", { id: "ch_synthetic" }));
    expect(state.writes).toEqual([]);
  });
});
