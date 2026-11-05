# Life Guestbook: product and build plan

lifeguestbook.com. Draft v1, 5 November 2026.

Life Guestbook is one shared, permanent place for a person's life story. Family and friends build it together, before or after the person passes. One link or QR code collects photos and memories from everyone, including people who can't attend the service. On the day, the same page runs the guestbook and live slideshow. It is always co-managed by several admins, so it is never locked to one person's email.

---

## 1. Scope

| Module (from the product summary) | In v1? | Notes |
|---|---|---|
| Sitewide multi-admin and delegation | **Yes, core** | Every page has an owner plus co-admins from day one. This is the main thing that sets us apart from competitors. |
| Social crowdsourcing and remote outreach | **Yes, launch** | One share link, Facebook/WhatsApp-ready previews, and pre-service curation. |
| Day-of guestbook and live slideshow | **Yes, launch** | QR code, no app and no account for guests, a live wall and fast moderation from a phone. Reuses Lazy Album directly. |
| Living Legacy (before passing) | **Phase 4** | Same page in "living" mode, plus a timeline and succession. The page converts to a memorial later. |
| Community and heritage groups | **Not planned** | Dropped. The data model (albums and tags) won't rule it out if we change our minds. |

Beachhead: **families arranging a funeral or celebration of life in the next 1–3 weeks.** These buyers are urgent and emotionally motivated, and they share widely, which gives free marketing. Living Legacy comes next, because the same families come back to set one up for an aging parent.

---

## 2. Market and pricing

### Competitors (checked 5 Nov 2026)

