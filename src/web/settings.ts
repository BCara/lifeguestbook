import type { MemorialAdmin } from "../shared/types";

const SERVICE_FIELDS = ["date", "time", "place", "livestreamUrl"] as const;

export function settingsForm(m: MemorialAdmin) {
  return {
    name: m.name, born: m.born ?? "", died: m.died ?? "", intro: m.intro ?? "", story: m.story ?? "",
    privacy: m.privacy, moderation: m.moderation,
    date: m.service?.date ?? "", time: m.service?.time ?? "", place: m.service?.place ?? "", livestreamUrl: m.service?.livestreamUrl ?? "",
  };
}

export type SettingsForm = ReturnType<typeof settingsForm>;

/** Only the fields the admin changed, so a save never writes back values that someone else has changed since. */
export function settingsChanges(before: SettingsForm, after: SettingsForm) {
  const body: Record<string, unknown> = {};
  for (const k of ["name", "born", "died", "intro", "story", "privacy", "moderation"] as const) {
    if (after[k] !== before[k]) body[k] = after[k];
  }
  if (SERVICE_FIELDS.some((k) => after[k] !== before[k])) {
    body.service = { date: after.date, time: after.time, place: after.place, livestreamUrl: after.livestreamUrl };
  }
  return body;
}
