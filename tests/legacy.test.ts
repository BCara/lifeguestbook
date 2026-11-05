import { describe, expect, it } from "vitest";
import { diedMD, isSealed } from "../functions/src/db";
import { injectMeta } from "../functions/src/share";
import { lifeYears } from "../src/shared/types";

describe("sealed letters", () => {
  const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
  it("stay sealed until passing or their date", () => {
    expect(isSealed({ sealed: { until: "passing" } })).toBe(true);
    expect(isSealed({ sealed: { until: "passing", openedAt: 1 } })).toBe(false);
    expect(isSealed({ sealed: { until: day(10) } })).toBe(true);
    expect(isSealed({ sealed: { until: day(-1) } })).toBe(false);
    expect(isSealed({})).toBe(false);
  });
});

describe("dates", () => {
  it("anniversary key", () => {
    expect(diedMD("2025-11-05")).toBe("11-05");
    expect(diedMD("")).toBeNull();
    expect(diedMD("nonsense")).toBeNull();
  });
  it("life years", () => {
    expect(lifeYears("1948-03-02", "2026-10-30")).toBe("1948 – 2026");
    expect(lifeYears("1948-03-02")).toBe("1948 –");
    expect(lifeYears()).toBe("");
  });
});

describe("link previews", () => {
  const shell = `<html><head><title>Life Guestbook</title><meta name="description" content="x" /><meta property="og:title" content="old" /></head><body></body></html>`;
  it("replaces title and OG tags, escapes values", () => {
    const out = injectMeta(shell, { "og:title": `Ann "Nan" O'Neil & co`, description: "d" }, "Ann <3", "noindex");
    expect(out).toContain("<title>Ann &lt;3</title>");
    expect(out).toContain('property="og:title" content="Ann &quot;Nan&quot; O&#39;Neil &amp; co"');
    expect(out).not.toContain('content="old"');
    expect(out).toContain('<meta name="robots" content="noindex" />');
    expect(out.match(/name="description"/g)?.length).toBe(1);
  });
});
