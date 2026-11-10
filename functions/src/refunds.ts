// Decisions for taking a purchase back when its payment is fully refunded or disputed. No imports
// with side effects, so the unit tests can load this file directly.
import type { PlanState } from "../../src/shared/plans";

export type RevokeReason = "refunded" | "disputed";

/** The parts of a `payments/{ref}` record the decision reads. */
export interface PaymentRecord {
  memorialId?: string;
  product?: string;
  /** The plan just before this payment was applied (recorded since Nov 2026). */
  planBefore?: PlanState;
  revoked?: RevokeReason;
}

/**
 * Whether a refund or dispute on payment `ref` (a Checkout Session or renewal invoice id) should put
 * the page back on the plan it had before. Only the payment that last set the plan can take it back:
 * if another payment changed the plan since (a later renewal, or Forever bought on top), undoing this
 * one would also undo that one, so it's left for the owner to check by hand. Payments recorded before
 * `planBefore` existed are left for a hand check too.
 */
export function revokeDecision(payment: PaymentRecord | undefined, memorial: { planPaymentRef?: string | null } | undefined, ref: string) {
  if (!payment) return "not-applied" as const;
  if (payment.revoked) return "already" as const;
  if (!memorial) return "missing" as const;
  if (!payment.planBefore) return "legacy" as const;
  return memorial.planPaymentRef === ref ? ("revoke" as const) : ("other-payment" as const);
}

/** Stripe marks a charge `refunded` only once all of it has been refunded. Partial refunds keep the purchase. */
export const isFullRefund = (charge: { refunded: boolean; amount: number; amount_refunded: number }) =>
  charge.refunded === true && charge.amount_refunded >= charge.amount;

/** An id, whether Stripe sent the id or the expanded object. */
export const idOf = (v: string | { id?: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));
