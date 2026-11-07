#!/usr/bin/env node
// Read-only checks of a deployed Life Guestbook site. Only GET requests and a TLS handshake;
// nothing is written, signed in or paid for.
//
//   npm run check:deploy                               # https://lifeguestbook.com
//   npm run check:deploy -- https://lifeguestbook-cbert.web.app
//   npm run check:deploy -- https://lifeguestbook.com --strict   # warnings also fail
//
// Exit code 1 if any check fails (or any warning with --strict).
import { readFileSync } from "node:fs";
import tls from "node:tls";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const base = new URL(args.find((a) => !a.startsWith("--")) ?? "https://lifeguestbook.com");
const origin = base.origin;
const host = base.hostname;
const CANONICAL = "https://lifeguestbook.com";
const isFirebaseHost = /\.(web\.app|firebaseapp\.com)$/.test(host);
const isLocal = host === "localhost" || host === "127.0.0.1";

const results = [];
const record = (level, name, detail = "") => {
  results.push({ level, name, detail });
  const tag = { pass: "PASS", warn: "WARN", fail: "FAIL" }[level];
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const pass = (n, d) => record("pass", n, d);
const warn = (n, d) => record("warn", n, d);
const fail = (n, d) => record("fail", n, d);

async function get(path, init = {}) {
  const url = path.startsWith("http") ? path : `${origin}${path}`;
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "lifeguestbook-post-deploy-check" }, ...init });
  const body = res.status >= 300 && res.status < 400 ? "" : await res.text();
  return { res, body, h: (k) => res.headers.get(k) ?? "" };
}

async function check(name, fn) {
  try {
    await fn();
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}

function productPages() {
  try {
    const src = readFileSync(new URL("../src/web/pages/home-products.ts", import.meta.url), "utf8");
    const ids = [...src.matchAll(/^\s{4}id: "([\w-]+)",\s*\n\s{4}title: "([^"]+)"/gm)].map(([, id, title]) => ({ id, title }));
    if (ids.length) return ids;
  } catch { /* fall through */ }
  return [
    { id: "memories-from-afar", title: "Memories from Afar" },
    { id: "day-of-guestbook", title: "Day-of Guestbook" },
    { id: "living-legacy", title: "Living Legacy" },
  ];
}

console.log(`Checking ${origin}\n`);

await check("API health", async () => {
  const { res, body, h } = await get("/api/health");
  if (res.status !== 200) return fail("API health", `status ${res.status}`);
  if (JSON.parse(body).ok !== true) return fail("API health", `unexpected body ${body.slice(0, 80)}`);
  pass("API health", "200 {ok:true}");
  if (!/no-store/.test(h("cache-control"))) fail("API cache policy", `cache-control "${h("cache-control")}" (want private, no-store)`);
  else pass("API cache policy", h("cache-control"));
});

let homeHtml = "";
await check("Homepage", async () => {
  const { res, body, h } = await get("/");
  homeHtml = body;
  if (res.status !== 200) return fail("Homepage", `status ${res.status}`);
  if (!/text\/html/.test(h("content-type"))) return fail("Homepage", `content-type ${h("content-type")}`);
  if (!body.includes('id="root"')) return fail("Homepage", "app shell (#root) missing");
  pass("Homepage", "200 text/html with app shell");
  const cc = h("cache-control");
  const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 0);
  if (maxAge > 3600) warn("Homepage cache", `cache-control "${cc}" keeps old HTML for over an hour after a deploy`);
  else pass("Homepage cache", cc || "(none)");
});

