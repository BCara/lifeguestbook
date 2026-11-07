/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  /** Injected by vite.config.ts at build time. */
  readonly VITE_SENTRY_RELEASE?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
}
