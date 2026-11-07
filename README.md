# Life Guestbook

lifeguestbook.com: one shared, permanent place for a person's life story. Family and friends build it together, before or after the person passes. One link or QR code collects photos and memories from everyone. On the day, a live slideshow shows them at the service. Several admins look after every page, so it's never locked to one person's email.

The product plan, competitor research and pricing are in [PLAN.md](PLAN.md).

## What's built

- **Memorial and Living Legacy pages** (`/m/:slug`): cover photo, dates, life story, service details and livestream link, plus a gallery of memories filtered by photos, words or era. Link-only by default.
- **Add a memory** (`/m/:slug/add`): no account or app. Photos, video and voice (video and voice on paid pages), text, name, how they knew them, the era, and an optional email for "it's on the page now". QR scans are tagged as "at the service".
- **Multi-admin** with roles: owner, admin, moderator, trusted contributor. Invites by email, role changes, leaving, and owner-only delete. **Ownership transfer** needs acceptance and the old owner stays on as admin. Admins can't remove the owner. Every action goes in an audit log.
- **Moderation**: approve-first by default, or "auto" (show unless flagged). Automated screening uses Google Vision SafeSearch and Natural Language moderation (DigiStayBook pattern). Critical results are hidden and nothing is auto-deleted. A report button hides an item until it's reviewed, with rate limits. There's a review queue with approve, hide, reject, edit text and bulk-approve of clean items. Photos are rotated, stripped of EXIF/GPS, and resized with `sharp`.
- **On the day**: live slideshow (`/wall?k=…`). It shows approved items only and polls every 4 seconds, and newly approved memories jump the queue. Admins have a phone remote (pause, play, next) and can rotate the slideshow link. Printable QR table cards (4 per A4) and an A4 poster.
- **Share kit**: links, a ready-to-post message, WhatsApp, Facebook, email and native share.
- **Email (Resend)**: sign-in links, invites, page ready, **digests** through a notification outbox (hourly; every 5 minutes in "instant" mode or when something is reported), "your memory was approved", ownership transfer, receipts, renewal reminders at 30 days, 7 days and lapsed, day-before checklist and day-after recap. Unsubscribe links are signed.
- **Payments (Stripe Checkout)**: Tribute and Forever (one-off), yearly hosting and Living Legacy (subscriptions), in GBP, AUD, USD, NZD, EUR and CAD by time zone. Tribute includes 2 years. Lapsed pages **freeze, never delete**. Any admin can pay.
- **Download everything**: a ZIP of all approved media plus a text file of all the memories, and a **printable memory book** (A5 or A4; cover, life story, chapters, every memory, "with love from") that saves as a PDF for a print shop.
- **Writing help (Claude)**: drafts a life story, eulogy, obituary or thank-you message from the approved memories plus the family's own notes. It is told never to invent facts and to leave `[placeholders]` instead. Guest text is passed as quoted data, never as instructions. "Use as the life story" puts it on the page, and drafts are kept. Free pages get 3 uses; paid pages get 40 a day.
- **Living Legacy**: chapters of a life (reorderable), Claude-suggested interview questions per chapter that build on what's already been told, answers as text, photos, or **voice and video recorded in the browser**, and **sealed letters** that open on a date or when the page becomes a memorial (family only, never public). A **legacy contact** turns the page into a memorial; the Living Legacy plan becomes a Tribute with 2 years included. The public page shows a timeline of chapters.
- **Big videos**: files over 25 MB upload in 8 MB chunks, each retried on bad signal, then combined in Cloud Storage (up to 200 MB). Guests can record voice and video messages on paid pages.
- **Link previews**: `/m/**` is served by a small `share` function that adds Open Graph tags (name, years, intro) and a 1200×630 share image built from the cover photo. Links pasted into Facebook, WhatsApp or iMessage show the person, not a generic card. Private pages show nothing.
- **Succession**: if the owner hasn't signed in for 90 days, an admin can ask to take over. The owner is emailed, has 14 days to say no, and signing in at all cancels it.
- **Anniversary emails** to admins each year on the date they died, inviting more memories.
- **FAQ, privacy and terms pages.** The privacy and terms text is a draft for legal review before launch.

## Architecture

