// Stripe Checkout. One-off: Tribute and Forever. Subscriptions: yearly hosting and Living Legacy.
// Instant purchases are confined to demo projects backed by the Firestore emulator.
import { Hono } from "hono";
import Stripe from "stripe";
import { CURRENCIES, formatPrice, PRICES, PRODUCT_NAMES, RECURRING, type Currency, type Product } from "../../src/shared/pricing";
import { hostingAfterPurchase, isFrozen } from "../../src/shared/plans";
import { can } from "../../src/shared/roles";
import { requireUser, type AppEnv } from "./auth";
import { audit, db, getMemorial, memorials, users, type MemorialDoc, type UserDoc } from "./db";
import { receiptEmail } from "./email";
import { guestbookEmail } from "./guestbook-email";
import { demoPurchasesEnabled, paymentsEnabled, type Env } from "./env";
import { roleOf } from "./db";

const PRODUCTS: Product[] = ["tribute", "forever", "hosting", "living"];

export function checkoutAllowed(m: Pick<MemorialDoc, "mode" | "plan">, product: Product) {
  if (m.plan.tier === "forever") return false;
  if (product === "forever") return true;
  if (product === "tribute") return m.mode === "memorial" && m.plan.tier === "free";
  if (product === "living") return m.mode === "living" && (m.plan.tier === "free" || m.plan.tier === "living" && isFrozen(m.plan));
  return m.plan.tier === "tribute" && isFrozen(m.plan);
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
  const done = db.collection("payments").doc(paymentRef);
  await db.runTransaction(async (tx) => {
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
      ...(billing.subscriptionId ? { stripeSubscriptionId: billing.subscriptionId, stripeSubscriptionCancelled: false } : {}),
      ...(billing.customerId ? { stripeCustomerId: billing.customerId } : {}),
    });
    tx.set(done, { memorialId, product, payerUid, at: Date.now(), amount: amountText });
    tx.set(audit(memorialId).doc(), { actor: payerUid, action: "purchase", detail: product, at: Date.now() });
    if (payer) tx.set(guestbookEmail(memorialId, `receipt-${paymentRef}`), {
      memorialId, dueAt: Date.now(),
      email: receiptEmail(payer.email, m.name, PRODUCT_NAMES[product], amountText, `${env.APP_ORIGIN}/dashboard/${memorialId}`),
    });
    return true;
  });
}

export const paymentRoutes = new Hono<AppEnv>()
  .post("/checkout", requireUser, async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { memorialId?: string; product?: Product; currency?: Currency };
    const uid = c.get("uid")!;
    if (!b.memorialId || !PRODUCTS.includes(b.product as Product)) return c.json({ error: "Bad request" }, 400);
    if (!can(await roleOf(b.memorialId, uid), "billing")) return c.json({ error: "Only admins can pay for the page." }, 403);
    const product = b.product as Product;
    const currency = CURRENCIES.includes(b.currency as Currency) ? (b.currency as Currency) : "usd";
    const m = (await getMemorial(b.memorialId))!;
    if (!m) return c.json({ error: "Page not found." }, 404);
    if (m.plan.tier === "forever") return c.json({ error: "This page already has Forever hosting." }, 400);
    if (!checkoutAllowed(m, product)) return c.json({ error: "This purchase is unavailable for the current plan. Renewals can start after paid hosting ends." }, 409);
    if (!paymentsEnabled(c.env)) {
      if (!demoPurchasesEnabled()) return c.json({ error: "Payments are currently unavailable." }, 503);
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
    const lock = db.collection("checkoutAttempts").doc(b.memorialId);
    const attempt = await db.runTransaction(async tx => {
      const old = (await tx.get(lock)).data();
      if (old && old.expiresAt > Date.now()) return old as { key: string; product: Product; currency: Currency; uid: string; expiresAt: number };
      const next = { key: crypto.randomUUID(), product, currency, uid, expiresAt: Date.now() + 31 * 60_000 };
      tx.set(lock, next);
      return next;
    });
    if (attempt.product !== product || attempt.currency !== currency || attempt.uid !== uid) return c.json({ error: "A checkout is already in progress for this page. Please complete it or try again in 31 minutes." }, 409);
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
      allow_promotion_codes: true,
      metadata: { memorialId: b.memorialId, product, uid },
      ...(recurring ? { subscription_data: { metadata: { memorialId: b.memorialId, product, uid } } } : {}),
      success_url: `${c.env.APP_ORIGIN}/dashboard/${b.memorialId}?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${c.env.APP_ORIGIN}/dashboard/${b.memorialId}?tab=plan`,
    }, { idempotencyKey: `guestbook-${attempt.key}` });
    return c.json({ url: session.url });
  })
  .post("/confirm", requireUser, async (c) => {
    // Called when the payer returns from Checkout, so the upgrade shows without waiting for the webhook.
    const b = (await c.req.json().catch(() => ({}))) as { sessionId?: string };
    if (!paymentsEnabled(c.env)) return c.json({ error: "Payments are currently unavailable." }, 503);
    if (!b.sessionId) return c.json({ error: "Bad request" }, 400);
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(b.sessionId);
    const meta = s.metadata;
    if (!meta?.memorialId || meta.uid !== c.get("uid") || !PRODUCTS.includes(meta.product as Product)) {
      return c.json({ error: "Payment session not found." }, 404);
    }
    if (!settled(s)) return c.json({ error: "Payment has not completed yet." }, 409);
    await fulfilCheckout(c.env, stripe, s);
    return c.json({ ok: true });
  })
  .post("/cancel-renewal", requireUser, async c => {
    const b = await c.req.json().catch(() => ({})) as { memorialId?: string };
    if (!b.memorialId || !can(await roleOf(b.memorialId, c.get("uid")), "billing")) return c.json({ error: "Only admins can manage billing." }, 403);
    await stopRecurringBilling(c.env, b.memorialId);
    return c.json({ ok: true });
  });

