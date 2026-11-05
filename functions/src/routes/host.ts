// Admin API: memorials, moderation, members and invites, ownership transfer, settings, download.
import { Hono } from "hono";
import { zipSync } from "fflate";
import { can, canAssign, canChangeMember, ROLE_LABELS, type Role } from "../../../src/shared/roles";
import { allowance } from "../../../src/shared/plans";
import { slugify, type ContributionStatus, type ModerationMode, type Privacy } from "../../../src/shared/types";
import { requireUser, validEmail, type AppEnv } from "../auth";
import { applyCountDelta } from "../counts";
import { randomToken, sha256, shortId } from "../crypto";
import {
  audit,
  bucket,
  contributions,
  getMemorial,
  invites,
  isSealed,
  logAudit,
  memberships,
  members,
  memorials,
  roleOf,
  users,
  walls,
  type ContributionDoc,
  type InviteDoc,
  type MemberDoc,
  type MemorialDoc,
  type UserDoc,
} from "../db";
import { approvedEmail, inviteEmail, pageReadyEmail, sendEmail, transferEmail } from "../email";
import { isDev } from "../env";
import { overLimit } from "../limits";
import { storeImage } from "../media";
import { adminView, contributionView } from "../views";
import { seedChapters } from "./legacy";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const PRIVACY: Privacy[] = ["link", "public", "private"];
const MODERATION: ModerationMode[] = ["approve_all", "auto", "trusted_only"];

async function addMember(mid: string, uid: string, email: string, role: Role, by: string | undefined, name?: string) {
  const doc: MemberDoc = { role, email, addedAt: Date.now(), ...(by ? { addedBy: by } : {}), ...(name ? { name } : {}) };
  await members(mid).doc(uid).set(doc);
  await memberships(uid).doc(mid).set({ role, addedAt: doc.addedAt });
}

