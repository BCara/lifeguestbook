import { useEffect } from "react";
import { Link } from "../router";
import { PublicLayout } from "./Home";
import { products } from "./home-products";
import "./ProductPage.css";

const icons = {
  camera: "M3 6h4l2-3h6l2 3h4v14H3z M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  message: "M21 11c0 4-4 7-9 7H9l-5 3 1-5a6 6 0 0 1-2-5c0-4 4-7 9-7s9 3 9 7z M8 11h.1m3.9 0h.1m3.9 0h.1",
  people: "M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M7 21v-3a5 5 0 0 1 10 0v3z M5 6a2.5 2.5 0 0 0 0 5m14-5a2.5 2.5 0 0 1 0 5M5 14a4 4 0 0 0-3 4v1m17-5a4 4 0 0 1 3 4v1",
  shield: "M12 2c3 2 6 3 9 3v6c0 5-4 9-9 11-5-2-9-6-9-11V5c3 0 6-1 9-3z M8 12l3 3 5-6",
  mail: "M2 5h20v14H2z M3 6l9 8 9-8",
  photo: "M2 3h20v18H2z M2 17l6-6 5 5 3-3 6 5 M16 7h.1",
  screen: "M2 3h20v14H2z M8 22h8m-4-5v5 M10 7l5 3-5 3z",
  qr: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h4m-7 4v-3m7-4v.1m0 6.9h-3",
  play: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M10 7l6 5-6 5z",
  download: "M12 2v13m-5-5 5 5 5-5M4 16v5h16v-5",
  book: "M12 5c-4-3-7-3-10-2v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-3-1-6-1-10 2v16",
  timeline: "M5 12h14 M3 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M21 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 5v7m0 0v5m-2 2 2-2 2 2-2 2z",
  check: "m4 12 5 5L20 6",
  heart: "M2 21c5 1 14-3 18-10 3-5-2-9-6-6l-2 3-2-3c-4-3-9 1-6 6 4 7 13 11 18 10",
};

function Icon({ name }: { name: keyof typeof icons }) {
  return <svg className="product-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={icons[name]} /></svg>;
}

export function ProductPage({ product }: { product: (typeof products)[number] }) {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute("content");
    document.title = `${product.title} | Life Guestbook`;
    description?.setAttribute("content", product.description);
    return () => {
      document.title = previousTitle;
      if (previousDescription != null) description?.setAttribute("content", previousDescription);
    };
  }, [product]);

  const start = (
    <Link to={product.to} className="home-start">Get Started <span aria-hidden="true">→</span></Link>
  );
  const art = `/images/product-${product.id}`;

  return (
    <PublicLayout product>
      <main className={`product-landing product-${product.id}`}>
        <section className="product-intro">
          <img
            className="product-hero-art"
            src={`${art}-hero-960.webp`}
            srcSet={`${art}-hero-600.webp 600w, ${art}-hero-960.webp 960w, ${art}-hero-1536.webp 1536w`}
            sizes="(min-width: 1200px) 810px, (min-width: 650px) max(65vw, 570px), max(100vw, 285px)"
            width="960" height="640" alt="" fetchPriority="high"
          />
          <div className="product-intro-copy">
            <p className="product-label">{product.title}</p>
            <h1>{product.heading}</h1>
            <p className="product-lead">{product.lead}</p>
            {start}
          </div>
        </section>

        <div className="product-content">
          <ul className="product-features" aria-label="Features">
            {product.features.map(([icon, title, copy]) => (
              <li key={title}><Icon name={icon} /><strong>{title}</strong><span>{copy}</span></li>
            ))}
          </ul>

          <section className="product-how" aria-labelledby="product-how-title">
            <h2 id="product-how-title" className="home-section-heading">How it works</h2>
            <div className="product-how-content">
              <ol className="product-steps" role="list">
                {product.steps.map(([icon, title, copy], index) => (
                  <li key={title}>
                    <span className="product-step-number" aria-hidden="true">{index + 1}</span>
                    <Icon name={icon} />
                    <div><h3>{title}</h3><p>{copy}</p></div>
                  </li>
                ))}
              </ol>
              <img className="product-steps-art" src={`${art}-steps-720.webp`} width="720" height="960" alt="" loading="lazy" />
            </div>
          </section>

          <section className="product-benefits">
            <img
              src={`${art}-benefits-840.webp`}
              srcSet={`${art}-benefits-420.webp 420w, ${art}-benefits-840.webp 840w, ${art}-benefits-1260.webp 1260w`}
              sizes="(min-width: 960px) 420px, (min-width: 650px) 44vw, min(420px, 90vw)"
              width="840" height="630" alt="" loading="lazy"
            />
            <div>
              <h2>{product.benefitsHeading}</h2>
              <ul>
                {product.benefits.map((benefit) => <li key={benefit}><Icon name="check" />{benefit}</li>)}
              </ul>
            </div>
          </section>

          <section className="product-next">
            <Icon name="heart" />
            <div>
              <h2>{product.nextHeading}</h2>
              <p>{product.nextCopy}</p>
            </div>
            {start}
          </section>
        </div>
      </main>
    </PublicLayout>
  );
}
