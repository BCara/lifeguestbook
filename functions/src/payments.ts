// Stripe Checkout. One-off: Tribute and Forever. Subscriptions: yearly hosting and Living Legacy.
// Instant purchases are confined to demo projects backed by the Firestore emulator.
//
// Webhook guarantees (see docs/stripe-sandbox-test.md):
// - Every event is signature-checked against STRIPE_WEBHOOK_SECRET on the raw body.
// - Every handler is idempotent, so Stripe retries and duplicate deliveries are harmless:
//   purchases and renewals are keyed by Checkout Session / Invoice id in `payments/{id}`, and
//   subscription state is re-read from Stripe rather than trusted from the (possibly stale) event.
// - A failure throws, the API answers 500 and Stripe retries for up to 3 days.
// - Nothing here ever deletes a page. A lapsed or cancelled plan keeps its hostingUntil and freezes.
import { Hono } from "hono";
import Stripe from "stripe";
import { CURRENCIES, formatPrice, PRICES, PRODUCT_NAMES, RECURRING, type Currency, type Product } from "../../src/shared/pricing";
import { hostingAfterPurchase, isFrozen, PAYMENTS_OFF_COPY } from "../../src/shared/plans";
import { can } from "../../src/shared/roles";
import { requireUser, type AppEnv } from "./auth";
import { audit, db, getMemorial, memorials, users, type MemorialDoc, type UserDoc } from "./db";
import { receiptEmail } from "./email";
import { guestbookEmail } from "./guestbook-email";
import { canGrantPaidPlans, demoPurchasesEnabled, paymentsEnabled, paymentsStatus, type Env } from "./env";
import { roleOf } from "./db";

const PRODUCTS: Product[] = ["tribute", "forever", "hosting", "living"];

export function checkoutAllowed(m: Pick<MemorialDoc, "mode" | "plan">, product: Product) {
  if (m.plan.tier === "forever") return false;
  if (product === "forever") return true;
  if (product === "tribute") return m.mode === "memorial" && m.plan.tier === "free";
  if (product === "living") return m.mode === "living" && (m.plan.tier === "free" || m.plan.tier === "living" && isFrozen(m.plan));
  return m.plan.tier === "tribute" && isFrozen(m.plan);
}

/** The JSON body for a payments route while paid upgrades are off. */
export function paymentsOff(env: Env) {
  const status = paymentsStatus(env);
  if (status === "on") return null;
  return { error: PAYMENTS_OFF_COPY[status], code: status === "free-launch" ? "free_launch" : "payments_unavailable" } as const;
}

export async function stopRecurringBilling(env: Env, memorialId: string, immediately = false) {
  const m = await getMemorial(memorialId);
  if (!m?.stripeSubscriptionId) return;
  if (!paymentsEnabled(env)) throw new Error("Billing is unavailable. Please try again before converting this page.");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const sub = await stripe.subscriptions.retrieve(m.stripeSubscriptionId);
  if (sub.metadata.memorialId !== memorialId) throw new Error("Subscription does not belong to this page");
  if (sub.status !== "canceled") {
    if (immediately) await stripe.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });
    else await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  }
  await memorials().doc(memorialId).update({ stripeSubscriptionCancelled: true });
}

