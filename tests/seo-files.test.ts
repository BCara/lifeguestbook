import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { products } from "../src/web/pages/home-products";

const read = (p: string) => readFileSync(new URL(`../public/${p}`, import.meta.url), "utf8");

describe("robots.txt and sitemap.xml", () => {
  it("lists every product landing page on the canonical domain", () => {
    const sitemap = read("sitemap.xml");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const p of products) expect(locs).toContain(`https://lifeguestbook.com/${p.id}`);
    for (const loc of locs) expect(loc.startsWith("https://lifeguestbook.com/")).toBe(true);
  });
  it("keeps private areas out and points at the sitemap", () => {
    const robots = read("robots.txt");
    for (const path of ["/api/", "/dashboard", "/wall"]) expect(robots).toContain(`Disallow: ${path}`);
    expect(robots).toContain("Sitemap: https://lifeguestbook.com/sitemap.xml");
  });
});
