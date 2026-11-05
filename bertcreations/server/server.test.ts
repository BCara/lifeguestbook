import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Ai, sanitizeSvg } from "./ai";
import { createApp } from "./app";
import { Passcode, Throttle } from "./auth";
import { FileStore } from "./store";

describe("Passcode", () => {
  const p = new Passcode("sunrise42", "secret");
  it("checks the passcode, ignoring surrounding spaces", () => {
    expect(p.check("sunrise42")).toBe(true);
    expect(p.check(" sunrise42 ")).toBe(true);
    expect(p.check("sunrise43")).toBe(false);
    expect(p.check("")).toBe(false);
  });
  it("issues tokens that verify, and rejects tampering and expiry", () => {
    const t = p.issue();
    expect(p.verify(t)).toBe(true);
    expect(p.verify(t.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).toBe(false);
    expect(p.verify(`${Date.now()}.${t.split(".")[1]}`)).toBe(false);
    expect(p.verify(p.issue(Date.now() - 31 * 86400000))).toBe(false);
    expect(p.verify(undefined)).toBe(false);
  });
  it("signs everyone out when the passcode changes", () => {
    expect(new Passcode("newcode", "secret").verify(p.issue())).toBe(false);
  });
});

describe("Throttle", () => {
  it("blocks after too many failures and recovers after the window", () => {
    const t = new Throttle(3, 1000);
    for (let i = 0; i < 3; i++) t.fail("ip", 0);
    expect(t.blocked("ip", 10)).toBe(true);
    expect(t.blocked("other", 10)).toBe(false);
    expect(t.blocked("ip", 2000)).toBe(false);
  });
});

describe("sanitizeSvg", () => {
  it("strips scripts, handlers, links and foreign content", () => {
    const dirty = `junk<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><a href="javascript:x"><circle r="5"/></a><foreignObject><div/></foreignObject><image href="http://x/y.png"/><rect onclick='x' width="1"/></svg>tail`;
    const clean = sanitizeSvg(dirty);
    expect(clean.startsWith("<svg")).toBe(true);
    expect(clean.endsWith("</svg>")).toBe(true);
    expect(clean).not.toMatch(/script|onload|onclick|foreignObject|href|<image|javascript/i);
    expect(clean).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
  it("returns empty for non-SVG", () => {
    expect(sanitizeSvg("<div>nope</div>")).toBe("");
  });
});

describe("API", () => {
  const dir = mkdtempSync(join(tmpdir(), "bc-"));
  const app = createApp({
    store: new FileStore(join(dir, "s.json")),
    ai: new Ai({ apiKey: "", model: "claude-opus-5-5", effort: "medium" }),
    passcode: new Passcode("letmein", "s"),
    secureCookies: false,
  });
  const H = { "content-type": "application/json", "x-studio": "1", "x-member": "m1" };
  let cookie = "";
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`/api${path}`, { ...init, headers: { ...H, cookie, ...(init.headers ?? {}) } });

  it("is locked without the passcode", async () => {
    expect((await call("/state")).status).toBe(401);
    expect((await call("/login", { method: "POST", body: JSON.stringify({ passcode: "nope" }) })).status).toBe(401);
  });

  it("rejects writes without the studio header", async () => {
    const r = await app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(400);
  });

  it("unlocks, creates, rates and moves an idea, with revs for polling", async () => {
    const login = await call("/login", { method: "POST", body: JSON.stringify({ passcode: "letmein" }) });
    expect(login.status).toBe(200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];

    const created = await call("/ideas", { method: "POST", body: JSON.stringify({ title: "Dog café", x: 1, y: 2 }) });
    const { idea } = (await created.json()) as { idea: { id: string } };

    await call(`/ideas/${idea.id}/rating`, { method: "PUT", body: JSON.stringify({ excitement: 8, feasibility: 6 }) });
    await call(`/ideas/${idea.id}`, { method: "PATCH", body: JSON.stringify({ stage: "exploring", title: "Dog café club" }) });

    const st = (await (await call("/state")).json()) as { workspace: { rev: number; ideas: any[]; activity: any[] } };
    const saved = st.workspace.ideas[0];
    expect(saved.title).toBe("Dog café club");
    expect(saved.stage).toBe("exploring");
    expect(saved.ratings.m1).toEqual({ excitement: 8, feasibility: 6 });
    expect(st.workspace.activity.map((a) => a.text)).toContain("moved 💡 Dog café to exploring");

    const same = (await (await call(`/state?rev=${st.workspace.rev}`)).json()) as { changed: boolean };
    expect(same.changed).toBe(false);
  });

  it("runs the AI tools in demo mode and stores the results", async () => {
    const st = (await (await call("/state")).json()) as { workspace: { ideas: { id: string }[] } };
    const id = st.workspace.ideas[0].id;
    const f = (await (await call(`/ideas/${id}/ai/future`, { method: "POST", body: "{}" })).json()) as any;
    expect(f.demo).toBe(true);
    expect(f.future.score).toBeGreaterThanOrEqual(0);
    expect(f.future.score).toBeLessThanOrEqual(100);
    await call(`/ideas/${id}/ai/canvas`, { method: "POST", body: "{}" });
    const coach = await call("/ai/coach", { method: "POST", body: JSON.stringify({ ideaId: id, mode: "skeptic", text: "Thoughts?" }) });
    expect(coach.status).toBe(200);
    const after = (await (await call("/state")).json()) as { workspace: { ideas: any[] } };
    expect(after.workspace.ideas[0].future).toBeTruthy();
    expect(after.workspace.ideas[0].tasks.length).toBe(5);
    expect(after.workspace.ideas[0].chat.length).toBe(2);
  });

  it("rejects bad input", async () => {
    const r = await call("/ideas", { method: "POST", body: JSON.stringify({ title: "" }) });
    expect(r.status).toBe(400);
  });
});
