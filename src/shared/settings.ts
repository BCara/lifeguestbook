// The guestbook Settings form. The PATCH carries only the fields the admin actually edited, measured
// against the snapshot the form was opened with. Re-sending every field from a stale snapshot used to
// write an older privacy value back over a change the admin had just saved.
import type { MemorialAdmin } from "./types";

export function settingsForm(m: MemorialAdmin) {
  return {
    name: m.name, born: m.born ?? "", died: m.died ?? "", intro: m.intro ?? "", story: m.story ?? "",
    privacy: m.privacy as string, moderation: m.moderation as string,
    date: m.service?.date ?? "", time: m.service?.time ?? "", place: m.service?.place ?? "", livestreamUrl: m.service?.livestreamUrl ?? "",
  };
}

export type SettingsForm = ReturnType<typeof settingsForm>;

const SERVICE = ["date", "time", "place", "livestreamUrl"] as const;
const PLAIN = ["name", "born", "died", "intro", "story", "privacy", "moderation"] as const;

/** The PATCH body for what changed between `base` and `f`, or null when nothing did. */
export function settingsPatch(base: SettingsForm, f: SettingsForm): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};
  for (const k of PLAIN) if (f[k] !== base[k]) body[k] = f[k];
  // The API replaces `service` as a whole, so send all four parts if any one changed.
  if (SERVICE.some((k) => f[k] !== base[k])) body.service = Object.fromEntries(SERVICE.map((k) => [k, f[k]]));
  return Object.keys(body).length ? body : null;
}
