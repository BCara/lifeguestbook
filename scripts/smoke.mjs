// End-to-end check against the emulators: sign in, create a memorial, invite a co-admin,
// guest uploads (text + photo), screening holds, approval, public view, report, upgrade, slideshow,
// ownership transfer, digest email. Run with `npm run test:smoke`.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";

const RUN = Date.now().toString(36); // unique accounts per run, so reruns against saved emulator data work
const OWNER = `owner-${RUN}@example.test`, SISTER = `sister-${RUN}@example.test`;
const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:5001/demo-lifeguestbook/us-central1/api";
class Client {
  cookie = "";
  ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  async req(method, path, body, form) {
    const headers = { cookie: this.cookie, "x-forwarded-for": this.ip };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload, redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers };
  }
  async signIn(email) {
    const r = await this.req("POST", "/auth/email", { email });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const token = new URL(r.data.devLink).searchParams.get("t");
    const preview = await new Client().req("GET", `/auth/verify?t=${token}`);
    assert.equal(preview.status, 200, "opening the link previews the sign-in form");
    assert.equal(preview.headers.get("set-cookie"), null, "preview does not sign in");
    const form = new FormData();
    form.set("t", token);
    const v = await this.req("POST", "/auth/verify", undefined, form);
    assert.equal(v.status, 303);
    const replay = await new Client().req("POST", "/auth/verify", undefined, form);
    assert.equal(replay.headers.get("location"), "/signin?expired=1");
    const me = await this.req("GET", "/me");
    assert.equal(me.data.user.email, email);
  }
}

// A tiny valid PNG (2x2) so sharp has something real to process.
function png() {
  const crc = (buf) => { let c, crc = 0xffffffff; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, 200, 100, 50, 10, 20, 30, 0, 40, 50, 60, 70, 80, 90]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const owner = new Client();
const sister = new Client();
const guest = new Client();
const step = (s) => console.log(`✓ ${s}`);

await owner.signIn(OWNER);
step("owner signs in with an email link");

const createBody = { requestId: randomUUID(), name: "Margaret Hughes", born: "1948-03-02", died: "2026-10-30", intro: "Mum loved her garden.", service: { date: "2026-11-12", place: "St Mary's, Bury" }, coAdmins: [SISTER] };
let r = await owner.req("POST", "/memorials", createBody);
assert.equal(r.status, 200, JSON.stringify(r.data));
const { id, slug } = r.data;
const repeated = await owner.req("POST", "/memorials", createBody);
assert.deepEqual(repeated.data, { id, slug }, "retry returns the same guestbook");
step(`memorial created (${slug}) with a co-admin invite`);

r = await owner.req("GET", `/memorials/${id}`);
assert.equal(r.data.memorial.privacy, "link");
assert.equal(r.data.memorial.role, "owner");
assert.equal(r.data.memorial.plan.tier, "free");
step("defaults: link-only, approve-first, free plan");

// The invite email was sent; accept it as the sister.
r = await owner.req("GET", "/dev/emails");
const inviteMail = r.data.emails.find((e) => e.to === SISTER);
assert.ok(inviteMail, "invite email recorded");
assert.equal(r.data.emails.filter((e) => e.to === SISTER).length, 1, "creation retry does not send the invite twice");
const inviteToken = inviteMail.text.match(/invite\?t=([\w-]+)/)[1];
const wrongAccount = new Client();
await wrongAccount.signIn(`wrong-${RUN}@example.test`);
assert.equal((await wrongAccount.req("POST", `/invites/${inviteToken}/accept`)).status, 403);
await sister.signIn(SISTER);
r = await sister.req("POST", `/invites/${inviteToken}/accept`);
assert.equal(r.status, 200, JSON.stringify(r.data));
r = await sister.req("GET", `/memorials/${id}`);
assert.equal(r.data.memorial.role, "admin");
step("co-admin accepts the emailed invitation");

// Guest contributions.
let fd = new FormData();
fd.append("name", "Dave from work"); fd.append("relation", "Work"); fd.append("era", "1980s"); fd.append("text", "She ran the best office Christmas party in Manchester.");
r = await guest.req("POST", `/m/${slug}/contributions`, undefined, fd);
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.status, "pending");
const textId = r.data.id;
fd = new FormData();
fd.append("name", "Uni friend"); fd.append("text", "Our trip to Whitby"); fd.append("file", new Blob([png()], { type: "image/png" }), "whitby.png");
r = await guest.req("POST", `/m/${slug}/contributions`, undefined, fd);
assert.equal(r.status, 200, JSON.stringify(r.data));
const photoId = r.data.id;
fd = new FormData();
fd.append("name", "Troll"); fd.append("text", "nasty [safety]");
r = await guest.req("POST", `/m/${slug}/contributions`, undefined, fd);
assert.equal(r.data.status, "hidden");
fd = new FormData();
fd.append("name", "Someone"); fd.append("file", new Blob([Buffer.from("x")], { type: "video/mp4" }), "clip.mp4");
r = await guest.req("POST", `/m/${slug}/contributions`, undefined, fd);
assert.equal(r.status, 402, "video needs Tribute");
step("guests share without an account; screening hides abuse; video gated on free");

