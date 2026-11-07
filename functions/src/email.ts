// Emails through Resend. Without a real RESEND_API_KEY each email is logged and, on the emulator,
// saved to the `devEmails` collection so the local test page can show it.
import { db } from "./db";
import { emailEnabled, isDev, type Env } from "./env";

export interface Email {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl?: string;
}

export async function sendEmail(env: Env, email: Email, deliveryId?: string): Promise<void> {
  if (!emailEnabled(env)) {
    if (!isDev()) throw new Error("Email delivery is unavailable");
    await db.collection("devEmails").add({ ...email, at: Date.now() });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(deliveryId ? { "Idempotency-Key": deliveryId } : {}) },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      reply_to: env.EMAIL_REPLY_TO,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.unsubscribeUrl ? { "List-Unsubscribe": `<${email.unsubscribeUrl}>` } : undefined,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** A calm, single-column layout that renders well in every mail client. */
function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }, footer?: string) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:#5b4636;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f7f3ee;font-family:Georgia,'Times New Roman',serif;color:#2f2721">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#8a7766;margin:0 0 20px">Life Guestbook</p>
<h1 style="font-size:24px;font-weight:normal;margin:0 0 16px">${esc(title)}</h1>
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6">${bodyHtml}${button}</div>
<p style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;color:#8a7766;margin-top:36px">${footer ?? "You're receiving this because of your Life Guestbook account."}</p>
</div></body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 12px">${s}</p>`;

export function signInEmail(to: string, link: string): Email {
  return {
    to,
    subject: "Your Life Guestbook sign-in link",
    html: layout("Sign in to Life Guestbook", p("Tap the button to sign in. The link works once and expires in 30 minutes."), { label: "Sign in", url: link },
      "If you didn't ask for this, you can ignore this email."),
    text: `Sign in to Life Guestbook (link expires in 30 minutes):\n${link}`,
  };
}

export function inviteEmail(to: string, inviter: string, memorialName: string, roleLabel: string, link: string): Email {
  return {
    to,
    subject: `${inviter} invited you to help look after ${memorialName}'s guestbook`,
    html: layout(`Help look after ${memorialName}'s page`,
      p(`${esc(inviter)} has added you as <strong>${esc(roleLabel)}</strong> on the Life Guestbook page for ${esc(memorialName)}.`) +
      p("Shared admins mean the page is never locked to one person. You'll be able to review memories people send in and keep the page as the family wants it."),
      { label: "Accept invitation", url: link }),
    text: `${inviter} invited you as ${roleLabel} for ${memorialName}'s Life Guestbook page.\nAccept: ${link}`,
  };
}

export function pageReadyEmail(to: string, memorialName: string, pageUrl: string, dashboardUrl: string, privatePage = false): Email {
  if (privatePage) {
    return {
      to,
      subject: `${memorialName}'s private guestbook is ready`,
      html: layout("Your private guestbook is ready", p("Open the dashboard to finish your page and invite family."), { label: "Open dashboard", url: dashboardUrl }),
      text: `Your private guestbook is ready. Open the dashboard to finish it and invite family: ${dashboardUrl}`,
    };
  }
  return {
    to,
    subject: `${memorialName}'s page is ready to share`,
    html: layout(`${memorialName}'s page is ready`,
      p("Share this link in your family group chat, on Facebook and by email. Anyone with it can add photos and memories, with no app or account needed:") +
      p(`<a href="${esc(pageUrl)}">${esc(pageUrl)}</a>`) +
      p("From your dashboard you can invite co-admins, review memories before they appear, and print QR cards for the service."),
      { label: "Open dashboard", url: dashboardUrl }),
    text: `${memorialName}'s page is ready.\nShare: ${pageUrl}\nDashboard: ${dashboardUrl}`,
  };
}