| Product | Model | Price | What it does well | Gap we exploit |
|---|---|---|---|---|
| [Kudoboard](https://www.kudoboard.com/online-memorial/) | Free (10 posts) / one-off | **US$99** | Multiple admins, preview before posting, slideshow, print book | Board format, not a life story. No QR on the day. US-centric. |
| [Keeper](https://www.mykeeper.com/en-GB/pricing) | Free (1 page, 5 items) / one-off | **US$99**, Concierge **US$350** | Unlimited media, QR plaques, family tree, AI obituary | Single owner. Free tier is very thin. |
| [Memories.net](https://memories.net/pricing) | One-off + yearly hosting | **US$99** + **US$12/yr** | Video tribute, order of service, memory book | Built around tools rather than crowdsourcing. |
| [GatheringUs](https://www.gatheringus.com/pages/how-it-works?c=973) | Free pages, paid virtual events | Free + 2.9% on donations | Fundraising and virtual services | Weak on the day itself and on moderation. |
| [Honorpix](https://honorpix.com/pricing/) | Tiers by guest count | One-off; access expires after 6–24 months | Live slideshow, QR, video guestbook | **Galleries expire.** No multi-admin. |
| [Memora](https://memora.com.au/#tribute) (AU) | — | Site blocked our fetch; pricing to confirm manually | AU tribute | — |
| UK crematoria (Obitus) | Per service | £55–£165 for a 25-photo slideshow | On site at the service | Fixed 25 photos, no crowdsourcing, gone afterwards. |

Takeaways:
- **US$99 one-off is the market anchor.** Every serious competitor sits there.
- Families pay a crematorium **£55+ for a 25-photo slideshow**. A live slideshow with unlimited crowdsourced photos at a lower price is an easy story to tell.
- Expiring galleries (Honorpix) and single-owner accounts (most of the rest) are the weaknesses to attack in marketing: "never expires, never locked to one email".

### Recommended pricing: free, then a one-off upgrade, then low yearly hosting

As you suggested. Prices are per memorial and use Lazy Album's multi-currency approach: `src/shared/pricing.ts`, Stripe Adaptive Pricing, and currency picked from time zone.

| | **Free** | **Tribute** (one-off) | **Keep it open** (yearly, after year 2) | **Forever** (one-off, optional) |
|---|---|---|---|---|
| Price | £0 | **£39 / A$79 / US$49 / NZ$85 / €45 / CA$65** | **£12 / A$24 / US$15 per year** | **£99 / A$195 / US$119** |
| Contributions | 30 photos and messages | Unlimited | Unlimited | Unlimited |
| Guests add | Photos, written messages | Also video, voice and video messages | Same | Same |
| Co-admins | 2 | Unlimited | Unlimited | Unlimited |
| Approve before showing, AI screening | Yes | Yes | Yes | Yes |
| QR cards and posters to print | Yes | Yes | Yes | Yes |
| Live slideshow on the day | — | Yes | Yes | Yes |
| Full download (ZIP) | Yes | Yes | Yes | Yes |
| "Made with Life Guestbook" footer | Yes | No | No | No |
| Hosting | Forever (it's small) | **2 years included** | Renews yearly | Lifetime, no renewals |

**Rule that protects trust: we never delete a memorial for non-payment.** If yearly hosting lapses, the page **freezes**. It stays online and downloadable, but new contributions, video playback and the slideshow switch off until someone renews. Any admin, not just the original buyer, can renew, so a cousin can pick up the bill years later. This is the selling point against Honorpix's expiring galleries.

Why these numbers:
- £39/US$49 undercuts the US$99 anchor by half. It sits next to the £55 crematorium slideshow as "the whole thing for less than the slideshow".
- Yearly renewal starts in year 3. That is long after the funeral, so it never feels like a charge during grief. It also gives recurring revenue from families who keep adding to the page.
- Forever at £99 suits buyers who just want it settled, and it brings cash forward.
- Cost check: a typical memorial is about 300 photos (~0.6 GB with display copies) plus about 20 short videos (~0.5 GB). Storage is roughly US$0.35/yr and AI screening about US$0.50 one-off, so margins stay healthy even on Forever. Guest videos are capped at 2 minutes and 200 MB.

**Living Legacy pricing (Phase 4):** **£29 / A$59 / US$35 per year** while the person is alive. When the page converts to a memorial, the Tribute features and 2 years of hosting are included, with no second purchase.

**Later: funeral directors (B2B).** Packs of memorial credits at about 50% wholesale, so directors can include the QR code in their package, plus co-branded QR cards. This is likely the strongest long-term channel, as it was with DigiStayBook's B2B approach. It doesn't block launch.

> Before launch, decide whether Free pages should also freeze after a while (e.g. 12 months without activity), and whether the yearly price should rise with storage used. My default is no to both.

---

## 3. Product: how it works

### Roles (sitewide, the same on every page)

| Role | Can do |
|---|---|
| **Owner** (1) | Everything, including billing, transferring ownership and deleting the page. |
| **Admin** | Everything except deleting the page or removing the owner. Can invite admins and moderators, change settings and pay or renew. |
| **Moderator** | Approve, hide or edit contributions and run the slideshow. Suits venue staff or a celebrant on the day. |
| **Trusted contributor** | Their posts skip the approval queue (close family). |
| Guest (no account) | Add contributions from the link or QR code, and view the page if it's public or link-only. |

**Succession and contingency**
- Setup asks for at least one co-admin straight away, and the dashboard nudges until there are two.
- **Ownership transfer**: the owner nominates, the new owner accepts by email, and the change happens.
- **Inactive-owner recovery**: if the owner hasn't signed in for 90 days, an admin can request ownership. The owner gets 14 days of emails to object, then ownership moves. A support-assisted route covers pages with no admins left.
- Living Legacy adds a **legacy contact**: the person who marks the page "in memory" when the time comes.
- Every admin action goes in an **audit log**: who approved, hid or edited what, and when.

### Main screens

1. **Create** (about 2 minutes): name, dates, cover photo, short intro, invite co-admins, choose privacy (public, link-only or private) and moderation (approve everything / screen automatically / trusted only).
2. **Memorial page** `/m/:slug`: hero, life story, gallery (filter by decade or chapter), messages, service details (time, place, livestream link) and an "Add a memory" button.
3. **Add a memory** `/m/:slug/add`: guests enter their name and how they knew the person (school, work, family, neighbour…), then photos/video/voice/text, an optional year or decade, and an optional email for "tell me when it's approved". No account or app needed. Built on Lazy Album's guest page.
4. **Dashboard** `/dashboard/:id`: review queue (swipe to approve or hide on a phone), contributions, people and roles, share kit, day-of tools, billing, download.
5. **Share kit**: copy-ready posts for Facebook, WhatsApp and email with Open Graph preview images, plus printable QR cards, A4 posters and order-of-service inserts (from Lazy Album's print page).
6. **Live slideshow** `/wall/:id?k=…`: full screen and approved items only. Admins and moderators can pin, skip, pause or remove from a phone in real time. Built on Lazy Album's wall.
7. **Living Legacy timeline** (Phase 4): chapters (childhood, school, work, family…), the person's own stories, recordings and "letters to be opened later".

### Moderation (DigiStayBook's pipeline, simplified for families)

1. Guest submits. Files go to a **quarantine** path in Storage, and the contribution is `pending`.
2. **Automated screening** (from DigiStayBook `screening.ts` / `visionScreening.ts`): Google Vision SafeSearch on images and Natural Language moderation on text. A `clear` result plus an "auto" moderation setting publishes straight away. Anything flagged is held for an admin, and `critical` results are hidden and escalated to us. Nothing is ever auto-deleted.
3. **Admin review**: approve, hide, edit text (fix typos, remove a surname) or reject. One tap from the email or the phone queue.
4. **Report button** on every public item, with DigiStayBook's `decideReport` rate limits and circuit breaker. A report hides the item pending review.
5. Image processing with `sharp` (from DigiStayBook): strip EXIF/GPS, make display and thumbnail sizes, convert HEIC (Lazy Album's `heic-to` on the client).
6. Abuse controls: per-IP and per-memorial rate limits (Lazy Album `limits.ts`), plus App Check on guest endpoints (DigiStayBook).

### Email notifications (Resend)

Uses Lazy Album's `email.ts` (templates, unsubscribe) and DigiStayBook's **notification outbox and digest worker** (`hostNotifications.ts`). That pattern stops 200 guests creating 200 emails.

| Email | To | When |
|---|---|---|
| Welcome and "your page is ready" (link, QR, share kit) | Creator | On create |
| You've been invited as an admin/moderator | Invitee | On invite (signed magic link) |
| New memories to review (digest) | Admins with notifications on | Hourly while pending; instant mode on the day of the service |
| Your memory was approved / is now on the page | Guest who left an email | On approval |
| Daily "new memories added" | Subscribed family and friends (Kudoboard-style) | Daily digest, opt-in |
| Service reminder and day-of checklist (slideshow link, QR, moderator tips) | Admins | Day before the service |
| Recap ("142 memories from 61 people") + download link | Admins | Day after the service |
| Ownership transfer / recovery request / objection window | Owner and admins | On those events |
| Receipt and upgrade confirmation | Payer | Stripe webhook |
| Hosting renewal: 30 days, 7 days, lapsed (frozen, not deleted) | All admins | Scheduled |
| Anniversary ("a year ago today…", invites new memories) | Admins and subscribers, opt-in | Yearly; also drives renewals |
| Auth: sign-in link, verify, reset | User | Branded Resend links (DigiStayBook `authEmails.ts`) |

Every non-essential email has a one-click unsubscribe and per-person preferences.

---

## 4. Architecture: the best of each existing app

Same stack as Lazy Album and DigiStayBook: **Firebase (Hosting, Cloud Functions 2nd gen, Firestore, Storage, Auth, App Check) + React 19 + Vite 8 + TypeScript, with Stripe, Resend, Sentry and GA4.** Node 22.

| Concern | Choice | Taken from | Why |
|---|---|---|---|
| Frontend | React 19 + Vite, prerendered marketing pages | Both | Same stack. Prerendering for SEO, as both apps do. |
| API | **One Hono `api` function behind a `/api/**` Hosting rewrite**; Firestore rules `deny all` | Lazy Album | One place to enforce roles. Multi-admin permissions are much easier to get right on the server than in rules. |
| Background work | Separate scheduled and trigger functions: outbox digest, screening retry, image processing, renewals | DigiStayBook | Keeps slow jobs off the request path. |
| Auth (admins) | **Firebase Auth**: email link + Google, with App Check | DigiStayBook | Lazy Album built its own OAuth only to get Drive refresh tokens. We don't need those, so we use the managed option. |
| Auth (guests) | No account: a signed guest-session cookie and rate limits | Lazy Album | Friction-free guest access. |
| File storage | **Firebase Storage**, direct upload via signed URLs to a quarantine path, then processing | DigiStayBook + Lazy Album upload flow | Permanent and independent of any one person's Google account. Chunked or resumable upload UX from Lazy Album. |
| Image processing | `sharp` in Functions; `heic-to` on the client | DigiStayBook / Lazy Album | |
| Moderation | Vision SafeSearch + NL moderation, screening budget, reports | DigiStayBook | Already built and tuned. Drop the property and booking parts. |
| Email | Resend + outbox/digest | Both | As above. |
| Payments | Stripe Checkout one-off with adaptive pricing; Stripe subscription for yearly hosting and Living Legacy | Lazy Album (`payments.ts`) + DigiStayBook (`stripeBilling.ts`) | Lazy Album has one-offs; DigiStayBook has subscription lifecycle logic. |
| Validation | `zod` on shared types | DigiStayBook | |
| Help chat | Claude help bubble + contact form | Both | |
| Monitoring | Sentry with `kind` / `area` error classification | Lazy Album | |
| Analytics | GA4: `memorial_created`, `contribution_added`, `begin_checkout`, `purchase` | Lazy Album | |
| Local dev | Emulators + seeded demo data + `/__test` walkthrough page | DigiStayBook (`tools/local-test.mjs`) | Best local dev experience of the two. |
| Tests | Vitest unit + emulator integration tests + customer-tester agent | DigiStayBook + Lazy Album | |
| Retention and deletion | Data-class retention, deletion worker, content-free audit trail | DigiStayBook (`retention.ts`, `storageDeletion.ts`) | Families will ask us to delete things. |

> **DigiGuestbook** is on GitLab and isn't reachable from this session (a public search found nothing, so it's probably private). Once it's shared (a public mirror, a GitHub copy, or the files) I'll fold any better patterns into this table before we build.

### Data model (Firestore)

```
users/{uid}                      email, name, emailPrefs
memorials/{id}                   slug, mode: living|memorial, subject{name, born, died, photo},
                                 story, privacy, moderationMode, plan{tier, hostingUntil, frozen},
                                 serviceEvents[], counts{pending, approved}, ownerId
memorials/{id}/members/{uid}     role: owner|admin|moderator|trusted, invitedBy, addedAt
memorials/{id}/invites/{token}   email, role, expiresAt
memorials/{id}/contributions/{c} type: photo|video|voice|text, media[], text, author{name, relation, email?},
                                 era/year, chapter?, status: pending|approved|hidden|rejected,
                                 screening{outcome, categories}, source: online|event, createdAt
memorials/{id}/chapters/{c}      (Living Legacy) title, order, era
memorials/{id}/reports/{r}       contributionId, reason, reporterHash
memorials/{id}/audit/{a}         actor, action, target, at
walls/{key}                      memorialId (hashed slideshow keys)
notificationOutbox/{n}           kind, memorialId, recipients, status
payments/{p}, subscriptions/{s}  Stripe mirrors
```

Storage: `quarantine/{memorialId}/{uploadId}` → `media/{memorialId}/{contributionId}/{original|display|thumb}`. All reads go through signed or short-lived URLs from the API. Private pages never have public objects.

---

## 5. Build phases

Each phase is a set of small pull requests, as in DigiStayBook.

**Phase 0: Foundations (week 1)**
Repo scaffold (React/Vite/Hono/Firebase), emulators and seed data, CI (typecheck, test, build), Sentry, Resend wiring, design system and brand (calm and warm, not funereal).

**Phase 1: Memorial page, multi-admin, crowdsourcing (weeks 2–4)**
Create flow, memorial page, guest "add a memory" with uploads, roles and invites, review queue, screening pipeline, reports, outbox emails (welcome, invite, digest, approved), share kit with OG images, download ZIP, audit log.

**Phase 2: Day of the service (weeks 5–6)**
QR cards and posters, live slideshow with phone remote control, instant notification mode, day-before and recap emails, load test (customer-tester agent: 150 guests uploading at once).

**Phase 3: Payments and launch (weeks 7–8)**
Free/Tribute limits, Stripe one-off + Forever, hosting clock + yearly renewal subscription, freeze-on-lapse, renewal emails, legal pages (privacy, terms, content policy), marketing site and SEO pages ("funeral guestbook", "celebration of life slideshow", "online memorial UK/AU"), GA4, go-live checklist.

**Phase 4: Living Legacy (weeks 9–12)**
Living mode, timeline chapters, self-recorded stories (voice and video), legacy contact, convert to memorial, ownership transfer and inactive-owner recovery, anniversary emails, yearly plan.

**Later**: printed memory book (print-on-demand), funeral director partner portal and credits, virtual service and livestream embed, family tree, AI-assisted life story and eulogy draft from contributions (Claude).

---

## 6. Decisions needed from you

1. **DigiGuestbook access**: it's on GitLab. A public link, a GitHub mirror or an export would let me compare it.
2. Pricing numbers above: happy with £39 one-off / 2 years included / £12 a year / £99 forever?
3. Launch markets: UK + AU first (where your pricing and timezone setup already sit), or US as well?
4. Firebase project: a new project `lifeguestbook-cbert`, a separate Stripe account and the Resend domain `lifeguestbook.com`. Shall I set up the scaffold to expect these?
5. Default privacy for new memorials: **link-only** (my recommendation) or public and indexable?
