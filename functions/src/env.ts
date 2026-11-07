import type { PaymentsStatus } from "../../src/shared/plans";

export interface Env {
  APP_ORIGIN: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  RESEND_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SCREENING_ENABLED: boolean;
  ANTHROPIC_API_KEY: string;
  /** Free-launch mode: no new paid checkouts, whatever keys are configured. */
  FREE_LAUNCH?: boolean;
}

export const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

const real = (v: string | undefined) => !!v && v !== "none" && v.length > 8;

export const emailEnabled = (env: Env) => real(env.RESEND_API_KEY);
/** The Firebase staging hostname uses sandbox keys. The public domain requires live keys. */
export const paymentsEnabled = (env: Env) => {
  const demo = (process.env.GCLOUD_PROJECT ?? "").startsWith("demo-");
  const staging = process.env.GCLOUD_PROJECT === "lifeguestbook-cbert"
    && env.APP_ORIGIN === "https://lifeguestbook-cbert.web.app";
  const mode = (isEmulator && demo) || staging ? "test" : "live";
  return new RegExp(`^sk_${mode}_[A-Za-z0-9]+$`).test(env.STRIPE_SECRET_KEY)
    && /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET);
};
/** Never turn a missing provider configuration into a production purchase. */
export const demoPurchasesEnabled = () => isEmulator
  && (process.env.GCLOUD_PROJECT ?? "").startsWith("demo-")
  && !!process.env.FIRESTORE_EMULATOR_HOST;
/**
 * What the upgrade UI and checkout API should do.
 * - "on": Stripe keys are valid for this deployment (or emulator instant upgrades).
 * - "free-launch": deliberately free, via FREE_LAUNCH=true or STRIPE_SECRET_KEY=none (or unset).
 * - "unavailable": a key is set but invalid for this deployment (e.g. a test key on the live domain).
 * Webhooks keep working whenever the keys are valid, so existing subscriptions stay correct.
 */
export function paymentsStatus(env: Env): PaymentsStatus {
  if (env.FREE_LAUNCH) return "free-launch";
  if (paymentsEnabled(env) || demoPurchasesEnabled()) return "on";
  const key = (env.STRIPE_SECRET_KEY ?? "").trim();
  return !key || key === "none" ? "free-launch" : "unavailable";
}
/** Paid plans may only be granted from a verified Stripe payment or the demo emulator. */
export const canGrantPaidPlans = (env: Env) => paymentsEnabled(env) || demoPurchasesEnabled();
/** Dev conveniences (sign-in links in responses, instant upgrades, /api/dev/*) only on the emulator. */
export const isDev = () => isEmulator;
