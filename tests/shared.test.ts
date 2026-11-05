import { describe, expect, it } from "vitest";
import { allowance, hostingAfterPurchase, isFrozen } from "../src/shared/plans";
import { currencyForTimeZone, formatPrice } from "../src/shared/pricing";
import { can, canAssign, canChangeMember } from "../src/shared/roles";
import { slugify } from "../src/shared/types";
import { countDelta } from "../functions/src/counts";
import { decideStatus } from "../functions/src/routes/guest";
import { combine, markerOutcome } from "../functions/src/screening";

const YEAR = 365 * 24 * 3600_000;

describe("plans", () => {
  it("free is limited but never freezes", () => {
    const a = allowance({ tier: "free", hostingUntil: null });
    expect(a.contributionLimit).toBe(30);
    expect(a.slideshow).toBe(false);
    expect(a.acceptingContributions).toBe(true);
  });
  it("tribute includes 2 years, then freezes (never deletes)", () => {
    const now = 1_000_000;
    const p = hostingAfterPurchase({ tier: "free", hostingUntil: null }, "tribute", now);
    expect(p).toEqual({ tier: "tribute", hostingUntil: now + 2 * YEAR });
    expect(isFrozen(p, now + YEAR)).toBe(false);
    expect(isFrozen(p, now + 3 * YEAR)).toBe(true);
    const a = allowance(p, now + 3 * YEAR);
    expect(a.acceptingContributions).toBe(false);
    expect(a.slideshow).toBe(false);
  });
  it("renewal extends from the later of now and the current end", () => {
    const now = 10 * YEAR;
    expect(hostingAfterPurchase({ tier: "tribute", hostingUntil: now + 100 }, "hosting", now).hostingUntil).toBe(now + 100 + YEAR);
    expect(hostingAfterPurchase({ tier: "tribute", hostingUntil: now - 5 * YEAR }, "hosting", now).hostingUntil).toBe(now + YEAR);
  });
  it("forever never expires and ignores later renewals", () => {
    const f = hostingAfterPurchase({ tier: "tribute", hostingUntil: 5 }, "forever");
    expect(f).toEqual({ tier: "forever", hostingUntil: null });
    expect(hostingAfterPurchase(f, "hosting")).toEqual(f);
    expect(isFrozen(f, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe("pricing", () => {
  it("picks currency from time zone", () => {
    expect(currencyForTimeZone("Europe/London")).toBe("gbp");
    expect(currencyForTimeZone("Australia/Sydney")).toBe("aud");
    expect(currencyForTimeZone("America/New_York")).toBe("usd");
    expect(currencyForTimeZone("America/Toronto")).toBe("cad");
    expect(currencyForTimeZone("Europe/Paris")).toBe("eur");
    expect(currencyForTimeZone("Pacific/Auckland")).toBe("nzd");
  });
  it("formats prices", () => {
    expect(formatPrice("tribute", "gbp")).toBe("£39");
    expect(formatPrice("hosting", "usd")).toBe("US$15/yr");
  });
});

describe("roles", () => {
  it("moderators review but can't manage people or billing", () => {
    expect(can("moderator", "moderate")).toBe(true);
    expect(can("moderator", "manage_members")).toBe(false);
    expect(can("moderator", "billing")).toBe(false);
  });
  it("only the owner deletes or transfers; nobody else can remove the owner", () => {
    expect(can("admin", "delete")).toBe(false);
    expect(can("owner", "transfer")).toBe(true);
    expect(canChangeMember("admin", "owner")).toBe(false);
    expect(canChangeMember("admin", "admin")).toBe(true);
    expect(canAssign("admin", "owner")).toBe(false);
    expect(canAssign("moderator", "trusted")).toBe(false);
  });
});

describe("moderation", () => {
  it("critical screening hides; review holds; members skip the queue", () => {
    expect(decideStatus({ moderation: "auto" }, { outcome: "critical" }, true)).toBe("hidden");
    expect(decideStatus({ moderation: "auto" }, { outcome: "review" }, true)).toBe("pending");
    expect(decideStatus({ moderation: "approve_all" }, { outcome: "clear" }, false)).toBe("pending");
    expect(decideStatus({ moderation: "approve_all" }, { outcome: "clear" }, true)).toBe("approved");
    expect(decideStatus({ moderation: "auto" }, { outcome: "clear" }, false)).toBe("approved");
    expect(decideStatus({ moderation: "auto" }, { outcome: "unavailable" }, false)).toBe("pending");
  });
  it("combines screening results by severity", () => {
    expect(combine([{ outcome: "clear" }, { outcome: "review", categories: ["x"] }])).toEqual({ outcome: "review", categories: ["x"] });
    expect(markerOutcome("hi [safety]")?.outcome).toBe("critical");
  });
  it("keeps counts consistent", () => {
    expect(countDelta(null, "pending")).toEqual({ "counts.pending": 1, "counts.total": 1 });
    expect(countDelta("pending", "approved")).toEqual({ "counts.pending": -1, "counts.approved": 1, "counts.total": 0 });
    expect(countDelta("approved", "rejected")).toEqual({ "counts.approved": -1, "counts.total": -1 });
  });
});

it("slugify", () => {
  expect(slugify("Margaret Ellen Hughes")).toBe("margaret-ellen-hughes");
  expect(slugify("Zoë O'Brien")).toBe("zoe-o-brien");
});
