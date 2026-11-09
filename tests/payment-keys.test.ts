import { afterEach, describe, expect, it, vi } from "vitest";

const base = { STRIPE_WEBHOOK_SECRET: "whsec_synthetic" } as any;

describe("paymentsEnabled key modes", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("accepts live standard and restricted keys on the public domain, never test keys", async () => {
    vi.stubEnv("GCLOUD_PROJECT", "lifeguestbook-cbert");
    const { paymentsEnabled } = await import("../functions/src/env");
    const env = { ...base, APP_ORIGIN: "https://lifeguestbook.com" };
    expect(paymentsEnabled({ ...env, STRIPE_SECRET_KEY: "rk_live_synthetic" })).toBe(true);
    expect(paymentsEnabled({ ...env, STRIPE_SECRET_KEY: "sk_live_synthetic" })).toBe(true);
    expect(paymentsEnabled({ ...env, STRIPE_SECRET_KEY: "rk_test_synthetic" })).toBe(false);
    expect(paymentsEnabled({ ...env, STRIPE_SECRET_KEY: "pk_live_synthetic" })).toBe(false);
  });

  it("accepts only test keys on the staging hostname", async () => {
    vi.stubEnv("GCLOUD_PROJECT", "lifeguestbook-cbert");
    const { paymentsEnabled } = await import("../functions/src/env");
    const env = { ...base, APP_ORIGIN: "https://lifeguestbook-cbert.web.app" };
    expect(paymentsEnabled({ ...env, STRIPE_SECRET_KEY: "rk_test_synthetic" })).toBe(true);
    expect(paymentsEnabled({ ...env, STRIPE_SECRET_KEY: "rk_live_synthetic" })).toBe(false);
  });
});
