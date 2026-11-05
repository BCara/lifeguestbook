import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
  COACH_MODES,
  MEMBER_COLORS,
  STAGES,
  type ChatMsg,
  type Idea,
  type Workspace,
} from "../shared/types";
import { Ai, AiError } from "./ai";
import { COOKIE, Passcode, SESSION_DAYS, Throttle } from "./auth";
import { trimActivity, type Store } from "./store";

export interface AppDeps {
  store: Store;
  ai: Ai;
  passcode: Passcode;
  secureCookies: boolean;
}

const id = () => randomUUID().slice(0, 12);
const now = () => new Date().toISOString();
const str = (max: number) => z.string().trim().max(max);

const IdeaInput = z.object({
  title: str(120).min(1),
  pitch: str(2000).default(""),
  emoji: str(16).default("💡"),
  tags: z.array(str(40)).max(12).default([]),
  stage: z.enum(STAGES).default("spark"),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  notes: str(20000).default(""),
});
const IdeaPatch = IdeaInput.partial().extend({
  tasks: z
    .array(z.object({ id: str(40), text: str(500), done: z.boolean(), owner: str(40).optional() }))
    .max(200)
    .optional(),
});
const MemberInput = z.object({
  id: str(40).min(1),
  name: str(40).min(1),
  emoji: str(16).default("🙂"),
  color: str(20).default(MEMBER_COLORS[0]),
  skills: str(1000).default(""),
  interests: str(1000).default(""),
});
const StudioInput = z.object({
  name: str(60).min(1),
  location: str(120).default(""),
  budget: str(120).default(""),
  hoursPerWeek: str(40).default(""),
  constraints: str(2000).default(""),
});
const VisionPatch = z
  .object({
    northStar: str(500),
    why: str(2000),
    targetDate: str(10),
    focusIdeaId: str(40),
    words: z.array(str(30)).max(20),
    milestones: z
      .array(z.object({ id: str(40), title: str(200), detail: str(1000), due: str(10), done: z.boolean() }))
      .max(60),
  })
  .partial();

