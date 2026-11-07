// Link previews for Facebook, WhatsApp, iMessage and email. Hosting sends /m/** here; we return the
// normal app shell with Open Graph tags for that memorial, so a shared link shows their photo and
// name instead of a generic card. The app itself then loads as usual.
import { Hono } from "hono";
import sharp from "sharp";
import { lifeYears } from "../../src/shared/types";
import { bucket, memorialBySlug } from "./db";
import { esc } from "./email";
import type { Env } from "./env";

let shell: { html: string; at: number } | null = null;
async function appShell(env: Env) {
  if (shell && Date.now() - shell.at < 10 * 60_000) return shell.html;
  const res = await fetch(`${env.APP_ORIGIN}/index.html`, { signal: AbortSignal.timeout(5000) });
  const html = await res.text();
  shell = { html, at: Date.now() };
  return html;
}

export function injectMeta(html: string, tags: Record<string, string>, title: string, robots: string) {
  const meta = Object.entries(tags)
    .map(([k, v]) => `<meta ${k.startsWith("og:") ? "property" : "name"}="${k}" content="${esc(v)}" />`)
    .join("\n    ");
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/\s*<meta (property|name)="(og:[^"]+|description|twitter:[^"]+)"[^>]*>/g, "")
    .replace("</head>", `    ${meta}\n    <meta name="robots" content="${robots}" />\n  </head>`);
}

export const shareApp = new Hono<{ Bindings: Env }>().get("/m/:slug/:rest{.*}?", async (c) => {
  c.header("Cache-Control", "private, no-store");
  const slug = c.req.param("slug");
  const adding = c.req.path.endsWith("/add");
  const [html, m] = await Promise.all([appShell(c.env), memorialBySlug(slug)]);
  if (!m || m.privacy !== "public") {
    c.header("X-Robots-Tag", "noindex");
    return c.html(injectMeta(html, { "og:title": "Life Guestbook", "og:description": "A private memorial page.", "og:site_name": "Life Guestbook" }, "Life Guestbook", "noindex"));
  }
  const first = m.name.split(" ")[0];
  const years = lifeYears(m.born, m.died);
  const title = `${m.mode === "memorial" ? "In memory of " : ""}${m.name}${years ? ` (${years})` : ""}`;
  const description = adding
    ? `Share a photo, a story or a few words about ${first}. No app or account needed.`
    : m.intro?.slice(0, 200) || `Photos and memories of ${first}, shared by family and friends. Add yours.`;
  const url = `${c.env.APP_ORIGIN}/m/${m.slug}${adding ? "/add" : ""}`;
  const tags = {
    description,
    "og:type": "website",
    "og:site_name": "Life Guestbook",
    "og:title": title,
    "og:description": description,
    "og:url": url,
    "og:image": `${c.env.APP_ORIGIN}/api/og/${m.slug}.jpg?v=${encodeURIComponent((m.coverPath ?? "none").split("/").slice(-2, -1)[0] ?? "")}`,
    "og:image:width": "1200",
    "og:image:height": "630",
    "og:image:alt": `Photo of ${m.name}`,
    "twitter:card": "summary_large_image",
  };
  if (adding) c.header("X-Robots-Tag", "noindex");
  return c.html(injectMeta(html, tags, title, adding ? "noindex" : "index"));
});

/** 1200×630 share card: their cover photo, or a calm branded card if there isn't one. */
export async function shareImage(slug: string): Promise<Buffer | null> {
  const m = await memorialBySlug(slug);
  if (!m || m.privacy !== "public") return null;
  if (m.coverPath) {
    const [buf] = await bucket().file(m.coverPath).download();
    // Blurred photo as the backdrop, the photo itself centred at full height: works for portraits too.
    const bg = await sharp(buf).resize(1200, 630, { fit: "cover" }).blur(30).modulate({ brightness: 0.7 }).toBuffer();
    const fg = await sharp(buf).resize({ height: 630, width: 1100, fit: "inside" }).toBuffer();
    const meta = await sharp(fg).metadata();
    return sharp(bg)
      .composite([{ input: fg, left: Math.round((1200 - (meta.width ?? 630)) / 2), top: Math.round((630 - (meta.height ?? 630)) / 2) }])
      .jpeg({ quality: 82 })
      .toBuffer();
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f7f3ee"/><path d="M600 410c-60-40-100-73-100-120a50 50 0 0 1 100-13 50 50 0 0 1 100 13c0 47-40 80-100 120z" fill="#5b4636"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}
