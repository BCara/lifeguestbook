# Legal review checklist

Status: **draft for legal review, not legal advice.** The privacy policy, terms, cookie policy and
refund/cancellation policy live in `src/web/pages/Info.tsx` (routes `/privacy`, `/terms`, `/cookies`,
`/refunds`). Billing copy also appears in the Plan tab (`src/web/pages/Manage.tsx`, `Plan`) and in the
receipt and renewal emails (`functions/src/email.ts`, `receiptEmail` and `renewalEmail`). Keep all of them in step;
`tests/billing-emails.test.ts` guards the email disclosures.

Markets: UK, EU, Australia, New Zealand, United States, Canada.
Processors: Google Cloud/Firebase, Resend, Stripe, Anthropic; Sentry and GA4 planned (consent-gated).

The "Draft for legal review before launch" notice is shown at the top of every legal page and should be
removed only after sign-off.

## 1. Placeholders to fill

| Placeholder | Where | Notes |
|---|---|---|
| `[Company name, address]` | Privacy §1, Terms intro and §16 (`CONTROLLER` constant) | Legal entity acting as controller and contracting party |
| `[Date]` | Every legal page (`LAST_UPDATED` constant) | Effective / last-updated date |
| `[EU representative under Article 27 GDPR …]` | Privacy §1 | Needed if no EU establishment and Art. 27(2) exemption doesn't apply |
| `[UK representative, if required.]` | Privacy §1 | Needed if the controller is outside the UK |
| `[Data protection officer, if appointed.]` | Privacy §1 | Likely not mandatory; confirm |
| `[Postal address for privacy requests.]` | Privacy §1 | |
| `[Company number, registered office, VAT/ABN/GST numbers as required.]` | Terms §16 | UK Companies Act / E-Commerce Regs disclosures; AU ABN if registered |
| `[region]` for database and storage | Privacy §8 | Functions run in `us-central1` (see `firebase.json`); confirm Firestore and Storage location |
| `[Confirm Anthropic retention period …]` | Privacy §7 | Check current Anthropic commercial terms / zero-retention options |
| `[abuse@lifeguestbook.com]` | Privacy §10, Terms §6 | Mailbox must exist and be monitored |
| `[copyright@lifeguestbook.com]` | Terms §6 | Or reuse abuse@ |
| `[US: designated DMCA agent …]` | Terms §6 | Register with the US Copyright Office for §512 safe harbour |
| `[2 working days]`, `[promptly]` | Privacy §10, Terms §6 | Report response targets we can actually meet |
| `[30 days]` (backups, account deletion, logs) | Privacy §11 | **Engineering to confirm** backups exist and their real expiry; Cloud Logging retention |
| `[kept with the memory / deleted after X months]` | Privacy §11 | IP hashes on contributions (`ipHash`) currently have no expiry |
| `[6 / 7]` years | Privacy §11 | UK 6 yrs (HMRC), AU 5 yrs, US/CA ~6–7 yrs; pick one |
| `[16]` minimum age | Privacy §6 | GDPR Art. 8 age varies 13–16 by member state |
| `[Lawyer: consider consent.]`, `[Lawyer to confirm: … Article 9 condition]` | Privacy §5 table | See questions below |
| `[Lawyer: decide whether to offer advance notice of changes.]` | Privacy §8 | Sub-processor change notice |
| Sentry / GA4 rows and text in brackets | Privacy §3, §8; Cookies "Optional" | Remove if not launched; otherwise finalise cookie names, retention and settings |
| `[If GA4 is used, we will honour Global Privacy Control …]` | Cookies | Required in some US states if anything counts as "sharing" |
| `[include VAT/GST … / exclude sales tax …]` | Terms §8 | Depends on tax registration and whether Stripe Tax is used |
| `[and the amount]` | Terms §9 | Renewal reminders currently say "the price shown on your last receipt" (amount not stored); see engineering items |
| `[30]` days | Terms §9 (price changes), §13 (term changes) | |
| `[Lawyer: dispute and next-of-kin process.]` | Terms §3 | |
| `[Lawyer: wording of the Forever promise …]` | Terms §11 | |
| `[the greater of … £100 / equivalent]` | Terms §14 | Liability cap |
| `[the laws of England and Wales]` | Terms §15 | Governing law |
| `[US: dispute-resolution / arbitration approach, if any.]` | Terms §15 | |
| `[EU: online dispute resolution statement, if required.]` | Terms §15 | EU ODR platform was being wound down in 2025; confirm whether any statement is still needed |
| `[at checkout you ask us to start straight away]` | Refunds | Only true once checkout captures the express request + acknowledgement (see below) |
| `[Engineering: page deletion should stop renewal automatically.]` | Terms §9 | See engineering items |
| `[Engineering: consider stripping video metadata.]` | Privacy §3 | See engineering items |

