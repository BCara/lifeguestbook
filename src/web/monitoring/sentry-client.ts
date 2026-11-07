// Named re-exports so the lazily loaded Sentry chunk is tree-shaken (no replay/feedback code).
export { captureException, init } from "@sentry/react";
