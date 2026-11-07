// FAQ and the legal pages (privacy, terms, cookies, refunds). The legal text is a plain-English draft
// that needs review by a lawyer for each launch market (UK, EU, Australia, New Zealand, US, Canada)
// before going live; see docs/legal-review-checklist.md.
import { FREE_CONTRIBUTION_LIMIT, TRIBUTE_HOSTING_YEARS } from "../../shared/plans";
import { CURRENCIES, formatPrice, PRODUCT_NAMES, RECURRING, type Product } from "../../shared/pricing";
import { Link } from "../router";
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
  ["Do plans renew automatically?", "Tribute and Forever are one-off payments and never renew. Yearly hosting (to reopen a Tribute after its 2 years) and Living Legacy renew each year until cancelled; we email before each renewal and any admin can cancel on the Plan tab. If something isn't right, email us within 14 days of any payment for a full refund."],
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

// ---------------------------------------------------------------------------------------------
// Legal pages: privacy, terms, cookies and refunds.
// DRAFT for legal review. Every [bracketed placeholder] is listed, with open questions, in
// docs/legal-review-checklist.md. Keep the copy there and here in step.
// ---------------------------------------------------------------------------------------------

const CONTROLLER = "[Company name, address]";
const LAST_UPDATED = "[Date]";

function LegalHeader({ title, intro }: { title: string; intro?: string }) {
  return (
    <>
      <h1>{title}</h1>
      <p className="notice small">Draft for legal review before launch. Text in [square brackets] is still to be confirmed.</p>
      <p className="muted small">Last updated: {LAST_UPDATED}</p>
      {intro && <p>{intro}</p>}
    </>
  );
}

function LegalNav() {
  return (
    <p className="small">
      <Link to="/privacy">Privacy policy</Link> · <Link to="/terms">Terms</Link> · <Link to="/cookies">Cookies</Link> · <Link to="/refunds">Refunds and cancellation</Link>
    </p>
  );
}

const PRODUCTS: Product[] = ["tribute", "forever", "hosting", "living"];

