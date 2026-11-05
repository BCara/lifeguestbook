import type { Allowance, PlanState } from "./plans";
import type { Role } from "./roles";

export type Privacy = "link" | "public" | "private";
export type ModerationMode = "approve_all" | "auto" | "trusted_only";
export type ContributionType = "photo" | "video" | "voice" | "text";
export type ContributionStatus = "pending" | "approved" | "hidden" | "rejected";
export type MemorialMode = "memorial" | "living";

export interface ServiceDetails {
  date?: string; // YYYY-MM-DD
  time?: string;
  place?: string;
  livestreamUrl?: string;
}

export interface MemorialPublic {
  id: string;
  slug: string;
  mode: MemorialMode;
  name: string;
  born?: string;
  died?: string;
  intro?: string;
  story?: string;
  coverUrl?: string;
  privacy: Privacy;
  service?: ServiceDetails;
  allowance: Allowance;
  frozen: boolean;
}

export interface ChapterView {
  id: string;
  title: string;
  order: number;
  era?: string;
  stories?: number;
  questions?: { question: string; why: string }[];
}

export const DEFAULT_CHAPTERS = ["Early years", "Growing up", "School days", "Work and calling", "Love and family", "Places that mattered", "Proudest moments", "Advice and wishes"];

export interface MemorialAdmin extends MemorialPublic {
  legacyContactUid?: string | null;
  aiUses: number;
  moderation: ModerationMode;
  plan: PlanState;
  role: Role;
  counts: { pending: number; approved: number; total: number };
  wallKey?: string;
  notifyMode: "digest" | "instant";
}

export interface SealedInfo {
  /** "passing" = opens when the page becomes a memorial; otherwise a YYYY-MM-DD date. */
  until: string;
  to?: string;
  open: boolean;
}

export interface ContributionView {
  id: string;
  chapterId?: string;
  prompt?: string;
  sealed?: SealedInfo;
  type: ContributionType;
  text?: string;
  authorName: string;
  relation?: string;
  era?: string;
  status: ContributionStatus;
  screening?: { outcome: string; categories?: string[] };
  mediaUrl?: string;
  thumbUrl?: string;
  mime?: string;
  createdAt: number;
  source: "online" | "event";
}

export interface MemberView {
  uid: string;
  email: string;
  name?: string;
  role: Role;
  addedAt: number;
}

export interface InviteView {
  id: string;
  email: string;
  role: Role;
  createdAt: number;
}

export interface Me {
  uid: string;
  email: string;
  name?: string;
}

export const RELATIONS = ["Family", "Friend", "School", "University", "Work", "Neighbour", "Community", "Other"] as const;

export function lifeYears(born?: string, died?: string) {
  const y = (s?: string) => (s ? s.slice(0, 4) : "");
  if (!born && !died) return "";
  return `${y(born)}${died ? ` – ${y(died)}` : born ? " –" : ""}`;
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "memorial";
}
