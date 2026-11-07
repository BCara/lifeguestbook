import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, type PluginOption } from "vite";

import { productLandingHtml } from "./scripts/product-landing-html.ts";
import { releaseName } from "./scripts/release.mjs";

const release: string = releaseName();
// Source maps are only built (hidden, not referenced from the JS) and uploaded when a Sentry
// auth token is present. The plugin deletes the .map files after upload so they're never deployed.
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN;

const plugins: PluginOption[] = [react(), productLandingHtml()];
if (uploadSourceMaps) {
  plugins.push(
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT_WEB ?? process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      release: { name: release },
      sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
    }),
  );
}

export default defineConfig({
  plugins,
  define: { "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(release) },
  server: {
    port: Number(process.env.PORT) || 5173,
    // Straight to the Functions emulator (same /api paths the Hosting rewrite gives in production).
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: false,
        rewrite: (path) => `/demo-lifeguestbook/us-central1/api${path}`,
      },
    },
  },
  build: { outDir: "dist", sourcemap: uploadSourceMaps ? "hidden" : false },
});
