import { describe, expect, it } from "vitest";
import { settingsForm, settingsPatch } from "../src/shared/settings";
import type { MemorialAdmin } from "../src/shared/types";

const memorial = (over: Partial<MemorialAdmin> = {}) =>
  ({
    id: "m1", slug: "margaret-abc", mode: "memorial", name: "Margaret Hughes", born: "1948-03-02", died: "2026-10-30",
    intro: "Mum loved her garden.", privacy: "link", moderation: "approve_all",
    service: { date: "2026-11-12", place: "St Mary's" },
    ...over,
  }) as MemorialAdmin;

describe("settings form (regression: first privacy change was reverted)", () => {
  it("sends nothing when nothing changed", () => {
    const base = settingsForm(memorial());
    expect(settingsPatch(base, { ...base })).toBeNull();
  });

  it("a privacy change sends only privacy", () => {
    const base = settingsForm(memorial());
    expect(settingsPatch(base, { ...base, privacy: "private" })).toEqual({ privacy: "private" });
  });

  it("a later save from a form opened before the privacy change does not send privacy back", () => {
    // The owner made the page private; a Settings form opened from the older snapshot then saves moderation.
    const stale = settingsForm(memorial({ privacy: "link" }));
    const body = settingsPatch(stale, { ...stale, moderation: "auto" });
    expect(body).toEqual({ moderation: "auto" });
    expect(body).not.toHaveProperty("privacy");
  });

  it("the form re-bases on what the server returned after saving", () => {
    const after = settingsForm(memorial({ privacy: "private" }));
    expect(after.privacy).toBe("private");
    expect(settingsPatch(after, { ...after, privacy: "link" })).toEqual({ privacy: "link" });
  });

  it("service is sent whole because the API replaces it", () => {
    const base = settingsForm(memorial());
    expect(settingsPatch(base, { ...base, time: "11:00am" })).toEqual({
      service: { date: "2026-11-12", time: "11:00am", place: "St Mary's", livestreamUrl: "" },
    });
  });
});
