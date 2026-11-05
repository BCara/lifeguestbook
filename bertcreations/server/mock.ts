// Demo answers used when no ANTHROPIC_API_KEY is set, so the studio is fully clickable
// before the AI is connected. The UI labels everything from here as "demo".
import { COACH_MODES, LENSES, type ChatMsg, type CoachMode, type Idea, type IdeaSuggestion } from "../shared/types";

const POOL: IdeaSuggestion[] = [
  {
    title: "Repair Café Collective",
    pitch: "A paid-membership repair studio where locals fix clothes, bikes and gadgets with expert help, plus workshops and parts.",
    emoji: "🛠️",
    tags: ["community", "sustainability", "local"],
    whyUs: "Hands-on skills and a love of making things last make you credible hosts.",
    futureHook: "AI can diagnose a fault, but people still want hands, tools and a room full of neighbours.",
  },
  {
    title: "Legacy Story Studio",
    pitch: "Recorded life-story interviews with grandparents, turned into beautiful books and audio keepsakes for families.",
    emoji: "📖",
    tags: ["family", "storytelling", "premium"],
    whyUs: "Warmth with people plus an eye for design is exactly the mix this needs.",
    futureHook: "AI does the transcribing and layout; the trusted human interviewer is the product.",
  },
  {
    title: "Micro-Event Kitchen",
    pitch: "Pop-up supper clubs in unusual local venues, with a subscription for regulars and private bookings for celebrations.",
    emoji: "🍽️",
    tags: ["food", "experiences", "events"],
    whyUs: "You both love hosting, and events build a loyal crowd fast.",
    futureHook: "Shared real-world experiences become more valuable as screens fill with synthetic content.",
  },
  {
    title: "AI Helpdesk for Tradespeople",
    pitch: "A done-for-you service that sets up and runs AI quoting, booking and follow-ups for local plumbers, electricians and builders.",
    emoji: "🔧",
    tags: ["b2b", "services", "automation"],
    whyUs: "You can speak both 'tech' and 'tradesperson', which most agencies can't.",
    futureHook: "Rides the AI wave: every gain in AI capability makes the service better, and the trust is in you.",
  },
  {
    title: "Outdoor Wellness Retreats",
    pitch: "Weekend retreats mixing hiking, cold water, cooking and digital detox for burnt-out professionals.",
    emoji: "🏕️",
    tags: ["wellness", "outdoors", "experiences"],
    whyUs: "Your network of stressed-out friends is the first customer list.",
    futureHook: "The more AI-mediated work gets, the more people pay to switch off in person.",
  },
  {
    title: "Heritage Craft Subscription",
    pitch: "Monthly boxes from small British makers, each with the maker's story and a video workshop.",
    emoji: "🧶",
    tags: ["craft", "subscription", "makers"],
    whyUs: "Curation and storytelling are your strengths.",
    futureHook: "Provenance and the human hand behind an object can't be generated.",
  },
];

let cursor = 0;
export function spark(_brief: string, count: number): IdeaSuggestion[] {
  const out: IdeaSuggestion[] = [];
  for (let i = 0; i < count; i++) out.push(POOL[(cursor + i) % POOL.length]);
  cursor = (cursor + count) % POOL.length;
  return out;
}

export function mashup(a: Idea, b: Idea): IdeaSuggestion[] {
  return [1, 2, 3].map((n) => ({
    title: `${a.title.split(" ")[0]} × ${b.title.split(" ").slice(-1)[0]} ${["Lab", "Club", "Co."][n - 1]}`,
    pitch: `Demo mash-up ${n}: takes the audience of “${a.title}” and the delivery model of “${b.title}”.`,
    emoji: [a.emoji, b.emoji, "✨"][n - 1],
    tags: [...new Set([...a.tags, ...b.tags])].slice(0, 3),
    whyUs: "Combines two things you were already excited about.",
    futureHook: "Hybrid offers are harder for any single AI product to copy.",
  }));
}

function seed(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((h = (h * 1103515245 + 12345) >>> 0) % 1000) / 1000;
}

export function future(idea: Idea) {
  const r = seed(idea.title);
  return {
    verdict: "Demo verdict: promising if you lean into the parts only people can do.",
    lenses: Object.fromEntries(
      LENSES.map((l) => [l.key, { score: Math.round(3 + r() * 7), why: `Demo reason for ${l.label.toLowerCase()}.` }]),
    ) as Record<(typeof LENSES)[number]["key"], { score: number; why: string }>,
    threats: [
      "Generic AI tools let customers do a basic version themselves.",
      "A well-funded competitor automates the cheapest tier.",
      "Price pressure as AI drives down the cost of content.",
    ],
    moves: [
      "Build a community around the service, not just a product.",
      "Own the relationship: memberships, not one-off sales.",
      "Use AI behind the scenes to cut admin time in half.",
      "Make the in-person or hands-on element the hero of the brand.",
    ],
  };
}

