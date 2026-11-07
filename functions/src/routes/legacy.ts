// Living Legacy and writing help: chapters of a life, AI interview questions, AI drafts,
// legacy contact, and converting a living page into a memorial when the time comes.
import { Hono } from "hono";
import { can } from "../../../src/shared/roles";
import { hostingAfterPurchase, isPaid } from "../../../src/shared/plans";
import { DEFAULT_CHAPTERS } from "../../../src/shared/types";
import { requireUser, type AppEnv } from "../auth";
import { AiRefusal, DRAFT_KINDS, draftWriting, interviewQuestions, type DraftKind, type Tone } from "../ai";
import { adminEmails, contributions, diedMD, getMemorial, logAudit, memorials, roleOf, users, type ContributionDoc, type MemorialDoc, type UserDoc } from "../db";
import { conversionEmail, recoveryEmail, sendEmail } from "../email";
import { overLimit } from "../limits";
import { stopRecurringBilling } from "../payments";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
export const RECOVERY_IDLE_MS = 90 * 24 * 3600_000;
export const RECOVERY_WAIT_DAYS = 14;
export const chapters = (mid: string) => memorials().doc(mid).collection("chapters");
export const drafts = (mid: string) => memorials().doc(mid).collection("drafts");

export interface ChapterDoc { title: string; order: number; era?: string; questions?: { question: string; why: string }[]; createdAt: number }

export function seedChapters(mid: string, transaction: FirebaseFirestore.Transaction) {
  DEFAULT_CHAPTERS.forEach((title, i) => transaction.set(chapters(mid).doc(), { title, order: i, createdAt: Date.now() } satisfies ChapterDoc));
}

export const FREE_AI_USES = 3;
const AI_USER_DAILY = 30;

/**
 * Free pages get a taste of the writing help; paid pages get plenty. The free allowance is reserved
 * atomically before the model is called, so parallel requests can't each pass a stale `aiUses < 3`
 * check. Each signed-in user also has a daily cap across all their pages (pages are free to create).
 */
export async function reserveAiUse(mid: string, m: MemorialDoc, uid: string): Promise<"ok" | "page" | "user"> {
  if (await overLimit(`ai-user:${uid}`, AI_USER_DAILY, 24 * 3600_000)) return "user";
  if (isPaid(m.plan)) return (await overLimit(`ai:${mid}`, 40, 24 * 3600_000)) ? "page" : "ok";
  const ref = memorials().doc(mid);
  const { FieldValue } = await import("firebase-admin/firestore");
  const ok = await ref.firestore.runTransaction(async (tx) => {
    const used = ((await tx.get(ref)).data() as MemorialDoc | undefined)?.aiUses ?? 0;
    if (used >= FREE_AI_USES) return false;
    tx.update(ref, { aiUses: FieldValue.increment(1) });
    return true;
  });
  return ok ? "ok" : "page";
}
/** Paid pages count usage after success; free pages hand back a reservation that produced nothing. */
async function settleAiUse(mid: string, m: MemorialDoc, succeeded: boolean) {
  const { FieldValue } = await import("firebase-admin/firestore");
  if (isPaid(m.plan) && succeeded) await memorials().doc(mid).update({ aiUses: FieldValue.increment(1) });
  if (!isPaid(m.plan) && !succeeded) await memorials().doc(mid).update({ aiUses: FieldValue.increment(-1) }).catch(() => undefined);
}
const aiLimitMessage = (why: "page" | "user", m: MemorialDoc, what: string) =>
  why === "user" || isPaid(m.plan) ? `That's a lot of ${what} for one day. Try again tomorrow.` : `The free plan includes ${FREE_AI_USES} uses of the writing help. Upgrade for more.`;