export function digestEmail(to: string, memorialName: string, newCount: number, pending: number, reports: number, reviewUrl: string, unsubscribeUrl: string): Email {
  const lines = [
    `${newCount} new ${newCount === 1 ? "memory has" : "memories have"} been added to ${esc(memorialName)}'s page.`,
    pending ? `<strong>${pending}</strong> ${pending === 1 ? "is" : "are"} waiting for your approval.` : "",
    reports ? `<strong>${reports}</strong> ${reports === 1 ? "item was" : "items were"} reported and hidden until reviewed.` : "",
  ].filter(Boolean);
  return {
    to,
    subject: pending ? `${pending} new ${pending === 1 ? "memory" : "memories"} to review for ${memorialName}` : `New memories for ${memorialName}`,
    html: layout("New memories", lines.map(p).join(""), { label: pending ? "Review now" : "See the page", url: reviewUrl },
      `You're an admin of this page. <a href="${esc(unsubscribeUrl)}">Stop these emails</a>.`),
    text: `${newCount} new memories for ${memorialName}. ${pending} waiting for review.\n${reviewUrl}\nUnsubscribe: ${unsubscribeUrl}`,
    unsubscribeUrl,
  };
}

export function approvedEmail(to: string, authorName: string, memorialName: string, pageUrl: string): Email {
  return {
    to,
    subject: `Your memory of ${memorialName} is now on the page`,
    html: layout("Thank you for sharing", p(`Hi ${esc(authorName)}, the family has added your memory to ${esc(memorialName)}'s page.`), { label: "See the page", url: pageUrl },
      "You're receiving this because you left your email when sharing a memory."),
    text: `Your memory of ${memorialName} is now on the page: ${pageUrl}`,
  };
}

export function transferEmail(to: string, from: string, memorialName: string, link: string): Email {
  return {
    to,
    subject: `${from} wants to make you the owner of ${memorialName}'s page`,
    html: layout("Become the page owner?", p(`${esc(from)} would like to hand ownership of ${esc(memorialName)}'s page to you. As owner you'll look after billing and can never be removed by other admins.`),
      { label: "Review and accept", url: link }),
    text: `${from} wants to transfer ownership of ${memorialName}'s page to you: ${link}`,
  };
}

export function receiptEmail(to: string, memorialName: string, productName: string, amount: string, dashboardUrl: string): Email {
  return {
    to,
    subject: `Receipt: ${productName} for ${memorialName}`,
    html: layout("Thank you", p(`We've received your payment of ${esc(amount)} for <strong>${esc(productName)}</strong> on ${esc(memorialName)}'s page. Everything is unlocked now.`),
      { label: "Open dashboard", url: dashboardUrl }),
    text: `Payment received: ${productName} (${amount}) for ${memorialName}. ${dashboardUrl}`,
  };
}

export function renewalEmail(to: string, memorialName: string, daysLeft: number, dashboardUrl: string): Email {
  const lapsed = daysLeft <= 0;
  return {
    to,
    subject: lapsed ? `${memorialName}'s page is now read-only` : `${memorialName}'s page: hosting renews in ${daysLeft} days`,
    html: layout(lapsed ? "The page is safe, but read-only" : "A reminder about hosting",
      (lapsed
        ? p(`Hosting for ${esc(memorialName)}'s page has lapsed. <strong>Nothing has been deleted</strong>: the page stays online and you can download everything. New memories and the slideshow are paused until any admin renews.`)
        : p(`Hosting for ${esc(memorialName)}'s page ends in ${daysLeft} days. Any admin can renew, or choose Forever so it never needs renewing.`)),
      { label: "Renew hosting", url: dashboardUrl }),
    text: `${memorialName}: ${lapsed ? "hosting lapsed; page is read-only, nothing deleted" : `hosting ends in ${daysLeft} days`}. ${dashboardUrl}`,
  };
}

