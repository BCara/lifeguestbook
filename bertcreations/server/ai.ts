import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  COACH_MODES,
  LENSES,
  type BrandConcept,
  type ChatMsg,
  type CoachMode,
  type FutureCheck,
  type Idea,
  type IdeaSuggestion,
  type LeanCanvas,
  type Milestone,
  type Workspace,
} from "../shared/types";
import * as mock from "./mock";

export interface AiConfig {
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
}

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- prompts

const FUTURE_SAFE = `The Future-Safe framework scores how well a business holds up as AI keeps getting more capable. Six lenses, each 0–10:
${LENSES.map((l) => `- ${l.label} (${l.key}): ${l.hint}`).join("\n")}
A high score does not mean "avoids AI". The best ideas use AI as a tailwind for the boring parts while their core value rests on things AI can't easily commoditise: trust, presence, taste, community, physical delivery, proprietary relationships or data.`;

function studioContext(ws: Workspace) {
  const s = ws.studio;
  const people = ws.members.length
    ? ws.members.map((m) => `- ${m.name}: skills: ${m.skills || "not given"}; interests: ${m.interests || "not given"}`).join("\n")
    : "- (the founders haven't described themselves yet)";
  const v = ws.vision;
  const lines = [
    `Studio: ${s.name}`,
    `Founders:\n${people}`,
    s.location && `Based in: ${s.location}`,
    s.budget && `Starting budget: ${s.budget}`,
    s.hoursPerWeek && `Time available: ${s.hoursPerWeek} hours per week`,
    s.constraints && `Constraints and must-haves: ${s.constraints}`,
    v.northStar && `Their north star: ${v.northStar}`,
    v.why && `Why it matters to them: ${v.why}`,
    v.words.length ? `Words that describe the business they want: ${v.words.join(", ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function system(ws: Workspace) {
  return `You are the AI co-founder inside ${ws.studio.name} Studio, a private workspace where a small group of friends dream up, test and build a new business together.

${studioContext(ws)}

${FUTURE_SAFE}

How to help:
- Be concrete and specific to these founders, their skills, budget, time and location. Avoid generic startup advice.
- Prefer ideas that are realistic for a small team to start, can make first revenue quickly, and score well on the Future-Safe lenses.
- Be honest. If something is weak, say so kindly and say what would make it stronger.
- Use British English and local currency where the location makes it obvious.`;
}

function ideaBrief(idea: Idea) {
  return [
    `Idea: ${idea.emoji} ${idea.title}`,
    `Pitch: ${idea.pitch || "(no pitch yet)"}`,
    idea.tags.length ? `Tags: ${idea.tags.join(", ")}` : "",
    idea.notes ? `Founders' notes: ${idea.notes}` : "",
    idea.canvas ? `Lean canvas so far: ${JSON.stringify({ ...idea.canvas, at: undefined })}` : "",
    idea.future ? `Last Future-Safe score: ${idea.future.score}/100 – ${idea.future.verdict}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------- schemas

const Suggestion = z.object({
  title: z.string(),
  pitch: z.string(),
  emoji: z.string(),
  tags: z.array(z.string()),
  whyUs: z.string(),
  futureHook: z.string(),
});
const Suggestions = z.object({ ideas: z.array(Suggestion) });

const Lens = z.object({ score: z.number(), why: z.string() });
const Future = z.object({
  verdict: z.string(),
  lenses: z.object(Object.fromEntries(LENSES.map((l) => [l.key, Lens])) as Record<(typeof LENSES)[number]["key"], typeof Lens>),
  threats: z.array(z.string()),
  moves: z.array(z.string()),
});

const Canvas = z.object({
  problem: z.string(),
  customer: z.string(),
  solution: z.string(),
  uniqueValue: z.string(),
  unfairAdvantage: z.string(),
  channels: z.string(),
  revenue: z.string(),
  costs: z.string(),
  metrics: z.string(),
  firstSteps: z.array(z.string()),
});

const Brands = z.object({
  concepts: z.array(z.object({ name: z.string(), tagline: z.string(), palette: z.array(z.string()), svg: z.string() })),
});

const Roadmap = z.object({
  northStar: z.string(),
  milestones: z.array(z.object({ title: z.string(), detail: z.string(), weeksFromNow: z.number() })),
});

/** Structured outputs accept a subset of JSON Schema; drop the keywords it doesn't. */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (["$schema", "minimum", "maximum", "minLength", "maxLength", "maxItems", "pattern", "format"].includes(k)) continue;
      out[k] = strip(v);
    }
    return out;
  };
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>;
}

// ---------------------------------------------------------------- client

export class Ai {
  private client: Anthropic | null;
  constructor(private cfg: AiConfig) {
    this.client = cfg.apiKey ? new Anthropic({ apiKey: cfg.apiKey }) : null;
  }

  get live() {
    return !!this.client;
  }
  get model() {
    return this.cfg.model;
  }

  private async run(ws: Workspace, prompt: string | Anthropic.Beta.BetaMessageParam[], schema?: z.ZodType) {
    if (!this.client) throw new AiError("AI isn't connected.", 503);
    const messages: Anthropic.Beta.BetaMessageParam[] =
      typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await this.client.beta.messages
        .stream({
          model: this.cfg.model,
          max_tokens: 32000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [{ type: "text", text: system(ws), cache_control: { type: "ephemeral" } }],
          output_config: {
            effort: this.cfg.effort,
            ...(schema ? { format: { type: "json_schema" as const, schema: jsonSchema(schema) } } : {}),
          },
          messages,
        })
        .finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AiError("The AI key was rejected. Check ANTHROPIC_API_KEY.", 503);
      if (e instanceof Anthropic.RateLimitError) throw new AiError("The AI is busy right now. Try again in a minute.", 429);
      if (e instanceof Anthropic.APIError) {
        console.error("Claude API error", e.status, e.message);
        throw new AiError("The AI had a problem answering. Try again.");
      }
      throw e;
    }
    if (msg.stop_reason === "refusal") throw new AiError("The AI declined to help with that one. Try rephrasing.", 422);
    if (msg.stop_reason === "max_tokens") throw new AiError("The AI's answer was too long and got cut off. Try again.");
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!schema) return text;
    try {
      return schema.parse(JSON.parse(text));
    } catch {
      throw new AiError("The AI's answer came back in an unexpected shape. Try again.");
    }
  }

  async spark(ws: Workspace, brief: string, count: number): Promise<IdeaSuggestion[]> {
    if (!this.client) return mock.spark(brief, count);
    const existing = ws.ideas.map((i) => `- ${i.title}`).join("\n") || "(none yet)";
    const out = (await this.run(
      ws,
      `Suggest ${count} distinct business ideas for us.
${brief ? `What we're in the mood for: ${brief}` : "Surprise us, but keep it grounded in who we are."}

Ideas already on our board (don't repeat these):
${existing}

For each idea give: a short memorable title, a one-or-two sentence pitch, one emoji, 2–4 lowercase tags, "whyUs" (why these founders specifically could win), and "futureHook" (one sentence on why it stays valuable as AI improves).`,
      Suggestions,
    )) as z.infer<typeof Suggestions>;
    return out.ideas.slice(0, count);
  }

  async mashup(ws: Workspace, a: Idea, b: Idea): Promise<IdeaSuggestion[]> {
    if (!this.client) return mock.mashup(a, b);
    const out = (await this.run(
      ws,
      `Mash these two ideas from our board together into 3 new hybrid business ideas that take the best of each.

A) ${ideaBrief(a)}

B) ${ideaBrief(b)}

Same fields as usual: title, pitch, emoji, tags, whyUs, futureHook.`,
      Suggestions,
    )) as z.infer<typeof Suggestions>;
    return out.ideas.slice(0, 3);
  }

  async futureCheck(ws: Workspace, idea: Idea): Promise<FutureCheck> {
    const out = this.client
      ? ((await this.run(
          ws,
          `Run a Future-Safe check on this idea.

${ideaBrief(idea)}

Score each of the six lenses 0–10 with a one-sentence reason. Then give a one-line verdict, the 3 most likely ways AI (or AI-powered competitors) could erode this business over the next 5–10 years ("threats"), and 3–5 concrete moves that would make it more future-safe ("moves").`,
          Future,
        )) as z.infer<typeof Future>)
      : mock.future(idea);
    const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)));
    const lenses = Object.fromEntries(
      LENSES.map((l) => [l.key, { score: clamp(out.lenses[l.key].score), why: out.lenses[l.key].why }]),
    ) as FutureCheck["lenses"];
    const score = Math.round((Object.values(lenses).reduce((s, l) => s + l.score, 0) / (LENSES.length * 10)) * 100);
    return { score, verdict: out.verdict, lenses, threats: out.threats, moves: out.moves, at: new Date().toISOString() };
  }

  async canvas(ws: Workspace, idea: Idea): Promise<{ canvas: LeanCanvas; firstSteps: string[] }> {
    const out = this.client
      ? ((await this.run(
          ws,
          `Fill in a lean canvas for this idea, specific to us. Keep each box to 1–3 punchy sentences.

${ideaBrief(idea)}

Also give "firstSteps": 5 concrete actions we could finish in the next two weeks to learn whether this is worth pursuing (talk to X people, put up a landing page, run a pop-up, etc.).`,
          Canvas,
        )) as z.infer<typeof Canvas>)
      : mock.canvas(idea);
    const { firstSteps, ...canvas } = out;
    return { canvas: { ...canvas, at: new Date().toISOString() }, firstSteps };
  }

  async brand(ws: Workspace, idea: Idea): Promise<BrandConcept[]> {
    const out = this.client
      ? ((await this.run(
          ws,
          `Create 3 different brand concepts for this idea.

${ideaBrief(idea)}

For each: a business name, a tagline, a palette of 4 hex colours, and a simple logo mark as a self-contained SVG string (viewBox="0 0 200 200", flat shapes and at most a short word of text, no external images, fonts or scripts). Make the three concepts genuinely different in mood.`,
          Brands,
        )) as z.infer<typeof Brands>)
      : mock.brand(idea);
    return out.concepts.slice(0, 3).map((c) => ({
      name: c.name,
      tagline: c.tagline,
      palette: c.palette.filter((p) => /^#[0-9a-f]{3,8}$/i.test(p)).slice(0, 5),
      svg: sanitizeSvg(c.svg),
    }));
  }

  async coach(ws: Workspace, mode: CoachMode, history: ChatMsg[], idea?: Idea): Promise<string> {
    if (!this.client) return mock.coach(mode, history, idea);
    const names = Object.fromEntries(ws.members.map((m) => [m.id, m.name]));
    const persona = {
      coach: "Act as a warm but practical co-founder. Move the conversation towards decisions and next actions.",
      skeptic: "Act as a sharp devil's advocate. Find the weakest assumptions and the biggest risks, then suggest how to test them cheaply. Be blunt but never mean.",
      customer: "Role-play the most likely target customer for this idea, in the first person. React honestly to what the founders say, including what would make you buy or walk away. Stay in character.",
      investor: "Act as an experienced angel investor in a first meeting. Ask the hard questions about market, money and team, one or two at a time, and say what would get you excited.",
    }[mode];
    const lead = `${persona}\nKeep replies conversational and fairly short (under 200 words) unless asked for more. Light markdown (bold, bullet lists) is fine.\n${
      idea ? `\nWe're talking about this idea:\n${ideaBrief(idea)}` : "\nWe're talking about the studio in general."
    }`;
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    history.slice(-30).forEach((m, i) => {
      const content =
        m.role === "user"
          ? `${i === 0 ? `${lead}\n\n---\n` : ""}${names[m.who ?? ""] ?? "A founder"} (${COACH_MODES[m.mode ?? mode].label} mode): ${m.text}`
          : m.text;
      const last = messages.at(-1);
      if (last && last.role === m.role) last.content = `${last.content as string}\n\n${content}`;
      else messages.push({ role: m.role, content });
    });
    if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: lead });
    return (await this.run(ws, messages)) as string;
  }

  async roadmap(ws: Workspace, idea: Idea | undefined): Promise<{ northStar: string; milestones: Omit<Milestone, "id">[] }> {
    const out = this.client
      ? ((await this.run(
          ws,
          `Draft a roadmap from where we are today to a business that's up and running.
${idea ? `We're focusing on:\n${ideaBrief(idea)}` : "We haven't chosen a focus idea yet, so the early milestones should be about choosing one."}
${ws.vision.targetDate ? `Our target date is ${ws.vision.targetDate}.` : ""}

Give a crisp one-sentence north star (improve ours if we have one), and 6–8 milestones, each with a short title, one sentence of detail and how many weeks from now it should be done. Start with quick learning steps and end with being open for business.`,
          Roadmap,
        )) as z.infer<typeof Roadmap>)
      : mock.roadmap(idea);
    const now = Date.now();
    return {
      northStar: out.northStar,
      milestones: out.milestones.map((m) => ({
        title: m.title,
        detail: m.detail,
        due: new Date(now + Math.max(0, m.weeksFromNow) * 7 * 86400000).toISOString().slice(0, 10),
        done: false,
      })),
    };
  }
}

/**
 * Logos are shown with <img src="data:image/svg+xml,...">, where browsers never run scripts
 * or fetch external resources. We still strip anything active so the stored SVG is inert.
 */
export function sanitizeSvg(svg: string) {
  let s = String(svg ?? "").slice(0, 20000);
  const start = s.indexOf("<svg");
  const end = s.lastIndexOf("</svg>");
  if (start < 0 || end < 0) return "";
  s = s.slice(start, end + 6);
  s = s
    .replace(/<(script|foreignObject|iframe|image|use|a|style)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|foreignObject|iframe|image|use|a|style)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
  if (!/xmlns=/.test(s)) s = s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}
