# Monitoring and analytics

Everything here is **off until configured**. With no DSN / measurement ID set, the web
bundle contains no Sentry or Google code, the Functions never import `@sentry/node`, and no
consent banner or "Cookie settings" link is shown. Structured logging is always on.

| What | Where it's set | Effect |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | Web build env (`.env.production.local` or CI) | Browser error tracking (lazy 31 KB gz chunk) |
| `VITE_SENTRY_ENVIRONMENT` | Web build env | Optional, defaults to the Vite mode |
| `VITE_GA_MEASUREMENT_ID` | Web build env | GA4 `G-…`; shows the consent banner, loads gtag only after "Allow analytics" |
| `SENTRY_DSN` | `functions/.env` (deployed as a runtime env var) | Functions error tracking |
| `SENTRY_ENVIRONMENT` | `functions/.env` | Optional, defaults to `production` |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB` | Shell/CI running `npm run build` — **never** a `VITE_` var | Builds hidden source maps, uploads them, then deletes the `.map` files from `dist/` |
| `SENTRY_RELEASE` | Build env (optional) | Release tag; defaults to `lifeguestbook@<12-char git sha>` (`scripts/release.mjs`) for both web and Functions |

The DSN and measurement ID are public identifiers, not secrets. The Sentry auth token *is* a
secret: keep it in CI secrets or your shell, never in a committed file.

Example release build:

```bash
SENTRY_AUTH_TOKEN=… SENTRY_ORG=lifeguestbook SENTRY_PROJECT_WEB=web npm run build
```

Functions source maps aren't uploaded: `lib/index.js.map` is deployed with the function
and `process.setSourceMapsEnabled(true)` makes stack traces point at `functions/src/*.ts`.

## Privacy rules (enforced in code)

Shared scrubber: `src/shared/scrub.ts` (tests in `tests/monitoring.test.ts`).

- **Sentry (web + Functions):** `dataCollection` turns off user info, cookies, bodies, query
  strings, gen-AI inputs/outputs and headers other than `user-agent`. `beforeSend` then drops
  `event.user`, rebuilds `request` with only method/URL/UA, drops console and input
  breadcrumbs, redacts emails, replaces media/storage URLs with `[media-url]`, reduces
  paths to route shapes (`/m/:slug`, `/dashboard/:id`) and removes keys such as `text`,
  `caption`, `intro`, `email`, `photoUrl`. No tracing, no session replay.
- **GA4:** loaded only after consent (stored in `localStorage` as `lgb-cookie-consent-v1`).
  Withdrawing consent sets `ga-disable-<ID>`, updates consent mode to denied and deletes
  `_ga*` cookies. Google signals and ad personalisation are off; ad storage is always denied.
  Page views send only the route shape as location *and* title (real titles can contain a
  name), and the referrer is reduced to an origin or route shape. `/wall`, `/signin` and
  `/invite` are never tracked. Dashboard pages are tracked as path only.
- **Logs:** `functions/src/log.ts` scrubs every message and field the same way.

### GA4 events

| Event | Where | Params |
| --- | --- | --- |
| `guestbook_created` | `Create.tsx` after the page is created | `mode`, `purpose` |
| `memory_added` | `AddMemory.tsx` after a successful send | `items`, `with_media`, `pending` |
| `upgrade_started` | `Manage.tsx` Plan tab "Upgrade"/buy click | `product`, `currency` |
| `purchase` | `Manage.tsx` after `/payments/confirm` succeeds (once per Checkout session) | `transaction_id` (Stripe session id) |

Mark `purchase` (and optionally `guestbook_created`) as key events in GA4.

### GA4 property settings to apply when you create it

- Data retention: 2 months (Admin → Data collection and modification → Data retention).
- Data collection → Google signals: **off**. Granular location/device data: **off**.
- Web stream → Enhanced measurement: turn **off** "Form interactions" and "Site search"
  (they read form fields / query strings). Page views via history changes can stay off —
  the app sends page views itself.
- Accept the Data Processing Terms and set the data-sharing settings to off.
- Ask the legal session to list GA4 (Google Ireland/LLC) and Sentry as processors in the
  privacy notice and to describe the analytics cookies (`_ga`, `_ga_<ID>`, up to 2 years).

## Structured logging (Functions)

`functions/src/log.ts` writes one JSON line per entry, which Cloud Logging parses into
`severity`, `message` and `jsonPayload.*`:

```ts
import { log } from "./log";
log.info("Digest sent", { event: "digest_sent", count });
log.warn("Retrying email", { event: "email_retry" }, err);
log.error("Stripe webhook failed", err, { event: "stripe_webhook_error" });
```

`ERROR`/`CRITICAL` entries include `@type: …ReportedErrorEvent`, a stack trace and
`serviceContext.version` (the release), so they also appear in **Error Reporting**.
`functions/src/monitoring.ts` adds:

- `requestLogging` middleware: one `WARNING` line with `jsonPayload.event="http_5xx"`,
  method, route shape, status and latency for every 5xx response from `/api`.
- `reportError(message, err, fields)`: logs and, if `SENTRY_DSN` is set, captures + flushes.
  Used by `app.onError`.
- `monitored(name, fn)`: wraps the scheduled jobs; failures log `event="job_failed"` and
  rethrow.

## Uptime check on `/api/health`

Cloud Console → Monitoring → Uptime checks → **Create uptime check**:

- Protocol HTTPS, resource type URL, host `lifeguestbook.com`, path `/api/health`.
- Check frequency 5 min, regions: Europe, USA, Asia Pacific (matches UK/US/AU users).
- Response validation: content contains `"ok":true`, status 2xx.
- Create the alert policy it offers (fire after 2 consecutive failures) and attach the
  email notification channel.

CLI equivalent:

```bash
gcloud monitoring uptime create lifeguestbook-health --resource-type=uptime-url --resource-labels=host=lifeguestbook.com,project_id=PROJECT_ID --path=/api/health --protocol=https --period=5 --matcher-content='"ok":true' --matcher-type=contains-string --regions=europe,usa-virginia,asia-pacific
```

## Log-based 5xx alert

1. Logging → Logs Explorer, query:

   ```
   resource.type="cloud_run_revision"
   resource.labels.service_name="api"
   jsonPayload.event="http_5xx"
   ```

   (Also catch crashes outside Hono with an OR on `severity>=ERROR`.)
2. **Create metric** → Counter, name `api_5xx`.
3. Monitoring → Alerting → **Create policy** on `logging/user/api_5xx`: rolling window 5 min,
   sum, threshold **> 5** (start here and tune), notify the email channel.
4. Optional second policy straight from the logs (Logs Explorer → Create alert) on
   `jsonPayload.event="job_failed"` so a failed `dailyJobs` / `notificationDigest` run emails
   you immediately (rate-limit to one notification per hour).

```bash
gcloud logging metrics create api_5xx --description="API 5xx responses" --log-filter='resource.type="cloud_run_revision" AND jsonPayload.event="http_5xx"'
```

Error Reporting also emails on new error groups once notifications are enabled
(Error Reporting → Configure notifications).

## GCP budget alert

Billing → Budgets & alerts → **Create budget**:

- Scope: the LifeGuestbook project, all services.
- Amount: a fixed monthly figure (e.g. £50 to start) — not "last month's spend".
- Thresholds: 50 %, 90 %, 100 % actual and 100 % **forecasted**.
- Notifications: billing admins + the monitoring email channel.

Budgets only alert, they don't cap spend. Watch Cloud Functions invocations, Cloud
Storage egress and Anthropic usage (billed separately, set a limit in the Anthropic console).

```bash
gcloud billing budgets create --billing-account=BILLING_ACCOUNT_ID --display-name="LifeGuestbook monthly" --budget-amount=50GBP --filter-projects=projects/PROJECT_ID --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 --threshold-rule=percent=1.0,basis=forecasted-spend
```

## Launch checklist

- [ ] Create Sentry projects (web, functions); set `VITE_SENTRY_DSN` and `SENTRY_DSN`.
- [ ] Add `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT_WEB` to the release build env.
- [ ] In Sentry: enable "Prevent storing IP addresses" and the default data scrubbers.
- [ ] Create GA4 property, apply the settings above, set `VITE_GA_MEASUREMENT_ID`.
- [ ] Privacy notice updated for GA4 + Sentry (legal session).
- [ ] Uptime check, 5xx alert, job-failure alert, budget alert created.
- [ ] After deploy: trigger a test error and confirm it's scrubbed in Sentry and grouped in Error Reporting.
