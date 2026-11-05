// Living Legacy and writing help: chapters of a life, AI interview questions, AI drafts,
// legacy contact, and converting a living page into a memorial when the time comes.
import { Hono } from "hono";
import { can } from "../../../src/shared/roles";
import { hostingAfterPurchase, isPaid } from "../../../src/shared/plans";
import { DEFAULT_CHAPTERS } from "../../../src/shared/types";
import { requireUser, type AppEnv } from "../auth";
import { AiRefusal, DRAFT_KINDS, draftWriting, interviewQuestions, type DraftKind, type Tone } from "../ai";
import { adminEmails, contributions, getMemorial, logAudit, memorials, roleOf, users, type ContributionDoc, type MemorialDoc, type UserDoc } from "../db";
import { conversionEmail, sendEmail } from "../email";
import { overLimit } from "../limits";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
export const chapters = (mid: string) => memorials().doc(mid).collection("chapters");
export const drafts = (mid: string) => memorials().doc(mid).collection("drafts");

export interface ChapterDoc { title: string; order: number; era?: string; questions?: { question: string; why: string }[]; createdAt: number }

export async function seedChapters(mid: string) {
  const batch = memorials().firestore.batch();
  DEFAULT_CHAPTERS.forEach((title, i) => batch.set(chapters(mid).doc(), { title, order: i, createdAt: Date.now() } satisfies ChapterDoc));
  await batch.commit();
}

/** Free pages get a taste of the writing help; paid pages get plenty. */
async function aiAllowed(mid: string, m: MemorialDoc) {
  if (isPaid(m.plan)) return !(await overLimit(`ai:${mid}`, 40, 24 * 3600_000));
  return (m.aiUses ?? 0) < 3;
}
async function countAiUse(mid: string) {
  const { FieldValue } = await import("firebase-admin/firestore");
  await memorials().doc(mid).update({ aiUses: FieldValue.increment(1) });
}

export const legacyRoutes = new Hono<AppEnv>()
  .use("*", requireUser)

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
    if (typeof b.order === "number") update.order = b.order;
    await chapters(id).doc(cid).update(update);
    return c.json({ ok: true });
  })
  .post("/memorials/:id/chapters-order", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Not allowed" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { ids?: string[] };
    const batch = memorials().firestore.batch();
    (b.ids ?? []).slice(0, 100).forEach((cid, i) => batch.update(chapters(id).doc(cid), { order: i }));
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
    if (!(await aiAllowed(id, m))) return c.json({ error: isPaid(m.plan) ? "That's a lot of suggestions for one day. Try again tomorrow." : "The free plan includes 3 uses of the writing help. Upgrade for more." }, 402);
    const chSnap = await chapters(id).doc(cid).get();
    if (!chSnap.exists) return c.json({ error: "Not found" }, 404);
    const ch = chSnap.data() as ChapterDoc;
    const told = await contributions(id).where("status", "==", "approved").limit(300).get();
    const toldTexts = told.docs.map((d) => d.data() as ContributionDoc).filter((x) => x.text && !x.sealed).map((x) => `${x.prompt ? `Q: ${x.prompt}\nA: ` : ""}${x.text}`);
    try {
      const questions = await interviewQuestions(c.env, m, ch.title, toldTexts);
      await chSnap.ref.update({ questions });
      await countAiUse(id);
      return c.json({ questions });
    } catch (e) {
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
    if (!(await aiAllowed(id, m))) return c.json({ error: isPaid(m.plan) ? "That's a lot of drafts for one day. Try again tomorrow." : "The free plan includes 3 uses of the writing help. Upgrade for more." }, 402);
    const snap = await contributions(id).where("status", "==", "approved").orderBy("createdAt", "asc").limit(1500).get();
    const memories = snap.docs.map((d) => d.data() as ContributionDoc).filter((x) => !x.sealed);
    try {
      const text = await draftWriting(c.env, m, memories, { kind: b.kind as DraftKind, tone, notes: str(b.notes, 6000), speaker: str(b.speaker, 120) });
      const ref = await drafts(id).add({ kind: b.kind, tone, text, createdBy: uid, createdAt: Date.now(), memoryCount: memories.length });
      await countAiUse(id);
      await logAudit(id, uid, "ai_draft", undefined, b.kind);
      return c.json({ id: ref.id, text, memoryCount: memories.length });
    } catch (e) {
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
  .post("/memorials/:id/convert", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    const role = await roleOf(id, uid);
    const m = (await getMemorial(id))!;
    if (m.mode !== "living") return c.json({ error: "This page is already a memorial." }, 400);
    if (role !== "owner" && m.legacyContactUid !== uid) return c.json({ error: "Only the owner or the legacy contact can do this." }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { died?: string; service?: Record<string, unknown>; intro?: string };
    const died = str(b.died, 10);
    if (!died) return c.json({ error: "Please add the date they passed away." }, 400);
    const update: Record<string, unknown> = { mode: "memorial", died, convertedAt: Date.now(), convertedBy: uid };
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
