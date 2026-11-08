import { describe, expect, it } from "vitest";
import { settingsChanges, type SettingsForm } from "../src/web/settings";

const base: SettingsForm = {
  name: "Margaret Hughes", born: "1948-03-02", died: "2026-10-30", intro: "", story: "",
  privacy: "link", moderation: "approve_all",
  date: "2026-11-12", time: "", place: "St Mary's", livestreamUrl: "",
};

describe("settings save", () => {
  it("sends a privacy change on its own", () => {
    expect(settingsChanges(base, { ...base, privacy: "private" })).toEqual({ privacy: "private" });
  });

  it("does not send fields the admin left alone, so it can't overwrite another admin's change", () => {
    expect(settingsChanges(base, { ...base, intro: "Mum loved her garden." })).toEqual({ intro: "Mum loved her garden." });
    expect(settingsChanges(base, { ...base })).toEqual({});
  });

  it("sends the whole service block when any service field changes", () => {
    expect(settingsChanges(base, { ...base, time: "11:00" })).toEqual({
      service: { date: "2026-11-12", time: "11:00", place: "St Mary's", livestreamUrl: "" },
    });
  });
});
