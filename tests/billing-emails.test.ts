// Billing disclosures in emails must match the Terms and refund policy (src/web/pages/Info.tsx).
import { describe, expect, it, vi } from "vitest";

vi.mock("../functions/src/db", () => ({ db: {} }));
const { receiptEmail, renewalEmail } = await import("../functions/src/email");

const DASH = "https://lifeguestbook.com/dashboard/abc";
const END = Date.UTC(2027, 10, 7);

describe("receipt email", () => {
  it("discloses automatic renewal, how to cancel and the 14-day refund for subscriptions", () => {
    const e = receiptEmail("a@example.com", "Ann Lee", "Living Legacy (yearly)", "35.00 USD", DASH, { recurring: true, hostingUntil: END });
    expect(e.text).toContain("renews automatically each year on or around 7 November 2027");
    expect(e.text).toContain("currently 35.00 USD");
    expect(e.text).toContain("Cancel any time from the Plan tab");
    expect(e.text).toContain("within 14 days");
    expect(e.html).toContain("https://lifeguestbook.com/refunds");
    expect(e.html).toContain(`${DASH}?tab=plan`);
  });

  it("says one-off plans won't renew", () => {
    const e = receiptEmail("a@example.com", "Ann Lee", "Tribute", "39.00 GBP", DASH, { recurring: false, hostingUntil: END });
    expect(e.text).toContain("won't renew automatically");
    expect(e.text).not.toContain("subscription");
  });

  it("marks Forever as hosted for life", () => {
    const e = receiptEmail("a@example.com", "Ann Lee", "Forever", "99.00 GBP", DASH, { recurring: false, hostingUntil: null });
    expect(e.text).toContain("for life");
    expect(e.text).not.toContain("won't renew");
  });

  it("labels automatic renewals", () => {
    const e = receiptEmail("a@example.com", "Ann Lee", "Keep it open (yearly)", "12.00 GBP", DASH, { recurring: true, renewal: true, hostingUntil: END });
    expect(e.subject).toContain("renewed");
  });
});

describe("renewal reminder", () => {
  it("warns of an upcoming automatic charge when a subscription is active", () => {
    const e = renewalEmail("a@example.com", "Ann Lee", 30, `${DASH}?tab=plan`, true, END);
    expect(e.text).toContain("renews automatically");
    expect(e.text).toContain("Cancel any time");
  });

  it("tells one-off plans they won't be charged", () => {
    const e = renewalEmail("a@example.com", "Ann Lee", 30, `${DASH}?tab=plan`, false, END);
    expect(e.text).toContain("won't renew automatically");
  });

  it("never says a lapsed page was deleted", () => {
    const e = renewalEmail("a@example.com", "Ann Lee", 0, `${DASH}?tab=plan`, false, END);
    expect(e.text).toContain("nothing is deleted");
  });
});