type PurchaseBilling = { subscriptionId?: string; customerId?: string; periodEnd?: number; renewal?: boolean };
export async function applyPurchase(env: Env, memorialId: string, product: Product, payerUid: string, paymentRef: string, amountText: string, billing: PurchaseBilling = {}) {
  if (!PRODUCTS.includes(product)) throw new Error("Unknown payment product");
  // Defence in depth: free-launch / unconfigured deployments can never grant a paid plan.
  if (!canGrantPaidPlans(env)) throw new Error("Payments are off; refusing to grant a paid plan");
  const done = db.collection("payments").doc(paymentRef);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(done)).exists) return false; // webhook and return-redirect both call this
    const mref = memorials().doc(memorialId);
    const m = (await tx.get(mref)).data();
    if (!m) return false;
    const payer = (await tx.get(users().doc(payerUid))).data() as UserDoc | undefined;
    // Renewals follow Stripe's paid period instead of adding years on webhook replay or delay.
    const plan = billing.renewal && billing.periodEnd
      ? { ...m.plan, hostingUntil: Math.max(m.plan.hostingUntil ?? 0, billing.periodEnd) }
      : hostingAfterPurchase(m.plan, product);
    if (billing.renewal && (m.stripeSubscriptionId !== billing.subscriptionId || m.plan.tier === "forever" || (product === "living" && m.mode !== "living"))) return false;
    tx.update(mref, { plan, reminders: {},
      ...(billing.renewal ? { stripeRenewalFailed: null } : {}),
      ...(billing.subscriptionId ? { stripeSubscriptionId: billing.subscriptionId, stripeSubscriptionCancelled: false, stripeRenewalFailed: null } : {}),
      ...(billing.customerId ? { stripeCustomerId: billing.customerId } : {}),
    });
    tx.set(done, { memorialId, product, payerUid, at: Date.now(), amount: amountText });
    tx.set(audit(memorialId).doc(), { actor: payerUid, action: billing.renewal ? "renewal" : "purchase", detail: product, at: Date.now() });
    if (payer) tx.set(guestbookEmail(memorialId, `receipt-${paymentRef}`), {
      memorialId, dueAt: Date.now(),
      email: receiptEmail(payer.email, m.name, PRODUCT_NAMES[product], amountText, `${env.APP_ORIGIN}/dashboard/${memorialId}`),
    });
    return true;
  });
}

type Attempt = { key: string; product: Product; currency: Currency; uid: string; expiresAt: number };
const attemptLock = (memorialId: string) => db.collection("checkoutAttempts").doc(memorialId);

/** Frees the page's checkout lock once its session has finished, so another purchase can start at once. */
export async function releaseCheckoutLock(memorialId: string, attemptKey: string | undefined) {
  if (!attemptKey) return;
  const lock = attemptLock(memorialId);
  await db.runTransaction(async tx => {
    const cur = (await tx.get(lock)).data() as Attempt | undefined;
    if (cur?.key === attemptKey) tx.delete(lock);
  });
}

