// FAQ, privacy and terms. The privacy and terms text is a plain-English starting point that needs
// review by a lawyer in each launch market (UK, Australia, US) before going live.
import { FREE_CONTRIBUTION_LIMIT } from "../../shared/plans";
import { PublicLayout } from "./Home";

const FAQ: [string, string][] = [
  ["Do guests need an app or an account?", "No. Guests scan the QR code or tap the link, add a photo, video, voice message or a few words, and that's it."],
  ["Who can see the page?", "By default, only people with the link. You can make it public (findable on search engines) or private (only invited family) at any time."],
  ["Can anything appear without us seeing it first?", "Not unless you choose that. New pages are set so an admin approves every memory first. Everything is also screened automatically, and anything unkind is held back or hidden."],
  ["What if I'm the only one with access and something happens to me?", "Every page can have several admins with full access, and we encourage at least two. You can hand ownership to another admin at any time. If an owner stops signing in for 90 days, an admin can ask to take over; the owner gets 14 days' notice to say no."],
  ["What does the writing help do?", "It drafts a life story, eulogy, obituary or thank-you message from the memories people have shared and anything you add. It doesn't make things up: where it needs a fact it doesn't have, it leaves a [placeholder] for you. Always read it through and make it yours."],
  ["What is a Living Legacy?", "A page for someone who's still with us, to tell their own story with family: chapters of their life, suggested questions to ask, recordings in their own voice, and letters sealed until later. When the time comes, a chosen legacy contact turns it into their memorial page."],
  ["How does the slideshow work on the day?", "Open the slideshow link on the venue laptop or TV. Approved memories play on a loop, new ones appear within seconds of approval, and a QR code in the corner invites people to add theirs. You can pause or skip from your phone."],
  ["What happens when hosting ends?", "We never delete a page because a renewal was missed. It stays online and downloadable, and new memories and the slideshow pause until any admin renews. Or choose Forever and never think about it."],
  ["Can we download everything?", "Yes, any time: a ZIP of every photo, video and recording plus all the written memories, and a printable memory book you can save as a PDF."],
  ["What's free?", `A page with up to ${FREE_CONTRIBUTION_LIMIT} photos and messages, 2 co-admins, approval and screening, QR cards and full download. The upgrade adds unlimited memories, video and voice, the live slideshow and unlimited admins.`],
];

export function Faq() {
  return (
    <PublicLayout>
      <main className="public-info prose">
        <h1>Help &amp; frequently asked questions</h1>
        <p>Find out how guests share memories, how your family manages the page and what you can keep.</p>
        <div className="public-faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <p>Have another question? Email <a href="mailto:hello@lifeguestbook.com">hello@lifeguestbook.com</a>.</p>
      </main>
    </PublicLayout>
  );
}

export function Privacy() {
  return (
    <PublicLayout>
      <main className="public-info prose">
        <h1>Privacy</h1>
        <p className="notice small">Draft for legal review before launch.</p>
        <h3>What we keep</h3>
        <p>For admins: your email address, name if given, and which pages you look after. For guests: the name, words and files you share, an optional email if you want to know when it's on the page, and a one-way hash of your IP address used only to stop abuse. We strip location data (GPS) from photos when they're uploaded.</p>
        <h3>Why</h3>
        <p>To run the page you or your family created: showing memories to the people the family chooses, sending the emails you'd expect (sign-in links, invitations, summaries of new memories, receipts and reminders), preventing abuse, and taking payment.</p>
        <h3>Who else handles it</h3>
        <p>Google Cloud and Firebase (hosting, database, file storage and automated screening of photos and text), Resend (email), Stripe (payments; we never see card numbers) and Anthropic (only when an admin uses writing help: the page's approved memories are sent to draft the text and are not used to train models).</p>
        <h3>Your choices</h3>
        <p>Admins can edit, hide or delete any memory, change who can see the page, download everything, or delete the page entirely. If you shared a memory and want it removed, ask the family or email us and we'll pass it on or remove it. You can unsubscribe from non-essential emails with one click.</p>
        <h3>How long</h3>
        <p>Pages stay as long as the family wants them. Deleted pages and their files are removed straight away; backups expire within 30 days. Sign-in links expire after 30 minutes.</p>
        <h3>Contact</h3>
        <p><a href="mailto:privacy@lifeguestbook.com">privacy@lifeguestbook.com</a></p>
      </main>
    </PublicLayout>
  );
}

export function Terms() {
  return (
    <PublicLayout>
      <main className="public-info prose">
        <h1>Terms</h1>
        <p className="notice small">Draft for legal review before launch.</p>
        <h3>The page belongs to the family</h3>
        <p>Whoever creates a page and the admins they invite decide what's on it and who can see it. People who share memories keep the copyright in what they share and let the page's admins and us show it on that page, include it in downloads and printed books, and use it in the slideshow.</p>
        <h3>Be kind</h3>
        <p>Don't share anything unlawful, hateful, sexual, violent, or that isn't yours to share. We screen contributions automatically and may hide or remove content that breaks these rules, and we'll cooperate with lawful requests.</p>
        <h3>Payments and refunds</h3>
        <p>Tribute and Forever are one-off payments per page; yearly hosting and Living Legacy renew each year until cancelled. If something isn't right within 14 days of paying, email us for a full refund.</p>
        <h3>Our promise about hosting</h3>
        <p>If hosting lapses, the page becomes read-only but stays online and downloadable. We won't delete a page for non-payment. If we ever had to close the service, we'd give at least 12 months' notice and a full download of every page.</p>
        <h3>Liability</h3>
        <p>We work hard to keep everything safe and available, but the service is provided as it is. Nothing in these terms limits rights you have under consumer law where you live.</p>
      </main>
    </PublicLayout>
  );
}
