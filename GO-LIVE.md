# LifeGuestbook: going live with payments

The code side is done: checkout, webhooks (all 5 events), renewals and cancellations are built and tested.
Prices are set in code (`src/shared/pricing.ts`), so you don't create any products in Stripe.
What's left needs your accounts. Do the steps in order; each takes a few minutes.

Run commands in **Git Bash** from `C:\Users\clbbe\Documents\Projects\LifeGuestbook\source`.

---

## 1. Stripe account (Stripe Dashboard)

1. Sign in at dashboard.stripe.com. Use the account switcher (top left) to **create a new account called LifeGuestbook**.
   Don't reuse LeaversBook: payouts, statement descriptor and receipts should say LifeGuestbook.
2. **Activate payments**: Settings → Business → fill in business details, identity, and the bank account for payouts.
   Set the statement descriptor to `LIFEGUESTBOOK` and the support email to `hello@lifeguestbook.com`.
3. Settings → Payments → **Adaptive Pricing: on** (lets visitors outside GBP/AUD/USD/NZD/EUR/CAD see local prices).
4. Settings → Customer emails → turn on **successful payment** receipts.

## 2. Sandbox test on staging (do this before live)

1. In the LifeGuestbook account, switch to **Test mode / sandbox** → Developers → API keys → reveal and copy the **Secret key** (`sk_test_...`).
2. Run:
   ```bash
   bash scripts/stripe-setup.sh test
   ```
   Paste the key when asked (it won't show). The script confirms the account name, creates the webhook,
   saves both secrets to Firebase and redeploys. It ends with "Payments are ON".
3. On https://lifeguestbook-cbert.web.app sign in, create a page, go to its Plan tab and buy **Tribute**
   with card `4242 4242 4242 4242`, any future date, any CVC. The page should show the upgrade straight away.
4. Also try **Living Legacy (yearly)** to check subscriptions.

## 3. Point lifeguestbook.com at Firebase (GoDaddy)

1. Firebase console → project **lifeguestbook-cbert** (signed in as codebertcreations@gmail.com) → Hosting →
   lifeguestbook.com → note the **A record IP** it asks for (normally `199.36.158.100`) and any TXT record.
2. GoDaddy → My Products → lifeguestbook.com → DNS:
   - **Write down the current A records first** (13.248.243.5 and 76.223.105.230) so you can roll back.
   - Delete those two A records for `@`, add one A record `@` → the Firebase IP.
   - `www` → CNAME → `lifeguestbook-cbert.web.app`.
   - Leave the Resend records (SPF, DKIM, DMARC) and any MX records alone.
   - If GoDaddy "Website Builder" or domain forwarding is on, turn it off.
3. Firebase console → Authentication → Settings → **Authorized domains** → add `lifeguestbook.com` and `www.lifeguestbook.com`
   (without this, "Sign in with Google" fails on the real domain).
4. Wait until https://lifeguestbook.com/api/health shows `{"ok":true}` (minutes to a few hours).

## 4. Switch on live payments

1. Stripe Dashboard → switch **out of** test mode → Developers → API keys → copy the live **Secret key** (`sk_live_...`).
2. Run:
   ```bash
   bash scripts/stripe-setup.sh live
   ```
   It refuses to run until step 3 is finished and the Stripe account is activated. It then creates the live webhook
   at `https://lifeguestbook.com/api/stripe/webhook`, saves the live secrets, switches the app's origin to
   https://lifeguestbook.com and deploys the site and API.
3. **Real purchase check**: on https://lifeguestbook.com buy Tribute with your own card, check the page upgrades and
   the receipt email arrives, then refund it in the Stripe Dashboard.

## 5. Other things only you can do

- **Google Cloud budget alert** on the Blaze project, and confirm the billing card is valid.
- **Support inbox**: make sure hello@lifeguestbook.com receives mail.
- **Legal**: the privacy and terms pages still say "Draft for legal review". Selling to the public, you should have these
  checked (UK/AU/US), and register with the ICO if you're UK-based.
- **AI writing help** (optional): set a real `ANTHROPIC_API_KEY` secret, or it keeps using sample text.
- **Real phones**: on an iPhone and an Android phone, add a memory with a photo, voice note and video.

## Rollback

- Payments off: `npx firebase functions:secrets:set STRIPE_SECRET_KEY --project lifeguestbook-cbert --account codebertcreations@gmail.com`
  and enter `none`, then `npx firebase deploy --only functions --project lifeguestbook-cbert --account codebertcreations@gmail.com`.
- Domain: put the two GoDaddy A records from step 3 back.
