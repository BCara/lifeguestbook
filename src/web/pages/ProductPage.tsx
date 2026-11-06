import { useEffect } from "react";
import { Footer } from "../components";
import { Link } from "../router";
import { HomeHeader, ProductArt } from "./Home";
import { products } from "./home-products";

export function ProductPage({ product }: { product: (typeof products)[number] }) {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute("content");
    document.title = `${product.heading} | LifeGuestbook`;
    description?.setAttribute("content", product.description);
    return () => {
      document.title = previousTitle;
      if (previousDescription != null) description?.setAttribute("content", previousDescription);
    };
  }, [product]);

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="product-landing">
        <a className="product-back" href="/#products">← All three ways to use LifeGuestbook</a>
        <div className="product-intro">
          <div>
            <p className="home-family-label">{product.title}</p>
            <h1>{product.heading}</h1>
            <p>{product.lead}</p>
            <Link to={product.to} className="home-start">{product.action}</Link>
          </div>
          <ProductArt className="product-landing-art" viewBox={product.art} />
        </div>
        <div className="product-steps">
          {product.sections.map(([title, copy]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{copy}</p>
            </section>
          ))}
        </div>
        <p className="product-family">LifeGuestbook is a family business. <a href="/#our-family">A little about us</a></p>
      </main>
      <Footer />
    </div>
  );
}

