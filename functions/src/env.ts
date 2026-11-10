export interface Env {
  APP_ORIGIN: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  RESEND_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SCREENING_ENABLED: boolean;
  ANTHROPIC_API_KEY: string;
  /** Bearer key for GET /api/admin/portfolio-summary. Empty or "none": the route answers 404. */
  PORTFOLIO_REPORT_KEY?: string;
  /** Where the owner's daily report goes. Empty: no report is sent. */
  ADMIN_EMAIL?: string;
  /** Extra owner or test addresses to leave out of the report, comma-separated. */
  REPORT_EXCLUDE_EMAILS?: string;
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
  // Standard (sk_) or restricted (rk_) secret key for the matching mode.
  return new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(env.STRIPE_SECRET_KEY)
    && /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET);
};
/** Never turn a missing provider configuration into a production purchase. */
export const demoPurchasesEnabled = () => isEmulator
  && (process.env.GCLOUD_PROJECT ?? "").startsWith("demo-")
  && !!process.env.FIRESTORE_EMULATOR_HOST;
/** Dev conveniences (sign-in links in responses, instant upgrades, /api/dev/*) only on the emulator. */
export const isDev = () => isEmulator;