/** Paid, or nothing to pay because a 100% off promotion code was used ("no_payment_required"). */
const settled = (s: Stripe.Checkout.Session) => s.payment_status === "paid" || s.payment_status === "no_payment_required";

async function fulfilCheckout(env: Env, stripe: Stripe, s: Stripe.Checkout.Session) {
  const meta = s.metadata;
  if (!settled(s) || !meta?.memorialId || !meta.uid || !PRODUCTS.includes(meta.product as Product)) return;
  const subscriptionId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
  if (meta.product === "forever") await stopRecurringBilling(env, meta.memorialId, true);
  await applyPurchase(env, meta.memorialId, meta.product as Product, meta.uid, s.id, amount(s.amount_total, s.currency), {
    subscriptionId, customerId: typeof s.customer === "string" ? s.customer : s.customer?.id,
  });
}

const amount = (minor: number | null, currency: string | null) => `${((minor ?? 0) / 100).toFixed(2)} ${(currency ?? "").toUpperCase()}`;

export async function stripeWebhook(env: Env, req: Request): Promise<Response> {
  if (!paymentsEnabled(env)) return new Response("payments off", { status: 404 });
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object as Stripe.Checkout.Session;
    await fulfilCheckout(env, stripe, s);
  }
  if (event.type === "invoice.paid") {
    // Yearly renewals after the first payment (the first is covered by checkout.session.completed).
    const inv = event.data.object as Stripe.Invoice & { subscription_details?: { metadata?: Record<string, string> } };
    const meta = inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata;
    const subscription = inv.parent?.subscription_details?.subscription;
    const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
    if (inv.billing_reason === "subscription_cycle" && meta?.memorialId && meta.uid && PRODUCTS.includes(meta.product as Product) && subscriptionId && inv.id) {
      const periodEnd = Math.max(...inv.lines.data.map(line => line.period.end)) * 1000;
      if (Number.isFinite(periodEnd)) await applyPurchase(env, meta.memorialId, meta.product as Product, meta.uid, inv.id, amount(inv.amount_paid, inv.currency), { subscriptionId, periodEnd, renewal: true });
    }
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const changed = event.data.object as Stripe.Subscription;
    const sub = await stripe.subscriptions.retrieve(changed.id);
    const mid = sub.metadata.memorialId;
    if (mid) await db.runTransaction(async tx => {
      const ref = memorials().doc(mid);
      const m = (await tx.get(ref)).data();
      if (m?.stripeSubscriptionId === sub.id) tx.update(ref, { stripeSubscriptionCancelled: sub.status === "canceled" || sub.cancel_at_period_end });
    });
  }
  return new Response("ok");
}
