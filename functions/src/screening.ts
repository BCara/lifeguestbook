// Automated screening (from DigiStayBook): Google Vision SafeSearch for photos and the Natural
// Language moderateText API for text. Nothing is auto-deleted; flagged items are held for the
// family, and serious ones are hidden. On the emulator, markers simulate outcomes:
// "[review]" holds for review, "[safety]" hides as critical.
import { applicationDefault } from "firebase-admin/app";
import type { Env } from "./env";

export type Outcome = "clear" | "review" | "critical" | "unavailable";
export interface ScreeningResult { outcome: Outcome; categories?: string[] }

const LIKELY = new Set(["LIKELY", "VERY_LIKELY"]);
const TEXT_HOLD = 0.8;
const TEXT_SERIOUS = new Set(["Toxic", "Insult", "Profanity", "Derogatory", "Sexual", "Violent", "Death, Harm & Tragedy"]);

export function combine(results: ScreeningResult[]): ScreeningResult {
  const order: Outcome[] = ["clear", "unavailable", "review", "critical"];
  let worst: Outcome = "clear";
  const categories: string[] = [];
  for (const r of results) {
    if (order.indexOf(r.outcome) > order.indexOf(worst)) worst = r.outcome;
    categories.push(...(r.categories ?? []));
  }
  return { outcome: worst, categories: categories.length ? categories : undefined };
}

export function markerOutcome(text: string): ScreeningResult | null {
  if (text.includes("[safety]")) return { outcome: "critical", categories: ["Simulated safety"] };
  if (text.includes("[review]")) return { outcome: "review", categories: ["Simulated review"] };
  return null;
}

async function token() {
  const t = await applicationDefault().getAccessToken();
  return t.access_token;
}

export async function screenText(env: Env, text: string): Promise<ScreeningResult> {
  if (!text.trim()) return { outcome: "clear" };
  const marked = markerOutcome(text);
  if (!env.SCREENING_ENABLED) return marked ?? { outcome: "clear" };
  try {
    const res = await fetch("https://language.googleapis.com/v2/documents:moderateText", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ document: { type: "PLAIN_TEXT", content: text.slice(0, 5000) } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { outcome: "unavailable" };
    const json = (await res.json()) as { moderationCategories?: { name: string; confidence: number }[] };
    // "Death, Harm & Tragedy" is expected on a memorial; only hold it when combined with something else.
    const flagged = (json.moderationCategories ?? []).filter((c) => c.confidence >= TEXT_HOLD && c.name !== "Death, Harm & Tragedy");
    if (!flagged.length) return { outcome: "clear" };
    const serious = flagged.some((c) => TEXT_SERIOUS.has(c.name) && c.confidence >= 0.92);
    return { outcome: serious ? "critical" : "review", categories: flagged.map((c) => c.name) };
  } catch {
    return { outcome: "unavailable" };
  }
}

export async function screenImage(env: Env, image: Buffer, nameHint = ""): Promise<ScreeningResult> {
  const marked = markerOutcome(nameHint);
  if (!env.SCREENING_ENABLED) return marked ?? { outcome: "clear" };
  try {
    const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ image: { content: image.toString("base64") }, features: [{ type: "SAFE_SEARCH_DETECTION" }] }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { outcome: "unavailable" };
    const json = (await res.json()) as { responses?: { safeSearchAnnotation?: Record<string, string> }[] };
    const a = json.responses?.[0]?.safeSearchAnnotation;
    if (!a) return { outcome: "unavailable" };
    const critical = ["adult", "violence"].filter((k) => LIKELY.has(a[k]));
    if (critical.length) return { outcome: "critical", categories: critical.map((k) => `Photo ${k}`) };
    const review = ["racy", "medical"].filter((k) => LIKELY.has(a[k]));
    return review.length ? { outcome: "review", categories: review.map((k) => `Photo ${k}`) } : { outcome: "clear" };
  } catch {
    return { outcome: "unavailable" };
  }
}
