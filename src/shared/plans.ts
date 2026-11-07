// What each tier allows. The server enforces these; the web app only displays them.
export type Tier = "free" | "tribute" | "forever" | "living";

export const FREE_CONTRIBUTION_LIMIT = 30;
export const FREE_ADMIN_LIMIT = 2; // co-admins, not counting the owner
export const TRIBUTE_HOSTING_YEARS = 2;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
/** One request through Hosting + Functions can carry at most ~32 MB. */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** Whether paid upgrades can be bought right now (see functions/src/env.ts paymentsStatus). */
export type PaymentsStatus = "on" | "free-launch" | "unavailable";

/** Friendly copy for admins when upgrades can't be bought. */
export const PAYMENTS_OFF_COPY: Record<Exclude<PaymentsStatus, "on">, string> = {
  "free-launch": "Life Guestbook is free while we launch. Paid upgrades aren't on sale yet, so there's nothing to pay. Your page keeps everything it has, and the free plan includes up to " + FREE_CONTRIBUTION_LIMIT + " photos and messages and " + FREE_ADMIN_LIMIT + " co-admins.",
  unavailable: "Paid upgrades are temporarily unavailable. Nothing has been charged. Please try again later.",
};

export interface PlanState {
  tier: Tier;
  /** ms since epoch; null = never expires (free or forever). */
  hostingUntil: number | null;
}

export function isPaid(plan: PlanState) {
  return plan.tier !== "free";
}

/** Lapsed paid pages freeze: still online and downloadable, but no new contributions or slideshow. */
export function isFrozen(plan: PlanState, now = Date.now()) {
  return plan.tier !== "free" && plan.tier !== "forever" && plan.hostingUntil != null && plan.hostingUntil < now;
}

export interface Allowance {
  unlimitedContributions: boolean;
  contributionLimit: number | null;
  video: boolean;
  voice: boolean;
  slideshow: boolean;
  adminLimit: number | null;
  branding: boolean;
  acceptingContributions: boolean;
}

export function allowance(plan: PlanState, now = Date.now()): Allowance {
  const paid = isPaid(plan);
  const frozen = isFrozen(plan, now);
  return {
    unlimitedContributions: paid,
    contributionLimit: paid ? null : FREE_CONTRIBUTION_LIMIT,
    video: paid && !frozen,
    voice: paid && !frozen,
    slideshow: paid && !frozen,
    adminLimit: paid ? null : FREE_ADMIN_LIMIT,
    branding: !paid,
    acceptingContributions: !frozen,
  };
}

/** Hosting after a purchase. Renewals extend from whichever is later: now or the current end. */
export function hostingAfterPurchase(plan: PlanState, product: "tribute" | "forever" | "hosting" | "living", now = Date.now()): PlanState {
  const YEAR = 365 * 24 * 3600_000;
  if (product === "forever") return { tier: "forever", hostingUntil: null };
  if (plan.tier === "forever") return plan;
  if (product === "tribute") {
    const base = Math.max(now, plan.hostingUntil ?? 0);
    return { tier: "tribute", hostingUntil: base + TRIBUTE_HOSTING_YEARS * YEAR };
  }
  if (product === "living") {
    const base = Math.max(now, plan.hostingUntil ?? 0);
    return { tier: "living", hostingUntil: base + YEAR };
  }
  // hosting renewal
  const base = Math.max(now, plan.hostingUntil ?? now);
  return { tier: plan.tier === "free" ? "tribute" : plan.tier, hostingUntil: base + YEAR };
}
