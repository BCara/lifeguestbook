// Passwordless sign-in for admins: a one-time link emailed through Resend.
// Sessions live in Firestore; the cookie must be called `__session` because Firebase Hosting
// strips every other cookie before requests reach Cloud Functions.
import type { DecodedIdToken } from "firebase-admin/auth";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomToken, sha256 } from "./crypto";
import { db, sessions, signInTokens, users, type UserDoc } from "./db";
import { sendEmail, signInEmail } from "./email";
import { emailEnabled, isDev, type Env } from "./env";
import { clientIp, overLimit } from "./limits";
import { verifyGoogleSessionToken } from "./google-auth";

export type AppEnv = { Bindings: Env; Variables: { uid?: string; user?: UserDoc & { uid: string } } };

const SESSION_MS = 60 * 24 * 3600_000;
const LINK_MS = 30 * 60_000;
const COOKIE = "__session";

export const userIdFor = (email: string) => sha256(email.trim().toLowerCase()).slice(0, 28);
export const validEmail = (e: unknown): e is string => typeof e === "string" && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const safeNext = (n: unknown) =>
  typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(n) ? n : "/dashboard";

/** Loads the signed-in user, if any. Never rejects. */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (token) {
    const snap = await sessions().doc(sha256(token)).get();
    const s = snap.data() as { uid: string; expiresAt: number } | undefined;
    if (s && s.expiresAt > Date.now()) {
      const u = await users().doc(s.uid).get();
      if (u.exists) {
        c.set("uid", s.uid);
        c.set("user", { uid: s.uid, ...(u.data() as UserDoc) });
        const data = u.data() as UserDoc;
        if (Date.now() - (data.lastSeenAt ?? 0) > 3600_000) await u.ref.update({ lastSeenAt: Date.now() });
      }
    }
  }
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("uid")) return c.json({ error: "Please sign in." }, 401);
  await next();
};

export async function ensureUser(email: string, name?: string) {
  const uid = userIdFor(email);
  const ref = users().doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ email: email.trim().toLowerCase(), name: name ?? null, createdAt: Date.now(), lastSeenAt: Date.now() });
  }
  return uid;
}

export async function startSession(c: Context<AppEnv>, uid: string) {
  // Always a fresh token; a session cookie already in the browser (whoever set it) stops working.
  const previous = getCookie(c, COOKIE);
  if (previous) await sessions().doc(sha256(previous)).delete().catch(() => undefined);
  const token = randomToken(32);
  const secure = !c.req.url.startsWith("http://localhost") && !c.req.url.startsWith("http://127.0.0.1");
  setCookie(c, COOKIE, token, { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: SESSION_MS / 1000 });
  return sessions().doc(sha256(token)).set({ uid, expiresAt: Date.now() + SESSION_MS, createdAt: Date.now() });
}

