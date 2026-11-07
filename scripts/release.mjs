// Release name shared by the web build, the functions build and Sentry.
// SENTRY_RELEASE wins; otherwise the short git SHA; otherwise the package version.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function releaseName() {
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE;
  try {
    return `lifeguestbook@${execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()}`;
  } catch {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return `lifeguestbook@${pkg.version}`;
  }
}
