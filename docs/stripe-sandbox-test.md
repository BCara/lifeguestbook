# Stripe sandbox test plan

A step-by-step run-through of every payment path, in Stripe **test mode** only. It takes about an hour.
Nothing here needs a live key, and no real money moves. Tick each box as you go.

> **Never** put a live key (`sk_live_…`) in `functions/.secret.local` or a staging secret. The code refuses
> test keys on lifeguestbook.com and live keys everywhere else, so a mix-up shows "Paid upgrades are
> temporarily unavailable" instead of charging anyone.

## 0. What you need

- A Stripe account with a **sandbox** (Dashboard → top-left account menu → *Sandboxes* → create one, e.g. "LifeGuestbook test").
- The sandbox's secret key: Dashboard → *Developers* → *API keys* → **Secret key** (`sk_test_…`).
- The [Stripe CLI](https://docs.stripe.com/stripe-cli), logged in to the sandbox:

  ```bash
  stripe login
  ```

- This repo installed (`npm ci && npm ci --prefix functions`) and Node 22.

## 1. Point the local stack at the sandbox

1. Start forwarding webhooks to the local dev server (Vite proxies `/api` to the Functions emulator).
   Leave this running in its own terminal:

   ```bash
   stripe listen --forward-to http://localhost:5173/api/stripe/webhook
   ```

   It prints `Ready! Your webhook signing secret is whsec_…`. Copy that value.
2. Edit `functions/.secret.local` (created by `npm run setup:emulators`) so it contains:

   ```
   STRIPE_SECRET_KEY=sk_test_…        # the sandbox secret key
   STRIPE_WEBHOOK_SECRET=whsec_…      # from stripe listen
   ```

   Make sure `functions/.env.local` has `FREE_LAUNCH=false` (or no `FREE_LAUNCH` line).
3. Start everything:

   ```bash
   npm run dev
   ```

4. Open http://localhost:5173, sign in (the dev sign-in link is shown on screen), create a **memorial**
   page and a **Living Legacy** page. Keep the Emulator UI (http://localhost:4000 → Firestore) open in a tab:
   you will look at `memorials/{id}`, `payments/{id}`, `checkoutAttempts/{id}` and `memorials/{id}/audit`.

The emulator project is `demo-…`, so the code expects a `sk_test_` key. If the Plan tab still says
upgrades are unavailable, the key or webhook secret is malformed: check for spaces or quotes.

### Test cards

Use any future expiry date, any CVC and any postcode.

| Card number | Behaviour |
| --- | --- |
| `4242 4242 4242 4242` | Succeeds |
| `4000 0025 0000 3155` | Asks for 3-D Secure, then succeeds once you approve it |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0341` | Can be saved, but every later charge fails (use for failed renewals) |
| `4000 0000 0000 0259` | Succeeds, then opens a dispute |

## 2. Checks

For each step, the **expected** lines are what to verify.

### 2.1 Free launch (no keys)

- [ ] Stop `npm run dev`, set `STRIPE_SECRET_KEY=none` in `functions/.secret.local`, start again.
- [ ] Plan tab shows **"Free while we launch"** with the free-plan limits and no price cards.
- [ ] Day-of tab's slideshow card says the upgrade isn't on sale yet (no "Upgrade on the Plan tab").
- [ ] In the browser console: `fetch("/api/payments/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memorialId:"<id>",product:"tribute"})}).then(r=>r.status)` → **503**, body `code: "free_launch"`.
- [ ] Add 30 memories: the 31st is refused (free limits still apply).
- [ ] Repeat with a valid `sk_test_` key **and** `FREE_LAUNCH=true` in `functions/.env.local`: same result.
- [ ] Put the sandbox key back and remove `FREE_LAUNCH` before continuing.

> On the Emulator only, `STRIPE_SECRET_KEY=none` *without* `FREE_LAUNCH=true` gives free instant
> "test" upgrades (the smoke test relies on this). Deployed projects never do.

### 2.2 One-off purchase: Tribute

- [ ] On the memorial page → Plan → **Upgrade** (Tribute). You land on Stripe Checkout in your currency.
- [ ] Pay with `4242…`. You return to the dashboard and the plan reads **Tribute, hosting paid until** (today + 2 years).
- [ ] `stripe listen` shows `checkout.session.completed` → `200`.
- [ ] Firestore: one `payments/cs_test_…` doc; one `audit` entry `purchase`; one receipt in the guestbook email outbox; `checkoutAttempts/{id}` is **gone**.

### 2.3 Declined card and 3-D Secure

- [ ] On a fresh memorial page, Upgrade → pay with `4000 0000 0000 9995`: Checkout shows the decline, nothing changes on the page.
- [ ] Same Checkout, now `4000 0025 0000 3155`, approve the 3DS challenge: Tribute applied as in 2.2.
- [ ] Start Checkout again on another page and press the back arrow on Checkout: you return to the Plan tab; clicking Upgrade again re-opens the same session (no duplicate).

### 2.4 Duplicate delivery (idempotency)

- [ ] Find the `checkout.session.completed` event id from 2.2 (`stripe listen` output or Dashboard → *Workbench* → *Events*).
- [ ] Resend it:

  ```bash
  stripe events resend evt_…
  ```

- [ ] Webhook answers `200`; **no** second `payments` doc, audit entry or receipt; `hostingUntil` unchanged.
- [ ] The return redirect (`/payments/confirm`) and the webhook both ran for 2.2 and only one purchase was recorded.

### 2.5 Subscription: Living Legacy

- [ ] On the Living Legacy page → Plan → **Start**. Pay with `4242…`.
- [ ] Plan reads **Living Legacy**, paid until today + 1 year, "Your subscription renews automatically each year."
- [ ] `memorials/{id}` has `stripeSubscriptionId`, `stripeCustomerId`, `stripeSubscriptionCancelled: false`.
- [ ] The subscription's first `invoice.paid` (billing reason `subscription_create`) did **not** add a second year.

### 2.6 Cancel renewal (user)

- [ ] Plan → **Cancel automatic renewal** → confirm.
- [ ] Stripe Dashboard → the subscription shows "Cancels on …". Plan tab says renewal is cancelled, features stay.
- [ ] `customer.subscription.updated` → `200`.
- [ ] In the Dashboard, click **Don't cancel** on that subscription: after the `customer.subscription.updated` event the Plan tab shows the renewal as active again.

### 2.7 Cancel in the Dashboard (immediately)

- [ ] On a second Living Legacy page with an active subscription, Dashboard → subscription → **Cancel immediately**.
- [ ] `customer.subscription.deleted` → `200`; page shows renewal cancelled; **plan and hostingUntil unchanged** (the page freezes only when that date passes; it is never deleted).

### 2.8 Living Legacy → Tribute conversion

- [ ] On a Living Legacy page with an active subscription: Manage → **Turn this into a memorial page…**, enter a date, confirm.
- [ ] Dashboard: the subscription is **cancelled immediately**, with no proration and no new invoice.
- [ ] Plan reads **Tribute**, paid until today + 2 years. `customer.subscription.deleted` → `200`.
- [ ] Race check: start a Living Legacy Checkout in one tab, convert the page in another, then pay. Expected: the new subscription is cancelled at once, the page gets Tribute (2 years), and no renewals follow.

### 2.9 Forever

- [ ] On a Tribute or Living Legacy page with a subscription, Plan → **Choose Forever**, pay with `4242…`.
- [ ] Plan reads **Forever**; the old subscription is cancelled immediately in the Dashboard; no renewal options remain.

### 2.10 Renewal (yearly) with a test clock

Checkout can't attach to a test clock, so create a matching subscription with the CLI and link it to a page.
Replace `<memorialId>` and `<uid>` (Firestore → `users`, the doc id of the page owner).

```bash
stripe test_helpers test_clocks create -d frozen_time=$(date +%s) -d name="renewal"
```

```bash
stripe customers create -d test_clock=clock_… -d email=renewal@example.test -d payment_method=pm_card_visa -d "invoice_settings[default_payment_method]=pm_card_visa"
```

```bash
stripe prices create -d currency=gbp -d unit_amount=1200 -d "recurring[interval]=year" -d "product_data[name]=Keep it open (sandbox)"
```

```bash
stripe subscriptions create -d customer=cus_… -d "items[0][price]=price_…" -d "metadata[memorialId]=<memorialId>" -d "metadata[product]=hosting" -d "metadata[uid]=<uid>"
```

- [ ] In the Emulator UI, on `memorials/<memorialId>` set `plan` to `{ tier: "tribute", hostingUntil: <now + 1 year, ms> }`, `stripeSubscriptionId: "sub_…"`, `stripeSubscriptionCancelled: false`.
- [ ] Advance the clock past the first year:

  ```bash
  stripe test_helpers test_clocks advance clock_… -d frozen_time=$(( $(date +%s) + 366*86400 ))
  ```

- [ ] `invoice.paid` (billing reason `subscription_cycle`) → `200`; `hostingUntil` equals the **new period end** (not "old + 1 year" stacked); one `payments/in_…` doc; audit entry `renewal`.
- [ ] Resend that `invoice.paid` event: nothing changes.

### 2.11 Failed renewal and lapse

- [ ] On the clock's customer, set the default card to one that fails:

  ```bash
  stripe customers update cus_… -d payment_method=pm_card_chargeCustomerFail -d "invoice_settings[default_payment_method]=pm_card_chargeCustomerFail"
  ```

  (If the CLI refuses, attach `pm_card_chargeCustomerFail` first with `stripe payment_methods attach pm_card_chargeCustomerFail -d customer=cus_…`.)
- [ ] Advance the clock another year. `invoice.payment_failed` → `200`.
- [ ] Plan tab shows **"Renewal payment didn't go through"** with a **Pay with another card** link (Stripe-hosted invoice). `plan` is unchanged.
- [ ] Advance the clock ~4 weeks so Smart Retries are exhausted. With the recommended setting ("cancel the subscription"), `customer.subscription.deleted` arrives: the failed-renewal notice clears and renewal shows as cancelled.
- [ ] Set `hostingUntil` in the past (or wait for it). The page is **frozen**: still online and downloadable, no new memories, slideshow off, and a **Keep it open** renew card appears. Nothing was deleted.
- [ ] Renew via **Keep it open** with `4242…`: the page unfreezes with a year of hosting from today.
- [ ] Optional: run the daily jobs (`curl -X POST "http://localhost:5173/api/dev/run-jobs?now=<ms>"`) to see the 30-day, 7-day and lapsed reminder emails at `/api/dev/emails`.

### 2.12 Refund

- [ ] Dashboard → *Payments* → the Tribute payment from 2.2 → **Refund** (full).
- [ ] The page **keeps** its plan. Refunds are a manual decision: if the page should lose the upgrade, set its `plan` back by hand in Firestore (or ask a developer). This is deliberate so a partial or goodwill refund never strips a family's page.
- [ ] The webhook endpoint isn't subscribed to `charge.refunded`; if it were, it would answer `200` and do nothing.

### 2.13 Signature checks

- [ ] Forged request:

  ```bash
  curl -i -X POST http://localhost:5173/api/stripe/webhook -H "stripe-signature: t=1,v1=forged" -d '{}'
  ```

  → **400 bad signature**, nothing written.
- [ ] Stop `stripe listen`, restart it (it keeps the same secret per device). If you ever change the secret without updating `functions/.secret.local`, every event gets `400`; the Dashboard then retries for 3 days, so fixing the secret recovers them.

## 3. Staging (optional, deployed)

Staging (`https://lifeguestbook-cbert.web.app`) accepts **test** keys only.

1. In the sandbox: *Developers* → *Webhooks* → **Add endpoint** with the URL `https://lifeguestbook-cbert.web.app/api/stripe/webhook`, the events and API version listed in the README (Stripe step), and copy its signing secret.
2. Set `STRIPE_SECRET_KEY` (sandbox `sk_test_…`) and `STRIPE_WEBHOOK_SECRET` as Firebase secrets on the staging project and deploy.
3. Repeat 2.2–2.9. To resend events use Dashboard → *Workbench* → *Events* → **Resend**, or `stripe events resend evt_… --webhook-endpoint=we_…`.

## 4. Sign-off

Payments are ready for live keys when every box above is ticked, the Dashboard's webhook endpoint shows
no failed deliveries, and the settings in the README's Stripe step are in place on the live account.
