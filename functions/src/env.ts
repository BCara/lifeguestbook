export interface Env {
  APP_ORIGIN: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  RESEND_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SCREENING_ENABLED: boolean;
}

export const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

const real = (v: string | undefined) => !!v && v !== "none" && v.length > 8;

export const emailEnabled = (env: Env) => real(env.RESEND_API_KEY);
export const paymentsEnabled = (env: Env) => real(env.STRIPE_SECRET_KEY);
/** Dev conveniences (sign-in links in responses, instant upgrades, /api/dev/*) only on the emulator. */
export const isDev = () => isEmulator;
