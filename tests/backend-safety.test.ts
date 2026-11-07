import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "../functions/node_modules/hono/dist/index.js";

const state = vi.hoisted(() => ({
  memorial: { id: "m1", mode: "memorial", name: "Sensitive Name", privacy: "private", wallKey: "new-key", plan: { tier: "free" }, coverPath: "cover.jpg" } as any,
  role: undefined as string | undefined,
  status: "approved",
  transaction: vi.fn(),
  download: vi.fn(async () => [Buffer.from("synthetic-image")]),
}));
vi.mock("../functions/src/db", () => ({
  db: { runTransaction: state.transaction, collection: () => ({ doc: () => ({}) }) },
  getMemorial: vi.fn(async () => state.memorial),
  memorialBySlug: vi.fn(async () => state.memorial),
  roleOf: vi.fn(async () => state.role),
  contributions: () => ({ doc: () => ({ get: async () => ({ data: () => ({ status: state.status, media: { display: "photo.jpg" } }) }) }) }),
  bucket: () => ({ file: () => ({ getMetadata: async () => [{ size: 15, contentType: "image/jpeg" }], download: state.download }) }),
  memorials: vi.fn(), users: vi.fn(), logAudit: vi.fn(), isSealed: () => false,
}));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
beforeEach(() => { vi.resetModules(); state.transaction.mockClear(); state.download.mockClear(); state.role = undefined; state.status = "approved"; state.memorial.privacy = "private"; });
const env = { APP_ORIGIN: "http://localhost:5000", STRIPE_SECRET_KEY: "none", STRIPE_WEBHOOK_SECRET: "none" } as any;

describe("checkout isolation", () => {
  it.each([
    ["false", "live-project", "localhost:8080", "none"],
    ["true", "live-project", "localhost:8080", "none"],
    ["true", "demo-test", "", "none"],
    ["false", "live-project", "", "sk_test_synthetic"],
  ])("does not mutate purchases with unavailable or mismatched Stripe (%s, %s)", async (emulator, project, firestore, key) => {
    vi.stubEnv("FUNCTIONS_EMULATOR", emulator); vi.stubEnv("GCLOUD_PROJECT", project); vi.stubEnv("FIRESTORE_EMULATOR_HOST", firestore);
    state.role = "owner";
    const { paymentRoutes } = await import("../functions/src/payments");
    const app = new Hono().use("*", async (c, next) => { c.set("uid", "synthetic-owner"); await next(); }).route("/", paymentRoutes);
    const res = await app.request("/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memorialId: "m1", product: "tribute" }) }, { ...env, STRIPE_SECRET_KEY: key });
    expect(res.status).toBe(503); expect(state.transaction).not.toHaveBeenCalled();
  });
  it("allows instant purchase only with demo project and emulator backing", async () => {
    vi.stubEnv("FUNCTIONS_EMULATOR", "true"); vi.stubEnv("GCLOUD_PROJECT", "demo-test"); vi.stubEnv("FIRESTORE_EMULATOR_HOST", "localhost:8080");
    state.role = "owner";
    state.transaction.mockResolvedValue(false);
    const { paymentRoutes } = await import("../functions/src/payments");
    const app = new Hono().use("*", async (c, next) => { c.set("uid", "synthetic-owner"); await next(); }).route("/", paymentRoutes);
    const res = await app.request("/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memorialId: "m1", product: "tribute" }) }, env);
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ applied: true });
    expect(state.transaction).toHaveBeenCalledOnce();
    const { demoPurchasesEnabled, paymentsEnabled } = await import("../functions/src/env");
    expect(demoPurchasesEnabled()).toBe(true);
    expect(paymentsEnabled({ ...env, STRIPE_SECRET_KEY: "sk_live_synthetic", STRIPE_WEBHOOK_SECRET: "whsec_synthetic" })).toBe(false);
  });
});

describe("revocable content", () => {
  it("returns the same generic guest response for private and missing pages", async () => {
    const { guestRoutes } = await import("../functions/src/routes/guest");
    const denied = await guestRoutes.request("/test", {}, env);
    expect(denied.status).toBe(404); expect(await denied.json()).toEqual({ error: "Not found" });
  });
  it("does not cache full or range media, and rechecks hidden content and rotated keys", async () => {
    const { mediaRoutes } = await import("../functions/src/routes/guest");
    for (const headers of [{}, { range: "bytes=0-4" }]) {
      const res = await mediaRoutes.request("/m1/c1/display?k=new-key", { headers }, env);
      expect(res.status).toBe(headers.range ? 206 : 200); expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    state.status = "hidden";
    expect((await mediaRoutes.request("/m1/c1/display?k=new-key", {}, env)).status).toBe(404);
    state.status = "approved";
    expect((await mediaRoutes.request("/m1/c1/display?k=old-key", {}, env)).status).toBe(404);
    state.memorial.privacy = "public";
    expect((await mediaRoutes.request("/m1/c1/display", {}, env)).status).toBe(200);
    state.memorial.privacy = "private";
    expect((await mediaRoutes.request("/m1/c1/display", {}, env)).status).toBe(404);
  });
  it.each(["private", "unlisted"])("does not disclose %s page details in link previews", async privacy => {
    state.memorial.privacy = privacy;
    vi.stubGlobal("fetch", vi.fn(async () => new Response('<html><head><title>App</title></head><body></body></html>')));
    const { shareApp, shareImage } = await import("../functions/src/share");
    const res = await shareApp.request("/m/test", {}, env);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const html = await res.text(); expect(html).not.toContain("Sensitive Name"); expect(html).not.toContain("og:image");
    expect(await shareImage("test")).toBeNull(); expect(state.download).not.toHaveBeenCalled();
  });
});

