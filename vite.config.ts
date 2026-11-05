import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    // The Hosting emulator applies the same /api rewrite as production.
    proxy: { "/api": { target: "http://127.0.0.1:5002", changeOrigin: false } },
  },
  build: { outDir: "dist" },
});
