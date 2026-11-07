import { beforeEach, describe, expect, it, vi } from "vitest";
import { authRoutes, userIdFor } from "../functions/src/auth";

const { verify, userDoc, saveSession } = vi.hoisted(() => ({
  verify: vi.fn(),
  userDoc: vi.fn(() => ({ get: async () => ({ exists: true }) })),
  saveSession: vi.fn(async () => undefined),
}));

vi.mock("../functions/src/google-auth", () => ({ verifyGoogleSessionToken: verify }));
vi.mock("../functions/src/db", () => ({
  users: () => ({ doc: userDoc }),
  sessions: () => ({ doc: () => ({ set: saveSession }) }),
}));
vi.mock("../functions/src/limits", () => ({
  clientIp: () => "192.0.2.1",
  overLimit: async () => false,
}));

const origin = "https://lifeguestbook-cbert.web.app";
const env = { APP_ORIGIN: origin } as Parameters<typeof authRoutes.request>[2];

function exchange(next: string, requestOrigin = origin) {
  return authRoutes.request(`${origin}/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: requestOrigin },
    body: JSON.stringify({ idToken: "synthetic-token", next }),
  }, env);
}

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue({
    email: "Host@Gmail.com",
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_provider: "google.com" },
  });
});

describe("Google session exchange", () => {
  it("reuses the email-link account and preserves the invited destination", async () => {
    const result = await exchange("/invite?t=example");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ next: "/invite?t=example" });
    expect(verify).toHaveBeenCalledWith("synthetic-token");
    expect(userDoc).toHaveBeenCalledWith(userIdFor("host@gmail.com"));
    expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ uid: userIdFor("host@gmail.com") }));
    expect(result.headers.get("set-cookie")).toMatch(/__session=.+HttpOnly/i);
  });

  it("rejects requests from another origin before verifying the token", async () => {
    expect((await exchange("/dashboard", "https://example.test")).status).toBe(403);
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([
    { email_verified: false },
    { email: "host@example.test" },
    { firebase: { sign_in_provider: "password" } },
    { auth_time: 0 },
  ])("rejects tokens that are ineligible for a session", async (claims) => {
    verify.mockResolvedValue({ ...await verify.getMockImplementation()?.(), ...claims });
    expect((await exchange("/dashboard")).status).toBe(401);
    expect(saveSession).not.toHaveBeenCalled();
  });

  it("falls back to the dashboard for an external destination", async () => {
    expect(await (await exchange("//example.test")).json()).toEqual({ next: "/dashboard" });
  });
});