r = await guest.req("GET", `/m/${slug}`);
assert.equal(r.data.contributions.length, 0, "nothing public before approval");
r = await guest.req("GET", `/memorials/${id}/contributions?status=pending`);
assert.equal(r.status, 401, "guests can't see the queue");
r = await sister.req("GET", `/memorials/${id}/contributions?status=pending`);
assert.equal(r.data.contributions.length, 2);
await sister.req("POST", `/memorials/${id}/contributions/${textId}`, { action: "approve" });
await sister.req("POST", `/memorials/${id}/contributions/${photoId}`, { action: "approve" });
r = await guest.req("GET", `/m/${slug}`);
assert.equal(r.data.contributions.length, 2);
const photo = r.data.contributions.find((c) => c.id === photoId);
const img = await guest.req("GET", photo.mediaUrl.replace(/^\/api/, ""));
assert.equal(img.status, 200);
assert.equal(img.headers.get("content-type"), "image/jpeg");
step("co-admin approves; memories and processed photo are public");

r = await guest.req("POST", `/m/${slug}/contributions/${textId}/report`);
r = await guest.req("GET", `/m/${slug}`);
assert.equal(r.data.contributions.length, 1, "reported item hidden pending review");
step("report hides an item until reviewed");

r = await owner.req("GET", `/wall?k=${(await owner.req("GET", `/memorials/${id}`)).data.memorial.wallKey}`);
assert.equal(r.status, 402, "slideshow is a paid feature");
r = await sister.req("POST", "/payments/checkout", { memorialId: id, product: "tribute", currency: "gbp" });
assert.equal(r.data.applied, true);
r = await owner.req("GET", `/memorials/${id}`);
assert.equal(r.data.memorial.plan.tier, "tribute");
assert.ok(r.data.memorial.plan.hostingUntil > Date.now() + 700 * 86400_000);
const wallKey = r.data.memorial.wallKey;
r = await guest.req("GET", `/wall?k=${wallKey}`);
assert.equal(r.status, 200);
assert.equal(r.data.items.length, 1);
step("any admin can upgrade (dev: instant); 2 years hosting; slideshow unlocked");

r = await owner.req("GET", `/memorials/${id}/members`);
const sisterUid = r.data.members.find((m) => m.email === SISTER).uid;
r = await sister.req("DELETE", `/memorials/${id}/members/${r.data.members.find((m) => m.role === "owner").uid}`);
assert.equal(r.status, 403, "admins can't remove the owner");
await owner.req("POST", `/memorials/${id}/transfer`, { uid: sisterUid });
r = await sister.req("POST", `/memorials/${id}/transfer/accept`);
assert.equal(r.status, 200);
r = await owner.req("GET", `/memorials/${id}`);
assert.equal(r.data.memorial.role, "admin");
step("ownership transfers to the co-admin; old owner stays as admin");

r = await owner.req("POST", "/dev/run-jobs");
assert.ok(r.data.digests >= 1, "digest emails sent");
step(`outbox digest sent ${r.data.digests} email(s)`);

r = await sister.req("GET", `/memorials/${id}/download`);
assert.equal(r.status, 200);
assert.ok(r.data.byteLength > 100);
step("download ZIP works");

