// End-to-end check against the emulators: sign in, create a memorial, invite a co-admin,
// guest uploads (text + photo), screening holds, approval, public view, report, upgrade, slideshow,
// ownership transfer, digest email. Run with `npm run test:smoke`.
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:5001/demo-lifeguestbook/us-central1/api";
class Client {
  cookie = "";
  async req(method, path, body, form) {
    const headers = { cookie: this.cookie };
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
    const v = await this.req("GET", `/auth/verify?t=${token}`);
    assert.equal(v.status, 302);
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

await owner.signIn("owner@example.test");
step("owner signs in with an email link");

let r = await owner.req("POST", "/memorials", { name: "Margaret Hughes", born: "1948-03-02", died: "2026-10-30", intro: "Mum loved her garden.", service: { date: "2026-11-12", place: "St Mary's, Bury" }, coAdmins: ["sister@example.test"] });
assert.equal(r.status, 200, JSON.stringify(r.data));
const { id, slug } = r.data;
step(`memorial created (${slug}) with a co-admin invite`);

r = await owner.req("GET", `/memorials/${id}`);
assert.equal(r.data.memorial.privacy, "link");
assert.equal(r.data.memorial.role, "owner");
assert.equal(r.data.memorial.plan.tier, "free");
step("defaults: link-only, approve-first, free plan");

// The invite email was sent; accept it as the sister.
r = await owner.req("GET", "/dev/emails");
const inviteMail = r.data.emails.find((e) => e.to === "sister@example.test");
assert.ok(inviteMail, "invite email logged");
const inviteToken = inviteMail.text.match(/invite\?t=([\w-]+)/)[1];
await sister.signIn("sister@example.test");
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
const sisterUid = r.data.members.find((m) => m.email === "sister@example.test").uid;
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

console.log("\nAll smoke checks passed.");
