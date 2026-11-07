import { allowance, isFrozen } from "../../src/shared/plans";
import type { Role } from "../../src/shared/roles";
import type { ContributionView, MemorialAdmin, MemorialPublic } from "../../src/shared/types";
import { isSealed, type ContributionDoc, type MemorialDoc } from "./db";

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
    recurringBilling: !!m.stripeSubscriptionId,
    renewalCancelled: m.stripeSubscriptionCancelled ?? false,
    renewalFailed: !!m.stripeRenewalFailed,
    renewalInvoiceUrl: m.stripeRenewalFailed?.invoiceUrl ?? null,
    role,
    counts: m.counts,
    wallKey: m.wallKey,
    notifyMode: m.notifyMode,
    legacyContactUid: m.legacyContactUid ?? null,
    aiUses: m.aiUses ?? 0,
  };
}

export function contributionView(mid: string, id: string, c: ContributionDoc, forAdmin: boolean, viewerUid?: string): ContributionView {
  const hasDisplay = !!c.media?.display;
  const closed = isSealed(c) && c.authorUid !== viewerUid;
  const sealed = c.sealed ? { until: c.sealed.until, to: c.sealed.to, open: !isSealed(c) } : undefined;
  if (closed) {
    // Only the writer sees a sealed letter before it opens; everyone else sees the envelope.
    return { id, type: c.type, authorName: c.authorName, status: c.status, createdAt: c.createdAt, source: c.source, chapterId: c.chapterId ?? undefined, prompt: c.prompt, sealed };
  }
  return {
    id,
    chapterId: c.chapterId ?? undefined,
    prompt: c.prompt,
    sealed,
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