// ---------------------------------------------------------------- Living Legacy + writing help
r = await owner.req("POST", "/memorials", { name: "Arthur Bell", born: "1941-06-01", mode: "living" });
const live = r.data;
r = await owner.req("GET", `/memorials/${live.id}/chapters`);
assert.equal(r.data.chapters.length, 8, "default chapters seeded");
const ch = r.data.chapters[1];
r = await owner.req("POST", `/memorials/${live.id}/chapters/${ch.id}/questions`);
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.ok(r.data.questions.length >= 3);
const q = r.data.questions[0].question;
step("living page seeds chapters; interview questions suggested");

fd = new FormData();
fd.append("name", "Arthur"); fd.append("text", "We lived above the bakery on Bolton Street."); fd.append("chapterId", ch.id); fd.append("prompt", q);
r = await owner.req("POST", `/m/${live.slug}/contributions`, undefined, fd);
assert.equal(r.data.status, "approved", "family stories skip review");
fd = new FormData();
fd.append("name", "Arthur"); fd.append("text", "To my grandchildren: be kind, and always carry a hanky."); fd.append("chapterId", ch.id); fd.append("sealUntil", "passing"); fd.append("sealTo", "my grandchildren");
r = await owner.req("POST", `/m/${live.slug}/contributions`, undefined, fd);
const letterId = r.data.id;
fd = new FormData();
fd.append("name", "Guest"); fd.append("text", "sneaky"); fd.append("chapterId", ch.id); fd.append("sealUntil", "passing");
r = await guest.req("POST", `/m/${live.slug}/contributions`, undefined, fd);
const guestDoc = r.data.id;
r = await guest.req("GET", `/m/${live.slug}`);
assert.ok(r.data.contributions.some((c) => c.chapterId === ch.id && c.prompt === q), "story shows in public timeline");
assert.ok(!r.data.contributions.some((c) => c.id === letterId), "sealed letter never public");
assert.equal(r.data.chapters.length, 8);
step("stories file under chapters with their question; sealed letter hidden from the public");

