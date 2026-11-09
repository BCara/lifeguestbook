#!/usr/bin/env bash
# Connects LifeGuestbook to Stripe in one go:
#   1. asks for your Stripe secret key (hidden input, never printed or saved to disk),
#   2. checks which Stripe account it belongs to,
#   3. creates the webhook endpoint with the five events the app handles,
#   4. stores STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as Firebase secrets,
#   5. redeploys the functions so they pick up the new secrets.
#
# Usage (Git Bash, from the repo root):
#   bash scripts/stripe-setup.sh test   # sandbox keys -> staging (lifeguestbook-cbert.web.app)
#   bash scripts/stripe-setup.sh live   # live keys    -> https://lifeguestbook.com
set -euo pipefail
# This PC sits behind a TLS-inspecting proxy; Node needs the Windows certificate store to reach Stripe and Firebase.
export NODE_OPTIONS="${NODE_OPTIONS:---use-system-ca}"

MODE="${1:-}"
PROJECT="lifeguestbook-cbert"
FIREBASE_ACCOUNT="${FIREBASE_ACCOUNT:-codebertcreations@gmail.com}"
case "$MODE" in
  test) ORIGIN="https://lifeguestbook-cbert.web.app" ;;
  live) ORIGIN="https://lifeguestbook.com" ;;
  *) echo "Usage: bash scripts/stripe-setup.sh test|live"; exit 1 ;;
esac
WEBHOOK_URL="$ORIGIN/api/stripe/webhook"
cd "$(dirname "$0")/.."
ENV_FILE="functions/.env.$PROJECT"

if [[ "$MODE" == "live" ]]; then
  # Stripe must be able to reach the webhook, so the domain has to be on Firebase first.
  if [[ "$(curl -s -m 15 "$ORIGIN/api/health" || true)" != *'"ok":true'* ]]; then
    echo "$ORIGIN/api/health does not answer from Firebase yet. Finish the GoDaddy DNS change first (see GO-LIVE.md)."
    exit 1
  fi
fi

read -rsp "Paste the LifeGuestbook Stripe secret key (sk_${MODE}_...): " STRIPE_KEY; echo
if [[ ! "$STRIPE_KEY" =~ ^sk_${MODE}_[A-Za-z0-9]+$ ]]; then
  echo "That is not an sk_${MODE}_ key. Use the standard secret key from Developers > API keys (not a restricted rk_ key)."
  exit 1
fi
export STRIPE_KEY WEBHOOK_URL

# Small Stripe API helper in Node, so the key travels in an env var rather than on a command line.
stripe_api() { node --input-type=module -e "$1"; }

ACCOUNT_LINE=$(stripe_api '
  const r = await fetch("https://api.stripe.com/v1/account", { headers: { Authorization: `Bearer ${process.env.STRIPE_KEY}` } });
  const a = await r.json();
  if (!r.ok) { console.log("ERROR " + (a.error?.message ?? r.status)); process.exit(0); }
  const name = a.settings?.dashboard?.display_name || a.business_profile?.name || "(no name set)";
  console.log(`${name} | ${a.id} | ${a.country ?? "?"} | charges_enabled=${a.charges_enabled}`);
')
if [[ "$ACCOUNT_LINE" == ERROR* ]]; then echo "Stripe rejected the key: ${ACCOUNT_LINE#ERROR }"; exit 1; fi
echo "Stripe account: $ACCOUNT_LINE"
if [[ "$MODE" == "live" && "$ACCOUNT_LINE" == *"charges_enabled=false"* ]]; then
  echo "This account cannot take live payments yet. Finish activation in the Stripe Dashboard first."; exit 1
fi
read -rp "Is this the LifeGuestbook account? [y/N] " OK
[[ "$OK" =~ ^[Yy]$ ]] || { echo "Stopped. Nothing was changed."; exit 1; }

# Replace any existing endpoint for this URL (Stripe only reveals a signing secret at creation).
WEBHOOK_SECRET=$(stripe_api '
  const auth = { Authorization: `Bearer ${process.env.STRIPE_KEY}` };
  const list = await (await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", { headers: auth })).json();
  for (const e of list.data ?? []) if (e.url === process.env.WEBHOOK_URL) {
    await fetch(`https://api.stripe.com/v1/webhook_endpoints/${e.id}`, { method: "DELETE", headers: auth });
    console.error(`Replaced the old endpoint ${e.id}.`);
  }
  const body = new URLSearchParams({ url: process.env.WEBHOOK_URL, description: "LifeGuestbook (Firebase functions)" });
  for (const ev of ["checkout.session.completed", "checkout.session.async_payment_succeeded", "invoice.paid",
    "customer.subscription.updated", "customer.subscription.deleted"]) body.append("enabled_events[]", ev);
  const r = await fetch("https://api.stripe.com/v1/webhook_endpoints", { method: "POST", headers: auth, body });
  const e = await r.json();
  if (!r.ok || !e.secret) { console.error("Could not create the webhook: " + (e.error?.message ?? r.status)); process.exit(1); }
  console.error(`Created webhook ${e.id} -> ${e.url}`);
  process.stdout.write(e.secret);
')

echo "Saving secrets to Firebase ($PROJECT)..."
printf %s "$STRIPE_KEY" | npx firebase functions:secrets:set STRIPE_SECRET_KEY --data-file - --project "$PROJECT" --account "$FIREBASE_ACCOUNT" --force >/dev/null
printf %s "$WEBHOOK_SECRET" | npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --data-file - --project "$PROJECT" --account "$FIREBASE_ACCOUNT" --force >/dev/null
unset STRIPE_KEY WEBHOOK_SECRET
echo "Secrets saved."

# The app picks test or live keys from APP_ORIGIN, so keep it in step with the mode.
sed -i "s#^APP_ORIGIN=.*#APP_ORIGIN=$ORIGIN#" "$ENV_FILE"
echo "APP_ORIGIN set to $ORIGIN in $ENV_FILE."

echo "Building and deploying (hosting + functions)..."
npm run build >/dev/null
npx firebase deploy --only hosting,functions --project "$PROJECT" --account "$FIREBASE_ACCOUNT" --force

echo
RESULT=$(curl -s -m 30 -X POST "$WEBHOOK_URL" -d '{}' || true)
if [[ "$RESULT" == "bad signature" ]]; then
  echo "Payments are ON at $ORIGIN (webhook answers 'bad signature' to an unsigned test, as it should)."
else
  echo "Payments do not look on yet: the webhook answered '$RESULT'. Wait a minute and run:"
  echo "  curl -s -X POST $WEBHOOK_URL -d '{}'"
fi
