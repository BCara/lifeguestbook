/**
 * Error tracking for the Functions. Off unless SENTRY_DSN is set (functions/.env or the
 * deploy environment); the SDK is only imported when it is, so cold starts don't pay for it.
 */
import type { MiddlewareHandler } from "hono";
import { routeShape, scrubSentryEvent } from "../../src/shared/scrub";
import { log, RELEASE, type Fields } from "./log";

type SentryNode = typeof import("@sentry/node");
let sentry: Promise<SentryNode | null> | undefined;

export const sentryEnabled = () => !!process.env.SENTRY_DSN;

function loadSentry(): Promise<SentryNode | null> {
  if (!sentryEnabled()) return Promise.resolve(null);
  sentry ??= import("@sentry/node")
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        release: RELEASE,
        environment: process.env.SENTRY_ENVIRONMENT ?? (process.env.FUNCTIONS_EMULATOR === "true" ? "emulator" : "production"),
        // Error capture only: no tracing, and no automatic request/AI/DB data collection.
        tracesSampleRate: 0,
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: { request: { allow: ["user-agent"] }, response: false },
          httpBodies: [],
          urlQueryParams: false,
          genAI: { inputs: false, outputs: false },
          databaseQueryData: false,
        },
        beforeSend: (event) => scrubSentryEvent(event),
        beforeBreadcrumb: (b) => (b.category === "console" ? null : b),
      });
      return Sentry;
    })
    .catch((err) => {
      log.warn("Sentry failed to initialise", {}, err);
      return null;
    });
  return sentry;
}

/** Start loading Sentry at cold start (no-op without SENTRY_DSN). */
export function initMonitoring() {
  void loadSentry();
}

/** Logs the error to Cloud Logging and, if configured, sends it to Sentry and flushes. */
export async function reportError(message: string, err: unknown, fields: Fields = {}) {
  log.error(message, err, fields);
  const Sentry = await loadSentry();
  if (!Sentry) return;
  Sentry.captureException(err, { tags: Object.fromEntries(Object.entries(fields).filter(([, v]) => typeof v === "string" || typeof v === "number")) as Record<string, string> });
  // Functions can be frozen right after responding, so flush now (bounded).
  await Sentry.flush(2000).catch(() => false);
}

/** Logs one structured line per 5xx response, for the log-based alert in docs/monitoring.md. */
export const requestLogging: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const status = c.res.status;
  if (status >= 500) {
    log.warn("HTTP 5xx response", {
      event: "http_5xx",
      method: c.req.method,
      route: routeShape(new URL(c.req.url).pathname),
      status,
      latencyMs: Date.now() - start,
    });
  }
};

/** Wraps a scheduled job so failures are logged, reported and still rethrown (so retries/metrics see them). */
export function monitored<A extends unknown[]>(job: string, fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      await reportError(`Scheduled job ${job} failed`, err, { event: "job_failed", job });
      throw err;
    }
  };
}
