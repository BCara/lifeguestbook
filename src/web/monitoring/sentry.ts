import { scrubSentryEvent } from "../../shared/scrub";

type SentryModule = typeof import("./sentry-client");

let sentry: SentryModule | undefined;

/**
 * Loads Sentry only when VITE_SENTRY_DSN is set at build time. Without it this is a
 * no-op and the SDK chunk is never downloaded.
 */
export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  const Sentry = await import("./sentry-client");
  Sentry.init({
    dsn,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
    // Collect nothing about the person or request beyond the user agent; beforeSend scrubs the rest.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    // Errors only: no tracing, no session replay (replay could capture memory text).
    tracesSampleRate: 0,
    integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
    ignoreErrors: ["ResizeObserver loop", "Non-Error promise rejection captured", "Load failed", "Failed to fetch", "NetworkError"],
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (b) => (b.category === "console" || b.category === "ui.input" ? null : b),
  });
  sentry = Sentry;
}

/** Report a handled error. Safe to call when Sentry is off. */
export function reportError(err: unknown, context?: Record<string, string | number | boolean>) {
  sentry?.captureException(err, context ? { tags: context } : undefined);
}