/** Every price in every currency, straight from the price list the checkout uses. */
function PriceTable() {
  return (
    <div className="table-scroll">
      <table className="small">
        <thead>
          <tr><th>Plan</th>{CURRENCIES.map((c) => <th key={c}>{c.toUpperCase()}</th>)}<th>Billing</th></tr>
        </thead>
        <tbody>
          {PRODUCTS.map((p) => (
            <tr key={p}>
              <td>{PRODUCT_NAMES[p]}</td>
              {CURRENCIES.map((c) => <td key={c}>{formatPrice(p, c)}</td>)}
              <td>{RECURRING[p] ? "Renews every year until cancelled" : "One-off payment"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Privacy() {
  return (
    <PublicLayout>
      <main className="public-info prose">
        <LegalHeader
          title="Privacy policy"
          intro="Life Guestbook is a place for families to gather memories of someone they love. That means we look after some of the most personal things people ever share. This policy explains what we collect, why, who helps us, how long we keep it and what you can ask us to do."
        />
        <LegalNav />

        <h2>1. Who we are</h2>
        <p>Life Guestbook (lifeguestbook.com) is run by {CONTROLLER} ("we", "us"). For the personal information described here, we are the data controller (in Australia, New Zealand and Canada, the organisation responsible for it). [EU representative under Article 27 GDPR, if required: name, address.] [UK representative, if required.]</p>
        <p>Questions or requests: <a href="mailto:privacy@lifeguestbook.com">privacy@lifeguestbook.com</a>. [Data protection officer, if appointed.] [Postal address for privacy requests.]</p>

        <h2>2. Who this covers</h2>
        <ul>
          <li><strong>Admins</strong>: people who create a page or are invited to help look after one (owner, co-admins and a Living Legacy's legacy contact).</li>
          <li><strong>Contributors</strong>: anyone who shares a memory, photo, video, voice message or letter. No account is needed.</li>
          <li><strong>Visitors</strong>: people who view a page or the slideshow.</li>
          <li><strong>People in memories</strong>: the person a page is about, and anyone else who appears in or is mentioned in what is shared.</li>
        </ul>

        <h2>3. What we collect</h2>
        <h3>From admins</h3>
        <p>Email address; name if you give it; Google account name and email if you sign in with Google; the pages you look after and your role on each; settings you choose; a record of important actions (approvals, ownership changes, purchases) kept so the family can see who did what; and billing details. Stripe takes card payments: we never see or store full card numbers. We receive from Stripe your email, the amount, currency, payment status, subscription status and a customer reference.</p>
        <h3>From contributors</h3>
        <p>The name you give, what you write or record, the photos, videos and audio you upload, an optional email address (only if you ask to be told when your memory is on the page) and a one-way hash of your IP address, used only to limit abuse and spam. We remove location data (GPS and other EXIF metadata) from photos when they are uploaded. Videos and voice recordings are stored as uploaded, so they may still contain details your device added, such as location. [Engineering: consider stripping video metadata.] Your name may be remembered on your own device so you don't have to type it again (see <Link to="/cookies">Cookies</Link>).</p>
        <h3>About the person a page is for</h3>
        <p>Admins add details such as name, dates of birth and death, a photo, service details and a life story. On a Living Legacy page, the person may record their own stories and sealed letters.</p>
        <h3>Automatically</h3>
        <p>Technical logs (IP address, browser, times and errors) kept by our hosting provider for security and to keep the service running. [If enabled, and only with your consent: error reports (Sentry) and usage analytics (Google Analytics 4). See <Link to="/cookies">Cookies</Link>.]</p>

        <h2>4. Information about people who have died, and about other people</h2>
        <p>In the UK and EU, data protection law generally protects living people only, but we treat information about someone who has died with the same care as anything else on the service. Memories often also contain information about living people: relatives, friends, people in photos. Some of it can be sensitive (for example health, religion or beliefs, shown in a cause of death or a funeral service).</p>
        <p>Admins decide who can see a page (link only, public or private) and approve what appears. If you appear in something on a page and want it changed or removed, ask the page's admins, use the "Report" link on the memory, or email us and we will review it (see section 10).</p>

        <h2>5. Why we use it, and our lawful bases</h2>
        <p>Where UK or EU data protection law applies, we rely on these lawful bases:</p>
        <div className="table-scroll">
          <table className="small">
            <thead><tr><th>What we do</th><th>Lawful basis</th></tr></thead>
            <tbody>
              <tr><td>Create and run pages for admins, sign you in, provide downloads, the slideshow and printed books</td><td>Contract with the admin</td></tr>
              <tr><td>Show contributors' memories on the page they chose, and include them in downloads and books</td><td>Legitimate interests (helping families remember someone, at the contributor's own request). [Lawyer: consider consent.]</td></tr>
              <tr><td>Sensitive information within memories</td><td>[Lawyer to confirm: explicit consent of the contributor / information made public by the person / other Article 9 condition]</td></tr>
              <tr><td>Automated screening of photos and text, abuse limits, reports, security logs</td><td>Legitimate interests (keeping pages safe and kind)</td></tr>
              <tr><td>Emails you'd expect: sign-in links, invitations, receipts, hosting reminders, approval queues</td><td>Contract, or legitimate interests for contributors' notices</td></tr>
              <tr><td>Optional emails: new-memory summaries, anniversary reminders, "your memory is on the page"</td><td>Legitimate interests with one-click unsubscribe, or consent where you opted in</td></tr>
              <tr><td>Writing help (AI drafting) when an admin asks for it</td><td>Contract with the admin; legitimate interests for contributors' memories used in the draft</td></tr>
              <tr><td>Taking payment, keeping tax and accounting records</td><td>Contract; legal obligation</td></tr>
              <tr><td>Optional analytics and error reporting cookies</td><td>Consent</td></tr>
              <tr><td>Responding to legal requests and protecting our rights</td><td>Legal obligation; legitimate interests</td></tr>
            </tbody>
          </table>
        </div>
        <p>We do not sell personal information, we do not use it for advertising, and we do not make decisions with legal or similarly significant effects about anyone purely by automated means. Automated screening can hold a memory back for a person to review; it never deletes anything on its own.</p>

        <h2>6. Children</h2>
        <p>Admins must be 18 or over. Life Guestbook is not aimed at children, and we do not knowingly collect personal information from children under 13 (or the minimum age in your country, [16] in parts of the EU) without a parent's or guardian's involvement. Children often want to share a memory of a grandparent: we ask that a parent or guardian helps them do it. Families often share photos of children: please think about whether the page should be private, and admins can remove any photo at any time. If you believe a child has given us information without permission, email <a href="mailto:privacy@lifeguestbook.com">privacy@lifeguestbook.com</a> and we will delete it.</p>

        <h2>7. Writing help and AI</h2>
        <p>When an admin uses writing help, the written text of the page's approved memories (not photos, video or audio) and anything the admin adds are sent to Anthropic, which provides the AI model that drafts the text. Sealed letters are not sent. Anthropic processes this on our behalf under its commercial terms, which do not allow it to use our customers' content to train its models. [Confirm Anthropic retention period for API inputs and outputs.] Drafts are suggestions: an admin always reviews them before anything is published. We do not use page content to train any AI model, ours or anyone else's.</p>
        <p>Automated screening of photos and text uses Google Cloud Vision and Natural Language under Google's cloud terms, which also do not allow Google to use the content to train its models.</p>

        <h2>8. Who helps us (sub-processors)</h2>
        <div className="table-scroll">
          <table className="small">
            <thead><tr><th>Provider</th><th>What for</th><th>Where</th></tr></thead>
            <tbody>
              <tr><td>Google Cloud / Firebase (Google LLC, Google Ireland Ltd)</td><td>Hosting, database, file storage, sign-in, automated screening of photos and text</td><td>Server functions in the United States (us-central1); database and file storage in [region]; support access may be from the US and elsewhere</td></tr>
              <tr><td>Resend (Plus Five Five, Inc.)</td><td>Sending email</td><td>United States</td></tr>
              <tr><td>Stripe (Stripe, Inc. / Stripe Payments Europe Ltd / Stripe Payments UK Ltd)</td><td>Payments and subscriptions</td><td>United States, Ireland, UK</td></tr>
              <tr><td>Anthropic (Anthropic PBC)</td><td>AI writing help, only when an admin uses it</td><td>United States</td></tr>
              <tr><td>[Sentry (Functional Software, Inc.)]</td><td>[Error reports, only with consent]</td><td>[United States / EU]</td></tr>
              <tr><td>[Google Analytics 4 (Google LLC)]</td><td>[Usage analytics, only with consent]</td><td>[United States]</td></tr>
            </tbody>
          </table>
        </div>
        <p>Each provider handles personal information only on our instructions and under a written data processing agreement. We will update this list before adding a new provider. [Lawyer: decide whether to offer advance notice of changes.]</p>

        <h2>9. International transfers</h2>
        <p>Some providers are in the United States and other countries that may not have the same data protection laws as yours. Where UK or EU law applies, we protect transfers with the EU-U.S. Data Privacy Framework and its UK extension where the provider is certified, or with the European Commission's Standard Contractual Clauses and the UK International Data Transfer Addendum. For Australia, New Zealand and Canada, we take reasonable steps so that overseas recipients protect information to a comparable standard. You can ask us for a copy of the safeguards.</p>

        <h2>10. Moderation, reports and takedown</h2>
        <p>Pages are set up so admins approve every memory first. Everything shared is also screened automatically; anything that looks unkind, explicit or unsafe is held back for a person to look at. Anyone can use the "Report" link on a memory: it is hidden from the page straight away until an admin reviews it.</p>
        <p>If an admin doesn't act, or the page itself is the problem, email <a href="mailto:[abuse@lifeguestbook.com]">[abuse@lifeguestbook.com]</a> with the page link and what's wrong. We aim to acknowledge reports within [2 working days] and to act on clearly unlawful content [promptly]. For more, see the moderation section of our <Link to="/terms">Terms</Link>.</p>

        <h2>11. How long we keep things</h2>
        <ul>
          <li><strong>Pages and memories</strong>: as long as the page exists. We never delete a page because hosting lapsed: it becomes read-only (frozen) but stays online and downloadable until an admin deletes it or asks us to.</li>
          <li><strong>Deleted pages</strong>: when the owner deletes a page, its memories and files are removed from the live service straight away. Copies in backups expire within [30 days].</li>
          <li><strong>Deleted memories</strong>: removed straight away when an admin deletes them; backups expire within [30 days].</li>
          <li><strong>Your account</strong>: to delete your account, email <a href="mailto:privacy@lifeguestbook.com">privacy@lifeguestbook.com</a>. We will delete it within [30 days]. Pages you own need a new owner first, or will be deleted with your account if you ask. Memories you shared as a contributor stay on the family's page unless you ask for them to be removed.</li>
          <li><strong>Sign-in links</strong>: expire after 30 minutes and work once. Sign-in sessions last up to 60 days.</li>
          <li><strong>Unfinished uploads</strong>: deleted after 24 hours.</li>
          <li><strong>IP hashes on memories</strong>: [kept with the memory / deleted after X months].</li>
          <li><strong>Payment and tax records</strong>: [6 / 7] years after the payment, as tax law requires, even if a page is deleted.</li>
          <li><strong>Server logs</strong>: [30 days].</li>
        </ul>

        <h2>12. Your rights</h2>
        <p>Admins can edit, hide or delete any memory, change who can see the page, download everything and delete the page at any time. Anyone can also ask us to:</p>
        <ul>
          <li>give you a copy of your personal information, and in a portable format;</li>
          <li>correct it;</li>
          <li>delete it;</li>
          <li>restrict or object to how we use it (including objecting to anything we do based on legitimate interests);</li>
          <li>withdraw consent where we rely on it, without affecting what we did before.</li>
        </ul>
        <p>Email <a href="mailto:privacy@lifeguestbook.com">privacy@lifeguestbook.com</a>. We may need to confirm who you are. We reply within one month (UK/EU), 30 days (Australia, New Zealand, Canada) or the period your local law requires (for example 45 days in California). If a memory you shared is on a family's page, we will usually pass your request to the admins first, and remove it ourselves if they don't.</p>
        <p><strong>United States</strong>: residents of California and other states with privacy laws have the rights above to know, access, correct and delete. We do not sell or "share" personal information for cross-context behavioural advertising, and we do not use sensitive information to infer characteristics about you. You will not be treated differently for using your rights. An authorised agent may make a request for you.</p>
        <p><strong>Complaints</strong>: please contact us first. You can also complain to your regulator: the Information Commissioner's Office (UK), your local data protection authority (EU), the Office of the Australian Information Commissioner, the Office of the Privacy Commissioner (New Zealand) or the Office of the Privacy Commissioner of Canada.</p>

        <h2>13. Keeping it safe</h2>
        <p>Data is encrypted in transit and at rest. Media is only served after checking the viewer is allowed to see the page. Sign-in links are single-use. Admin access is role-based and important actions are logged. If a breach affects you, we will tell you and the regulator as the law requires.</p>

        <h2>14. Changes</h2>
        <p>If we make a significant change to this policy, we'll email admins and show a notice on the site before it takes effect.</p>
      </main>
    </PublicLayout>
  );
}

export function Terms() {
  return (
    <PublicLayout>
      <main className="public-info prose">
        <LegalHeader
          title="Terms of service"
          intro={`These terms are an agreement between you and ${CONTROLLER} ("Life Guestbook", "we", "us"). By creating a page, sharing a memory or paying for a plan, you agree to them. Nothing in them takes away rights you have under the consumer law of the country where you live.`}
        />
        <LegalNav />

        <h2>1. The service</h2>
        <p>Life Guestbook lets families create memorial pages and Living Legacy pages, invite others to share memories, review what is shared, show a live slideshow, use writing help, download everything and print memory books and QR cards.</p>

        <h2>2. Who can use it</h2>
        <p>You must be 18 or over to create a page, be an admin or pay. Anyone can share a memory; children should do so with a parent or guardian. You must give accurate details and keep access to your email secure, because sign-in links are sent there.</p>

        <h2>3. Pages, admins and ownership</h2>
        <ul>
          <li>The person who creates a page is its <strong>owner</strong>. The owner can invite co-admins, who share the work of looking after it. The owner alone can delete the page or hand ownership to another admin.</li>
          <li>If the owner hasn't signed in for 90 days, an admin can ask to take over. The owner gets an email and 14 days to say no; signing in cancels the request.</li>
          <li>On a Living Legacy page, the person may choose a <strong>legacy contact</strong> who can later turn it into a memorial page.</li>
          <li>Please only create a page about someone if you are family or a close friend acting with the family's blessing. If there is a dispute about a page, we may ask for information, restrict changes while it is resolved, or move ownership to the person we reasonably think is best placed to look after it. [Lawyer: dispute and next-of-kin process.]</li>
        </ul>

        <h2>4. What you share</h2>
        <p>You keep the copyright and other rights in what you share. You give the page's admins and us a non-exclusive, worldwide, royalty-free licence to store, copy, adapt for display (for example resizing photos or converting video), show and distribute it on that page, in its slideshow, in downloads and in printed memory books, and to make copies needed to run, back up and screen the service. The licence lasts while the content is on the service and in backups, and for downloads and books already made by the family.</p>
        <p>You promise that you have the right to share it, and that anyone identifiable in it would not reasonably object. Please don't share someone else's private information without care.</p>

        <h2>5. Rules for everyone</h2>
        <p>Don't share or do anything that is unlawful, hateful, harassing, sexually explicit, violent or graphic, that infringes someone's copyright or privacy, that is spam or advertising, or that tries to break or misuse the service. Don't create a page to mock, deceive or defraud (for example a fake memorial to collect money). Don't use writing help to create misleading content.</p>

        <h2>6. Moderation, reports and takedown</h2>
        <ul>
          <li><strong>Admins moderate their page.</strong> New pages are set so that an admin approves every memory before it appears. Admins can hide, edit or delete anything on their page.</li>
          <li><strong>Automated screening.</strong> Photos and text are checked automatically. Anything flagged is held for an admin to review; screening can be wrong, so a person makes the decision.</li>
          <li><strong>Reporting.</strong> Anyone viewing a page can report a memory. It is hidden straight away until an admin reviews it.</li>
          <li><strong>Reporting to us.</strong> Email <a href="mailto:[abuse@lifeguestbook.com]">[abuse@lifeguestbook.com]</a> with the page link, what is wrong and why. We aim to respond within [2 working days]. We may hide or remove content, suspend a page or restrict an account if it breaks these terms or the law. Where we can and it is safe to, we will tell the admins what we did and why, and they can ask us to look again by replying to that email.</li>
          <li><strong>Copyright.</strong> If you believe something infringes your copyright, email [copyright@lifeguestbook.com] with the details the law requires. [US: designated DMCA agent name and address, registered with the US Copyright Office.]</li>
          <li><strong>Law enforcement.</strong> We respond to valid legal requests and may report content where the law requires it.</li>
        </ul>

        <h2>7. Writing help (AI)</h2>
        <p>Writing help drafts text from the memories on the page and anything you add, using an AI model provided by Anthropic. It can make mistakes, so please read every draft and check facts, names and dates before you use it. Where it lacks a fact it leaves a [placeholder]. Text it drafts for you is yours to use. We don't use page content to train AI models, and our provider's terms don't allow it to either. Free pages include 3 uses; paid pages have a fair-use daily limit.</p>

        <h2>8. Plans and prices</h2>
        <ul>
          <li><strong>Free</strong>: up to {FREE_CONTRIBUTION_LIMIT} photos and messages and 2 co-admins, with no time limit.</li>
          <li><strong>Tribute</strong>: a one-off payment for one memorial page. Includes {TRIBUTE_HOSTING_YEARS} years of hosting with all paid features. It does <strong>not</strong> renew automatically.</li>
          <li><strong>Forever</strong>: a one-off payment for one page. Hosted for the life of the service, with nothing to renew.</li>
          <li><strong>Keep it open (yearly hosting)</strong>: after a Tribute's hosting ends, any admin can reopen the page for one year at a time. This is a subscription that renews automatically every year until cancelled.</li>
          <li><strong>Living Legacy (yearly)</strong>: a subscription for a page about someone who is still with us. It renews automatically every year until cancelled. When the page becomes a memorial, the subscription stops straight away and the page gets {TRIBUTE_HOSTING_YEARS} years of Tribute hosting at no extra cost.</li>
        </ul>
        <p>Prices are per page and shown before you pay. We charge in pounds, Australian dollars, US dollars, New Zealand dollars, euros or Canadian dollars depending on where you are; elsewhere we charge in US dollars and your bank may convert it. Prices [include VAT/GST where applicable / exclude sales tax, which is added at checkout where required].</p>
        <PriceTable />
        <p>Any admin can pay for a page. The person who pays is the customer for that payment and will receive the receipts. Payments are processed by Stripe.</p>

        <h2>9. Automatic renewal</h2>
        <p>If you choose a yearly subscription (Keep it open or Living Legacy), <strong>you authorise us to charge your payment method the yearly price shown at checkout once a year, on the anniversary of your first payment, until you cancel.</strong></p>
        <ul>
          <li><strong>Reminders</strong>: we email the page's admins about 30 days and 7 days before each renewal, with the date [and the amount].</li>
          <li><strong>Cancel any time, online</strong>: an admin can cancel on the page's dashboard (Plan tab, "Cancel automatic renewal"), or email <a href="mailto:hello@lifeguestbook.com">hello@lifeguestbook.com</a>. Cancelling stops future charges; the page keeps its paid features until the end of the year already paid for, then becomes read-only.</li>
          <li><strong>Switching to Forever</strong> ends a yearly subscription straight away; it won't be charged again.</li>
          <li><strong>Price changes</strong>: we will tell you at least [30] days before a renewal at a new price, and you can cancel before it applies.</li>
          <li><strong>Failed payments</strong>: if a renewal payment fails, Stripe may retry it. If it can't be collected, the page becomes read-only at the end of the paid period. Nothing is deleted.</li>
          <li><strong>Deleting a page</strong>: please cancel automatic renewal on the Plan tab before deleting a page that has a subscription. [Engineering: page deletion should stop renewal automatically.]</li>
        </ul>

        <h2>10. Refunds and cancellation</h2>
        <p>If something isn't right, email us within 14 days of paying (including a yearly renewal) for a full refund. See our <Link to="/refunds">refund and cancellation policy</Link> for the details, and how this fits with your legal cancellation rights.</p>

        <h2>11. When hosting ends: we don't delete pages</h2>
        <p>If paid hosting ends and isn't renewed, the page becomes read-only ("frozen"): it stays online and everything can still be downloaded, but new memories, video, voice and the slideshow pause until any admin renews or chooses Forever. We won't delete a page for non-payment.</p>
        <p>If we ever had to close the service, we would give at least 12 months' notice and make a full download of every page available. "Forever" means for as long as Life Guestbook (or a successor to it) runs the service. [Lawyer: wording of the Forever promise and any successor/escrow arrangement.]</p>

        <h2>12. Ending your use</h2>
        <p>You can stop using Life Guestbook at any time. The owner can delete a page from its dashboard; this can't be undone, so download everything first. We may suspend or close a page or account that seriously or repeatedly breaks these terms, after giving notice where it is reasonable. If we close a paid page because of our own decision rather than your breach, we will refund the unused part of what you paid.</p>

        <h2>13. Availability and changes</h2>
        <p>We work hard to keep the service safe and available, but can't promise it will always be uninterrupted. We may improve or change features. If a change significantly reduces what you've paid for, we'll tell you and you can ask for a proportionate refund. We'll give at least [30] days' notice of material changes to these terms by email or on the site.</p>

        <h2>14. Our responsibility to you</h2>
        <p>If you are a consumer, we provide the service with reasonable care and skill, and you have legal rights that nothing in these terms limits, including:</p>
        <ul>
          <li><strong>UK</strong>: your rights under the Consumer Rights Act 2015.</li>
          <li><strong>Australia</strong>: our services come with guarantees that cannot be excluded under the Australian Consumer Law. For major failures you are entitled to cancel and get a refund for the unused portion, or compensation for its reduced value. You are also entitled to be compensated for any other reasonably foreseeable loss or damage.</li>
          <li><strong>New Zealand</strong>: your rights under the Consumer Guarantees Act 1993.</li>
          <li><strong>EU, US and Canada</strong>: the consumer protection laws of where you live.</li>
        </ul>
        <p>Otherwise, and as far as the law allows: we are not responsible for losses that weren't reasonably foreseeable, for business losses, or for content that other people share; and our total liability to you is limited to [the greater of the amount you paid us in the 12 months before the claim and £100 / equivalent]. We do not exclude liability for death or personal injury caused by negligence, fraud, or anything else that can't be excluded by law. Please keep your own downloaded copy of anything irreplaceable.</p>

        <h2>15. Law and disputes</h2>
        <p>These terms are governed by [the laws of England and Wales]. If you are a consumer, you also keep the protection of the mandatory laws of the country where you live, and you can bring a claim in your local courts. [US: dispute-resolution / arbitration approach, if any.] [EU: online dispute resolution statement, if required.] Please contact us first at <a href="mailto:hello@lifeguestbook.com">hello@lifeguestbook.com</a> so we can try to put things right.</p>

        <h2>16. Contact</h2>
        <p>{CONTROLLER}. [Company number, registered office, VAT/ABN/GST numbers as required.] Email <a href="mailto:hello@lifeguestbook.com">hello@lifeguestbook.com</a>.</p>
      </main>
    </PublicLayout>
  );
}

export function Cookies() {
  return (
    <PublicLayout>
      <main className="public-info prose">
        <LegalHeader
          title="Cookie policy"
          intro="We keep cookies and similar storage to a minimum. The ones we need to run the site are always on; anything optional is off unless you agree to it."
        />
        <LegalNav />

        <h2>Strictly necessary (always on)</h2>
        <div className="table-scroll">
          <table className="small">
            <thead><tr><th>Name</th><th>Type</th><th>What for</th><th>How long</th></tr></thead>
            <tbody>
              <tr><td>__session</td><td>Cookie (secure, HTTP-only), set by lifeguestbook.com</td><td>Keeps admins signed in</td><td>Up to 60 days, or until you sign out</td></tr>
              <tr><td>lgb-name</td><td>Local storage on your device</td><td>Remembers the name you used when sharing a memory, so you don't have to type it again</td><td>Until you clear your browser storage</td></tr>
              <tr><td>Google sign-in</td><td>Cookies and storage set by Google during "Sign in with Google"</td><td>Only if you choose to sign in with Google; we don't keep the Google session after sign-in</td><td>Set by Google; see Google's privacy policy</td></tr>
              <tr><td>Stripe Checkout</td><td>Cookies set by Stripe on its payment pages</td><td>Taking payment securely and preventing fraud</td><td>Set by Stripe; see Stripe's cookie policy</td></tr>
            </tbody>
          </table>
        </div>

        <h2>Optional (only with your consent)</h2>
        <p>[Not yet in use. Before launch we may add the following, which will only run if you choose "Accept" in our cookie banner, and which you can turn off at any time from the "Cookie settings" link in the footer.]</p>
        <div className="table-scroll">
          <table className="small">
            <thead><tr><th>Provider</th><th>What for</th><th>How long</th></tr></thead>
            <tbody>
              <tr><td>[Google Analytics 4: _ga, _ga_*]</td><td>[Counting visits and understanding which pages help people, with IP addresses not stored and advertising features off]</td><td>[Up to 2 years / 14 months data retention]</td></tr>
              <tr><td>[Sentry]</td><td>[Error reports so we can fix problems; no cookies, but may read technical data from your browser]</td><td>[90 days]</td></tr>
            </tbody>
          </table>
        </div>

        <h2>No advertising</h2>
        <p>We don't use advertising or social-media tracking cookies, and we don't sell or share personal information for advertising. [If GA4 is used, we will honour Global Privacy Control signals as an opt-out.]</p>

        <h2>Managing cookies</h2>
        <p>You can delete or block cookies in your browser settings. If you block strictly necessary cookies, admins won't be able to stay signed in. See our <Link to="/privacy">privacy policy</Link> for more about how we use personal information.</p>
      </main>
    </PublicLayout>
  );
}

export function Refunds() {
  return (
    <PublicLayout>
      <main className="public-info prose">
        <LegalHeader title="Refunds and cancellation" intro="The short version: if something isn't right, tell us within 14 days of paying and we'll refund you in full." />
        <LegalNav />

        <h2>14-day refund on every payment</h2>
        <p>Email <a href="mailto:hello@lifeguestbook.com">hello@lifeguestbook.com</a> within 14 days of any payment, including a yearly renewal, and we'll refund it in full to the card you paid with. You don't need to give a reason. Refunds usually reach your account within 5–10 working days.</p>
        <p>When we refund a payment, the page goes back to the plan it had before (for example Free, or read-only if earlier hosting had ended). Nothing anyone shared is deleted. If a free page now has more than {FREE_CONTRIBUTION_LIMIT} memories, they all stay on the page; you just can't add more until you upgrade again.</p>

        <h2>Your legal right to cancel</h2>
        <p>In the UK and EU you normally have a 14-day right to cancel online purchases. Because our paid features start as soon as you pay, [at checkout you ask us to start straight away] and the law would otherwise allow us to deduct what you've used. Our 14-day refund is more generous: we don't deduct anything. In Australia, New Zealand and elsewhere, our refund promise is in addition to your rights under consumer law, which can't be excluded.</p>

        <h2>After 14 days</h2>
        <ul>
          <li><strong>Tribute and Forever</strong> are one-off payments and aren't usually refundable after 14 days, except where the law requires it (for example if the service has a major failure) or where we close a page for our own reasons.</li>
          <li><strong>Yearly subscriptions</strong> (Keep it open, Living Legacy) aren't refunded for part of a year after 14 days, but you can cancel renewal at any time so you aren't charged again.</li>
          <li><strong>Switching to Forever</strong> stops a yearly subscription straight away, with no further charges. The rest of the subscription year isn't refunded separately, because Forever covers it.</li>
        </ul>

        <h2>Cancelling automatic renewal</h2>
        <p>Any admin can cancel at any time on the page's dashboard: open the <strong>Plan</strong> tab and choose <strong>Cancel automatic renewal</strong>. You can also email us. You'll keep paid features until the end of the year you've paid for. After that the page becomes read-only but stays online and downloadable; any admin can reopen it later.</p>

        <h2>Living Legacy pages that become memorials</h2>
        <p>When a Living Legacy page is turned into a memorial page, its subscription stops straight away and won't be charged again. The page gets {TRIBUTE_HOSTING_YEARS} years of Tribute hosting at no extra cost. Because that replaces the rest of the year you paid for, there's no partial refund, but if the renewal was charged in the last 14 days we'll refund it if you ask.</p>

        <h2>Questions</h2>
        <p>See our full <Link to="/terms">Terms</Link>, or email <a href="mailto:hello@lifeguestbook.com">hello@lifeguestbook.com</a>.</p>
      </main>
    </PublicLayout>
  );
}
