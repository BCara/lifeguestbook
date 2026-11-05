# S01/S02 backend safety first slices (2026-11-06)

Starting SHA: b0e7388be67dfbeb5593f2450e02f3c925e63815.
Branch: fix/backend-safety. No provider calls, deployment, push, or NAS writes.
A04 foundation work is concurrent; no recorded completion was available when this slice began.

## Changes

- Missing or mode-mismatched Stripe configuration fails checkout with 503 instead of granting a plan. Stripe requires a matching key prefix and webhook secret; this validates configuration shape, not provider credentials.
- Instant purchases require Functions emulator, a demo-prefixed GCLOUD_PROJECT, and FIRESTORE_EMULATOR_HOST. Confirmation reports unavailable configuration instead of a misleading success.
- API responses, full/range media, and link previews have private, no-store cache policy. Private guest lookup/contribution/upload responses are generic 404s. Private reporting requires membership.
- Only public pages disclose personalized Open Graph data/images. Unlisted/private pages use generic previews.
- Slideshow lookup rechecks the current wall key even if an obsolete key mapping remains.

## Checks

- npm test -- --reporter=dot: 25 tests passed in 3 files, including 9 focused safety cases.
- npm run typecheck: passed frontend and functions.
- npm run build: passed frontend and functions.
- Regression tests use mocked database/storage, synthetic identities, and synthetic provider-key strings. They cover non-demo negative checkout without transaction, demo-only checkout, private-response redaction, full/range no-store, subsequent hide/private/key denial, and generic unlisted/private previews.

## Remaining acceptance

This is not full S01/S02 completion. Hosting emulator warmed-cache acceptance is still needed after A04 setup lands. Existing previously cached responses cannot be remotely revoked by changing origin response headers; rollout must account for the prior cache TTL (up to 24 hours) and any external preview copies. No actual Stripe validation, staging, or production acceptance was performed.
