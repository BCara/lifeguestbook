// Shared between the server and the browser. Plain JSON shapes only.

export const STAGES = ["spark", "exploring", "validating", "building", "parked"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<Stage, { label: string; hint: string; color: string }> = {
  spark: { label: "Spark", hint: "Raw idea, no judgement yet", color: "#f5b941" },
  exploring: { label: "Exploring", hint: "Researching, sketching, talking it through", color: "#5aa9ff" },
  validating: { label: "Validating", hint: "Testing with real people and real money", color: "#b07cff" },
  building: { label: "Building", hint: "We're doing this", color: "#3ed49b" },
  parked: { label: "Parked", hint: "Not now, maybe later", color: "#8a8fa3" },
};

/** The six lenses of the Future-Safe score. Each is scored 0–10 by the AI. */
export const LENSES = [
  { key: "humanTouch", label: "Human touch", hint: "Value comes from empathy, taste, presence or relationships." },
  { key: "trust", label: "Trust & accountability", hint: "Customers pay for a responsible, accountable human or brand." },
  { key: "physical", label: "Physical world", hint: "Atoms, not just bits: places, craft, logistics, hands-on work." },
  { key: "edge", label: "Proprietary edge", hint: "Unique data, community, brand or local knowledge AI can't copy." },
  { key: "tailwind", label: "AI tailwind", hint: "AI makes this cheaper and better to run, rather than obsolete." },
  { key: "demand", label: "Durable demand", hint: "The need persists or grows in an AI-saturated world." },
] as const;
export type LensKey = (typeof LENSES)[number]["key"];

export interface Member {
  id: string;
  name: string;
  emoji: string;
  color: string;
  skills: string;
  interests: string;
}

export interface StudioProfile {
  name: string;
  location: string;
  budget: string;
  hoursPerWeek: string;
  constraints: string;
}

export interface Rating {
  excitement: number; // 0–10
  feasibility: number; // 0–10
}

export interface FutureCheck {
  score: number; // 0–100
  verdict: string;
  lenses: Record<LensKey, { score: number; why: string }>;
  threats: string[];
  moves: string[];
  at: string;
}

export interface LeanCanvas {
  problem: string;
  customer: string;
  solution: string;
  uniqueValue: string;
  unfairAdvantage: string;
  channels: string;
  revenue: string;
  costs: string;
  metrics: string;
  at: string;
}

export interface BrandConcept {
  name: string;
  tagline: string;
  palette: string[];
  svg: string;
}

export interface ChatMsg {
  role: "user" | "assistant";
  who?: string; // member id for user turns
  mode?: CoachMode;
  text: string;
  at: string;
}

export const COACH_MODES = {
  coach: { label: "Co-founder", emoji: "🧭", hint: "Supportive, practical, pushes you forward" },
  skeptic: { label: "Devil's advocate", emoji: "😈", hint: "Pokes holes so the market doesn't have to" },
  customer: { label: "Target customer", emoji: "🛍️", hint: "Role-plays the person you want to sell to" },
  investor: { label: "Investor", emoji: "💷", hint: "Asks the questions someone writing a cheque would" },
} as const;
export type CoachMode = keyof typeof COACH_MODES;

export interface Task {
  id: string;
  text: string;
  done: boolean;
  owner?: string; // member id
}

export interface Idea {
  id: string;
  title: string;
  pitch: string;
  emoji: string;
  tags: string[];
  stage: Stage;
  x: number;
  y: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  ratings: Record<string, Rating>;
  hearts: string[];
  notes: string;
  tasks: Task[];
  future?: FutureCheck;
  canvas?: LeanCanvas;
  brands?: BrandConcept[];
  chat?: ChatMsg[];
}

export interface Milestone {
  id: string;
  title: string;
  detail: string;
  due: string; // yyyy-mm-dd or ""
  done: boolean;
}

export interface Vision {
  northStar: string;
  why: string;
  targetDate: string;
  focusIdeaId: string;
  words: string[];
  milestones: Milestone[];
}

export interface ActivityItem {
  id: string;
  at: string;
  who: string;
  text: string;
}

export interface Workspace {
  rev: number;
  studio: StudioProfile;
  members: Member[];
  vision: Vision;
  ideas: Idea[];
  activity: ActivityItem[];
  /** Studio-wide coach conversation (idea-specific chats live on each idea). */
  chat: ChatMsg[];
}

/** An AI-suggested idea, not yet on the board. */
export interface IdeaSuggestion {
  title: string;
  pitch: string;
  emoji: string;
  tags: string[];
  whyUs: string;
  futureHook: string;
}

export const MEMBER_COLORS = ["#ff7a59", "#5aa9ff", "#3ed49b", "#b07cff", "#f5b941", "#ff5c8a"];

export function averageRating(idea: Idea): Rating | null {
  const rs = Object.values(idea.ratings ?? {});
  if (!rs.length) return null;
  return {
    excitement: rs.reduce((s, r) => s + r.excitement, 0) / rs.length,
    feasibility: rs.reduce((s, r) => s + r.feasibility, 0) / rs.length,
  };
}

export function defaultWorkspace(): Omit<Workspace, "rev"> {
  return {
    studio: {
      name: "Bert Creations",
      location: "United Kingdom",
      budget: "",
      hoursPerWeek: "",
      constraints: "",
    },
    members: [],
    vision: { northStar: "", why: "", targetDate: "", focusIdeaId: "", words: [], milestones: [] },
    ideas: [],
    activity: [],
    chat: [],
  };
}
