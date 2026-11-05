import { useMemo, useState } from "react";
import { CURRENCIES, currencyForTimeZone, formatPrice, type Currency } from "../../shared/pricing";
import { FREE_CONTRIBUTION_LIMIT } from "../../shared/plans";
import { Footer, Header } from "../components";
import { Link } from "../router";

export function Home() {
  const initial = useMemo(() => currencyForTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const [cur, setCur] = useState<Currency>(initial);
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <p className="eyebrow">For funerals, celebrations of life, and the years before</p>
          <h1>One shared place for a whole life's memories.</h1>
          <p className="lead">
            Share one link or QR code. Friends, old colleagues and family everywhere add the photos and stories you've never seen. On the day, they appear on a live slideshow. Several family members look after the page together, so it's never locked to one person's email.
          </p>
          <div className="row gap wrap">
            <Link to="/new" className="btn">Create a free page</Link>
            <Link to="/new?mode=living" className="btn secondary">Start a Living Legacy</Link>
          </div>
          <p className="muted small">No app for guests. No account needed to share a memory.</p>
        </section>

        <section className="features">
          <div className="feature">
            <h3>Reach everyone who knew them</h3>
            <p>Post the link in Facebook, group chats and emails. University friends and old workmates share the stories family never heard, before the service.</p>
          </div>
          <div className="feature">
            <h3>QR guestbook and live slideshow on the day</h3>
            <p>Guests scan a card on the table, add a photo or a few words, and it appears on the screen once a family member approves it.</p>
          </div>
          <div className="feature">
            <h3>Shared admins, gentle moderation</h3>
            <p>Invite co-admins, moderators and trusted family. Everything can be reviewed before it appears, and anything unkind is screened and held automatically.</p>
          </div>
          <div className="feature">
            <h3>Living Legacy</h3>
            <p>Help a parent tell their own story while they can, with chapters, photos and recordings. When the time comes, the same page becomes their memorial.</p>
          </div>
        </section>

        <section className="pricing" id="pricing">
          <div className="row between wrap">
            <h2>Simple, one-off pricing</h2>
            <select value={cur} onChange={(e) => setCur(e.target.value as Currency)} aria-label="Currency">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="plans">
            <div className="plan">
              <h3>Free</h3>
              <p className="price">{cur === "gbp" ? "£0" : "Free"}</p>
              <ul>
                <li>Up to {FREE_CONTRIBUTION_LIMIT} photos and messages</li>
                <li>2 co-admins</li>
                <li>Approve before showing, automatic screening</li>
                <li>QR cards to print, full download</li>
              </ul>
            </div>
            <div className="plan featured">
              <h3>Tribute</h3>
              <p className="price">{formatPrice("tribute", cur)}</p>
              <p className="muted small">one-off, per page</p>
              <ul>
                <li>Unlimited photos, videos and voice messages</li>
                <li>Live slideshow for the service</li>
                <li>Unlimited co-admins and moderators</li>
                <li>No Life Guestbook branding</li>
                <li>2 years of hosting included, then {formatPrice("hosting", cur)} to keep it open</li>
              </ul>
            </div>
            <div className="plan">
              <h3>Forever</h3>
              <p className="price">{formatPrice("forever", cur)}</p>
              <p className="muted small">one-off, never renews</p>
              <ul>
                <li>Everything in Tribute</li>
                <li>Lifetime hosting, nothing to remember</li>
              </ul>
            </div>
            <div className="plan">
              <h3>Living Legacy</h3>
              <p className="price">{formatPrice("living", cur)}</p>
              <p className="muted small">while they're with us</p>
              <ul>
                <li>Everything in Tribute</li>
                <li>Becomes their memorial later, with 2 years included</li>
              </ul>
            </div>
          </div>
          <p className="muted small promise">
            <strong>Our promise:</strong> we never delete a page because a renewal was missed. It stays online and downloadable, and any admin can reopen it.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
