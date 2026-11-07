/**
 * Structured logging for Cloud Logging. Each call writes one JSON line; Cloud Run /
 * Cloud Functions gen2 parse `severity` and `message`, and keep the other fields as
 * jsonPayload, so alerts can filter on e.g. jsonPayload.event="http_5xx".
 * ERROR entries carry the ReportedErrorEvent type so they also land in Error Reporting.
 * Every string is passed through the shared PII scrubber.
 */
import { scrubDeep, scrubText } from "../../src/shared/scrub";

export type Severity = "DEBUG" | "INFO" | "NOTICE" | "WARNING" | "ERROR" | "CRITICAL";
export type Fields = Record<string, unknown>;

const ERROR_EVENT_TYPE = "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

export function errorDetails(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) return { name: err.name, message: scrubText(err.message), stack: err.stack && scrubText(err.stack) };
  return { name: "NonError", message: scrubText(String(err)) };
}

/** Builds the log entry (exported for tests). */
export function entry(severity: Severity, message: string, fields: Fields = {}, err?: unknown): Fields {
  const out: Fields = { severity, message: scrubText(message), ...scrubDeep(fields) };
  if (err !== undefined) {
    const e = errorDetails(err);
    // Error Reporting groups on the stack trace in `message` (or `stack_trace`).
    out.message = e.stack ? `${out.message}: ${e.stack}` : `${out.message}: ${e.name}: ${e.message}`;
    out.error = { name: e.name, message: e.message };
    if (severity === "ERROR" || severity === "CRITICAL") {
      out["@type"] = ERROR_EVENT_TYPE;
      out.serviceContext = { service: process.env.K_SERVICE ?? "lifeguestbook-functions", version: RELEASE };
    }
  }
  return out;
}

function write(e: Fields) {
  const line = JSON.stringify(e);
  if (e.severity === "ERROR" || e.severity === "CRITICAL" || e.severity === "WARNING") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (message: string, fields?: Fields) => write(entry("DEBUG", message, fields)),
  info: (message: string, fields?: Fields) => write(entry("INFO", message, fields)),
  warn: (message: string, fields?: Fields, err?: unknown) => write(entry("WARNING", message, fields, err)),
  error: (message: string, err?: unknown, fields?: Fields) => write(entry("ERROR", message, fields, err ?? new Error(message))),
  critical: (message: string, err?: unknown, fields?: Fields) => write(entry("CRITICAL", message, fields, err ?? new Error(message))),
};

declare const __SENTRY_RELEASE__: string | undefined;
/** Set at build time by functions/build.mjs; SENTRY_RELEASE at runtime overrides it. */
export const RELEASE: string =
  process.env.SENTRY_RELEASE || (typeof __SENTRY_RELEASE__ === "string" ? __SENTRY_RELEASE__ : "dev");
