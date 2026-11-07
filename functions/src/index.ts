import { getRequestListener } from "@hono/node-server";
import { defineBoolean, defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { Hono } from "hono";
import { authRoutes, loadSession, type AppEnv } from "./auth";
import { hmac } from "./crypto";
import { db, users } from "./db";
import { isDev, type Env } from "./env";
import { runDailyJobs } from "./jobs";
import { runDigests } from "./notify";
import { deliverGuestbookEmails } from "./guestbook-email";
import { paymentRoutes, stripeWebhook } from "./payments";
import { guestRoutes, mediaRoutes } from "./routes/guest";
import { hostRoutes, inviteRoutes } from "./routes/host";
import { legacyRoutes } from "./routes/legacy";
import { wallRoutes } from "./routes/wall";
import { shareApp, shareImage } from "./share";
import { uploadRoutes } from "./routes/uploads";
import { initMonitoring, monitored, reportError, requestLogging } from "./monitoring";
import { routeShape } from "../../src/shared/scrub";

process.setSourceMapsEnabled(true);
initMonitoring(); // no-op unless SENTRY_DSN is set

const APP_ORIGIN = defineString("APP_ORIGIN", { default: "https://lifeguestbook.com" });
const EMAIL_FROM = defineString("EMAIL_FROM", { default: "Life Guestbook <hello@lifeguestbook.com>" });
const EMAIL_REPLY_TO = defineString("EMAIL_REPLY_TO", { default: "hello@lifeguestbook.com" });
const SCREENING_ENABLED = defineBoolean("SCREENING_ENABLED", { default: false });
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const SECRETS = [RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ANTHROPIC_API_KEY];

const secret = (s: ReturnType<typeof defineSecret>) => {
  try {
    return s.value();
  } catch {
    return "";
  }
};

function envFor(): Env {
  return {
    APP_ORIGIN: APP_ORIGIN.value().replace(/\/$/, ""),
    EMAIL_FROM: EMAIL_FROM.value(),
    EMAIL_REPLY_TO: EMAIL_REPLY_TO.value(),
    RESEND_API_KEY: secret(RESEND_API_KEY),
    STRIPE_SECRET_KEY: secret(STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: secret(STRIPE_WEBHOOK_SECRET),
    SCREENING_ENABLED: SCREENING_ENABLED.value(),
    ANTHROPIC_API_KEY: secret(ANTHROPIC_API_KEY),
  };
}

export const app = new Hono<AppEnv>().basePath("/api");

app.use("*", requestLogging);
app.onError(async (err, c) => {
  await reportError("Unhandled API error", err, { event: "api_error", method: c.req.method, route: routeShape(new URL(c.req.url).pathname) });
  return c.json({ error: "Something went wrong on our side. Please try again." }, 500);
});

app.post("/stripe/webhook", (c) => stripeWebhook(c.env, c.req.raw));
app.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
app.use("*", loadSession);
app.get("/health", (c) => c.json({ ok: true }));
app.get("/og/:file", async (c) => {
  const img = await shareImage(c.req.param("file").replace(/\.jpg$/, ""));
  if (!img) return c.notFound();
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
});
app.get("/me", (c) => {
  const u = c.get("user");
  return c.json({ user: u ? { uid: u.uid, email: u.email, name: u.name } : null, dev: isDev() });
});
app.route("/auth", authRoutes);
app.route("/m", uploadRoutes);
app.route("/m", guestRoutes);
app.route("/media", mediaRoutes);
app.route("/wall", wallRoutes);
app.route("/invites", inviteRoutes);
app.route("/payments", paymentRoutes);
app.route("/", legacyRoutes);
app.route("/", hostRoutes);

app.get("/email/unsubscribe", async (c) => {
  const uid = c.req.query("u") ?? "";
  if (c.req.query("s") !== hmac(c.env.RESEND_API_KEY || "dev", uid)) return c.text("This link isn't valid.", 400);
  await users().doc(uid).update({ emailOptOut: true }).catch(() => undefined);
  return c.html("<p style='font-family:sans-serif;padding:24px'>You won't get these update emails any more.</p>");
});

// Local-only helpers for the test walkthrough.
app.get("/dev/emails", async (c) => {
  if (!isDev()) return c.notFound();
  const snap = await db.collection("devEmails").orderBy("at", "desc").limit(30).get();
  return c.json({ emails: snap.docs.map((d) => d.data()) });
});
app.post("/dev/run-jobs", async (c) => {
  if (!isDev()) return c.notFound();
  const now = Number(c.req.query("now")) || Date.now(); // lets the smoke test jump ahead in time
  const digests = await runDigests(c.env, now, true);
  await deliverGuestbookEmails(c.env);
  const daily = await runDailyJobs(c.env, now);
  return c.json({ digests, daily });
});

export const api = onRequest(
  { region: "us-central1", secrets: SECRETS, memory: "1GiB", timeoutSeconds: 300, concurrency: 40 },
  getRequestListener((req) => app.fetch(req, envFor())),
);

/** Serves /m/** with link-preview tags (see share.ts). */
export const share = onRequest(
  { region: "us-central1", memory: "256MiB", concurrency: 80 },
  getRequestListener((req) => shareApp.fetch(req, envFor())),
);

export const notificationDigest = onSchedule(
  { schedule: "every 5 minutes", region: "us-central1", secrets: SECRETS },
  monitored("notificationDigest", async () => {
    const env = envFor();
    await runDigests(env);
    await deliverGuestbookEmails(env);
  }),
);

export const dailyJobs = onSchedule(
  { schedule: "every day 08:10", timeZone: "Europe/London", region: "us-central1", secrets: SECRETS, timeoutSeconds: 540 },
  monitored("dailyJobs", async () => {
    await runDailyJobs(envFor());
  }),
);
