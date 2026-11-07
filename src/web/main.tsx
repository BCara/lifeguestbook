import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SessionProvider } from "./session";
import { initAnalytics } from "./monitoring/analytics";
import { ConsentBanner } from "./monitoring/ConsentBanner";
import { initSentry } from "./monitoring/sentry";
import "./styles.css";

// Both are no-ops unless VITE_SENTRY_DSN / VITE_GA_MEASUREMENT_ID are set (GA also needs consent).
void initSentry();
initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <App />
      <ConsentBanner />
    </SessionProvider>
  </StrictMode>,
);