export const authRoutes = new Hono<AppEnv>()
  .post("/google", async (c) => {
    if (c.req.header("Origin") !== c.env.APP_ORIGIN) return c.json({ error: "Sign in from the Life Guestbook site." }, 403);
    const body = await c.req.json().catch(() => null) as { idToken?: unknown; next?: unknown } | null;
    if (typeof body?.idToken !== "string" || body.idToken.length > 8192) return c.json({ error: "Google sign-in could not be verified." }, 400);
    if (await overLimit(`google-signin-ip:${clientIp(c.req.raw.headers)}`, 30)) {
      return c.json({ error: "Too many sign-in attempts. Please try again later." }, 429);
    }
    let identity: DecodedIdToken;
    try {
      identity = await verifyGoogleSessionToken(body.idToken);
    } catch {
      return c.json({ error: "Google sign-in could not be verified. Please try again." }, 401);
    }
    if (identity.firebase.sign_in_provider !== "google.com" || !identity.email_verified || !validEmail(identity.email)
      || Date.now() / 1000 - identity.auth_time > 5 * 60) {
      return c.json({ error: "Sign in again with a Google account that has a verified email address." }, 401);
    }
    // Google can verify ownership of Gmail addresses. Other mailbox providers use our email link.
    if (!/@(?:gmail|googlemail)\.com$/i.test(identity.email)) {
      return c.json({ error: "Use an email sign-in link for this address." }, 401);
    }
    const uid = await ensureUser(identity.email, typeof identity.name === "string" ? identity.name.slice(0, 80) : undefined);
    await startSession(c, uid);
    return c.json({ next: safeNext(body.next) });
  })
  .post("/email", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; name?: unknown; next?: string };
    if (!validEmail(body.email)) return c.json({ error: "Please enter a valid email address." }, 400);
    if (!isDev() && !emailEnabled(c.env)) return c.json({ error: "Sign-in email is temporarily unavailable." }, 503);
    const email = body.email.trim().toLowerCase();
    if ((await overLimit(`signin:${email}`, 6)) || (await overLimit(`signin-ip:${clientIp(c.req.raw.headers)}`, 30)))
      return c.json({ error: "Too many sign-in emails. Please wait a little and try again." }, 429);
    const token = randomToken(32);
    await signInTokens().doc(sha256(token)).set({ email, name: typeof body.name === "string" ? body.name.trim().slice(0, 80) || null : null, next: safeNext(body.next), expiresAt: Date.now() + LINK_MS });
    const link = `${c.env.APP_ORIGIN}/api/auth/verify?t=${token}`;
    try {
      await sendEmail(c.env, signInEmail(email, link));
    } catch {
      await signInTokens().doc(sha256(token)).delete();
      return c.json({ error: "Sign-in email could not be sent. Please try again." }, 503);
    }
    return c.json({ ok: true, ...(isDev() ? { devLink: link } : {}) });
  })
  .get("/verify", (c) => {
    const token = c.req.query("t") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return c.redirect("/signin?expired=1");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Content-Security-Policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; style-src 'unsafe-inline'");
    return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Sign in to Life Guestbook</title>
      <style>body{font:1rem/1.5 system-ui;background:#faf3eb;color:#39291f;margin:0;padding:1.5rem}header,main{max-width:32rem;margin:auto}header{padding-bottom:1rem;border-bottom:1px solid #cdb79f}header a{font:1.5rem Georgia,serif;color:inherit;text-decoration:none}main{box-sizing:border-box;margin-top:2rem;padding:clamp(1rem,5vw,2.5rem);background:#fffaf5;border:1px solid #cdb79f;border-radius:1.25rem}h1{font:400 clamp(1.8rem,6vw,2.5rem)/1.1 Georgia,serif;margin:0}button{font:600 1rem system-ui;padding:.75rem 1.25rem;border:0;border-radius:2rem;background:#575b2e;color:white;cursor:pointer}</style>
      </head><body><header><a href="/">Life Guestbook</a></header><main><h1>Sign in to Life Guestbook</h1>
      <p>Continue to open your guestbook on this device.</p>
      <form method="post" action="/api/auth/verify">
        <input type="hidden" name="t" value="${token}"><button type="submit">Continue to Life Guestbook</button>
      </form></main></body></html>`);
  })
  .post("/verify", async (c) => {
    const form = await c.req.parseBody().catch(() => null);
    const token = form?.t;
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return c.redirect("/signin?expired=1", 303);
    const ref = signInTokens().doc(sha256(token));
    const data = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const entry = snap.data() as { email: string; name?: string; next: string; expiresAt: number } | undefined;
      if (!entry || entry.expiresAt < Date.now()) return null;
      transaction.delete(ref);
      return entry;
    });
    if (!data) return c.redirect("/signin?expired=1", 303);
    const uid = await ensureUser(data.email, data.name ?? undefined);
    await startSession(c, uid);
    return c.redirect(safeNext(data.next), 303);
  })
  .post("/signout", async (c) => {
    const token = getCookie(c, COOKIE);
    if (token) await sessions().doc(sha256(token)).delete();
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
