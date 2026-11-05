// Bundles the functions into lib/index.js. --watch rebuilds on change.
import { build, context } from "esbuild";

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
};

if (process.argv.includes("--watch")) await (await context(options)).watch();
else await build(options);
