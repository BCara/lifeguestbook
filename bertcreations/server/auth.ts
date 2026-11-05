import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;
export const COOKIE = "bc_session";

const sha = (s: string) => createHash("sha256").update(s).digest();

export class Passcode {
  private key: Buffer;
  private digest: Buffer;

  /** Changing either the passcode or the secret signs everyone out. */
  constructor(passcode: string, secret: string) {
    this.digest = sha(passcode.trim());
    this.key = sha(`${secret}\u0000${passcode.trim()}`);
  }

  check(attempt: string) {
    return timingSafeEqual(sha(String(attempt ?? "").trim()), this.digest);
  }

  private sign(payload: string) {
    return createHmac("sha256", this.key).update(payload).digest("base64url");
  }

  issue(now = Date.now()) {
    const payload = String(now);
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string | undefined, now = Date.now()) {
    if (!token) return false;
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return false;
    const expected = Buffer.from(this.sign(payload));
    const got = Buffer.from(sig);
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
    const issued = Number(payload);
    return Number.isFinite(issued) && issued <= now + 60_000 && now - issued < SESSION_DAYS * DAY;
  }
}

/** Slows down passcode guessing: N failures per IP per window, then locked until the window passes. */
export class Throttle {
  private hits = new Map<string, { n: number; since: number }>();
  constructor(
    private max = 8,
    private windowMs = 15 * 60 * 1000,
  ) {}

  blocked(ip: string, now = Date.now()) {
    const h = this.hits.get(ip);
    if (!h) return false;
    if (now - h.since > this.windowMs) {
      this.hits.delete(ip);
      return false;
    }
    return h.n >= this.max;
  }

  fail(ip: string, now = Date.now()) {
    const h = this.hits.get(ip);
    if (!h || now - h.since > this.windowMs) this.hits.set(ip, { n: 1, since: now });
    else h.n++;
    if (this.hits.size > 5000) this.hits.clear();
  }

  reset(ip: string) {
    this.hits.delete(ip);
  }
}
