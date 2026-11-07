import { useEffect, useRef, useState } from "react";
import { Link } from "../router";
import { useSession } from "../session";
import "./Home.css";

const cards = [
  {
    id: "memories-from-afar",
    title: "Memories from Afar",
    description: "Collect photos and stories from family, friends and wider connections through one simple link.",
  },
  {
    id: "day-of-guestbook",
    title: "Day-of Guestbook",
    description: "Let guests share photos and messages at your event. Display a live slideshow to celebrate their life together.",
  },
  {
    id: "living-legacy",
    title: "Living Legacy",
    description: "Create your own digital life story. Capture the moments, people and experiences that have shaped you and your family.",
  },
];

const uses = [
  ["Family & Heritage", "Work together to capture and preserve family history."],
  ["Community Groups", "Keep local history and memories alive."],
  ["Celebrations of Life", "A meaningful way to bring stories together."],
  ["Your Story", "Because every life has a story worth sharing."],
];

function Brand() {
  return (
    <Link to="/" className="home-brand">
      <svg viewBox="0 0 76 72" aria-hidden="true">
        <path fill="#5a5e30" d="M61 12C49-1 24-2 10 10-4 22-1 41 10 51c-1 8-4 15-9 20 14-3 20-10 38-10-9-4-17-2-26 4 2-5 3-10 3-14C4 42 3 25 14 15 25 4 44 3 61 12Z" />
        <path fill="#bb5e30" d="M31 51C32 29 43 20 57 15c8-3 13-4 18-9-1 15-4 24-14 28-10 4-20 1-30 17Z" />
        <path fill="#d9ad7b" d="M33 56c10-18 24-14 38-24-4 20-16 30-38 24Z" />
      </svg>
      <span><strong>Life Guestbook</strong><small>A digital guestbook for every side of a life</small></span>
    </Link>
  );
}

export function HomeHeader() {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <header className="home-header">
      <Brand />
      <button className="home-menu" type="button" aria-label="Menu" aria-expanded={open} aria-controls="home-nav" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h20M2 12h20M2 19h20" /></svg>
      </button>
      <nav id="home-nav" className={open ? "home-nav is-open" : "home-nav"} aria-label="Main navigation" onClick={() => setOpen(false)}>
        <Link to="/memories-from-afar">Memories from Afar</Link>
        <Link to="/day-of-guestbook">Day-of Guestbook</Link>
        <Link to="/living-legacy">Living Legacy</Link>
        <a href="/#our-family">Our Story</a>
        <Link to={me ? "/dashboard" : "/new"} className="home-start">{me ? "Your pages" : "Get Started"} <span aria-hidden="true">→</span></Link>
      </nav>
    </header>
  );
}

function HomeFooter({ home, product }: { home: boolean; product: boolean }) {
  const { me } = useSession();
  const story = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function showStory() {
      if (location.hash === "#our-family" && story.current) {
        story.current.open = true;
        story.current.scrollIntoView({ block: "nearest" });
      }
    }
    showStory();
    window.addEventListener("hashchange", showStory);
    return () => window.removeEventListener("hashchange", showStory);
  }, []);

  return (
    <footer className="home-footer">
      <Brand />
      <div>
        <h2>Our Products</h2>
        {cards.map(({ id, title }) => <Link key={id} to={`/${id}`}>{title}</Link>)}
      </div>
      <div>
        <h2>About</h2>
        {home ? <details id="our-family" ref={story}>
          <summary>Our Story</summary>
          <p>We’re a family business. We built Life Guestbook to give families an easy place to gather photographs and stories, one memory at a time.</p>
        </details> : <a href="/#our-family">Our Story</a>}
        <a href={home ? "#our-impact" : "/#our-impact"}>Our Impact</a>
      </div>
      <div>
        <h2>Support</h2>
        <Link to="/faq">Help &amp; FAQs</Link>
        <a href="mailto:hello@lifeguestbook.com">Contact Us</a>
        {!product && <><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/cookies">Cookies</Link><Link to="/refunds">Refunds</Link></>}
      </div>
      <div className={product ? "product-footer-bottom" : "home-footer-account"}>
        {product && <small>© {new Date().getFullYear()} Life Guestbook. All rights reserved.</small>}
        <Link to={me ? "/dashboard" : "/signin"}>{me ? "Your pages" : "Sign in"}</Link>
        {product && <><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/cookies">Cookies</Link><Link to="/refunds">Refunds</Link></>}
      </div>
    </footer>
  );
}

export function PublicLayout({ children, home = false, product = false }: { children: React.ReactNode; home?: boolean; product?: boolean }) {
  return (
    <div className={home ? "home-page" : `home-page public-page${product ? " product-page" : ""}`}>
      <HomeHeader />
      {children}
      <HomeFooter home={home} product={product} />
    </div>
  );
}

export function Home() {
  return (
    <PublicLayout home>
      <main className="home-main">
        <section className="home-hero">
          <div>
            <h1>There’s more to<br /> every life than <em>the stories we know.</em></h1>
            <svg className="home-underline" viewBox="0 0 150 16" aria-hidden="true">
              <path d="M3 11C51 2 105-1 148 5 104 3 50 7 4 16 0 17-1 12 3 11Z" fill="currentColor" />
            </svg>
            <p>Bring together the photos, memories and little moments that make a person who they are.</p>
          </div>
          <img
            className="home-hero-art"
            src="/images/golden-family-memories-collage.webp"
            srcSet="/images/golden-family-memories-collage-640.webp 640w, /images/golden-family-memories-collage-1120.webp 1120w, /images/golden-family-memories-collage.webp 1977w"
            sizes="(min-width: 1536px) 930px, (min-width: 1100px) 60vw, (min-width: 760px) 88vw, 94vw"
            width="1977" height="795" alt="" fetchPriority="high"
          />
        </section>

        <section className="home-products" id="products" aria-labelledby="home-products-title">
          <h2 className="home-section-heading" id="home-products-title">How would you like to tell their story?</h2>
          <p className="home-products-intro">Collect memories from afar, invite guests to share at a celebration of life, or start a life story.</p>
          <div className="home-product-grid">
            {cards.map(({ id, title, description }) => (
              <Link to={`/${id}`} className={`home-product home-product-${id}`} key={id}>
                <img
                  src={`/images/home-${id}-960.webp`}
                  srcSet={`/images/home-${id}-480.webp 480w, /images/home-${id}-960.webp 960w, /images/home-${id}-1440.webp 1440w`}
                  sizes="(min-width: 1536px) 460px, (min-width: 1100px) 30vw, (min-width: 640px) 47vw, 94vw"
                  alt="" width="960" height="640" loading="lazy"
                />
                <div className="home-card-copy">
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                  <span className="home-card-arrow" aria-hidden="true">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="home-uses" id="how-it-works" aria-labelledby="home-uses-title">
          <h2 className="home-section-heading" id="home-uses-title">More ways to use Life Guestbook</h2>
          <div className="home-uses-grid">
            {uses.map(([title, description]) => (
              <div key={title}><h3>{title}</h3><p>{description}</p></div>
            ))}
          </div>
        </section>

        <section className="home-impact" id="our-impact">
          <h2>50% of our profits go to charity</h2>
          <p>You pick the good cause. Help create a more connected and compassionate world.</p>
        </section>
      </main>
    </PublicLayout>
  );
}
