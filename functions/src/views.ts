import { allowance, isFrozen } from "../../src/shared/plans";
import type { Role } from "../../src/shared/roles";
import type { ContributionView, MemorialAdmin, MemorialPublic } from "../../src/shared/types";
import type { ContributionDoc, MemorialDoc } from "./db";

export const mediaUrl = (mid: string, cid: string, variant: "display" | "thumb" | "original") => `/api/media/${mid}/${cid}/${variant}`;

export function publicView(id: string, m: MemorialDoc): MemorialPublic {
  return {
    id,
    slug: m.slug,
    mode: m.mode,
    name: m.name,
    born: m.born,
    died: m.died,
    intro: m.intro,
    story: m.story,
    coverUrl: m.coverPath ? `/api/media/${id}/cover/display?v=${encodeURIComponent(m.coverPath.split("/").pop() ?? "")}` : undefined,
    privacy: m.privacy,
    service: m.service,
    allowance: allowance(m.plan),
    frozen: isFrozen(m.plan),
  };
}

export function adminView(id: string, m: MemorialDoc, role: Role): MemorialAdmin {
  return {
    ...publicView(id, m),
    moderation: m.moderation,
    plan: m.plan,
    role,
    counts: m.counts,
    wallKey: m.wallKey,
    notifyMode: m.notifyMode,
  };
}

export function contributionView(mid: string, id: string, c: ContributionDoc, forAdmin: boolean): ContributionView {
  const hasDisplay = !!c.media?.display;
  return {
    id,
    type: c.type,
    text: c.text,
    authorName: c.authorName,
    relation: c.relation,
    era: c.era,
    status: c.status,
    screening: forAdmin ? c.screening : undefined,
    mediaUrl: c.media ? mediaUrl(mid, id, hasDisplay ? "display" : "original") : undefined,
    thumbUrl: c.media ? mediaUrl(mid, id, hasDisplay ? "thumb" : "original") : undefined,
    mime: c.media?.mime,
    createdAt: c.createdAt,
    source: c.source,
  };
}