export function createApp({ store, ai, passcode, secureCookies }: AppDeps) {
  const throttle = new Throttle();
  const app = new Hono().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof AiError) return c.json({ error: err.message }, err.status as 400);
    if (err instanceof z.ZodError) return c.json({ error: "Some of that didn't look right.", issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: "Something went wrong on our side. Please try again." }, 500);
  });

  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
    await next();
  });
  app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

  // Browsers won't send a custom header cross-site without CORS, which we never allow.
  app.use("*", async (c, next) => {
    if (!["GET", "HEAD"].includes(c.req.method) && c.req.header("x-studio") !== "1") return c.json({ error: "Missing header" }, 400);
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  const ipOf = (c: Context) =>
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";

  app.post("/login", async (c) => {
    const ip = ipOf(c);
    if (throttle.blocked(ip)) return c.json({ error: "Too many tries. Take a breather and try again in 15 minutes." }, 429);
    const { passcode: attempt } = z.object({ passcode: z.string().max(200) }).parse(await c.req.json());
    if (!passcode.check(attempt)) {
      throttle.fail(ip);
      await new Promise((r) => setTimeout(r, 400));
      return c.json({ error: "That's not the passcode." }, 401);
    }
    throttle.reset(ip);
    setCookie(c, COOKIE, passcode.issue(), {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
    return c.json({ ok: true });
  });

  app.post("/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // ---- everything below needs the passcode
  app.use("*", async (c, next) => {
    if (!passcode.verify(getCookie(c, COOKIE))) return c.json({ error: "locked" }, 401);
    await next();
  });

  const who = (c: Context) => c.req.header("x-member") ?? "";
  const log = async (c: Context, text: string) => {
    const item = { id: id(), at: now(), who: who(c), text };
    await store.updateDoc("activity", (a) => trimActivity([...a, item]));
  };
  const mustIdea = async (ideaId: string): Promise<{ ws: Workspace; idea: Idea }> => {
    const ws = await store.load();
    const idea = ws.ideas.find((i) => i.id === ideaId);
    if (!idea) throw new AiError("That idea no longer exists.", 404);
    return { ws, idea };
  };
  const patchIdea = (ideaId: string, fn: (i: Idea) => void) =>
    store.updateIdea(ideaId, (cur) => {
      if (!cur) throw new AiError("That idea no longer exists.", 404);
      fn(cur);
      cur.updatedAt = now();
      return cur;
    });

  app.get("/session", (c) => c.json({ ok: true, ai: { live: ai.live, model: ai.live ? ai.model : null } }));

  app.get("/state", async (c) => {
    const since = Number(c.req.query("rev") ?? -1);
    const rev = await store.rev();
    if (rev === since) return c.json({ changed: false, rev });
    return c.json({ changed: true, workspace: await store.load() });
  });

  app.get("/export", async (c) => {
    c.header("Content-Disposition", `attachment; filename="bertcreations-${now().slice(0, 10)}.json"`);
    return c.json(await store.load());
  });

  // ---- studio, members, vision
  app.put("/studio", async (c) => {
    const studio = StudioInput.parse(await c.req.json());
    await store.updateDoc("studio", () => studio);
    return c.json({ ok: true });
  });

  app.put("/members", async (c) => {
    const members = z.array(MemberInput).max(8).parse(await c.req.json());
    await store.updateDoc("members", () => members);
    return c.json({ ok: true });
  });

  app.put("/vision", async (c) => {
    const patch = VisionPatch.parse(await c.req.json());
    await store.updateDoc("vision", (v) => ({ ...v, ...patch }));
    return c.json({ ok: true });
  });

  // ---- ideas
  app.post("/ideas", async (c) => {
    const input = IdeaInput.parse(await c.req.json());
    const t = now();
    const idea: Idea = {
      ...input,
      id: id(),
      createdBy: who(c),
      createdAt: t,
      updatedAt: t,
      ratings: {},
      hearts: [],
      tasks: [],
    };
    await store.updateIdea(idea.id, () => idea);
    await log(c, `added ${idea.emoji} ${idea.title}`);
    return c.json({ idea });
  });

  app.patch("/ideas/:id", async (c) => {
    const patch = IdeaPatch.parse(await c.req.json());
    let before: Idea | undefined;
    const idea = await patchIdea(c.req.param("id"), (i) => {
      before = structuredClone(i);
      Object.assign(i, patch);
    });
    if (before && patch.stage && patch.stage !== before.stage) await log(c, `moved ${before.emoji} ${before.title} to ${patch.stage}`);
    return c.json({ idea });
  });

  app.delete("/ideas/:id", async (c) => {
    const { idea } = await mustIdea(c.req.param("id"));
    await store.updateIdea(idea.id, () => null);
    await log(c, `removed ${idea.emoji} ${idea.title}`);
    return c.json({ ok: true });
  });

  app.put("/ideas/:id/rating", async (c) => {
    const r = z
      .object({ excitement: z.number().min(0).max(10), feasibility: z.number().min(0).max(10) })
      .parse(await c.req.json());
    const member = who(c);
    if (!member) return c.json({ error: "Pick who you are first." }, 400);
    const idea = await patchIdea(c.req.param("id"), (i) => {
      i.ratings = { ...i.ratings, [member]: r };
    });
    return c.json({ idea });
  });

  app.post("/ideas/:id/heart", async (c) => {
    const member = who(c);
    if (!member) return c.json({ error: "Pick who you are first." }, 400);
    const idea = await patchIdea(c.req.param("id"), (i) => {
      i.hearts = i.hearts.includes(member) ? i.hearts.filter((h) => h !== member) : [...i.hearts, member];
    });
    return c.json({ idea });
  });

  // ---- AI
  app.post("/ai/spark", async (c) => {
    const { brief, count } = z
      .object({ brief: str(1000).default(""), count: z.number().int().min(1).max(6).default(4) })
      .parse(await c.req.json());
    return c.json({ ideas: await ai.spark(await store.load(), brief, count), demo: !ai.live });
  });

  app.post("/ai/mashup", async (c) => {
    const { a, b } = z.object({ a: str(40), b: str(40) }).parse(await c.req.json());
    const ws = await store.load();
    const A = ws.ideas.find((i) => i.id === a);
    const B = ws.ideas.find((i) => i.id === b);
    if (!A || !B || A.id === B.id) return c.json({ error: "Pick two different ideas to mash up." }, 400);
    return c.json({ ideas: await ai.mashup(ws, A, B), demo: !ai.live });
  });

  app.post("/ideas/:id/ai/future", async (c) => {
    const { ws, idea } = await mustIdea(c.req.param("id"));
    const future = await ai.futureCheck(ws, idea);
    await patchIdea(idea.id, (i) => {
      i.future = future;
    });
    await log(c, `ran a Future-Safe check on ${idea.emoji} ${idea.title}: ${future.score}/100`);
    return c.json({ future, demo: !ai.live });
  });

  app.post("/ideas/:id/ai/canvas", async (c) => {
    const { ws, idea } = await mustIdea(c.req.param("id"));
    const { canvas, firstSteps } = await ai.canvas(ws, idea);
    await patchIdea(idea.id, (i) => {
      i.canvas = canvas;
      const have = new Set(i.tasks.map((t) => t.text.toLowerCase()));
      i.tasks = [
        ...i.tasks,
        ...firstSteps.filter((s) => !have.has(s.toLowerCase())).map((text) => ({ id: id(), text, done: false })),
      ];
    });
    return c.json({ canvas, demo: !ai.live });
  });

  app.post("/ideas/:id/ai/brand", async (c) => {
    const { ws, idea } = await mustIdea(c.req.param("id"));
    const brands = await ai.brand(ws, idea);
    await patchIdea(idea.id, (i) => {
      i.brands = brands;
    });
    return c.json({ brands, demo: !ai.live });
  });

  app.post("/ai/coach", async (c) => {
    const { ideaId, mode, text } = z
      .object({
        ideaId: str(40).optional(),
        mode: z.enum(Object.keys(COACH_MODES) as [keyof typeof COACH_MODES]),
        text: str(4000).min(1),
      })
      .parse(await c.req.json());
    const ws = await store.load();
    const idea = ideaId ? ws.ideas.find((i) => i.id === ideaId) : undefined;
    if (ideaId && !idea) return c.json({ error: "That idea no longer exists." }, 404);
    const userMsg: ChatMsg = { role: "user", who: who(c), mode, text, at: now() };
    const history = [...((idea ? idea.chat : ws.chat) ?? []), userMsg];
    const reply = await ai.coach(ws, mode, history, idea);
    const botMsg: ChatMsg = { role: "assistant", mode, text: reply, at: now() };
    const append = (chat: ChatMsg[] = []) => [...chat, userMsg, botMsg].slice(-200);
    if (idea) await patchIdea(idea.id, (i) => void (i.chat = append(i.chat)));
    else await store.updateDoc("chat", (ch) => append(ch));
    return c.json({ reply: botMsg, demo: !ai.live });
  });

  app.post("/ai/chat/clear", async (c) => {
    const { ideaId } = z.object({ ideaId: str(40).optional() }).parse(await c.req.json());
    if (ideaId) await patchIdea(ideaId, (i) => void (i.chat = []));
    else await store.updateDoc("chat", () => []);
    return c.json({ ok: true });
  });

  app.post("/ai/roadmap", async (c) => {
    const ws = await store.load();
    const focus = ws.ideas.find((i) => i.id === ws.vision.focusIdeaId);
    return c.json({ ...(await ai.roadmap(ws, focus)), demo: !ai.live });
  });

  return app;
}
