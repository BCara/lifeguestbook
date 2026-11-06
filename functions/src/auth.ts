// Passwordless sign-in for admins: a one-time link emailed through Resend.
// Sessions live in Firestore; the cookie must be called `__session` because Firebase Hosting
// strips every other cookie before requests reach Cloud Functions.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomToken, sha256 } from "./crypto";
import { db, sessions, signInTokens, users, type UserDoc } from "./db";
import { sendEmail, signInEmail } from "./email";
import { isDev, type Env } from "./env";
import { clientIp, overLimit } from "./limits";

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

export function startSession(c: Context<AppEnv>, uid: string) {
  const token = randomToken(32);
  const secure = !c.req.url.startsWith("http://localhost") && !c.req.url.startsWith("http://127.0.0.1");
  setCookie(c, COOKIE, token, { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: SESSION_MS / 1000 });
  return sessions().doc(sha256(token)).set({ uid, expiresAt: Date.now() + SESSION_MS, createdAt: Date.now() });
}

export const authRoutes = new Hono<AppEnv>()
  .post("/email", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; name?: string; next?: string };
    if (!validEmail(body.email)) return c.json({ error: "Please enter a valid email address." }, 400);
    const email = body.email.trim().toLowerCase();
    if ((await overLimit(`signin:${email}`, 6)) || (await overLimit(`signin-ip:${clientIp(c.req.raw.headers)}`, 30)))
      return c.json({ error: "Too many sign-in emails. Please wait a little and try again." }, 429);
    const token = randomToken(32);
    await signInTokens().doc(sha256(token)).set({ email, name: body.name?.slice(0, 80) ?? null, next: safeNext(body.next), expiresAt: Date.now() + LINK_MS });
    const link = `${c.env.APP_ORIGIN}/api/auth/verify?t=${token}`;
    await sendEmail(c.env, signInEmail(email, link));
    return c.json({ ok: true, ...(isDev() ? { devLink: link } : {}) });
  })
  .get("/verify", async (c) => {
    const token = c.req.query("t") ?? "";
    const ref = signInTokens().doc(sha256(token));
    const data = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const entry = snap.data() as { email: string; name?: string; next: string; expiresAt: number } | undefined;
      if (!entry || entry.expiresAt < Date.now()) return null;
      transaction.delete(ref);
      return entry;
    });
    if (!data) return c.redirect("/signin?expired=1");
    const uid = await ensureUser(data.email, data.name ?? undefined);
    await startSession(c, uid);
    return c.redirect(safeNext(data.next));
  })
  .post("/signout", async (c) => {
    const token = getCookie(c, COOKIE);
    if (token) await sessions().doc(sha256(token)).delete();
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
