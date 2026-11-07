import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  memorial: {} as any, paid: false,
  writes: [] as { kind: string; ref: string; value: any }[],
  retrieve: vi.fn(), cancel: vi.fn(), update: vi.fn(),
}));
vi.mock("../functions/node_modules/stripe/esm/stripe.esm.node.js", () => ({ default: class {
  subscriptions = { retrieve: state.retrieve, cancel: state.cancel, update: state.update };
} }));
vi.mock("../functions/src/db", () => ({
  db: {
    collection: (name: string) => ({ doc: (id: string) => `${name}/${id}` }),
    runTransaction: async (fn: any) => fn({
      get: async (ref: string) => ({ exists: ref.startsWith("payments/") ? state.paid : true, data: () => ref.startsWith("memorials/") ? state.memorial : { email: "payer@example.com" } }),
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
  vi.clearAllMocks(); state.paid = false; state.writes = [];
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
