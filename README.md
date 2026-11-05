# Life Guestbook

lifeguestbook.com: one shared, permanent place for a person's life story. Family and friends build it together, before or after the person passes. One link or QR code collects photos and memories from everyone. On the day, a live slideshow shows them at the service. Several admins look after every page, so it's never locked to one person's email.

The product plan, competitor research and pricing are in [PLAN.md](PLAN.md).

## What's built (MVP)

- **Memorial and Living Legacy pages** (`/m/:slug`): cover photo, dates, life story, service details and livestream link, plus a gallery of memories filtered by photos, words or era. Link-only by default.
- **Add a memory** (`/m/:slug/add`): no account or app. Photos, video and voice (video and voice on paid pages), text, name, how they knew them, the era, and an optional email for "it's on the page now". QR scans are tagged as "at the service".
- **Multi-admin** with roles: owner, admin, moderator, trusted contributor. Invites by email, role changes, leaving, and owner-only delete. **Ownership transfer** needs acceptance and the old owner stays on as admin. Admins can't remove the owner. Every action goes in an audit log.
- **Moderation**: approve-first by default, or "auto" (show unless flagged). Automated screening uses Google Vision SafeSearch and Natural Language moderation (DigiStayBook pattern). Critical results are hidden and nothing is auto-deleted. A report button hides an item until it's reviewed, with rate limits. There's a review queue with approve, hide, reject, edit text and bulk-approve of clean items. Photos are rotated, stripped of EXIF/GPS, and resized with `sharp`.
- **On the day**: live slideshow (`/wall?k=…`). It shows approved items only and polls every 4 seconds, and newly approved memories jump the queue. Admins have a phone remote (pause, play, next) and can rotate the slideshow link. Printable QR table cards (4 per A4) and an A4 poster.
- **Share kit**: links, a ready-to-post message, WhatsApp, Facebook, email and native share.
- **Email (Resend)**: sign-in links, invites, page ready, **digests** through a notification outbox (hourly; every 5 minutes in "instant" mode or when something is reported), "your memory was approved", ownership transfer, receipts, renewal reminders at 30 days, 7 days and lapsed, day-before checklist and day-after recap. Unsubscribe links are signed.
- **Payments (Stripe Checkout)**: Tribute and Forever (one-off), yearly hosting and Living Legacy (subscriptions), in GBP, AUD, USD, NZD, EUR and CAD by time zone. Tribute includes 2 years. Lapsed pages **freeze, never delete**. Any admin can pay.
- **Download everything**: a ZIP of all approved media plus a text file of all the memories.

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

Firestore and Storage rules deny all browser access. Every read and write goes through the API, which checks the caller's role on that memorial.

## Run it locally

Requires Node 22+ and Java 11+ (for the emulators).

```bash
npm install --legacy-peer-deps
```

```bash
npm run dev
```

Open http://localhost:5173. Sign-in links, invitation links and every email show on screen or in the functions log; nothing is really sent. Without Stripe keys, upgrades apply instantly at no charge. Type `[review]` or `[safety]` in a memory to simulate screening flags. `POST /api/dev/run-jobs` runs the digest and daily jobs immediately.

Checks:

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run test:smoke
```

`npm test` runs the unit tests. `npm run test:smoke` is an end-to-end run on the emulators: sign-in, create, invite, guest upload, screening, approval, report, upgrade, slideshow, ownership transfer, digest and download.

## Going live (one-time setup)

1. Create the Firebase project `lifeguestbook-cbert` (already in `.firebaserc`) on the Blaze plan. Enable Firestore, Storage, and the Cloud Vision and Natural Language APIs.
2. Copy `functions/.env.example` to `functions/.env` and set `APP_ORIGIN=https://lifeguestbook.com` and `SCREENING_ENABLED=true`.
3. **Resend**: add the domain `lifeguestbook.com`, then:

   ```bash
   npx firebase functions:secrets:set RESEND_API_KEY
   ```

4. **Stripe**: create a separate account for Life Guestbook and turn on Adaptive Pricing. Add a webhook to `https://lifeguestbook.com/api/stripe/webhook` with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `invoice.paid`. Then set both secrets:

   ```bash
   npx firebase functions:secrets:set STRIPE_SECRET_KEY
   ```

   ```bash
   npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

   To keep a feature off, set its secret to `none`.
5. Deploy:

   ```bash
   npm run deploy
   ```

## Next up

See PLAN.md §5. Highest value next: resumable direct-to-Storage uploads for videos over 30 MB, OG share images per memorial, Living Legacy chapters and timeline, inactive-owner recovery, Sentry and GA4, help chat, and legal pages.