export function canvas(idea: Idea) {
  return {
    problem: `Demo: the main pain behind “${idea.title}”.`,
    customer: "Demo: busy 30–55 year olds who value quality and connection.",
    solution: idea.pitch || "Demo solution.",
    uniqueValue: "Demo: the warm, human version of something usually cold and generic.",
    unfairAdvantage: "Demo: your local network and complementary skills.",
    channels: "Demo: Instagram, local Facebook groups, word of mouth, partnerships.",
    revenue: "Demo: memberships plus premium one-offs.",
    costs: "Demo: venue, materials, marketing, software.",
    metrics: "Demo: paying members, repeat rate, referrals.",
    firstSteps: [
      "Interview 10 people who fit the target customer",
      "Write a one-page offer and price it",
      "Put up a simple landing page with a waitlist",
      "Run one small paid test event or pilot",
      "Review what you learned together and decide go / tweak / park",
    ],
  };
}

const LOGO = (fg: string, bg: string, letter: string, shape: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<rect width="200" height="200" rx="40" fill="${bg}"/>
${
  [
    `<circle cx="100" cy="100" r="58" fill="none" stroke="${fg}" stroke-width="14"/>`,
    `<path d="M40 150 L100 45 L160 150 Z" fill="${fg}" opacity=".9"/>`,
    `<rect x="48" y="48" width="104" height="104" rx="20" fill="${fg}" transform="rotate(12 100 100)"/>`,
  ][shape]
}
<text x="100" y="${shape === 1 ? 138 : 120}" font-family="Georgia, serif" font-size="56" font-weight="700" text-anchor="middle" fill="${shape === 0 ? fg : bg}">${letter}</text>
</svg>`;

export function brand(idea: Idea) {
  const l = (idea.title.trim()[0] ?? "B").toUpperCase().replace(/[^A-Z0-9]/, "B");
  return {
    concepts: [
      { name: `${idea.title} Co.`, tagline: "Demo: made by people, for people.", palette: ["#1d3557", "#e63946", "#f1faee", "#a8dadc"], svg: LOGO("#e63946", "#1d3557", l, 0) },
      { name: `The ${idea.title.split(" ")[0]} House`, tagline: "Demo: warm, local, lasting.", palette: ["#2a9d8f", "#e9c46a", "#f4a261", "#264653"], svg: LOGO("#e9c46a", "#264653", l, 1) },
      { name: `${idea.title.split(" ")[0]}ly`, tagline: "Demo: the bold one.", palette: ["#7b2cbf", "#ff9e00", "#10002b", "#e0aaff"], svg: LOGO("#ff9e00", "#10002b", l, 2) },
    ],
  };
}

export function coach(mode: CoachMode, history: ChatMsg[], idea?: Idea) {
  const last = history.at(-1)?.text ?? "";
  const m = COACH_MODES[mode];
  return `${m.emoji} **${m.label} (demo mode)**\n\nYou said: “${last.slice(0, 140)}”.\n\nOnce the AI is connected I'll reply properly${
    idea ? ` about **${idea.title}**` : ""
  }. For now, some good questions to discuss:\n- Who exactly is the first customer, by name?\n- What would they pay this month?\n- What's the cheapest test we can run this week?`;
}

export function roadmap(idea?: Idea) {
  const steps = [
    ["Pick our focus", "Agree on the one idea we'll test first.", 1],
    ["10 customer conversations", "Talk to real people who'd buy it and write down exactly what they say.", 3],
    ["Offer and price", "A one-page offer with a price we're slightly nervous about.", 4],
    ["First paid pilot", "Deliver it to 3–5 paying customers, even if it's scrappy.", 8],
    ["Brand and online presence", "Name, logo, landing page and one social channel.", 10],
    ["Systems and AI helpers", "Automate bookings, invoices and follow-ups.", 14],
    ["Official launch", "Open for business with a launch event.", 20],
  ] as const;
  return {
    northStar: idea ? `Demo: make “${idea.title}” a profitable, much-loved local business.` : "Demo: launch a business we're proud of within a year.",
    milestones: steps.map(([title, detail, weeksFromNow]) => ({ title, detail, weeksFromNow })),
  };
}
