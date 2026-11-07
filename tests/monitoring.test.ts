import { describe, expect, it } from "vitest";
import { routeShape, scrubDeep, scrubSentryEvent, scrubText } from "../src/shared/scrub";
import { entry } from "../functions/src/log";

describe("routeShape", () => {
  it("removes slugs, ids and query strings", () => {
    expect(routeShape("/m/jane-doe-1942")).toBe("/m/:slug");
    expect(routeShape("/m/jane-doe-1942/add?ref=qr#top")).toBe("/m/:slug/add");
    expect(routeShape("/dashboard/abc123XYZ/book")).toBe("/dashboard/:id/book");
    expect(routeShape("/api/memorials/abc/chapters/q8Hk2mPq9xYzT3")).toBe("/api/memorials/:id/chapters/:id");
    expect(routeShape("/api/media/memorials/abc/photo.jpg")).toBe("/api/media/:file");
    expect(routeShape("/signin?token=secret")).toBe("/signin");
    expect(routeShape("/day-of-guestbook")).toBe("/day-of-guestbook");
  });
});

describe("scrubText", () => {
  it("redacts emails and media URLs and strips queries", () => {
    expect(scrubText("mail jane.doe+x@example.co.uk now")).toBe("mail [email] now");
    expect(scrubText("GET https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media")).toBe("GET [media-url]");
    expect(scrubText("at https://lifeguestbook.com/api/media/x/y.jpg")).toBe("at [media-url]");
    expect(scrubText("see https://lifeguestbook.com/m/jane-doe?k=1")).toBe("see https://lifeguestbook.com/m/:slug");
  });
  it("drops content-bearing keys", () => {
    expect(scrubDeep({ text: "my memory", email: "a@b.co", status: 500, nested: { caption: "x", ok: "y" } })).toEqual({ status: 500, nested: { ok: "y" } });
  });
});

describe("scrubSentryEvent", () => {
  it("removes user, request bodies, console breadcrumbs and PII", () => {
    const out = scrubSentryEvent({
      user: { email: "a@b.co", ip_address: "1.2.3.4" },
      request: { url: "https://lifeguestbook.com/m/jane?x=1", method: "POST", data: "{\"text\":\"secret\"}", cookies: { s: "1" }, headers: { cookie: "s=1", "user-agent": "UA" } },
      breadcrumbs: [
        { category: "console", message: "memory text here" },
        { category: "ui.input", message: "typed" },
        { category: "fetch", data: { url: "/api/m/jane-doe/contributions?x=1", status_code: 500 } },
      ],
      exception: { values: [{ type: "Error", value: "failed for jane@example.com" }] },
      transaction: "/dashboard/abc123/print",
    });
    expect(out.user).toBeUndefined();
    expect(out.request).toEqual({ method: "POST", url: "https://lifeguestbook.com/m/:slug", headers: { "user-agent": "UA" } });
    expect(out.breadcrumbs).toHaveLength(1);
    expect(JSON.stringify(out)).not.toMatch(/jane|secret|memory text|@example/);
    expect(out.transaction).toBe("/dashboard/:id/print");
  });
});

describe("structured log entry", () => {
  it("is Error Reporting compatible and scrubbed", () => {
    const e = entry("ERROR", "Failed for a@b.co", { route: "/m/:slug", text: "memory" }, new Error("boom"));
    expect(e.severity).toBe("ERROR");
    expect(e["@type"]).toContain("ReportedErrorEvent");
    expect(String(e.message)).toContain("Error: boom");
    expect(String(e.message)).not.toContain("a@b.co");
    expect(e.text).toBeUndefined();
  });
});