await check("Hashed assets", async () => {
  const asset = /(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/.exec(homeHtml)?.[1];
  if (!asset) return fail("Hashed assets", "no /assets/*.js|css referenced from the homepage");
  const { res, h } = await get(asset);
  if (res.status !== 200) return fail("Hashed assets", `${asset} status ${res.status}`);
  if (!/immutable/.test(h("cache-control")) || !/max-age=31536000/.test(h("cache-control"))) return fail("Hashed assets", `${asset} cache-control "${h("cache-control")}"`);
  pass("Hashed assets", `${asset} immutable`);
});

for (const { id, title } of productPages()) {
  await check(`Product page /${id}`, async () => {
    const { res, body } = await get(`/${id}`);
    if (res.status !== 200) return fail(`Product page /${id}`, `status ${res.status}`);
    if (!body.includes(title)) return fail(`Product page /${id}`, `title "${title}" not in HTML (prerendered landing page missing?)`);
    pass(`Product page /${id}`);
  });
}

for (const path of ["/faq", "/privacy", "/terms"]) {
  await check(`Page ${path}`, async () => {
    const { res } = await get(path);
    if (res.status !== 200) fail(`Page ${path}`, `status ${res.status}`);
    else pass(`Page ${path}`);
  });
}

await check("Security headers", async () => {
  const { h } = await get("/");
  if (base.protocol === "https:") {
    const hsts = h("strict-transport-security");
    if (!hsts) fail("HSTS", "strict-transport-security missing");
    else pass("HSTS", hsts);
  }
  const want = {
    "x-content-type-options": (v) => v === "nosniff",
    "referrer-policy": (v) => !!v,
    "x-frame-options or CSP frame-ancestors": () => !!h("x-frame-options") || /frame-ancestors/.test(h("content-security-policy")),
  };
  for (const [name, ok] of Object.entries(want)) {
    const value = name.includes(" or ") ? "" : h(name);
    if (ok(value)) pass(`Header ${name}`, value);
    else warn(`Header ${name}`, "not set (security hardening, owned by the security workstream)");
  }
});

await check("Private areas noindex", async () => {
  for (const path of ["/dashboard", "/wall"]) {
    const { res, h } = await get(path);
    if (res.status !== 200) fail(`Noindex ${path}`, `status ${res.status}`);
    else if (!/noindex/.test(h("x-robots-tag"))) fail(`Noindex ${path}`, "x-robots-tag noindex missing");
    else pass(`Noindex ${path}`);
  }
});

await check("Unknown memorial 404", async () => {
  const slug = `post-deploy-check-${Math.random().toString(36).slice(2, 10)}`;
  const { res, body, h } = await get(`/m/${slug}`);
  if (res.status !== 404) return fail("Unknown memorial 404", `/m/${slug} returned ${res.status}`);
  if (!/noindex/.test(h("x-robots-tag"))) return fail("Unknown memorial 404", "x-robots-tag noindex missing");
  if (!body.includes('id="root"')) return fail("Unknown memorial 404", "app shell missing from 404 body");
  pass("Unknown memorial 404", "404, noindex, app shell");
});

await check("robots.txt", async () => {
  const { res, body, h } = await get("/robots.txt");
  if (res.status !== 200 || !/text\/plain/.test(h("content-type"))) return fail("robots.txt", `status ${res.status}, ${h("content-type")}`);
  if (!/^Sitemap: \S+/m.test(body)) return fail("robots.txt", "no Sitemap line");
  if (!/^Disallow: \/api\//m.test(body)) return fail("robots.txt", "does not disallow /api/");
  pass("robots.txt");
});

await check("sitemap.xml", async () => {
  const { res, body, h } = await get("/sitemap.xml");
  if (res.status !== 200 || !/xml/.test(h("content-type"))) return fail("sitemap.xml", `status ${res.status}, ${h("content-type")}`);
  if (!body.includes("<urlset")) return fail("sitemap.xml", "no <urlset>");
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const foreign = locs.filter((l) => !l.startsWith(`${CANONICAL}/`));
  if (foreign.length) return fail("sitemap.xml", `URLs outside ${CANONICAL}: ${foreign.join(", ")}`);
  if (origin !== CANONICAL) warn("sitemap.xml", `lists ${CANONICAL} URLs (expected on ${host}; fine before cutover)`);
  else pass("sitemap.xml", `${locs.length} URLs`);
});

if (!isFirebaseHost && !isLocal) {
  await check("www redirect", async () => {
    const www = host.startsWith("www.") ? host : `www.${host}`;
    const apex = host.replace(/^www\./, "");
    const { res, h } = await get(`https://${www}/faq?x=1`);
    const loc = h("location");
    if (![301, 302, 307, 308].includes(res.status)) return fail("www redirect", `https://${www}/ returned ${res.status}`);
    if (!loc.startsWith(`https://${apex}/`)) return fail("www redirect", `redirects to ${loc}`);
    if (res.status !== 301 && res.status !== 308) warn("www redirect", `${res.status} → ${loc} (prefer a permanent 301)`);
    else pass("www redirect", `${res.status} → ${loc}`);
  });
}

if (base.protocol === "https:" && !isLocal) {
  await check("HTTP → HTTPS", async () => {
    const { res, h } = await get(`http://${host}/`);
    if (![301, 302, 307, 308].includes(res.status) || !h("location").startsWith("https://")) fail("HTTP → HTTPS", `http:// returned ${res.status} ${h("location")}`);
    else pass("HTTP → HTTPS", `${res.status} → ${h("location")}`);
  });

  const hosts = [host];
  if (!isFirebaseHost && !host.startsWith("www.")) hosts.push(`www.${host}`);
  for (const name of hosts) {
    await check(`TLS ${name}`, () => new Promise((resolve, reject) => {
      const socket = tls.connect({ host: name, port: 443, servername: name, timeout: 10_000 }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!socket.authorized) return reject(new Error(`certificate not trusted: ${socket.authorizationError}`));
        const days = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
        if (days < 14) warn(`TLS ${name}`, `expires in ${days} days (${cert.valid_to})`);
        else pass(`TLS ${name}`, `valid, ${days} days left, issuer ${cert.issuer?.O ?? "?"}`);
        resolve();
      });
      socket.on("timeout", () => { socket.destroy(); reject(new Error("TLS handshake timed out")); });
      socket.on("error", reject);
    }));
  }
}

const failed = results.filter((r) => r.level === "fail").length;
const warned = results.filter((r) => r.level === "warn").length;
console.log(`\n${results.length - failed - warned} passed, ${warned} warnings, ${failed} failed`);
process.exit(failed || (strict && warned) ? 1 : 0);