export const hostRoutes = new Hono<AppEnv>()
  .use("*", requireUser)

  // ------------------------------------------------------------------ memorials
  .get("/memorials", async (c) => {
    const uid = c.get("uid")!;
    const ms = await memberships(uid).get();
    const out = [];
    for (const d of ms.docs) {
      const m = await getMemorial(d.id);
      const role = await roleOf(d.id, uid);
      if (m && role) out.push(adminView(m.id, m, role));
    }
    return c.json({ memorials: out });
  })
  .post("/memorials", async (c) => {
    const uid = c.get("uid")!;
    const user = c.get("user")!;
    if (await overLimit(`create:${uid}`, 10, 24 * 3600_000)) return c.json({ error: "That's a lot of pages in one day. Please contact us." }, 429);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = str(b.name, 80);
    if (!name) return c.json({ error: "Please enter their name." }, 400);
    const mode = b.mode === "living" ? "living" : "memorial";
    const slug = `${slugify(name)}-${shortId()}`;
    const doc: MemorialDoc = {
      slug,
      mode,
      name,
      born: str(b.born, 20),
      died: mode === "memorial" ? str(b.died, 20) : undefined,
      intro: str(b.intro, 600),
      privacy: PRIVACY.includes(b.privacy as Privacy) ? (b.privacy as Privacy) : "link",
      moderation: MODERATION.includes(b.moderation as ModerationMode) ? (b.moderation as ModerationMode) : "approve_all",
      service: {
        date: str((b.service as Record<string, unknown> | undefined)?.date, 10),
        time: str((b.service as Record<string, unknown> | undefined)?.time, 20),
        place: str((b.service as Record<string, unknown> | undefined)?.place, 200),
        livestreamUrl: str((b.service as Record<string, unknown> | undefined)?.livestreamUrl, 300),
      },
      plan: { tier: mode === "living" ? "free" : "free", hostingUntil: null },
      ownerId: uid,
      wallKey: randomToken(12),
      notifyMode: "digest",
      counts: { pending: 0, approved: 0, total: 0 },
      createdAt: Date.now(),
    };
    const clean = JSON.parse(JSON.stringify(doc)) as MemorialDoc;
    const ref = await memorials().add(clean);
    await walls().doc(sha256(clean.wallKey)).set({ memorialId: ref.id });
    await addMember(ref.id, uid, user.email, "owner", undefined, user.name);
    await logAudit(ref.id, uid, "created");
    if (mode === "living") await seedChapters(ref.id);
    // Optional co-admin invites straight from setup.
    const coAdmins = Array.isArray(b.coAdmins) ? (b.coAdmins as unknown[]).filter(validEmail).slice(0, 2) : [];
    for (const email of coAdmins) await createInvite(c.env, ref.id, clean, uid, user.email, email, "admin");
    await sendEmail(c.env, pageReadyEmail(user.email, name, `${c.env.APP_ORIGIN}/m/${slug}`, `${c.env.APP_ORIGIN}/dashboard/${ref.id}`));
    return c.json({ id: ref.id, slug });
  })
  .get("/memorials/:id", async (c) => {
    const id = c.req.param("id");
    const role = await roleOf(id, c.get("uid"));
    const m = role && can(role, "view_dashboard") ? await getMemorial(id) : null;
    if (!m || !role) return c.json({ error: "Not found" }, 404);
    return c.json({ memorial: adminView(id, m, role), pendingTransfer: m.pendingTransfer ?? null });
  })
  .patch("/memorials/:id", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    const role = await roleOf(id, uid);
    if (!can(role, "manage_settings")) return c.json({ error: "Only admins can change settings." }, 403);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const [k, max] of [["name", 80], ["born", 20], ["died", 20], ["intro", 600], ["story", 20000]] as const) {
      if (k in b) update[k] = str(b[k], max) ?? null;
    }
    if (PRIVACY.includes(b.privacy as Privacy)) update.privacy = b.privacy;
    if (MODERATION.includes(b.moderation as ModerationMode)) update.moderation = b.moderation;
    if (b.notifyMode === "digest" || b.notifyMode === "instant") update.notifyMode = b.notifyMode;
    if (b.mode === "memorial" || b.mode === "living") update.mode = b.mode;
    if (b.service && typeof b.service === "object") {
      const s = b.service as Record<string, unknown>;
      update.service = JSON.parse(JSON.stringify({ date: str(s.date, 10), time: str(s.time, 20), place: str(s.place, 200), livestreamUrl: str(s.livestreamUrl, 300) }));
    }
    if (update.name === null) return c.json({ error: "Name can't be empty." }, 400);
    await memorials().doc(id).update(update);
    await logAudit(id, uid, "settings", undefined, Object.keys(update).join(","));
    const m = (await getMemorial(id))!;
    return c.json({ memorial: adminView(id, m, role!) });
  })
  .post("/memorials/:id/cover", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Only admins can change the cover." }, 403);
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File) || !file.type.startsWith("image/")) return c.json({ error: "Please choose a photo." }, 400);
    const prefix = `media/${id}/cover/${Date.now()}`;
    const stored = await storeImage(prefix, Buffer.from(await file.arrayBuffer()));
    await memorials().doc(id).update({ coverPath: stored.display });
    return c.json({ ok: true });
  })
  .delete("/memorials/:id", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    if (!can(await roleOf(id, uid), "delete")) return c.json({ error: "Only the owner can delete the page." }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { confirm?: string };
    const m = await getMemorial(id);
    if (!m || b.confirm !== m.name) return c.json({ error: "Type the name exactly to confirm." }, 400);
    const mem = await members(id).get();
    for (const d of mem.docs) await memberships(d.id).doc(id).delete();
    await walls().doc(sha256(m.wallKey)).delete();
    await bucket().deleteFiles({ prefix: `media/${id}/` }).catch(() => undefined);
    const { getFirestore } = await import("firebase-admin/firestore");
    await getFirestore().recursiveDelete(memorials().doc(id));
    return c.json({ ok: true });
  })

  // ------------------------------------------------------------------ moderation
  .get("/memorials/:id/contributions", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "moderate")) return c.json({ error: "Not allowed" }, 403);
    const status = c.req.query("status") as ContributionStatus | undefined;
    let q = contributions(id).orderBy("createdAt", "desc").limit(300);
    if (status) q = contributions(id).where("status", "==", status).orderBy("createdAt", "desc").limit(300);
    const snap = await q.get();
    return c.json({ contributions: snap.docs.map((d) => contributionView(id, d.id, d.data() as ContributionDoc, true, c.get("uid"))) });
  })
  .post("/memorials/:id/contributions/:cid", async (c) => {
    const { id, cid } = c.req.param();
    const uid = c.get("uid")!;
    if (!can(await roleOf(id, uid), "moderate")) return c.json({ error: "Not allowed" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { action?: string; text?: string; authorName?: string; era?: string };
    const ref = contributions(id).doc(cid);
    const snap = await ref.get();
    if (!snap.exists) return c.json({ error: "Not found" }, 404);
    const cur = snap.data() as ContributionDoc;
    const next: Partial<ContributionDoc> = {};
    const map: Record<string, ContributionStatus> = { approve: "approved", hide: "hidden", reject: "rejected", pending: "pending" };
    if (b.action && map[b.action]) next.status = map[b.action];
    if (typeof b.text === "string") next.text = b.text.slice(0, 5000);
    if (typeof b.authorName === "string" && b.authorName.trim()) next.authorName = b.authorName.trim().slice(0, 80);
    if (typeof b.era === "string") next.era = b.era.slice(0, 20);
    await ref.update(next);
    if (next.status && next.status !== cur.status) await applyCountDelta(id, cur.status, next.status);
    await logAudit(id, uid, b.action ?? "edit", cid);
    if (next.status === "approved" && cur.authorEmail && !cur.notifiedApproved) {
      const m = await getMemorial(id);
      if (m) await sendEmail(c.env, approvedEmail(cur.authorEmail, cur.authorName, m.name, `${c.env.APP_ORIGIN}/m/${m.slug}`));
      await ref.update({ notifiedApproved: true });
    }
    return c.json({ contribution: contributionView(id, cid, { ...cur, ...next }, true) });
  })
  .post("/memorials/:id/contributions-bulk", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    if (!can(await roleOf(id, uid), "moderate")) return c.json({ error: "Not allowed" }, 403);
    const pending = await contributions(id).where("status", "==", "pending").get();
    const m = await getMemorial(id);
    for (const d of pending.docs) {
      const cur = d.data() as ContributionDoc;
      if (cur.screening && cur.screening.outcome !== "clear") continue; // flagged ones need a human look
      await d.ref.update({ status: "approved", notifiedApproved: true });
      await applyCountDelta(id, "pending", "approved");
      if (cur.authorEmail && m) await sendEmail(c.env, approvedEmail(cur.authorEmail, cur.authorName, m.name, `${c.env.APP_ORIGIN}/m/${m.slug}`));
    }
    await logAudit(id, uid, "approve_all_clear");
    return c.json({ ok: true });
  })
  .get("/memorials/:id/audit", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Not allowed" }, 403);
    const snap = await audit(id).orderBy("at", "desc").limit(100).get();
    const emails = new Map<string, string>();
    const out = [];
    for (const d of snap.docs) {
      const a = d.data() as { actor: string; action: string; target?: string; detail?: string; at: number };
      if (!emails.has(a.actor)) emails.set(a.actor, ((await users().doc(a.actor).get()).data() as UserDoc | undefined)?.email ?? "guest");
      out.push({ ...a, actorEmail: emails.get(a.actor) });
    }
    return c.json({ audit: out });
  })

  // ------------------------------------------------------------------ members and invites
  .get("/memorials/:id/members", async (c) => {
    const id = c.req.param("id");
    const role = await roleOf(id, c.get("uid"));
    if (!can(role, "view_dashboard")) return c.json({ error: "Not allowed" }, 403);
    const [mem, inv] = await Promise.all([members(id).get(), invites().where("memorialId", "==", id).get()]);
    return c.json({
      members: mem.docs.map((d) => ({ uid: d.id, ...(d.data() as MemberDoc) })),
      invites: can(role, "manage_members")
        ? inv.docs.filter((d) => !(d.data() as InviteDoc).acceptedBy && (d.data() as InviteDoc).expiresAt > Date.now())
            .map((d) => ({ id: d.id, email: (d.data() as InviteDoc).email, role: (d.data() as InviteDoc).role, createdAt: (d.data() as InviteDoc).createdAt }))
        : [],
    });
  })
  .post("/memorials/:id/invites", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    const role = await roleOf(id, uid);
    const b = (await c.req.json().catch(() => ({}))) as { email?: string; role?: Role };
    const target = (["admin", "moderator", "trusted"] as Role[]).includes(b.role as Role) ? (b.role as Role) : "admin";
    if (!canAssign(role, target)) return c.json({ error: "Only admins can invite people." }, 403);
    if (!validEmail(b.email)) return c.json({ error: "Please enter a valid email address." }, 400);
    const m = (await getMemorial(id))!;
    if (target === "admin") {
      const limit = allowance(m.plan).adminLimit;
      if (limit != null) {
        const admins = (await members(id).where("role", "==", "admin").get()).size;
        const pendingAdmins = (await invites().where("memorialId", "==", id).where("role", "==", "admin").get()).docs.filter((d) => !(d.data() as InviteDoc).acceptedBy).length;
        if (admins + pendingAdmins >= limit) return c.json({ error: `The free plan includes ${limit} co-admins. Upgrade for unlimited.` }, 402);
      }
    }
    if (await overLimit(`invite:${id}`, 40, 24 * 3600_000)) return c.json({ error: "Too many invitations today." }, 429);
    const link = await createInvite(c.env, id, m, uid, c.get("user")!.email, b.email, target);
    await logAudit(id, uid, "invited", b.email, target);
    return c.json({ ok: true, ...(isDev() ? { devLink: link } : {}) });
  })
  .delete("/memorials/:id/invites/:inviteId", async (c) => {
    const { id, inviteId } = c.req.param();
    if (!can(await roleOf(id, c.get("uid")), "manage_members")) return c.json({ error: "Not allowed" }, 403);
    const snap = await invites().doc(inviteId).get();
    if (snap.exists && (snap.data() as InviteDoc).memorialId === id) await snap.ref.delete();
    return c.json({ ok: true });
  })
  .post("/memorials/:id/members/:uid", async (c) => {
    const { id, uid: target } = c.req.param();
    const uid = c.get("uid")!;
    const role = await roleOf(id, uid);
    const current = await roleOf(id, target);
    const b = (await c.req.json().catch(() => ({}))) as { role?: Role };
    if (!current) return c.json({ error: "Not found" }, 404);
    if (!b.role || !canChangeMember(role, current) || !canAssign(role, b.role)) return c.json({ error: "You can't change that person's role." }, 403);
    await members(id).doc(target).update({ role: b.role });
    await memberships(target).doc(id).set({ role: b.role }, { merge: true });
    await logAudit(id, uid, "role_changed", target, b.role);
    return c.json({ ok: true });
  })
  .delete("/memorials/:id/members/:uid", async (c) => {
    const { id, uid: target } = c.req.param();
    const uid = c.get("uid")!;
    const role = await roleOf(id, uid);
    const current = await roleOf(id, target);
    if (!current) return c.json({ error: "Not found" }, 404);
    const leaving = target === uid && current !== "owner";
    if (!leaving && !canChangeMember(role, current)) return c.json({ error: "You can't remove that person." }, 403);
    await members(id).doc(target).delete();
    await memberships(target).doc(id).delete();
    await logAudit(id, uid, leaving ? "left" : "removed", target);
    return c.json({ ok: true });
  })

  // ------------------------------------------------------------------ ownership transfer
  .post("/memorials/:id/transfer", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    if (!can(await roleOf(id, uid), "transfer")) return c.json({ error: "Only the owner can transfer ownership." }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { uid?: string };
    const targetRole = b.uid ? await roleOf(id, b.uid) : null;
    if (!b.uid || targetRole !== "admin") return c.json({ error: "Choose an existing admin to become owner." }, 400);
    await memorials().doc(id).update({ pendingTransfer: { toUid: b.uid, at: Date.now() } });
    const m = (await getMemorial(id))!;
    const to = (await users().doc(b.uid).get()).data() as UserDoc;
    await sendEmail(c.env, transferEmail(to.email, c.get("user")!.email, m.name, `${c.env.APP_ORIGIN}/dashboard/${id}`));
    await logAudit(id, uid, "transfer_requested", b.uid);
    return c.json({ ok: true });
  })
  .post("/memorials/:id/transfer/accept", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    const m = await getMemorial(id);
    if (!m?.pendingTransfer || m.pendingTransfer.toUid !== uid) return c.json({ error: "No transfer is waiting for you." }, 400);
    const oldOwner = m.ownerId;
    await members(id).doc(uid).update({ role: "owner" });
    await memberships(uid).doc(id).set({ role: "owner" }, { merge: true });
    await members(id).doc(oldOwner).update({ role: "admin" }).catch(() => undefined);
    await memberships(oldOwner).doc(id).set({ role: "admin" }, { merge: true });
    await memorials().doc(id).update({ ownerId: uid, pendingTransfer: null });
    await logAudit(id, uid, "transfer_accepted", oldOwner);
    return c.json({ ok: true });
  })
  .post("/memorials/:id/transfer/cancel", async (c) => {
    const id = c.req.param("id");
    const uid = c.get("uid")!;
    const m = await getMemorial(id);
    if (!m?.pendingTransfer || (m.ownerId !== uid && m.pendingTransfer.toUid !== uid)) return c.json({ error: "Nothing to cancel." }, 400);
    await memorials().doc(id).update({ pendingTransfer: null });
    return c.json({ ok: true });
  })

  // ------------------------------------------------------------------ slideshow control
  .post("/memorials/:id/wall", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "moderate")) return c.json({ error: "Not allowed" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { paused?: boolean; pinnedId?: string | null; skip?: boolean };
    const m = (await getMemorial(id))!;
    const wall = { ...(m.wall ?? {}) };
    if (typeof b.paused === "boolean") wall.paused = b.paused;
    if (b.pinnedId !== undefined) wall.pinnedId = b.pinnedId;
    if (b.skip) wall.skip = (wall.skip ?? 0) + 1;
    wall.updatedAt = Date.now();
    await memorials().doc(id).update({ wall });
    return c.json({ wall });
  })
  .post("/memorials/:id/wall/rotate", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Not allowed" }, 403);
    const m = (await getMemorial(id))!;
    const key = randomToken(12);
    await walls().doc(sha256(m.wallKey)).delete();
    await walls().doc(sha256(key)).set({ memorialId: id });
    await memorials().doc(id).update({ wallKey: key });
    return c.json({ wallKey: key });
  })

  // ------------------------------------------------------------------ download everything
  .get("/memorials/:id/download", async (c) => {
    const id = c.req.param("id");
    if (!can(await roleOf(id, c.get("uid")), "manage_settings")) return c.json({ error: "Only admins can download." }, 403);
    const m = (await getMemorial(id))!;
    const snap = await contributions(id).where("status", "==", "approved").orderBy("createdAt", "asc").get();
    const files: Record<string, Uint8Array> = {};
    const lines: string[] = [`${m.name}`, m.born || m.died ? `${m.born ?? ""} – ${m.died ?? ""}` : "", "", m.intro ?? "", "", m.story ?? "", "", "Memories", "========", ""];
    let i = 0;
    for (const d of snap.docs) {
      const cdoc = d.data() as ContributionDoc;
      if (isSealed(cdoc)) continue;
      i++;
      const n = String(i).padStart(4, "0");
      lines.push(`#${n} ${cdoc.authorName}${cdoc.relation ? ` (${cdoc.relation})` : ""}${cdoc.era ? `, ${cdoc.era}` : ""} – ${new Date(cdoc.createdAt).toISOString().slice(0, 10)}`);
      if (cdoc.text) lines.push(cdoc.text);
      lines.push("");
      const path = cdoc.media?.original ?? cdoc.media?.display;
      if (path) {
        const [buf] = await bucket().file(path).download();
        const ext = path.split(".").pop();
        files[`media/${n}-${slugify(cdoc.authorName)}.${ext}`] = new Uint8Array(buf);
      }
    }
    files["memories.txt"] = new TextEncoder().encode(lines.join("\n"));
    const zip = zipSync(files, { level: 0 });
    return new Response(zip, {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slugify(m.name)}-life-guestbook.zip"` },
    });
  });