Same stack as LazyAlbum and DigiStayBook: Firebase Hosting, Cloud Functions (2nd gen, Node 22), Firestore, Storage, React 19 and Vite.

| Piece | Code |
|---|---|
| Web app (React, small router) | `src/web` |
| Shared types, pricing, plans, roles | `src/shared` |
| API: one Hono function `api` behind the `/api/**` Hosting rewrite | `functions/src/index.ts`, `functions/src/routes/*` |
| Sign-in (email magic link, `__session` cookie) | `functions/src/auth.ts` |
| Screening | `functions/src/screening.ts` |
| Media processing | `functions/src/media.ts` |
| Emails and outbox digests | `functions/src/email.ts`, `functions/src/notify.ts` |
| Daily jobs (renewals, day-before, recap) | `functions/src/jobs.ts` |
| Stripe | `functions/src/payments.ts` |
| Writing help and interview questions (Claude Opus 5.5, server-side refusal fallback) | `functions/src/ai.ts`, `functions/src/routes/legacy.ts` |
| Chunked uploads | `functions/src/routes/uploads.ts` |
| Link previews | `functions/src/share.ts` |

Firestore and Storage rules deny all browser access. Every read and write goes through the API, which checks the caller's role on that memorial.

## Run it locally

Use Node 22 (the patch version is in `.node-version`) and a Java 21 JDK for the Firebase emulators. On Windows, install the pinned Node version and a Java 21 JDK, then reopen PowerShell. Verify that `node --version` matches `.node-version` and `java -version` reports 21. If PowerShell blocks the npm wrapper, use `npm.cmd` in place of `npm` in the commands below.

From the repository root, install dependencies from both lockfiles.

```sh
npm ci
npm ci --prefix functions
```

```sh
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the Functions emulator. The emulator scripts target `demo-lifeguestbook` and create ignored local settings on first run. `npm run setup:emulators` prepares the same settings for a manual emulator start after `npm run build`. The defaults use dummy provider secrets and disable cloud screening. Set `APP_ORIGIN` in `functions/.env.local` if you serve Vite at a different origin.

Sign-in and invitation links appear on screen or in the emulator-only `/api/dev/emails` inbox. With the dummy Stripe keys, upgrades apply instantly at no charge. Type `[review]` or `[safety]` in a memory to simulate screening flags. `POST /api/dev/run-jobs` runs the digest and daily jobs immediately.

Run the same baseline commands as CI. Stop the dev emulators before running the smoke test so its emulator ports are available.

```sh
npm run typecheck
npm test
npm run build
npm run test:smoke
```

The smoke test exercises sign-in, creation, invites, guest uploads, screening, approval, reports, upgrades, slideshow, ownership transfer, digests and downloads on the emulators.

## Going live

Follow **[docs/go-live-runbook.md](docs/go-live-runbook.md)**: pre-flight, secret-name checks, GoDaddy DNS cutover (keeping the Resend records), switching `APP_ORIGIN` to `https://lifeguestbook.com`, deploy, verification, rollback, Google sign-in settings, and data safety (backups, Firestore TTL, Storage lifecycle).

After any deploy, run the read-only checks against the live site:

```sh
npm run check:deploy -- https://lifeguestbook.com
```

Provider setup the runbook assumes is already done:

- **Firebase**: project `lifeguestbook-cbert` (in `.firebaserc`) on the Blaze plan with Firestore, Storage, and the Cloud Vision and Natural Language APIs enabled. Deploy settings live in `functions/.env.lifeguestbook-cbert` (copy `functions/.env.example`).
- **Secrets** (`npx firebase functions:secrets:set NAME`): `RESEND_API_KEY` (domain `lifeguestbook.com` verified in Resend), `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (webhook `https://lifeguestbook.com/api/stripe/webhook` with `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`), `ANTHROPIC_API_KEY` (writing help; requests use `claude-opus-5-5` with `fallbacks: "default"`). Set a secret to `none` to keep that feature off.

## Next up

- Sentry and GA4 wiring (same pattern as LazyAlbum), and the help chat bubble.
- A funeral-director partner portal (bulk credits, co-branded QR cards).
- A print-on-demand memory book integration (the printable PDF works today).
- Legal review of the privacy and terms drafts for the UK, Australia and the US.
