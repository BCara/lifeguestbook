// Bundles the functions into lib/index.js. --watch rebuilds on change.
import { build, context } from "esbuild";
import { releaseName } from "../scripts/release.mjs";

const options = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  outfile: "lib/index.js",
  sourcemap: true,
  logLevel: "info",
  // Release tag for Sentry and Error Reporting (see scripts/release.mjs).
  define: { __SENTRY_RELEASE__: JSON.stringify(releaseName()) },
};

if (process.argv.includes("--watch")) await (await context(options)).watch();
else await build(options);
