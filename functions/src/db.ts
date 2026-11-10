import { initializeApp, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { PlanState } from "../../src/shared/plans";
import type { Role } from "../../src/shared/roles";
import type {
  ContributionStatus,
  ContributionType,
  MemorialMode,
  ModerationMode,
  Privacy,
  ServiceDetails,
} from "../../src/shared/types";

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const bucket = () => getStorage().bucket();
export { FieldValue, Timestamp };

export interface UserDoc {
  email: string;
  name?: string;
  createdAt: number;
  lastSeenAt: number;
  emailOptOut?: boolean;
}

export interface MemorialDoc {
  slug: string;
  mode: MemorialMode;
  name: string;
  born?: string;
  died?: string;
  intro?: string;
  story?: string;
  coverPath?: string;
  privacy: Privacy;
  moderation: ModerationMode;
  service?: ServiceDetails;
  plan: PlanState;
  ownerId: string;
  wallKey: string;
  wall?: { paused?: boolean; pinnedId?: string | null; skip?: number; updatedAt?: number };
  notifyMode: "digest" | "instant";
  counts: { pending: number; approved: number; total: number };
  pendingTransfer?: { toUid: string; at: number } | null;
  createdAt: number;
  reminders?: Record<string, number>;
  recapSentAt?: number;
  dayBeforeSentAt?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionCancelled?: boolean;
  /** The payment that last set `plan`, so a refund or dispute of it can take it back. */
  planPaymentRef?: string | null;
  unpaidReason?: "refunded" | "disputed";
  unpaidAt?: number;
  unpaidStripeEvent?: string;
  legacyContactUid?: string | null;
  aiUses?: number;
  convertedAt?: number;
  /** "MM-DD" of the date they died, for anniversary emails. */
  diedMD?: string | null;
  anniversarySentYear?: number;
  recovery?: { requestedBy: string; at: number } | null;
}

export const diedMD = (died?: string | null) => (died && /^\d{4}-\d{2}-\d{2}$/.test(died) ? died.slice(5) : null);

export interface MemberDoc {
  role: Role;
  email: string;
  name?: string;
  addedAt: number;
  addedBy?: string;
}

export interface ContributionDoc {
  type: ContributionType;
  text?: string;
  authorName: string;
  relation?: string;
  era?: string;
  authorEmail?: string;
  authorUid?: string;
  status: ContributionStatus;
  screening?: { outcome: string; categories?: string[] };
  media?: { original?: string; display?: string; thumb?: string; mime: string; bytes: number };
  source: "online" | "event";
  createdAt: number;
  ipHash?: string;
  notifiedApproved?: boolean;
  chapterId?: string | null;
  prompt?: string;
  sealed?: { until: string; to?: string; openedAt?: number };
  reported?: boolean;
}

/** A sealed letter stays closed until the page becomes a memorial ("passing") or its date arrives. */
export function isSealed(c: Pick<ContributionDoc, "sealed">, now = Date.now()) {
  if (!c.sealed || c.sealed.openedAt) return false;
  if (c.sealed.until === "passing") return true;
  return c.sealed.until > new Date(now).toISOString().slice(0, 10);
}

export interface InviteDoc {
  memorialId: string;
  email: string;
  role: Role;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  acceptedBy?: string;
}

export interface OutboxDoc {
  kind: "new_contribution" | "report";
  memorialId: string;
  contributionId: string;
  status: "pending" | "sent";
  createdAt: number;
}

export const users = () => db.collection("users");
export const memorials = () => db.collection("memorials");
export const members = (mid: string) => memorials().doc(mid).collection("members");
export const contributions = (mid: string) => memorials().doc(mid).collection("contributions");
export const audit = (mid: string) => memorials().doc(mid).collection("audit");
export const memberships = (uid: string) => users().doc(uid).collection("memberships");
export const invites = () => db.collection("invites");
export const sessions = () => db.collection("sessions");
export const signInTokens = () => db.collection("signInTokens");
export const outbox = () => db.collection("notificationOutbox");
export const limits = () => db.collection("limits");
export const walls = () => db.collection("walls");

export async function getMemorial(id: string) {
  const snap = await memorials().doc(id).get();
  return snap.exists ? ({ id: snap.id, ...(snap.data() as MemorialDoc) }) : null;
}

export async function memorialBySlug(slug: string) {
  const q = await memorials().where("slug", "==", slug).limit(1).get();
  if (q.empty) return null;
  const d = q.docs[0];
  return { id: d.id, ...(d.data() as MemorialDoc) };
}

export async function roleOf(mid: string, uid: string | undefined): Promise<Role | null> {
  if (!uid) return null;
  const snap = await members(mid).doc(uid).get();
  return snap.exists ? (snap.data() as MemberDoc).role : null;
}

export async function logAudit(mid: string, actor: string, action: string, target?: string, detail?: string) {
  await audit(mid).add({ actor, action, target: target ?? null, detail: detail ?? null, at: Date.now() });
}

export async function adminEmails(mid: string, roles: Role[] = ["owner", "admin", "moderator"]) {
  const q = await members(mid).where("role", "in", roles).get();
  const out: { uid: string; email: string }[] = [];
  for (const d of q.docs) {
    const m = d.data() as MemberDoc;
    const u = await users().doc(d.id).get();
    if (u.exists && (u.data() as UserDoc).emailOptOut) continue;
    out.push({ uid: d.id, email: m.email });
  }
  return out;
}
