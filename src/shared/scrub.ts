/**
 * PII scrubbing shared by the web app and Cloud Functions before anything is
 * sent to Sentry, GA4 or logs. Memorial slugs and IDs identify a person, so
 * paths are reduced to their route shape; emails and media URLs are redacted.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\bhttps?:\/\/[^\s"'<>)]+/g;
// Anything that serves user media: Firebase/GCS storage and our own media proxy.
const MEDIA_HOST = /(^|\.)(firebasestorage\.googleapis\.com|storage\.googleapis\.com|storage\.cloud\.google\.com|appspot\.com|firebasestorage\.app)$/;

/** Route templates. Order matters: first match wins. */
const ROUTES: [RegExp, string][] = [
  [/^\/api\/media\/.*/, "/api/media/:file"],
  [/^\/api\/og\/.*/, "/api/og/:file"],
  [/^\/api\/m\/[^/]+(\/.*)?$/, "/api/m/:slug$1"],
  [/^\/api\/memorials\/[^/]+(\/.*)?$/, "/api/memorials/:id$1"],
  [/^\/api\/wall\/.*/, "/api/wall/:id"],
  [/^\/m\/[^/]+(\/.*)?$/, "/m/:slug$1"],
  [/^\/dashboard\/[^/]+(\/.*)?$/, "/dashboard/:id$1"],
];

/** "/m/jane-doe-1942/add?x=1#y" -> "/m/:slug/add". Never returns a query string or hash. */
export function routeShape(path: string): string {
  let p = path.split(/[?#]/)[0] || "/";
  for (const [re, to] of ROUTES) {
    if (re.test(p)) {
      p = p.replace(re, to);
      break;
    }
  }
  // Any remaining long opaque segment (ids, tokens, upload ids, chapter ids) is redacted too.
  return p.replace(/\/(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{12,}(?=\/|$)/g, "/:id");
}

function scrubUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (MEDIA_HOST.test(u.hostname) || u.pathname.startsWith("/api/media/")) return "[media-url]";
    return `${u.origin}${routeShape(u.pathname)}`;
  } catch {
    return "[url]";
  }
}

/** Redacts emails and media URLs, and strips query strings and slugs from other URLs. */
export function scrubText(s: string): string {
  // A bare same-origin path (fetch/navigation breadcrumbs, request URLs).
  if (/^\/[^\s]*$/.test(s)) return s.startsWith("/api/media/") ? "[media-url]" : routeShape(s);
  return s.replace(URL_RE, scrubUrl).replace(EMAIL, "[email]");
}

/** Keys whose values may hold user content and are dropped outright. */
const DROP_KEYS = new Set([
  "text", "body", "memory", "caption", "intro", "email", "emails", "photo", "photourl", "photo_url",
  "request_body", "response_body", "cookies", "cookie", "authorization",
  "query_string", "querystring", "password", "token", "sessionid", "session_id",
]);

/** Deep-copies a JSON-ish value, dropping risky keys and scrubbing every string. */
export function scrubDeep<T>(value: T, depth = 0): T {
  if (depth > 8) return "[depth]" as T;
  if (typeof value === "string") return scrubText(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP_KEYS.has(k.toLowerCase())) continue;
      out[k] = scrubDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Minimal shape of a Sentry event that we touch; avoids a type dependency in shared code. */
export interface ScrubbableEvent {
  user?: unknown;
  request?: { url?: string; method?: string; headers?: Record<string, string>; [k: string]: unknown };
  breadcrumbs?: { category?: string; message?: string; data?: Record<string, unknown>; [k: string]: unknown }[];
  transaction?: string;
  [k: string]: unknown;
}

const DROPPED_BREADCRUMBS = new Set(["console", "ui.input"]);

/** Applied as Sentry `beforeSend` on both web and functions. */
export function scrubSentryEvent<E extends object>(input: E): E {
  const { user: _user, request, breadcrumbs, ...rest } = input as ScrubbableEvent;
  const out = scrubDeep(rest) as ScrubbableEvent;
  if (request) {
    const ua = request.headers?.["user-agent"] ?? request.headers?.["User-Agent"];
    out.request = {
      ...(request.method ? { method: request.method } : {}),
      ...(request.url ? { url: scrubText(request.url) } : {}),
      ...(ua ? { headers: { "user-agent": ua } } : {}),
    };
  }
  if (breadcrumbs) {
    out.breadcrumbs = breadcrumbs
      .filter((b) => !DROPPED_BREADCRUMBS.has(b.category ?? ""))
      .map((b) => scrubDeep(b));
  }
  if (typeof out.transaction === "string") out.transaction = routeShape(out.transaction);
  return out as E;
}