export const paymentRoutes = new Hono<AppEnv>()
  .post("/checkout", requireUser, async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { memorialId?: string; product?: Product; currency?: Currency };
    const uid = c.get("uid")!;
    const off = paymentsOff(c.env);
    if (off) return c.json(off, 503);
    if (!b.memorialId || !PRODUCTS.includes(b.product as Product)) return c.json({ error: "Bad request" }, 400);
    if (!can(await roleOf(b.memorialId, uid), "billing")) return c.json({ error: "Only admins can pay for the page." }, 403);
    const product = b.product as Product;
    const currency = CURRENCIES.includes(b.currency as Currency) ? (b.currency as Currency) : "usd";
    const m = await getMemorial(b.memorialId);
    if (!m) return c.json({ error: "Page not found." }, 404);
    if (m.plan.tier === "forever") return c.json({ error: "This page already has Forever hosting." }, 400);
    if (!checkoutAllowed(m, product)) return c.json({ error: "This purchase is unavailable for the current plan. Renewals can start after paid hosting ends." }, 409);
    if (!paymentsEnabled(c.env)) {
      // paymentsStatus "on" without valid keys means the demo emulator: instant, free upgrade.
      if (!demoPurchasesEnabled()) return c.json({ error: PAYMENTS_OFF_COPY.unavailable, code: "payments_unavailable" }, 503);
      await applyPurchase(c.env, b.memorialId, product, uid, `dev-${Date.now()}`, `${formatPrice(product, currency)} (test, no charge)`);
      return c.json({ applied: true });
    }
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
    const recurring = RECURRING[product];
    if (recurring && m.stripeSubscriptionId) {
      const existing = await stripe.subscriptions.retrieve(m.stripeSubscriptionId);
      if (existing.status !== "canceled" && existing.status !== "incomplete_expired") return c.json({ error: "This page already has a subscription. Cancel its renewal before starting another." }, 409);
    }
    // All admins share one checkout attempt, preventing simultaneous duplicate subscriptions.
    const lock = attemptLock(b.memorialId);
    const attempt = await db.runTransaction(async tx => {
      const old = (await tx.get(lock)).data();
      if (old && old.expiresAt > Date.now()) return old as Attempt;
      const next: Attempt = { key: crypto.randomUUID(), product, currency, uid, expiresAt: Date.now() + 31 * 60_000 };
      tx.set(lock, next);
      return next;
    });
    if (attempt.product !== product || attempt.currency !== currency || attempt.uid !== uid) return c.json({ error: "A checkout is already in progress for this page. Please complete it or try again in 31 minutes." }, 409);
    const metadata = { memorialId: b.memorialId, product, uid, attempt: attempt.key };
    const session = await stripe.checkout.sessions.create({
      expires_at: Math.floor(attempt.expiresAt / 1000),
      mode: recurring ? "subscription" : "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: PRICES[product][currency],
          product_data: { name: `${PRODUCT_NAMES[product]} – ${m.name}` },
          ...(recurring ? { recurring: { interval: "year" as const } } : {}),
        },
      }],
      customer_email: c.get("user")!.email,
      metadata,
      ...(recurring ? { subscription_data: { metadata } } : {}),
      success_url: `${c.env.APP_ORIGIN}/dashboard/${b.memorialId}?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${c.env.APP_ORIGIN}/dashboard/${b.memorialId}?tab=plan`,
    }, { idempotencyKey: `guestbook-${attempt.key}` });
    // The same attempt key returns the same session; once it is finished there is no URL to send.
    if (!session.url) {
      await releaseCheckoutLock(b.memorialId, attempt.key);
      return c.json({ error: "That checkout has already finished. Please refresh and try again." }, 409);
    }
    return c.json({ url: session.url });
  })
  .post("/confirm", requireUser, async (c) => {
    // Called when the payer returns from Checkout, so the upgrade shows without waiting for the webhook.
    const b = (await c.req.json().catch(() => ({}))) as { sessionId?: string };
    if (!paymentsEnabled(c.env)) return c.json(paymentsOff(c.env) ?? { error: PAYMENTS_OFF_COPY.unavailable, code: "payments_unavailable" }, 503);
    if (!b.sessionId) return c.json({ error: "Bad request" }, 400);
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(b.sessionId);
    const meta = s.metadata;
    if (!meta?.memorialId || meta.uid !== c.get("uid") || !PRODUCTS.includes(meta.product as Product)) {
      return c.json({ error: "Payment session not found." }, 404);
    }
    if (s.payment_status !== "paid") return c.json({ error: "Payment has not completed yet." }, 409);
    await fulfilCheckout(c.env, stripe, s);
    return c.json({ ok: true });
  })
  .post("/cancel-renewal", requireUser, async c => {
    const b = await c.req.json().catch(() => ({})) as { memorialId?: string };
    if (!b.memorialId || !can(await roleOf(b.memorialId, c.get("uid")), "billing")) return c.json({ error: "Only admins can manage billing." }, 403);
    if (!paymentsEnabled(c.env)) return c.json({ error: "Billing can't be changed right now. Nothing has been charged; please try again later.", code: "payments_unavailable" }, 503);
    await stopRecurringBilling(c.env, b.memorialId);
    return c.json({ ok: true });
  });

const subscriptionIdOf = (s: { subscription?: string | { id: string } | null }) => typeof s.subscription === "string" ? s.subscription : s.subscription?.id;

export async function fulfilCheckout(env: Env, stripe: Stripe, s: Stripe.Checkout.Session) {
  const meta = s.metadata;
  if (s.payment_status !== "paid" || !meta?.memorialId || !meta.uid || !PRODUCTS.includes(meta.product as Product)) return;
  let product = meta.product as Product;
  let subscriptionId = subscriptionIdOf(s);
  if (product === "forever") await stopRecurringBilling(env, meta.memorialId, true);
  if (product === "living" && subscriptionId) {
    // The page became a memorial while this checkout was open. Conversion turns Living Legacy into
    // Tribute, so do the same here, and stop the new subscription so it never charges a memorial page.
    const m = await getMemorial(meta.memorialId);
    if (m && m.mode !== "living") {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (sub.status !== "canceled") await stripe.subscriptions.cancel(subscriptionId, { prorate: false, invoice_now: false });
      product = "tribute";
      subscriptionId = undefined;
    }
  }
  await applyPurchase(env, meta.memorialId, product, meta.uid, s.id, amount(s.amount_total, s.currency), {
    subscriptionId, customerId: typeof s.customer === "string" ? s.customer : s.customer?.id,
  });
  await releaseCheckoutLock(meta.memorialId, meta.attempt);
}

