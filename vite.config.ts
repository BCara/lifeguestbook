import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { productLandingHtml } from "./scripts/product-landing-html.ts";

export default defineConfig({
  plugins: [react(), productLandingHtml()],
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
  build: { outDir: "dist" },
});
