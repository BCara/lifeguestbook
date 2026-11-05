export interface Env {
  APP_ORIGIN: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  RESEND_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SCREENING_ENABLED: boolean;
  ANTHROPIC_API_KEY: string;
}

export const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

const real = (v: string | undefined) => !!v && v !== "none" && v.length > 8;

export const emailEnabled = (env: Env) => real(env.RESEND_API_KEY);
/** Live checkout requires a live key; demo projects accept test keys only. */
export const paymentsEnabled = (env: Env) => {
  const demo = (process.env.GCLOUD_PROJECT ?? "").startsWith("demo-");
  const mode = isEmulator && demo ? "test" : "live";
  return new RegExp(`^sk_${mode}_[A-Za-z0-9]+$`).test(env.STRIPE_SECRET_KEY)
    && /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET);
};
/** Never turn a missing provider configuration into a production purchase. */
export const demoPurchasesEnabled = () => isEmulator
  && (process.env.GCLOUD_PROJECT ?? "").startsWith("demo-")
  && !!process.env.FIRESTORE_EMULATOR_HOST;
/** Dev conveniences (sign-in links in responses, instant upgrades, /api/dev/*) only on the emulator. */
export const isDev = () => isEmulator;
