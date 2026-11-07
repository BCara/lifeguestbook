import { useEffect, useRef, useState } from "react";
import { analyticsConfigured, getConsent, onConsentChange, setConsent } from "./analytics";
import { useLocation } from "../router";

/**
 * Cookie consent for optional analytics. Shown on first visit (when GA is configured)
 * and again from the "Cookie settings" footer link. Rejecting is as easy as accepting.
 */
export function ConsentBanner() {
  const { path } = useLocation();
  const [open, setOpen] = useState(() => analyticsConfigured && getConsent() === null);
  const [, rerender] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const reopened = useRef(false);

  useEffect(() => onConsentChange(() => rerender((n) => n + 1)), []);
  useEffect(() => {
    const show = () => {
      reopened.current = true;
      setOpen(true);
    };
    window.addEventListener("lgb:cookie-settings", show);
    return () => window.removeEventListener("lgb:cookie-settings", show);
  }, []);
  useEffect(() => {
    if (open && reopened.current) heading.current?.focus();
  }, [open]);

  // Never cover the full-screen slideshow.
  if (!analyticsConfigured || !open || path === "/wall") return null;
  const current = getConsent();
  const choose = (v: "granted" | "denied") => {
    setConsent(v);
    setOpen(false);
    reopened.current = false;
  };

  return (
    <section className="consent-banner" role="region" aria-labelledby="consent-title">
      <h2 id="consent-title" ref={heading} tabIndex={-1}>Cookies</h2>
      <p>
        We use essential cookies to keep you signed in. With your permission we'd also like to use Google Analytics
        cookies to count visits and see which pages help people. We never send memories, names or photos.{" "}
        <a href="/privacy">Privacy notice</a>
      </p>
      {current && <p className="small">Your current choice: analytics {current === "granted" ? "allowed" : "off"}.</p>}
      <div className="consent-actions">
        <button className="btn secondary" onClick={() => choose("denied")}>Reject analytics</button>
        <button className="btn" onClick={() => choose("granted")}>Allow analytics</button>
      </div>
    </section>
  );
}
