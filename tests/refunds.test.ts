import { describe, expect, it } from "vitest";
import { isFullRefund, revokeDecision } from "../functions/src/refunds";

const before = { tier: "free" as const, hostingUntil: null };

describe("refund and dispute decisions", () => {
  it("takes back the payment that last set the plan", () => {
    expect(revokeDecision({ planBefore: before }, { planPaymentRef: "cs_1" }, "cs_1")).toBe("revoke");
  });
  it("never undoes a plan set by a different payment", () => {
    expect(revokeDecision({ planBefore: before }, { planPaymentRef: "in_2" }, "cs_1")).toBe("other-payment");
  });
  it("changes nothing on a repeat or a refund after a dispute", () => {
    expect(revokeDecision({ planBefore: before, revoked: "disputed" }, { planPaymentRef: "cs_1" }, "cs_1")).toBe("already");
  });
  it("leaves older payments without a recorded previous plan for a hand check", () => {
    expect(revokeDecision({}, { planPaymentRef: "cs_1" }, "cs_1")).toBe("legacy");
  });
  it("blocks a payment that was refunded before it was applied", () => {
    expect(revokeDecision(undefined, { planPaymentRef: null }, "cs_1")).toBe("not-applied");
  });
  it("only counts full refunds", () => {
    expect(isFullRefund({ refunded: false, amount: 4000, amount_refunded: 1000 })).toBe(false);
    expect(isFullRefund({ refunded: true, amount: 4000, amount_refunded: 4000 })).toBe(true);
  });
});
