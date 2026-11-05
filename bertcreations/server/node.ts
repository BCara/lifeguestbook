import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { Ai, type AiConfig } from "./ai";
import { createApp } from "./app";
import { Passcode } from "./auth";
import { FileStore, FirestoreStore, type Store } from "./store";

if (existsSync(".env")) process.loadEnvFile(".env");

const prod = process.env.NODE_ENV === "production";
const env = (k: string, d = "") => process.env[k]?.trim() || d;

const passcodeValue = env("STUDIO_PASSCODE", prod ? "" : "bert");
if (!passcodeValue) {
  console.error("STUDIO_PASSCODE must be set in production. Refusing to start an unlocked studio.");
  process.exit(1);
}
if (!prod && !process.env.STUDIO_PASSCODE) console.warn('⚠️  No STUDIO_PASSCODE set. Using the dev passcode "bert".');
const secret = env("SESSION_SECRET", passcodeValue);
if (prod && !process.env.SESSION_SECRET) console.warn("⚠️  Set SESSION_SECRET to a long random string for stronger sessions.");

const store: Store =
  env("STORE") === "firestore"
    ? await FirestoreStore.create(env("FIRESTORE_PREFIX", "bc"))
    : new FileStore(env("DATA_FILE", "./data/studio.json"));

const aiConfig: AiConfig = {
  apiKey: env("ANTHROPIC_API_KEY"),
  model: env("AI_MODEL", "claude-opus-5-5"),
  effort: env("AI_EFFORT", "medium") as AiConfig["effort"],
};
const ai = new Ai(aiConfig);
if (!ai.live) console.warn("⚠️  No ANTHROPIC_API_KEY set. AI features run in demo mode.");

const api = createApp({ store, ai, passcode: new Passcode(passcodeValue, secret), secureCookies: prod });

const root = new Hono();
root.route("/", api);

// In production the same server hosts the built web app.
if (existsSync("./dist/index.html")) {
  const index = readFileSync("./dist/index.html", "utf8");
  root.use("/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  root.use("*", serveStatic({ root: "./dist" }));
  root.get("*", (c) => {
    c.header("X-Robots-Tag", "noindex, nofollow");
    return c.html(index);
  });
}

const port = Number(env("PORT", prod ? "8080" : "8787"));
serve({ fetch: root.fetch, port }, () =>
  console.log(`✨ ${prod ? "Bert Creations Studio" : "Studio API"} on http://localhost:${port} (store: ${env("STORE", "file")}, ai: ${ai.live ? aiConfig.model : "demo"})`),
);
