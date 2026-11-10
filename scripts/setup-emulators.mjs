import { writeFileSync } from "node:fs";

const defaults = {
  ".env.local": [
    "APP_ORIGIN=http://localhost:5173",
    "EMAIL_FROM=Life Guestbook <hello@example.test>",
    "EMAIL_REPLY_TO=hello@example.test",
    "SCREENING_ENABLED=false",
    "",
  ].join("\n"),
  ".secret.local": [
    "RESEND_API_KEY=none",
    "STRIPE_SECRET_KEY=none",
    "STRIPE_WEBHOOK_SECRET=none",
    "ANTHROPIC_API_KEY=none",
    "PORTFOLIO_REPORT_KEY=none",
    "",
  ].join("\n"),
};

for (const [name, contents] of Object.entries(defaults)) {
  try {
    writeFileSync(new URL(`../functions/${name}`, import.meta.url), contents, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}
