// Prices per memorial, in minor units, one amount per supported currency.
// Visitors outside these currencies pay USD (Stripe Adaptive Pricing shows a local amount).
export const CURRENCIES = ["gbp", "aud", "usd", "nzd", "eur", "cad"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Product = "tribute" | "forever" | "hosting" | "living";

export const PRICES: Record<Product, Record<Currency, number>> = {
  // One-off: unlimited + slideshow + video, 2 years of hosting included.
  tribute: { gbp: 3900, aud: 7900, usd: 4900, nzd: 8500, eur: 4500, cad: 6500 },
  // One-off: lifetime hosting, never renews.
  forever: { gbp: 9900, aud: 19500, usd: 11900, nzd: 21500, eur: 11500, cad: 15900 },
  // Yearly, from year 3, to keep a Tribute open.
  hosting: { gbp: 1200, aud: 2400, usd: 1500, nzd: 2600, eur: 1400, cad: 2000 },
  // Yearly while the person is alive (Living Legacy).
  living: { gbp: 2900, aud: 5900, usd: 3500, nzd: 6500, eur: 3400, cad: 4800 },
};

export const RECURRING: Record<Product, boolean> = { tribute: false, forever: false, hosting: true, living: true };

export const PRODUCT_NAMES: Record<Product, string> = {
  tribute: "Tribute",
  forever: "Forever",
  hosting: "Keep it open (yearly)",
  living: "Living Legacy (yearly)",
};

const SYMBOL: Record<Currency, string> = { gbp: "£", aud: "A$", usd: "US$", nzd: "NZ$", eur: "€", cad: "CA$" };

export function formatPrice(product: Product, currency: Currency): string {
  const amount = PRICES[product][currency] / 100;
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${SYMBOL[currency]}${text}${RECURRING[product] ? "/yr" : ""}`;
}

/** Guess the visitor's currency from their device time zone. */
export function currencyForTimeZone(tz: string | undefined): Currency {
  if (!tz) return "usd";
  if (tz === "Europe/London" || tz === "Europe/Belfast" || tz === "Europe/Jersey" || tz === "Europe/Guernsey" || tz === "Europe/Isle_of_Man") return "gbp";
  if (tz === "Pacific/Auckland" || tz === "Pacific/Chatham") return "nzd";
  if (tz.startsWith("Australia/")) return "aud";
  if (tz === "Europe/Dublin" || (tz.startsWith("Europe/") && EURO_ZONES.has(tz))) return "eur";
  if (CANADA_ZONES.has(tz)) return "cad";
  return "usd";
}

const EURO_ZONES = new Set([
  "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam",
  "Europe/Brussels", "Europe/Vienna", "Europe/Lisbon", "Europe/Helsinki", "Europe/Athens", "Europe/Luxembourg",
  "Europe/Bratislava", "Europe/Ljubljana", "Europe/Tallinn", "Europe/Riga", "Europe/Vilnius", "Europe/Malta",
  "Europe/Zagreb", "Asia/Nicosia", "Europe/Monaco",
]);
const CANADA_ZONES = new Set([
  "America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax",
  "America/St_Johns", "America/Regina", "America/Moncton", "America/Whitehorse", "America/Yellowknife",
]);
