// Stripe Checkout. One-off: Tribute and Forever. Subscriptions: yearly hosting and Living Legacy.
// Instant purchases are confined to demo projects backed by the Firestore emulator.
import { Hono } from "hono";
import Stripe from "stripe";
import { CURRENCIES, formatPrice, PRICES, PRODUCT_NAMES, RECURRING, type Currency, type Product } from "../../src/shared/pricing";
import { hostingAfterPurchase } from "../../src/shared/plans";
import { can } from "../../src/shared/roles";
import { requireUser, type AppEnv } from "./auth";
import { db, getMemorial, logAudit, memorials, users, type UserDoc } from "./db";
import { receiptEmail, sendEmail } from "./email";
import { demoPurchasesEnabled, paymentsEnabled, type Env } from "./env";
import { roleOf } from "./db";

const PRODUCTS: Product[] = ["tribute", "forever", "hosting", "living"];

export async function applyPurchase(env: Env, memorialId: string, product: Product, payerUid: string, paymentRef: string, amountText: string) {
  const done = db.collection("payments").doc(paymentRef);
  const applied = await db.runTransaction(async (tx) => {
    if ((await tx.get(done)).exists) return false; // webhook and return-redirect both call this
    const mref = memorials().doc(memorialId);
    const m = (await tx.get(mref)).data();
    if (!m) return false;
    const plan = hostingAfterPurchase(m.plan, product);
    tx.update(mref, { plan, reminders: {} });
    tx.set(done, { memorialId, product, payerUid, at: Date.now(), amount: amountText });
    return true;
  });
  if (!applied) return;
  await logAudit(memorialId, payerUid, "purchase", undefined, product);
  const m = await getMemorial(memorialId);
  const payer = (await users().doc(payerUid).get()).data() as UserDoc | undefined;
  if (m && payer) await sendEmail(env, receiptEmail(payer.email, m.name, PRODUCT_NAMES[product], amountText, `${env.APP_ORIGIN}/dashboard/${memorialId}`));
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
    if (m.plan.tier === "forever") return c.json({ error: "This page already has Forever hosting." }, 400);
    if (!paymentsEnabled(c.env)) {
      if (!demoPurchasesEnabled()) return c.json({ error: "Payments are currently unavailable." }, 503);
      await applyPurchase(c.env, b.memorialId, product, uid, `dev-${Date.now()}`, `${formatPrice(product, currency)} (test, no charge)`);
      return c.json({ applied: true });
    }
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
    const recurring = RECURRING[product];
    const session = await stripe.checkout.sessions.create({
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
      metadata: { memorialId: b.memorialId, product, uid },
      ...(recurring ? { subscription_data: { metadata: { memorialId: b.memorialId, product, uid } } } : {}),
      success_url: `${c.env.APP_ORIGIN}/dashboard/${b.memorialId}?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${c.env.APP_ORIGIN}/dashboard/${b.memorialId}?tab=plan`,
    });
    return c.json({ url: session.url });
  })
  .post("/confirm", requireUser, async (c) => {
    // Called when the payer returns from Checkout, so the upgrade shows without waiting for the webhook.
    const b = (await c.req.json().catch(() => ({}))) as { sessionId?: string };
    if (!paymentsEnabled(c.env)) return c.json({ error: "Payments are currently unavailable." }, 503);
    if (!b.sessionId) return c.json({ error: "Bad request" }, 400);
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(b.sessionId);
    if (s.payment_status === "paid" && s.metadata?.memorialId) {
      await applyPurchase(c.env, s.metadata.memorialId, s.metadata.product as Product, s.metadata.uid, s.id, amount(s.amount_total, s.currency));
    }
    return c.json({ ok: true });
  });

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
    if (s.payment_status === "paid" && s.metadata?.memorialId)
      await applyPurchase(env, s.metadata.memorialId, s.metadata.product as Product, s.metadata.uid, s.id, amount(s.amount_total, s.currency));
  }
  if (event.type === "invoice.paid") {
    // Yearly renewals after the first payment (the first is covered by checkout.session.completed).
    const inv = event.data.object as Stripe.Invoice & { subscription_details?: { metadata?: Record<string, string> } };
    const meta = inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata;
    if (inv.billing_reason === "subscription_cycle" && meta?.memorialId)
      await applyPurchase(env, meta.memorialId, meta.product as Product, meta.uid, inv.id ?? `inv-${Date.now()}`, amount(inv.amount_paid, inv.currency));
  }
  return new Response("ok");
}
