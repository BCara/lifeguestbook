// Cross-cutting request hardening for the `api` function: CSRF origin checks, Firestore path
// injection guards, response headers, upload content sniffing and URL validation.
import type { MiddlewareHandler } from "hono";
import { isDev } from "./env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Whether a state-changing request may proceed, based on the browser's Origin / Sec-Fetch-Site. */
export function sameOriginAllowed(method: string, headers: Headers, appOrigin: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  const origin = headers.get("origin");
  if (origin && origin !== "null") {
    return origin === appOrigin || (isDev() && LOCAL_ORIGIN.test(origin));
  }
  if (origin === "null") return false; // sandboxed frames, data: URLs, some cross-site redirects
  // No Origin header: non-browser clients (Stripe, curl, the smoke test). Browsers that send
  // Sec-Fetch-Site tell us when a request came from another site.
  const site = headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none" || (isDev() && site === "same-site");
}

/**
 * Defence in depth on top of SameSite=Lax: refuse cross-site POST/PUT/PATCH/DELETE. This also stops
 * login CSRF on /auth/verify (an attacker posting their own sign-in token from another site).
 */
export const sameOriginOnly: MiddlewareHandler<{ Bindings: { APP_ORIGIN: string } }> = async (c, next) => {
  if (!sameOriginAllowed(c.req.method, c.req.raw.headers, c.env.APP_ORIGIN)) {
    return c.json({ error: "This request has to come from the Life Guestbook site." }, 403);
  }
  await next();
};

/**
 * Route parameters are percent-decoded, so `%2F` would let a caller smuggle "/" into a Firestore
 * document id or Storage key (e.g. `memorials/<id>/...`). No legitimate id contains these.
 */
export const noEncodedSeparators: MiddlewareHandler = async (c, next) => {
  const raw = new URL(c.req.url).pathname;
  if (/%(2f|5c|00|2e)/i.test(raw)) return c.json({ error: "Not found" }, 404);
  await next();
};

/** Baseline headers for every API response. Pages that render HTML set their own stricter CSP. */
export const apiSecurityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const h = c.res.headers;
  const set = (k: string, v: string) => { if (!h.has(k)) h.set(k, v); };
  set("X-Content-Type-Options", "nosniff");
  set("X-Frame-Options", "DENY");
  set("Referrer-Policy", "strict-origin-when-cross-origin");
  set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
};

/** Headers for user-uploaded media: never interpreted as a document, never framed elsewhere. */
export const MEDIA_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

const ascii = (b: Uint8Array, start: number, end: number) => Buffer.from(b.subarray(start, end)).toString("latin1");
const isMp4Family = (b: Uint8Array) => b.length >= 12 && ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(ascii(b, 4, 8));
const isEbml = (b: Uint8Array) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
const isMpegAudio = (b: Uint8Array) => (b.length >= 3 && ascii(b, 0, 3) === "ID3") || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
const isAdts = (b: Uint8Array) => b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0;

/**
 * Checks the first bytes of a video or audio upload against its declared type, so a file that
 * claims to be a video can't be HTML, SVG or a script. Photos are re-encoded by sharp instead.
 */
export function sniffMatches(mime: string, head: Uint8Array): boolean {
  switch (mime) {
    case "video/mp4":
    case "video/quicktime":
    case "audio/mp4":
    case "audio/x-m4a":
      return isMp4Family(head);
    case "video/webm":
    case "audio/webm":
      return isEbml(head);
    case "audio/ogg":
      return head.length >= 4 && ascii(head, 0, 4) === "OggS";
    case "audio/wav":
      return head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WAVE";
    case "audio/mpeg":
      return isMpegAudio(head);
    case "audio/aac":
      return isAdts(head) || isMp4Family(head);
    default:
      return false;
  }
}

/** An http(s) URL safe to render as a link for guests (no javascript:, data:, etc.), or undefined. */
export function safeHttpUrl(v: unknown, max = 300): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