const amount = (minor: number | null, currency: string | null) => `${((minor ?? 0) / 100).toFixed(2)} ${(currency ?? "").toUpperCase()}`;

type InvoiceLike = Stripe.Invoice & { subscription?: string | { id: string } | null; subscription_details?: { metadata?: Record<string, string> } };
function invoiceSubscription(inv: InvoiceLike) {
  const meta = inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata;
  const sub = inv.parent?.subscription_details?.subscription ?? inv.subscription;
  return { meta, subscriptionId: typeof sub === "string" ? sub : sub?.id };
}

/** Marks or clears a failed renewal on the page that owns this subscription. */
async function setRenewalFailed(subscriptionId: string, memorialId: string, value: MemorialDoc["stripeRenewalFailed"]) {
  await db.runTransaction(async tx => {
    const ref = memorials().doc(memorialId);
    const m = (await tx.get(ref)).data();
    if (m?.stripeSubscriptionId !== subscriptionId) return;
    tx.update(ref, { stripeRenewalFailed: value });
    if (value) tx.set(audit(memorialId).doc(), { actor: "stripe", action: "renewal_failed", detail: value.invoiceId, at: Date.now() });
  });
}

export async function handleStripeEvent(env: Env, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      // completed with payment_status "unpaid" (bank debits) is a no-op; async_payment_succeeded follows.
      await fulfilCheckout(env, stripe, event.data.object);
      return;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const meta = event.data.object.metadata;
      if (meta?.memorialId) await releaseCheckoutLock(meta.memorialId, meta.attempt);
      return;
    }
    case "invoice.paid": {
      // Yearly renewals after the first payment (the first is covered by checkout.session.completed).
      const inv = event.data.object as InvoiceLike;
      const { meta, subscriptionId } = invoiceSubscription(inv);
      if (inv.billing_reason === "subscription_cycle" && meta?.memorialId && meta.uid && PRODUCTS.includes(meta.product as Product) && subscriptionId && inv.id) {
        const periodEnd = Math.max(...inv.lines.data.map(line => line.period.end)) * 1000;
        if (Number.isFinite(periodEnd)) await applyPurchase(env, meta.memorialId, meta.product as Product, meta.uid, inv.id, amount(inv.amount_paid, inv.currency), { subscriptionId, periodEnd, renewal: true });
      }
      return;
    }
    case "invoice.payment_failed": {
      // Stripe retries (Smart Retries) and emails the payer; we flag the page so admins see it.
      // The plan is untouched: if retries run out, hosting simply lapses and the page freezes.
      const inv = event.data.object as InvoiceLike;
      const { meta, subscriptionId } = invoiceSubscription(inv);
      if (inv.billing_reason === "subscription_cycle" && meta?.memorialId && subscriptionId && inv.id) {
        await setRenewalFailed(subscriptionId, meta.memorialId, { at: Date.now(), invoiceId: inv.id, invoiceUrl: inv.hosted_invoice_url ?? null });
      }
      return;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      // Re-read the subscription so out-of-order deliveries settle on Stripe's current state.
      const sub = await stripe.subscriptions.retrieve(event.data.object.id);
      const mid = sub.metadata.memorialId;
      if (!mid) return;
      const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
      await db.runTransaction(async tx => {
        const ref = memorials().doc(mid);
        const m = (await tx.get(ref)).data();
        if (m?.stripeSubscriptionId !== sub.id) return;
        // Never touch the plan here: hostingUntil stays as paid, so an ended subscription freezes the page.
        tx.update(ref, {
          stripeSubscriptionCancelled: ended || sub.cancel_at_period_end || !!sub.cancel_at,
          ...(ended ? { stripeRenewalFailed: null } : {}),
        });
      });
      return;
    }
    default:
      return; // Unhandled types are acknowledged so Stripe doesn't retry them.
  }
}

export async function stripeWebhook(env: Env, req: Request): Promise<Response> {
  // 503 (not 404) so Stripe keeps retrying if keys are briefly misconfigured.
  if (!paymentsEnabled(env)) return new Response("payments off", { status: 503 });
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  await handleStripeEvent(env, stripe, event);
  return new Response("ok");
}
