import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { products } from "../src/web/pages/home-products.ts";

const escape = (text: string) => text.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
);

export function productLandingHtml(): Plugin {
  let output: string;
  return {
    name: "product-landing-html",
    apply: "build",
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const shell = readFileSync(resolve(output, "index.html"), "utf8");
      for (const product of products) {
        const title = escape(`${product.title} | Life Guestbook`);
        const description = escape(product.description);
        const sections = product.steps.map(([, heading, copy]) =>
          `<section><h2>${escape(heading)}</h2><p>${escape(copy)}</p></section>`,
        ).join("");
        const fallback = `<main><a href="/">LifeGuestbook</a><h1>${escape(product.heading)}</h1><p>${escape(product.lead)}</p>${sections}<p><a href="${escape(product.to)}">Get Started</a></p><p>LifeGuestbook is a family business.</p></main>`;
        const html = shell
          .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
          .replace(/(<meta name="description" content=")[^"]*/, `$1${description}`)
          .replace(/(<meta property="og:title" content=")[^"]*/, `$1${title}`)
          .replace(/(<meta property="og:description" content=")[^"]*/, `$1${description}`)
          .replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);
        writeFileSync(resolve(output, `${product.id}.html`), html);
      }
    },
  };
}