// The co-admin (now owner of Margaret's page) is invited to Arthur's page as admin and becomes legacy contact.
r = await owner.req("POST", `/memorials/${live.id}/invites`, { email: SISTER, role: "admin" });
const tok2 = new URL(r.data.devLink).searchParams.get("t");
await sister.req("POST", `/invites/${tok2}/accept`);
r = await sister.req("GET", `/memorials/${live.id}/chapters/${ch.id}/stories`);
const env = r.data.stories.find((x) => x.id === letterId);
assert.ok(env.sealed && !env.sealed.open && !env.text, "other admins see only the envelope");
r = await owner.req("POST", `/memorials/${live.id}/legacy-contact`, { uid: sisterUid });
assert.equal(r.status, 200);
assert.equal((await owner.req("PATCH", `/memorials/${live.id}`, { mode: "memorial" })).status, 400, "settings cannot bypass conversion");
assert.equal((await owner.req("POST", `/memorials/${live.id}/members/${sisterUid}`, { role: "moderator" })).status, 200);
assert.equal((await sister.req("POST", `/memorials/${live.id}/convert`, { died: "2026-11-01" })).status, 403, "demoted legacy contact cannot convert");
assert.equal((await owner.req("POST", `/memorials/${live.id}/members/${sisterUid}`, { role: "admin" })).status, 200);
r = await sister.req("POST", `/memorials/${live.id}/convert`, { died: "2026-11-01" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.lettersOpened, 1);
r = await sister.req("GET", `/memorials/${live.id}/chapters/${ch.id}/stories`);
assert.ok(r.data.stories.find((x) => x.id === letterId).text.includes("hanky"), "letter opens for the family");
r = await guest.req("GET", `/m/${live.slug}`);
assert.equal(r.data.memorial.mode, "memorial");
assert.ok(!r.data.contributions.some((c) => c.id === letterId), "opened letters stay family-only");
step("legacy contact converts to a memorial; sealed letter opens for family only");

r = await sister.req("POST", `/memorials/${id}/ai/draft`, { kind: "eulogy", tone: "warm", speaker: "Her sister" });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.ok(r.data.text.length > 20);
r = await sister.req("GET", `/memorials/${id}/drafts`);
assert.equal(r.data.drafts.length, 1);
r = await guest.req("POST", `/memorials/${id}/ai/draft`, { kind: "eulogy" });
assert.equal(r.status, 401);
step("writing help drafts a eulogy (sample text without an API key); drafts are kept");

// Recorded voice notes arrive as "audio/webm;codecs=opus".
fd = new FormData();
fd.append("name", "Voice"); fd.append("file", new Blob([Buffer.from("fakeaudio")], { type: "audio/webm;codecs=opus" }), "voice.webm");
r = await guest.req("POST", `/m/${slug}/contributions`, undefined, fd);
assert.equal(r.status, 200, JSON.stringify(r.data));
step("recorded voice notes with codec parameters are accepted on paid pages");

// Large video in chunks (17 MB -> 3 chunks), as the browser does for anything over 25 MB.
const big = Buffer.alloc(17 * 1024 * 1024, 7);
r = await guest.req("POST", `/m/${slug}/uploads`, { size: big.length, type: "video/mp4" });
assert.equal(r.status, 200, JSON.stringify(r.data));
const up = r.data;
for (let i = 0; i < up.chunks; i++) {
  const part = big.subarray(i * up.chunkBytes, Math.min(big.length, (i + 1) * up.chunkBytes));
  const res = await fetch(`${BASE}/api/m/${slug}/uploads/${up.uploadId}/${i}`, { method: "PUT", body: part, headers: { "content-type": "application/octet-stream" } });
  assert.equal(res.status, 200, await res.text());
}
fd = new FormData();
fd.append("name", "Cousin Mike"); fd.append("text", "The speech from the 60th"); fd.append("uploadId", up.uploadId);
r = await guest.req("POST", `/m/${slug}/contributions`, undefined, fd);
assert.equal(r.status, 200, JSON.stringify(r.data));
const vidId = r.data.id;
await sister.req("POST", `/memorials/${id}/contributions/${vidId}`, { action: "approve" });
const vid = await guest.req("GET", `/media/${id}/${vidId}/original`);
assert.equal(vid.data.byteLength, big.length, "combined video is complete");
const ranged = await fetch(`${BASE}/api/media/${id}/${vidId}/original`, { headers: { range: "bytes=0-99" } });
assert.equal(ranged.status, 206);
step("17 MB video uploads in chunks, combines in Storage, and streams with range requests");

// ---------------------------------------------------------------- recovery and anniversaries
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const FS = `http://${firestoreHost}/v1/projects/demo-lifeguestbook/databases/(default)/documents`;
const fsPatch = (path, fields) => fetch(`${FS}/${path}?${Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join("&")}`, {
  method: "PATCH", headers: { Authorization: "Bearer owner", "content-type": "application/json" },
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "number" ? { integerValue: String(v) } : { stringValue: v }])) }),
});
// Arthur's page (now a memorial) is owned by `owner`, with sister as admin. The owner goes quiet.
const ownerUid = (await owner.req("GET", "/me")).data.user.uid;
const fixture = await fsPatch(`users/${ownerUid}`, { lastSeenAt: Date.now() - 120 * 86400_000 });
assert.ok(fixture.ok, `Recovery fixture update failed (HTTP ${fixture.status})`);
r = await sister.req("GET", `/memorials/${live.id}`);
assert.ok(r.data.ownerInactiveDays >= 119);
r = await sister.req("POST", `/memorials/${live.id}/recovery`);
assert.equal(r.status, 200, JSON.stringify(r.data));
r = await guest.req("POST", `/dev/run-jobs?now=${Date.now() + 15 * 86400_000}`);
r = await sister.req("GET", `/memorials/${live.id}`);
assert.equal(r.data.memorial.role, "owner", "ownership moves after 14 days of silence");
step("inactive owner: an admin asks, and ownership moves after 14 days");

// A year ago today.
const today = new Date();
const aYearAgo = `${today.getUTCFullYear() - 1}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
await sister.req("PATCH", `/memorials/${live.id}`, { died: aYearAgo });
r = await guest.req("POST", "/dev/run-jobs");
r = await owner.req("GET", "/dev/emails");
assert.ok(r.data.emails.some((e) => e.subject.startsWith("Remembering Arthur, a year on")), "anniversary email sent");
step("anniversary email goes to admins a year on");

// Email unsubscribe links must work without signing in.
const unsub = await fetch(`${BASE}/api/email/unsubscribe?u=x&s=bad`);
assert.equal(unsub.status, 400, "unsubscribe reachable signed-out (bad signature rejected)");
step("unsubscribe links work without signing in");

console.log("\nAll smoke checks passed.");