## 2. Questions for the lawyer

### Privacy and data protection
1. **Controller vs processor.** We've drafted Life Guestbook as controller for everything, with families possibly within the household exemption. Is that right, or are families (or page owners) controllers for page content with us as processor? Does that change for public pages?
2. **Lawful basis for contributors' content.** Legitimate interests vs consent for publishing a contributor's memory on the page they chose. Consent would make withdrawal = removal; is that desirable?
3. **Special category data (UK/EU GDPR Art. 9).** Memories may reveal health (cause of death), religion (funeral rites) or other special category data about **living** relatives and contributors. Which Art. 9 condition applies: explicit consent at upload, "manifestly made public", or should we add an upload-time notice/checkbox?
4. **Deceased persons.** UK/EU GDPR doesn't cover the dead, but some EU states (e.g. France, Italy, Denmark) have post-mortem data rules, and the Australian/NZ/Canadian positions differ. Is the "we treat it with the same care" wording adequate? Any next-of-kin rights we should offer?
5. **Children.** Is "admins 18+, guests under 13 with a parent" enough for COPPA (US) given the service isn't directed at children? Is the EU age-of-consent wording right? Photos of children uploaded by family: any extra obligations (UK Children's Code applicability)?
6. **Automated screening.** Google Vision/Natural Language holds content for human review and never deletes. Confirm this isn't an Art. 22 automated decision and the transparency wording is enough.
7. **AI writing help.** Confirm Anthropic's commercial terms support "not used to train models", and whether we need Anthropic named as a sub-processor with a DPA (yes, assumed). Is a separate notice at the point of use needed?
8. **International transfers.** Confirm the DPF/SCC/IDTA wording for each US provider (Google, Resend, Stripe, Anthropic, Sentry). Is a transfer risk assessment needed? Australian APP 8, NZ IPP 12 and Canadian PIPEDA/Quebec Law 25 wording?
9. **US state privacy laws.** Do we meet any thresholds (CCPA etc.)? If not, keep the US paragraph as goodwill or trim? If GA4 is added, does it count as "sharing" for cross-context behavioural advertising?
10. **Quebec Law 25.** Any additional obligations (privacy officer named publicly, privacy impact assessment for transfers outside Quebec)?
11. **Response times.** We list one month (UK/EU), 30 days (AU/NZ/CA), 45 days (California). Correct?
12. **Retention.** Is "forever while the page exists, frozen pages never deleted" defensible under storage limitation, especially for lapsed free/abandoned pages? Should we add an inactivity policy?
13. **Account deletion** is by email only today (no self-serve). Acceptable at launch?

### Terms
14. **Content licence** scope and survival (downloads/books already made). Moral rights waiver needed?
15. **Disputes over pages** between family members, and requests from next of kin to remove a page they didn't create. What process and wording?
16. **Moderation / online safety.** Does the UK Online Safety Act apply (user-to-user service)? If so: illegal content risk assessment, reporting/complaints, terms requirements. EU Digital Services Act: notice-and-action, statement of reasons, points of contact. Australia's Online Safety Act / Basic Online Safety Expectations?
17. **DMCA** agent registration and repeat-infringer policy wording for US safe harbour.
18. **"Forever" promise.** How should "for the life of the service" plus "12 months' notice and full download on closure" be worded? Do we need escrow / a successor arrangement to make it fair and not misleading?
19. **Liability cap and exclusions**: acceptable for consumers in each market (UK CRA, AU ACL unfair terms, NZ, EU UCTD)? Is the ACL wording the mandatory text required?
20. **Governing law / jurisdiction** given consumers in six markets. Arbitration/class waiver for the US: recommended or not?
21. **Fake memorials / fundraising fraud** clause: adequate?

### Billing, auto-renewal and refunds
22. **UK/EU 14-day cancellation (CCRs / Consumer Rights Directive).** Paid features start immediately. Our policy offers a full no-questions 14-day refund instead of a deduction. Do we still need the express request + acknowledgement at checkout and the cancellation information/model form in the confirmation email? (The receipt email now includes the 14-day refund and links to the policy and terms.)
23. **UK DMCC Act 2024 subscription contract rules** (commencement expected [confirm date]). Requirements for pre-contract information, reminder notices before renewal, renewal cooling-off periods and easy exit. Our yearly reminders go out ~30 and ~7 days before renewal. Is that enough, and does the reminder need the amount?
24. **US automatic renewal laws** (California ARL as amended 2024/25, FTC Negative Option Rule status, New York, etc.). Checkout must show the terms "clearly and conspicuously" next to the pay button with affirmative consent; Stripe Checkout shows the yearly price. Do we need an explicit checkbox? The acknowledgement email (receipt) now states renewal, price, frequency and how to cancel. Annual reminder 15–45 days before renewal (we send at 30). Does the reminder need the exact amount?
25. **Australia (ACL).** Subscription traps / unfair contract terms; the "unfair trading practices" reform proposals. Is our ACL consumer guarantees wording right?
26. **Canada / Quebec.** Consumer Protection Act distance-contract requirements, renewal notices.
27. **Refunds after conversion.** Living Legacy → memorial cancels the subscription immediately with no proration, but grants 2 years' Tribute hosting free. Switching to Forever also cancels immediately with no proration. Is "no partial refund" fair in all markets?
28. **Tax display.** Are prices inclusive of VAT/GST (required for UK/EU/AU/NZ consumers)? Do we need Stripe Tax and to register in any market (EU OSS, AU GST, NZ GST, CA GST/HST, US states)?
29. **Refund rule interaction with "frozen, never deleted".** After a refund the page reverts to its earlier plan; a free page over the 30-memory limit keeps everything but can't add more. Any issue?