export const legacyRoutes = new Hono<AppEnv>()
  .use("/memorials", requireUser)
  .use("/memorials/*", requireUser)

  // ------------------------------------------------------------------ chapters
  .get("/memorials/:id/chapters", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "view_dashboard")) return c.json({ error: "Not allowed" }, 403);
    const [snap, all] = await Promise.all([chapters(id).orderBy("order").get(), contributions(id).where("status", "in", ["approved", "pending"]).get()]);
    const counts = new Map<string, number>();
    for (const d of all.docs) {
      const ch = (d.data() as ContributionDoc).chapterId;
      if (ch) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    return c.json({ chapters: snap.docs.map((d) => ({ id: d.id, ...(d.data() as ChapterDoc), stories: counts.get(d.id) ?? 0 })) });
  })
  .post("/memorials/:id/chapters", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Only admins can add chapters." }, 403);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = str(b.title, 80);
    if (!title) return c.json({ error: "Give the chapter a title." }, 400);
    const last = await chapters(id).orderBy("order", "desc").limit(1).get();
    const order = last.empty ? 0 : (last.docs[0].data() as ChapterDoc).order + 1;
    const ref = await chapters(id).add(JSON.parse(JSON.stringify({ title, era: str(b.era, 30), order, createdAt: Date.now() })));
    return c.json({ id: ref.id });
  })
  .patch("/memorials/:id/chapters/:cid", async (c) => {
    const { id, cid } = c.req.param();
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Not allowed" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (str(b.title, 80)) update.title = str(b.title, 80);
    if ("era" in b) update.era = str(b.era, 30) ?? null;
    if (typeof b.order === "number" && Number.isInteger(b.order) && b.order >= 0 && b.order < 1000) update.order = b.order;
    await chapters(id).doc(cid).update(update);
    return c.json({ ok: true });
  })
  .post("/memorials/:id/chapters-order", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Not allowed" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { ids?: string[] };
    const batch = memorials().firestore.batch();
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9]{1,40}$/.test(x)).slice(0, 100) : [];
    ids.forEach((cid, i) => batch.update(chapters(id).doc(cid), { order: i }));
    await batch.commit();
    return c.json({ ok: true });
  })
  .delete("/memorials/:id/chapters/:cid", async (c) => {
    const { id, cid } = c.req.param();
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Not allowed" }, 403);
    const stories = await contributions(id).where("chapterId", "==", cid).get();
    await Promise.all(stories.docs.map((d) => d.ref.update({ chapterId: null })));
    await chapters(id).doc(cid).delete();
    return c.json({ ok: true });
  })
  .get("/memorials/:id/chapters/:cid/stories", async (c) => {
    const { id, cid } = c.req.param();
    const uid = c.get("uid")!;
    if (!can(await roleOf(id, uid), "view_dashboard")) return c.json({ error: "Not allowed" }, 403);
    const { contributionView } = await import("../views");
    const snap = await contributions(id).where("chapterId", "==", cid).get();
    const list = snap.docs
      .map((d) => contributionView(id, d.id, d.data() as ContributionDoc, true, uid))
      .filter((v) => v.status === "approved" || v.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt);
    return c.json({ stories: list });
  })
  .post("/memorials/:id/chapters/:cid/questions", async (c) => {
    const { id, cid } = c.req.param();
    if (!can(await roleOf(id, c.get("uid")), "moderate")) return c.json({ error: "Not allowed" }, 403);
    const m = (await getMemorial(id))!;
    const chSnap = await chapters(id).doc(cid).get();
    if (!chSnap.exists) return c.json({ error: "Not found" }, 404);
    const allowed = await reserveAiUse(id, m, c.get("uid")!);
    if (allowed !== "ok") return c.json({ error: aiLimitMessage(allowed, m, "suggestions") }, allowed === "user" ? 429 : 402);
    const ch = chSnap.data() as ChapterDoc;
    const told = await contributions(id).where("status", "==", "approved").limit(300).get();
    const toldTexts = told.docs.map((d) => d.data() as ContributionDoc).filter((x) => x.text && !x.sealed).map((x) => `${x.prompt ? `Q: ${x.prompt}\nA: ` : ""}${x.text}`);
    try {
      const questions = await interviewQuestions(c.env, m, ch.title, toldTexts);
      await chSnap.ref.update({ questions });
      await settleAiUse(id, m, true);
      return c.json({ questions });
    } catch (e) {
      await settleAiUse(id, m, false);
      if (e instanceof AiRefusal) return c.json({ error: e.message }, 422);
      throw e;
    }
  })

  // ------------------------------------------------------------------ writing help
  .post("/memorials/:id/ai/draft", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    if (!can(await roleOf(id, uid), "manage_settings")) return c.json({ error: "Only admins can use writing help." }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { kind?: DraftKind; tone?: Tone; notes?: string; speaker?: string };
    if (!DRAFT_KINDS.includes(b.kind as DraftKind)) return c.json({ error: "Choose what to write." }, 400);
    const tone: Tone = b.tone === "light" || b.tone === "formal" ? b.tone : "warm";
    const m = (await getMemorial(id))!;
    const allowed = await reserveAiUse(id, m, uid);
    if (allowed !== "ok") return c.json({ error: aiLimitMessage(allowed, m, "drafts") }, allowed === "user" ? 429 : 402);
    const snap = await contributions(id).where("status", "==", "approved").orderBy("createdAt", "asc").limit(1500).get();
    const memories = snap.docs.map((d) => d.data() as ContributionDoc).filter((x) => !x.sealed);
    try {
      const text = await draftWriting(c.env, m, memories, { kind: b.kind as DraftKind, tone, notes: str(b.notes, 6000), speaker: str(b.speaker, 120) });
      const ref = await drafts(id).add({ kind: b.kind, tone, text, createdBy: uid, createdAt: Date.now(), memoryCount: memories.length });
      await settleAiUse(id, m, true);
      await logAudit(id, uid, "ai_draft", undefined, b.kind);
      return c.json({ id: ref.id, text, memoryCount: memories.length });
    } catch (e) {
      await settleAiUse(id, m, false);
      if (e instanceof AiRefusal) return c.json({ error: e.message }, 422);
      throw e;
    }
  })
  .get("/memorials/:id/drafts", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Not allowed" }, 403);
    const snap = await drafts(id).orderBy("createdAt", "desc").limit(30).get();
    return c.json({ drafts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  })

  // ------------------------------------------------------------------ succession
  .post("/memorials/:id/legacy-contact", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    if ((await roleOf(id, uid)) !== "owner") return c.json({ error: "Only the owner can choose the legacy contact." }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { uid?: string | null };
    if (b.uid && !can(await roleOf(id, b.uid), "manage_settings")) return c.json({ error: "The legacy contact must be an admin." }, 400);
    await memorials().doc(id).update({ legacyContactUid: b.uid ?? null });
    await logAudit(id, uid, "legacy_contact", b.uid ?? undefined);
    return c.json({ ok: true });
  })
  // If the owner has gone quiet (90 days), an admin can ask to take over. The owner gets 14 days of
  // emails to say no; signing in at all also cancels it. The daily job completes it otherwise.
  .post("/memorials/:id/recovery", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    if ((await roleOf(id, uid)) !== "admin") return c.json({ error: "Only admins can ask to take over the page." }, 403);
    const m = (await getMemorial(id))!;
    if (m.recovery) return c.json({ error: "A request is already waiting." }, 400);
    const owner = (await users().doc(m.ownerId).get()).data() as UserDoc | undefined;
    const idle = owner ? Date.now() - (owner.lastSeenAt ?? owner.createdAt) : Infinity;
    if (idle < RECOVERY_IDLE_MS) return c.json({ error: "The owner has been active recently. Ask them to make you the owner instead." }, 400);
    await memorials().doc(id).update({ recovery: { requestedBy: uid, at: Date.now() } });
    const requester = ((await users().doc(uid).get()).data() as UserDoc).email;
    if (owner) await sendEmail(c.env, recoveryEmail(owner.email, m.name, requester, `${c.env.APP_ORIGIN}/dashboard/${id}?tab=people`));
    await logAudit(id, uid, "recovery_requested");
    return c.json({ ok: true, completesAfterDays: RECOVERY_WAIT_DAYS });
  })
  .post("/memorials/:id/recovery/cancel", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    const m = (await getMemorial(id))!;
    if (!m.recovery || (m.ownerId !== uid && m.recovery.requestedBy !== uid)) return c.json({ error: "Nothing to cancel." }, 400);
    await memorials().doc(id).update({ recovery: null });
    await logAudit(id, uid, "recovery_cancelled");
    return c.json({ ok: true });
  })
  .post("/memorials/:id/convert", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    const role = await roleOf(id, uid);
    const m = (await getMemorial(id))!;
    if (!m || (role !== "owner" && !(role === "admin" && m.legacyContactUid === uid))) return c.json({ error: "Only the owner or the legacy contact can do this." }, 403);
    if (m.mode !== "living") return c.json({ error: "This page is already a memorial." }, 400);
    const b = (await c.req.json().catch(() => ({}))) as { died?: string; service?: Record<string, unknown>; intro?: string };
    const died = str(b.died, 10);
    if (!died) return c.json({ error: "Please add the date they passed away." }, 400);
    // Stop Stripe charges before changing the entitlement. A provider failure leaves the page unchanged.
    await stopRecurringBilling(c.env, id, true);
    const update: Record<string, unknown> = { mode: "memorial", died, diedMD: diedMD(died), convertedAt: Date.now(), convertedBy: uid };
    if (b.service) update.service = JSON.parse(JSON.stringify({ date: str(b.service.date, 10), time: str(b.service.time, 20), place: str(b.service.place, 200) }));
    if (str(b.intro, 600)) update.intro = str(b.intro, 600);
    // A Living Legacy subscription becomes a Tribute with 2 years from today; nothing extra to pay.
    if (m.plan.tier === "living") update.plan = hostingAfterPurchase({ tier: "free", hostingUntil: null }, "tribute");
    await memorials().doc(id).update(update);
    // Letters sealed "until I'm gone" open now, for the family only.
    const sealed = await contributions(id).where("sealed.until", "==", "passing").get();
    await Promise.all(sealed.docs.map((d) => d.ref.update({ "sealed.openedAt": Date.now() })));
    await logAudit(id, uid, "converted_to_memorial");
    const actor = ((await users().doc(uid).get()).data() as UserDoc).email;
    for (const a of await adminEmails(id)) {
      if (a.uid === uid) continue;
      await sendEmail(c.env, conversionEmail(a.email, m.name, actor, sealed.size, `${c.env.APP_ORIGIN}/dashboard/${id}`));
    }
    return c.json({ ok: true, lettersOpened: sealed.size });
  });
