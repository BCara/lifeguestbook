# Bert Creations Studio

A private, passcode-locked studio where the founders dream up, test and build a new business together, with an AI co-founder alongside.

## What's inside

| Area | What it does |
|---|---|
| **Idea Board** | An infinite canvas of idea cards you can drag, pan and zoom. Double-click to drop an idea. **✨ Spark with AI** generates ideas tailored to the founders. **🧪 Mash-up** fuses two ideas into new hybrids. |
| **Idea drawer** | Click any card. Pitch, tags, notes, and each person's 🔥 excitement / 🧱 feasibility ratings. Plus four AI tools: **🛡️ Future-Safe check** (radar chart), **Lean canvas** (one-page plan + first five steps), **Brand** (3 names, taglines, palettes and logo marks), and **Talk it through** (chat as co-founder, devil's advocate, target customer or investor). |
| **Pipeline** | Kanban from Spark → Exploring → Validating → Building → Parked. Drag cards between columns. |
| **Future Map** | Every idea plotted: across = Future-Safe score, up = excitement, bubble size = feasibility. The top right is the sweet spot. Includes a front-runners ranking. |
| **Vision** | North star, countdown to your target date, the "why", vibe words, the focus idea, and a roadmap timeline the AI can draft. Also shows recent activity. |
| **Us** | Each founder's skills and interests, plus budget, time, location and constraints. All of it feeds every AI answer. Export everything as JSON. |

Everyone sees changes live (the page syncs every few seconds). Each device remembers who is using it.

### The Future-Safe score

Every idea is scored 0–10 on six lenses: **human touch, trust & accountability, physical world, proprietary edge, AI tailwind, durable demand**. Together they give a score out of 100. It's not about avoiding AI. It favours businesses whose core value AI can't commoditise and that use AI to run the rest more cheaply. Each check also lists the ways AI could erode the idea and the moves that would protect it.

### Built to last

- **Model-agnostic setup:** the model and effort level are environment variables (`AI_MODEL`, `AI_EFFORT`), so moving to a newer Claude model doesn't need a code change. If the main model declines a request, the server automatically retries on a fallback model.
- **You own the data:** it lives in a JSON file or your own Firestore, and one click exports all of it.
- **Private:** a passcode protects everything, sessions are signed httpOnly cookies, guessing the passcode is rate-limited, all pages are marked `noindex`, and the AI key never reaches the browser.
- **Works without AI:** with no API key, every AI feature runs in a clearly labelled demo mode, so you can try the whole app first.

## Run it locally

```bash
cd bertcreations
npm install
npm run dev
```

Open http://localhost:5180. The dev passcode is `bert`. Data is saved to `bertcreations/data/studio.json`.

To switch on real AI, copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` (get one at https://console.anthropic.com).

```bash
npm test          # server tests
npm run typecheck
```

## Deploy

The app is one Node server that hosts both the web app and the API. It needs these settings:

| Variable | Required | Notes |
|---|---|---|
| `STUDIO_PASSCODE` | **yes** | The server refuses to start in production without it. |
| `SESSION_SECRET` | recommended | A long random string. Changing it, or the passcode, signs everyone out. |
| `ANTHROPIC_API_KEY` | for real AI | Without it the AI runs in demo mode. |
| `AI_MODEL` / `AI_EFFORT` | no | Default: `claude-opus-5-5` / `medium`. |
| `STORE` | no | `file` (default) or `firestore`. |

### Option A: Google Cloud Run + Firestore (recommended)

This reuses the existing Firebase project `lifeguestbook-cbert`. Studio data lives in its own `bc_ideas` and `bc_meta` collections, separate from Life Guestbook.

```bash
cd bertcreations
gcloud run deploy bertcreations --source . --region europe-west2 --allow-unauthenticated \
  --set-env-vars STORE=firestore,NODE_ENV=production \
  --set-secrets STUDIO_PASSCODE=studio-passcode:latest,SESSION_SECRET=studio-session-secret:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --project lifeguestbook-cbert
```

Create the three secrets in Secret Manager first, and give the Cloud Run service account the *Secret Manager Secret Accessor* and *Cloud Datastore User* roles. `--allow-unauthenticated` only means the page loads in a browser. The passcode screen still protects everything.

**Custom domain:** in Cloud Run go to *Manage custom domains → Add mapping*, pick the `bertcreations` service, and enter your domain. Then add the DNS records it shows at your domain registrar. HTTPS is set up automatically.

### Option B: any host with a persistent disk (Render, Railway, Fly.io, a VPS)

Build with the included `Dockerfile`. Mount a volume and set `DATA_FILE=/data/studio.json`. Then point your domain at the host.

## Code map

```
bertcreations/
  shared/types.ts     data shapes, stages, Future-Safe lenses (used by server and browser)
  server/app.ts       API routes (Hono)
  server/ai.ts        Claude prompts, structured outputs, SVG sanitising
  server/mock.ts      demo-mode answers
  server/store.ts     FileStore + FirestoreStore (rev counter for cheap polling)
  server/auth.ts      passcode, signed session cookie, throttle
  server/node.ts      server entry: config, static hosting
  src/                React app (views/ = Board, Pipeline, FutureMap, Vision, Us, IdeaDrawer, Coach, Spark)
```