## 3. Engineering items found during the review (not legal, but the policies depend on them)

These were **not changed** in this pass (copy/content only). Fix before launch or adjust the policy wording.

1. **Deleting a page doesn't cancel its Stripe subscription.** `DELETE /memorials/:id` (`functions/src/routes/host.ts`) removes the page but never calls `stopRecurringBilling`, so a yearly subscription would keep charging for a deleted page. The terms currently ask users to cancel first; the fix is to call `stopRecurringBilling(env, id, true)` before deletion.
2. **Renewal reminders don't state the amount.** The subscription amount and currency aren't stored on the memorial; reminders refer to "the price shown on your last receipt". Store the price at checkout (or fetch the upcoming invoice from Stripe) if the lawyer says the amount must be in the reminder (likely for California and the UK DMCC rules).
3. **Checkout consent.** Stripe Checkout is reached straight from the Plan tab. Consider an explicit acknowledgement before redirect (auto-renewal terms; UK/EU request for immediate start / loss of the statutory cancellation right) depending on answers to Q22–24. The Plan tab now shows the renewal terms and the 14-day refund next to the buttons.
4. **Failed renewals.** If a renewal payment fails, Stripe retries; the page freezes when `hostingUntil` passes, and the lapsed email offers to reopen. But checkout refuses a new subscription while the old one isn't `canceled`, so an admin may be unable to reopen until Stripe gives up. Check the dunning settings and the lapsed-email wording.
5. **Video/audio metadata.** Photos are stripped of EXIF/GPS; videos and audio are stored as uploaded and may contain location. The privacy policy now says so.
6. **IP hash retention.** `ipHash` on contributions has no expiry; pick a retention period or add a TTL.
7. **Backups.** The privacy policy says backups expire within [30 days]. Confirm backups exist (Firestore PITR/scheduled exports, Storage versioning) and their real retention.
8. **Account deletion** is email-only; there's no self-serve endpoint.
9. **Cookie banner.** None exists yet. Required before enabling GA4 (and Sentry if it uses device storage) in UK/EU; add a "Cookie settings" footer link as the cookie policy describes.
10. **Refunds** are manual (Stripe dashboard). On refund, the plan should be reverted; there is no `charge.refunded` webhook handler yet.

## 4. Billing copy consistency (checked)

| Fact | Terms / Refunds | Plan tab | Emails |
|---|---|---|---|
| Tribute is one-off, 2 years of hosting, no auto-renew | §8 | "One-off payment; it doesn't renew automatically." | Receipt: "one-off payment. It won't renew automatically." Reminder: "won't renew automatically and you won't be charged" |
| Forever is one-off, for life | §8, §11 | "One-off payment, no renewals" | Receipt: "for life … nothing to renew" |
| Yearly hosting and Living Legacy renew yearly until cancelled | §8, §9 | Shows price and "renews automatically every year … until cancelled" | Receipt states renewal, current price, how to cancel. Reminder for active subscriptions says it will renew automatically and how to cancel |
| Cancel online any time, keep features to end of paid year | §9, Refunds | "Cancel automatic renewal" button and confirm dialog | Receipt and reminder |
| 14-day full refund on any payment, including renewals | §10, Refunds | Note under the plans | Receipt, and reminder for subscriptions |
| Lapsed pages freeze, never deleted | §11 | Existing notice | Lapsed email: "Nothing has been deleted" |
| Living → memorial stops the subscription, 2 years included | §8, Refunds | Living card | Conversion email (unchanged) |
| Switching to Forever stops the subscription | §9, Refunds | Forever card note when a subscription is active | — |

Fixed in this pass: the old pre-lapse reminder told every page "Any admin can renew" even for auto-renewing subscriptions (which charge automatically) and for Tributes (which can't be renewed until hosting ends). The old receipt didn't mention auto-renewal, cancellation or refunds.
