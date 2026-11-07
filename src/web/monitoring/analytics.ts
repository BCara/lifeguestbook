import { routeShape } from "../../shared/scrub";

/**
 * GA4, loaded only after the visitor opts in (UK GDPR / PECR). Nothing is loaded,
 * and no cookie is set, until consent is "granted". Paths are reduced to their route
 * shape (no slugs, IDs, query strings or titles), and the /wall slideshow is never tracked.
 */

export const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || "";
export const analyticsConfigured = /^G-[A-Z0-9]+$/.test(GA_ID);

export type Consent = "granted" | "denied";
const KEY = "lgb-cookie-consent-v1";
const listeners = new Set<() => void>();

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value: Consent) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* private mode: consent applies to this page view only */
  }
  if (value === "granted") startAnalytics();
  else stopAnalytics();
  listeners.forEach((l) => l());
}

export function onConsentChange(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** Opens the banner again from the "Cookie settings" link. */
export function openCookieSettings() {
  window.dispatchEvent(new Event("lgb:cookie-settings"));
}

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let started = false;
let lastPath = "";

/** Paths we never send, not even as a page view. */
export function isUntracked(path: string) {
  return path === "/wall" || path.startsWith("/wall/") || path === "/signin" || path === "/invite";
}

function pageView() {
  if (!started || !window.gtag) return;
  const path = location.pathname;
  if (isUntracked(path)) return;
  const shape = routeShape(path);
  if (shape === lastPath) return;
  lastPath = shape;
  window.gtag("event", "page_view", {
    page_location: `${location.origin}${shape}`,
    page_path: shape,
    page_title: shape, // real titles can contain a person's name
    page_referrer: lastReferrer(),
  });
}

function lastReferrer() {
  try {
    const r = new URL(document.referrer);
    return r.origin === location.origin ? `${r.origin}${routeShape(r.pathname)}` : r.origin;
  } catch {
    return "";
  }
}

function startAnalytics() {
  if (!analyticsConfigured) return;
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = false;
  if (!started) {
    started = true;
    window.dataLayer = window.dataLayer || [];
    // gtag.js requires the `arguments` object, not an array.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: `${location.origin}${routeShape(location.pathname)}`,
      page_title: routeShape(location.pathname),
    });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(s);
    window.addEventListener("popstate", () => queueMicrotask(pageView));
  } else {
    window.gtag?.("consent", "update", { analytics_storage: "granted" });
  }
  lastPath = "";
  pageView();
}

function stopAnalytics() {
  if (!analyticsConfigured) return;
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = true;
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  // Remove GA cookies already set on this domain.
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (name === "_ga" || name.startsWith("_ga_") || name === "_gid") {
      const host = location.hostname;
      for (const domain of ["", `; domain=${host}`, `; domain=.${host.replace(/^www\./, "")}`]) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
      }
    }
  }
}

export function initAnalytics() {
  if (analyticsConfigured && getConsent() === "granted") startAnalytics();
}

type EventName = "guestbook_created" | "memory_added" | "upgrade_started" | "purchase";
type Params = Record<string, string | number | boolean | undefined>;

/** Sends a product event if (and only if) analytics is on. Never pass names, text or emails. */
export function track(name: EventName, params: Params = {}) {
  if (!started || !window.gtag || getConsent() !== "granted" || isUntracked(location.pathname)) return;
  window.gtag("event", name, { ...params, page_path: routeShape(location.pathname) });
}

/** GA4 purchase, sent once per Stripe Checkout session even if the return page reloads. */
export function trackPurchase(checkoutSessionId: string) {
  const key = `lgb-purchase-${checkoutSessionId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* fall through: at worst a duplicate, which GA dedupes by transaction_id */
  }
  track("purchase", { transaction_id: checkoutSessionId });
}