export function conversionEmail(to: string, memorialName: string, actor: string, lettersOpened: number, dashboardUrl: string): Email {
  return {
    to,
    subject: `${memorialName}'s page is now a memorial`,
    html: layout(`In memory of ${memorialName}`,
      p(`${esc(actor)} has marked ${esc(memorialName)}'s Living Legacy page as a memorial. Everything ${esc(memorialName.split(" ")[0])} recorded is safe, and friends can now share their memories too.`) +
      (lettersOpened ? p(`<strong>${lettersOpened} sealed ${lettersOpened === 1 ? "letter has" : "letters have"} opened</strong> and can be read from the dashboard by the family.`) : "") +
      p("From the dashboard you can add the service details, share the link, and print QR cards for the day."),
      { label: "Open dashboard", url: dashboardUrl }),
    text: `${memorialName}'s page is now a memorial. ${lettersOpened} sealed letters opened. ${dashboardUrl}`,
  };
}

export function recoveryEmail(to: string, memorialName: string, requester: string, link: string): Email {
  return {
    to,
    subject: `${requester} has asked to look after ${memorialName}'s page`,
    html: layout("Are you still looking after this page?",
      p(`${esc(requester)}, an admin of ${esc(memorialName)}'s page, has asked to become its owner because you haven't signed in for a while.`) +
      p("<strong>If that's fine, you don't need to do anything.</strong> Ownership moves to them in 14 days and you'll stay on as an admin. If you'd rather keep it, sign in and cancel the request; signing in at all cancels it too."),
      { label: "Keep ownership", url: link }),
    text: `${requester} asked to take over ${memorialName}'s page. It moves in 14 days unless you sign in: ${link}`,
  };
}

export function anniversaryEmail(to: string, memorialName: string, years: number, pageUrl: string, unsubscribeUrl: string): Email {
  const first = memorialName.split(" ")[0];
  const when = years === 1 ? "a year" : `${years} years`;
  return {
    to,
    subject: `Remembering ${first}, ${when} on`,
    html: layout(`Remembering ${first}`,
      p(`It's ${when} today since ${esc(memorialName)} passed away. We hope the memories people shared bring some comfort.`) +
      p("Today can be a good day to invite more: people often find a photo or remember a story they didn't think of at the time."),
      { label: `Visit ${first}'s page`, url: pageUrl },
      `You're an admin of this page. <a href="${esc(unsubscribeUrl)}">Stop these emails</a>.`),
    text: `It's ${when} today since ${memorialName} passed away. ${pageUrl}`,
    unsubscribeUrl,
  };
}

export function dayBeforeEmail(to: string, memorialName: string, wallUrl: string | undefined, dashboardUrl: string): Email {
  return {
    to,
    subject: `Tomorrow: ${memorialName}'s service checklist`,
    html: layout("Ready for tomorrow",
      p("A few things that help on the day:") +
      `<ul style="margin:0 0 12px;padding-left:20px"><li>Put the printed QR cards on tables and by the entrance.</li>${wallUrl ? `<li>Open the slideshow on the venue laptop: <a href="${esc(wallUrl)}">slideshow link</a>.</li>` : ""}<li>Ask one person to keep an eye on the review queue from their phone.</li></ul>`,
      { label: "Open dashboard", url: dashboardUrl }),
    text: `Tomorrow's checklist for ${memorialName}. ${wallUrl ? `Slideshow: ${wallUrl}  ` : ""}Dashboard: ${dashboardUrl}`,
  };
}

export function recapEmail(to: string, memorialName: string, memories: number, people: number, dashboardUrl: string): Email {
  return {
    to,
    subject: `${memories} memories of ${memorialName}`,
    html: layout(`${memories} memories from ${people} people`,
      p(`Thank you for sharing ${esc(memorialName)}'s page. People can keep adding memories, and you can download everything at any time from the dashboard.`),
      { label: "See the memories", url: dashboardUrl }),
    text: `${memories} memories from ${people} people for ${memorialName}. ${dashboardUrl}`,
  };
}
