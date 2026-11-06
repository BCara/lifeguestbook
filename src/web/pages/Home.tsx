import { useMemo, useState } from "react";
import { CURRENCIES, currencyForTimeZone, formatPrice, type Currency } from "../../shared/pricing";
import { FREE_CONTRIBUTION_LIMIT } from "../../shared/plans";
import { Footer } from "../components";
import { Link } from "../router";

import { useSession } from "../session";
import "./Home.css";

const products = [
  { id: "living-legacy", title: "Living Legacy", line: "Record their story together.", art: "474 378 330 300", icon: "book", to: "/new?mode=living", action: "Start a Living Legacy", detail: "Choose favourite photos and record their stories in their own words. Invite family to help build a timeline together." },
  { id: "memories-from-afar", title: "Memories from Afar", line: "Collect photos and stories through one link.", art: "819 378 333 300", icon: "photo", to: "/new", action: "Create a page to share", detail: "Share your page in a Facebook announcement, group chat or email. Review incoming photos and stories with family before the service." },
  { id: "day-of-guestbook", title: "Day-of Guestbook & Live Slideshow", line: "Scan, contribute, and see memories on screen.", art: "1169 378 346 302", icon: "screen", to: "/new", action: "Create a memorial guestbook", detail: "Put a QR code at the service so guests can share without an app or account. Choose what appears on the venue screen with the live slideshow, included in Tribute." },
] as const;

const iconPaths = {
  book: "M3 5c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2z M12 7v14",
  photo: "M3 4h18v16H3z M3 16l5-5 4 4 3-3 6 6 M16 8h.01",
  screen: "M2 4h20v13H2z M8 21h8 M12 17v4 M10 8l5 3-5 3z",
};

function ProductArt({ viewBox, className }: { viewBox: string; className: string }) {
  // The approved reference supplies the photo regions. Titles and controls are rendered separately.
  return (
    <svg className={className} viewBox={viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <image href="/images/home-reference.webp" width="1536" height="1024" />
    </svg>
  );
}

function HomeHeader() {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <header className="home-header">
      <Link to="/" className="home-brand">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path fill="currentColor" d="M37 3c-6 4-14 1-20 7-4 4-4 9-3 13 6-6 12-9 18-12-5 4-11 9-16 16C29 28 36 18 37 3ZM3 14c7 0 10 4 10 11C6 25 3 21 3 14Z" />
          <path d="M10 37c2-7 6-13 12-18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        LifeGuestbook
      </Link>
      <button className="home-menu" type="button" aria-label="Menu" aria-expanded={open} aria-controls="home-nav" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h20M2 12h20M2 19h20" /></svg>
      </button>
      <nav id="home-nav" className={open ? "home-nav is-open" : "home-nav"} aria-label="Main navigation" onClick={() => setOpen(false)}>
        <a href="#how-it-works">How it Works</a>
        <a href="#products">Products</a>
        <a href="#examples">Examples</a>
        <Link to={me ? "/dashboard" : "/signin"}>{me ? "Your pages" : "Sign in"}</Link>
        <Link to="/new" className="home-start">Get Started</Link>
      </nav>
    </header>
  );
}


export function Home() {
  const initial = useMemo(() => currencyForTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const [cur, setCur] = useState<Currency>(initial);
  return (
    <div className="home-page">
      <HomeHeader />
      <main className="home-main">
        <section className="home-hero">
          <ProductArt className="home-hero-art" viewBox="995 146 539 223" />
          <h1>Gather a life’s stories<br className="home-heading-break" /> in three simple ways</h1>
          <svg className="home-underline" viewBox="0 0 175 18" aria-hidden="true">
            <path d="M4 15C56 3 121 0 171 7" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          </svg>
        </section>
        <section className="home-products" id="products" aria-label="Three ways to use LifeGuestbook">
          {products.map(({ id, title, line, art, icon }) => (
            <a key={id} href={`#${id}`} className={`home-product home-product-${icon}`}>
              <ProductArt className="home-card-art" viewBox={art} />
              <div className="home-card-copy">
                <span className="home-card-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconPaths[icon]} /></svg>
                </span>
                <h2>{title}</h2>
                <p>{line}</p>
              </div>
              <span className="home-card-arrow" aria-hidden="true">›</span>
            </a>
          ))}
        </section>
        <section className="home-benefits" id="how-it-works" aria-label="How it works">
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 18c0-3 2-5 4-5s4 2 4 5M3 17c0-3 2-4 4-4m10 0c2 0 4 1 4 4M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>Bring people together</span>
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconPaths.photo} /></svg>Preserve meaningful memories</span>
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconPaths.screen} /></svg>Share at the service and beyond</span>
        </section>
        <section className="home-examples" id="examples">
          <h2>Find the right fit</h2>
          <div className="home-examples-grid">
            {products.map(({ id, title, detail, action, to }) => (
              <article key={id} id={id}>
                <h3>{title}</h3>
                <p>{detail}</p>
                <Link to={to} className="home-start">{action}</Link>
              </article>
            ))}
          </div>
        </section>


        <section className="pricing" id="pricing">
          <div className="row between wrap">
            <h2>Plans and pricing</h2>
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
    </div>
  );
}