async function createInvite(env: AppEnv["Bindings"], mid: string, m: MemorialDoc, uid: string, inviterEmail: string, email: string, role: Role) {
  const token = randomToken(24);
  const doc: InviteDoc = { memorialId: mid, email: email.toLowerCase(), role, invitedBy: uid, createdAt: Date.now(), expiresAt: Date.now() + 30 * 24 * 3600_000 };
  await invites().doc(sha256(token)).set(doc);
  const link = `${env.APP_ORIGIN}/invite?t=${token}`;
  await sendEmail(env, inviteEmail(email, inviterEmail, m.name, ROLE_LABELS[role], link));
  return link;
}

/** Invite acceptance needs a signed-in user but not membership, so it lives outside hostRoutes' checks. */
export const inviteRoutes = new Hono<AppEnv>()
  .get("/:token", async (c) => {
    const snap = await invites().doc(sha256(c.req.param("token"))).get();
    const inv = snap.data() as InviteDoc | undefined;
    if (!inv || inv.expiresAt < Date.now() || inv.acceptedBy) return c.json({ error: "This invitation has expired or was already used." }, 404);
    const m = await getMemorial(inv.memorialId);
    if (!m) return c.json({ error: "This page no longer exists." }, 404);
    return c.json({ memorialName: m.name, role: inv.role, email: inv.email });
  })
  .post("/:token/accept", requireUser, async (c) => {
    const ref = invites().doc(sha256(c.req.param("token")));
    const inv = (await ref.get()).data() as InviteDoc | undefined;
    if (!inv || inv.expiresAt < Date.now() || inv.acceptedBy) return c.json({ error: "This invitation has expired or was already used." }, 404);
    const uid = c.get("uid")!;
    const user = c.get("user")!;
    const existing = await roleOf(inv.memorialId, uid);
    if (!existing || existing === "trusted" || (existing === "moderator" && inv.role === "admin")) {
      await addMember(inv.memorialId, uid, user.email, inv.role, inv.invitedBy, user.name);
    }
    await ref.update({ acceptedBy: uid });
    await logAudit(inv.memorialId, uid, "joined", undefined, inv.role);
    return c.json({ memorialId: inv.memorialId });
  });

export { addMember };
