# Go-live runbook: lifeguestbook.com cutover

Moves Life Guestbook from the staging host `https://lifeguestbook-cbert.web.app` to `https://lifeguestbook.com`.
Firebase project: `lifeguestbook-cbert`. Hosting site: `lifeguestbook-cbert`.

All commands are **Windows PowerShell**, run from the repository root unless stated. If PowerShell blocks the npm wrapper, use `npm.cmd` and `npx.cmd`.
Nothing here prints a secret value. Never run `firebase functions:secrets:access`, and never paste a key into a terminal that is being recorded or shared.

**State at the time of writing**

| Item | Value |
|---|---|
| `lifeguestbook.com` A records (GoDaddy) | `13.248.243.5`, `76.223.105.230` |
| Firebase Hosting custom domain | apex added, TLS certificate active, `www` → apex redirect configured |
| Deploy env file (owner's machine, gitignored) | `functions/.env.lifeguestbook-cbert` with `APP_ORIGIN=https://lifeguestbook-cbert.web.app`, `SCREENING_ENABLED=true` |
| Resend sender DNS records at GoDaddy | must be kept unchanged |

Order of the day: **DNS first, then switch `APP_ORIGIN` and deploy.** Reasons:

- The `share` function (serves every `/m/...` link) fetches `${APP_ORIGIN}/index.html`. If `APP_ORIGIN` points at lifeguestbook.com while the domain still resolves to GoDaddy, memorial pages would get GoDaddy's HTML.
- Email sign-in checks that the browser `Origin` equals `APP_ORIGIN`. Between the DNS change and the deploy (a few minutes), email sign-in works on the staging host only. Pick a quiet time.
- When `APP_ORIGIN` is no longer the staging host, checkout requires **live** Stripe keys (`sk_live_…`, `whsec_…`). With test keys, checkout answers 503 ("not available") rather than charging. The Stripe workstream owns those secrets and the webhook URL.

---

## T-1 day: preparation

### 1. Record the current DNS zone (the "before" state)

In GoDaddy: **My Products → lifeguestbook.com → DNS → Manage Zones → … → Export Zone File**. Save it as `dns-before-YYYY-MM-DD.txt` somewhere outside the repository.

Also snapshot what the public resolvers see:

```powershell
$names = "lifeguestbook.com","www.lifeguestbook.com","_dmarc.lifeguestbook.com","send.lifeguestbook.com","resend._domainkey.lifeguestbook.com"
```

```powershell
foreach ($n in $names) { foreach ($t in "A","AAAA","CNAME","TXT","MX") { Resolve-DnsName -Name $n -Type $t -Server 8.8.8.8 -ErrorAction SilentlyContinue | Where-Object Section -eq "Answer" | Select-Object Name,Type,TTL,IPAddress,NameHost,Strings,NameExchange } } | Format-Table -AutoSize | Out-File "$HOME\dns-before.txt"
```

Mark these rows in the export as **keep unchanged** (names as Resend showed them when the domain was verified; check the Resend dashboard → Domains → lifeguestbook.com):

- `send` MX (Resend bounce/feedback, `feedback-smtp.…amazonses.com`)
- `send` TXT SPF (`v=spf1 include:amazonses.com ~all`)
- `resend._domainkey` TXT (DKIM public key)
- `_dmarc` TXT (DMARC policy)
- any apex `MX` / `TXT` records you use for inbound mail or other verifications (Google Search Console, `hosting-site=…`, `_acme-challenge`)

### 2. Lower the TTL of the records you will change

In GoDaddy, edit only the apex `A` records (`@`) and `www` (`CNAME` or `A`) and set **TTL = 600 seconds** (GoDaddy: "Custom" → 600, or the shortest choice, 1/2 hour). Do not touch the Resend rows. Wait at least the old TTL (typically 1 hour, up to 1 day) before cutover; doing it the day before covers any value.

### 3. Get the exact target records from Firebase

Firebase console → **Hosting → lifeguestbook-cbert → Custom domains**. For `lifeguestbook.com` and `www.lifeguestbook.com` click **View** / **Records** and copy the requested records exactly (normally an `A` record for `@` and a `TXT` `hosting-site=lifeguestbook-cbert`; `www` as `CNAME lifeguestbook-cbert.web.app` or the A record shown). Use the console values, not values from this document.

### 4. Pre-flight on the owner's machine

```powershell
node --version   # must match .node-version (22.23.4)
```

```powershell
npx firebase --version
```

```powershell
npx firebase login:list
```

```powershell
npx firebase use lifeguestbook-cbert
```

```powershell
git fetch origin
```

```powershell
git status --short
```

Note the commit you are about to replace, so rollback has a target:

```powershell
git log -1 --format="%H %s" | Tee-Object -FilePath "$HOME\lifeguestbook-predeploy-commit.txt"
```

Install and run the same checks as CI:

```powershell
npm ci
```

```powershell
npm ci --prefix functions
```

```powershell
npm run typecheck
```

```powershell
npm test
```

```powershell
npm run build
```

Check staging is healthy before you start (read-only):

```powershell
npm run check:deploy -- https://lifeguestbook-cbert.web.app
```

The sitemap warning ("lists https://lifeguestbook.com URLs") and security-header warnings are expected on staging.

### 5. Verify secret names exist (never values)

```powershell
foreach ($s in "RESEND_API_KEY","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","ANTHROPIC_API_KEY") { Write-Host "== $s"; npx firebase functions:secrets:get $s --project lifeguestbook-cbert }
```

Each must list at least one version with state `ENABLED`. This shows metadata only. If one is missing, the matching feature is off; confirm that is intended (Stripe secrets are set by the Stripe workstream; use the value `none` to keep a feature deliberately off).

### 6. Google sign-in: authorized domains and OAuth consent screen

1. Firebase console → **Authentication → Settings → Authorized domains**: add `lifeguestbook.com` and `www.lifeguestbook.com`. Keep `lifeguestbook-cbert.web.app`, `lifeguestbook-cbert.firebaseapp.com` and `localhost`.
2. Google Cloud console (project `lifeguestbook-cbert`) → **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding / Audience):
   - App name `Life Guestbook`, user support email and developer contact set to an address you read.
   - App home page `https://lifeguestbook.com`, privacy policy `https://lifeguestbook.com/privacy`, terms `https://lifeguestbook.com/terms`.
   - Authorized domains: `lifeguestbook.com` and `firebaseapp.com` entries for `lifeguestbook-cbert.firebaseapp.com`.
   - Scopes: only `openid`, `email`, `profile` (no verification needed for these).
   - Audience / publishing status: **In production** (External). In "Testing", only listed test users can sign in.
   - Uploading a logo triggers brand verification (days). Skip the logo for launch day or do it well ahead.
3. **APIs & Services → Credentials → OAuth 2.0 Client IDs → Web client (auto created by Google Service)**: add `https://lifeguestbook.com` to *Authorized JavaScript origins*. Keep the redirect URI `https://lifeguestbook-cbert.firebaseapp.com/__/auth/handler`.
4. **Credentials → API keys → Browser key**: if it has HTTP-referrer restrictions, add `https://lifeguestbook.com/*`.

The web app reads its Firebase config from `/__/firebase/init.json`, so `authDomain` stays `lifeguestbook-cbert.firebaseapp.com`; the Google popup will show that host. That is expected.

### 7. Data safety (one-off, can be done any day before launch)

See [Data safety](#data-safety) below. At minimum turn on managed backups and create the export bucket before go-live.

---

## T-0: cutover

### 8. Change DNS at GoDaddy

Only these rows change. Everything else, especially the Resend `send`, `resend._domainkey`, `_dmarc` and any `MX` rows, stays exactly as it was.

| Name | Type | Before | After |
|---|---|---|---|
| `@` | A | `13.248.243.5` | value from Firebase console (step 3) |
| `@` | A | `76.223.105.230` | delete (unless Firebase asks for two A records) |
| `@` | AAAA | any GoDaddy value | delete |
| `@` | TXT | — | `hosting-site=lifeguestbook-cbert` if Firebase asks for it (add, don't replace other TXT records) |
| `www` | CNAME | GoDaddy default (`@` or parking) | `lifeguestbook-cbert.web.app` (or the value the console shows) |

Also in GoDaddy: **Domain → Forwarding**: make sure no domain forwarding or "parked page" is enabled, since it overrides the A records.

Watch it propagate:

```powershell
Resolve-DnsName lifeguestbook.com -Type A -Server 8.8.8.8 -DnsOnly
```

```powershell
Resolve-DnsName www.lifeguestbook.com -Server 1.1.1.1 -DnsOnly
```

Confirm the Resend records still resolve:

```powershell
Resolve-DnsName resend._domainkey.lifeguestbook.com -Type TXT -Server 8.8.8.8 -DnsOnly
```

```powershell
Resolve-DnsName send.lifeguestbook.com -Type MX -Server 8.8.8.8 -DnsOnly
```

When the A record shows the Firebase value, Firebase console → Custom domains should show **Connected** for both names. Quick check that Hosting answers on the new domain (still on the staging `APP_ORIGIN`, so expect sitemap/sign-in caveats only):

```powershell
npm run check:deploy -- https://lifeguestbook.com
```

### 9. Switch `APP_ORIGIN` to the public domain

```powershell
$envFile = "functions\.env.lifeguestbook-cbert"
```

```powershell
Copy-Item $envFile "$envFile.bak-$(Get-Date -Format yyyyMMdd-HHmm)"
```

```powershell
(Get-Content $envFile) -replace '^APP_ORIGIN=.*$', 'APP_ORIGIN=https://lifeguestbook.com' | Set-Content -Encoding ascii $envFile
```

If the file has no `BACKUP_BUCKET` line yet, add one so deploy doesn't prompt (use `none` until the bucket from [Data safety](#data-safety) exists):

```powershell
if (-not (Select-String -Path $envFile -Pattern '^BACKUP_BUCKET=' -Quiet)) { Add-Content -Encoding ascii $envFile 'BACKUP_BUCKET=gs://lifeguestbook-cbert-backups' }
```

Check (prints variable names and the non-secret values only; this file holds no secrets):

```powershell
Select-String -Path $envFile -Pattern '^(APP_ORIGIN|SCREENING_ENABLED|BACKUP_BUCKET|EMAIL_FROM)='
```

Expected: `APP_ORIGIN=https://lifeguestbook.com`, `SCREENING_ENABLED=true`, `BACKUP_BUCKET=gs://…` or `none`. Use `-Encoding ascii` (not `utf8`) in Windows PowerShell 5.1: its UTF-8 writes a byte-order mark that breaks the first line of a dotenv file.

### 10. Deploy

```powershell
npm run deploy
```

This builds the web app and functions and deploys Hosting, Functions (`api`, `share`, `notificationDigest`, `dailyJobs`, `firestoreExport`), Firestore rules/indexes (including the TTL policies) and Storage rules. Answer "No" if it offers to delete functions you don't recognise and investigate first.

### 11. Verify

```powershell
npm run check:deploy -- https://lifeguestbook.com
```

Must show **0 failed**. Warnings for `x-content-type-options`, `referrer-policy` and `frame-ancestors` belong to the security workstream. Then by hand, in a private browser window:

1. `https://lifeguestbook.com` loads; `https://www.lifeguestbook.com/faq` redirects to `https://lifeguestbook.com/faq`; the padlock shows a valid certificate.
2. Sign in with an email link: the email arrives from `hello@lifeguestbook.com` and the link starts with `https://lifeguestbook.com/api/auth/verify`.
3. Sign in with Google: the popup completes and you land on the dashboard.
4. Open an existing memorial `/m/<slug>` and paste the link into WhatsApp or <https://www.opengraph.xyz>: a public page shows the person's name and photo; the `og:url` is on `lifeguestbook.com`.
5. Add a test memory as a guest; approve it from the dashboard; delete it afterwards.
6. Checkout (only if the Stripe workstream has set live keys): start a checkout and cancel on the Stripe page. With test keys you should get the "not available" message, never a free upgrade.
7. Logs, 15 minutes after deploy:

   ```powershell
   npx firebase functions:log --only api --lines 100
   ```

8. Google Search Console: add the domain property `lifeguestbook.com` (DNS TXT verification; add the TXT row, don't replace others) and submit `https://lifeguestbook.com/sitemap.xml`.

### 12. After 48 hours stable

Raise the TTL on the changed rows back to 1 hour (3600). Keep the "before" zone file for a month.

---

## Rollback

Pick the smallest step that fixes the problem.

### A. Bad web release (frontend broken, API fine)

Firebase console → **Hosting → lifeguestbook-cbert → Release history** → on the previous release, **⋮ → Roll back**. This is instant and doesn't touch Functions.

CLI alternative (`firebase hosting:rollback` doesn't exist in firebase-tools 15.x; `hosting:clone` copies an earlier version back to live). Find the version ID in Release history (or the deploy log), then:

```powershell
npx firebase hosting:clone lifeguestbook-cbert@<VERSION_ID> lifeguestbook-cbert:live
```

### B. Bad functions release or bad config: redeploy the previous commit

```powershell
$prev = (Get-Content "$HOME\lifeguestbook-predeploy-commit.txt").Split(" ")[0]
```

```powershell
git switch --detach $prev
```

```powershell
npm ci
```

```powershell
npm ci --prefix functions
```

```powershell
npm run deploy
```

```powershell
git switch -
```

If the problem is `APP_ORIGIN` (for example sign-in broken because DNS isn't live yet), restore the backup env file and deploy functions only:

```powershell
Copy-Item (Get-ChildItem "functions\.env.lifeguestbook-cbert.bak-*" | Sort-Object Name | Select-Object -Last 1).FullName "functions\.env.lifeguestbook-cbert" -Force
```

```powershell
npx firebase deploy --only functions
```

### C. Domain problem: revert DNS

At GoDaddy, put back the "before" rows: delete the Firebase `A` record(s), re-add `@ A 13.248.243.5` and `@ A 76.223.105.230`, and restore the old `www` record from `dns-before-YYYY-MM-DD.txt`. Don't touch the Resend rows. With TTL 600 most users see the old site within 10–30 minutes. Then do step B with `APP_ORIGIN=https://lifeguestbook-cbert.web.app` so links, emails and sign-in point at the working host again.

---

## Data safety

### Firestore TTL (configured in code)

`limits` and `uploads` documents carry a Timestamp field `deleteAt`, and `firestore.indexes.json` declares TTL policies on `limits.deleteAt` and `uploads.deleteAt`. They deploy with `npm run deploy` (or `npx firebase deploy --only firestore:indexes`).

Why not `expiresAt`: Firestore TTL only acts on Timestamp fields, and `expiresAt` is stored as a number of milliseconds (the code compares it numerically), so a TTL policy on it would silently never delete anything. `deleteAt` is set to `expiresAt` + 1 day for `limits` and + 7 days for `uploads`, so the daily job (`dailyJobs` → `cleanUp`) still runs first and removes the `tmp/<uploadId>/` chunks in Storage; TTL is the backstop. Documents written before this release have no `deleteAt` and are still cleaned by the daily job.

Check after deploy (policy state becomes `ACTIVE` within minutes to hours):

```powershell
gcloud firestore fields ttls list --project lifeguestbook-cbert
```

### Storage lifecycle for abandoned upload chunks

Chunked uploads write to `tmp/<uploadId>/`. Add a lifecycle rule that deletes anything under `tmp/` after 3 days (file: [`ops/storage-tmp.lifecycle.json`](../ops/storage-tmp.lifecycle.json)). Find the bucket name first (normally `lifeguestbook-cbert.firebasestorage.app` or `lifeguestbook-cbert.appspot.com`):

```powershell
gcloud storage buckets list --project lifeguestbook-cbert --format="value(name)"
```

```powershell
gcloud storage buckets update gs://<DEFAULT_BUCKET> --lifecycle-file=ops/storage-tmp.lifecycle.json
```

```powershell
gcloud storage buckets describe gs://<DEFAULT_BUCKET> --format="default(lifecycle_config,soft_delete_policy)"
```

Leave the bucket's **soft delete** policy on (default 7 days): it lets you restore memorial media deleted by mistake.

### Managed Firestore backups and point-in-time recovery (recommended)

```powershell
npx firebase firestore:backups:schedules:create --project lifeguestbook-cbert --recurrence DAILY --retention 14d
```

```powershell
npx firebase firestore:backups:schedules:create --project lifeguestbook-cbert --recurrence WEEKLY --day-of-week SUNDAY --retention 98d
```

```powershell
npx firebase firestore:databases:update "(default)" --project lifeguestbook-cbert --point-in-time-recovery ENABLED --delete-protection ENABLED
```

PITR keeps 7 days of versions you can read or restore from. Restore a backup into a **new** database with `npx firebase firestore:databases:restore`, check it, then switch over; never restore over the live one.

### Scheduled Firestore export to Cloud Storage (configured in code)

The `firestoreExport` function (`functions/src/backup.ts`) runs daily at 02:30 Europe/London and exports the whole database to `${BACKUP_BUCKET}/firestore/<timestamp>/`. With `BACKUP_BUCKET=none` it only logs "skipped". Exports are an off-database copy: they survive deleting the database and can go to another project or BigQuery.

One-off setup (bucket location must match the Firestore location; check it first):

```powershell
npx firebase firestore:databases:get "(default)" --project lifeguestbook-cbert
```

```powershell
gcloud storage buckets create gs://lifeguestbook-cbert-backups --project lifeguestbook-cbert --location <FIRESTORE_LOCATION_e.g._US> --uniform-bucket-level-access --public-access-prevention
```

```powershell
gcloud storage buckets update gs://lifeguestbook-cbert-backups --lifecycle-file=ops/backup-bucket.lifecycle.json
```

```powershell
$num = gcloud projects describe lifeguestbook-cbert --format="value(projectNumber)"
```

The function runs as the default compute service account; it needs permission to start exports. The Firestore service agent writes the files, so it needs the bucket:

```powershell
gcloud projects add-iam-policy-binding lifeguestbook-cbert --member="serviceAccount:$num-compute@developer.gserviceaccount.com" --role="roles/datastore.importExportAdmin"
```

```powershell
gcloud storage buckets add-iam-policy-binding gs://lifeguestbook-cbert-backups --member="serviceAccount:service-$num@gcp-sa-firestore.iam.gserviceaccount.com" --role="roles/storage.admin"
```

```powershell
gcloud storage buckets add-iam-policy-binding gs://lifeguestbook-cbert-backups --member="serviceAccount:$num-compute@developer.gserviceaccount.com" --role="roles/storage.admin"
```

Both bucket bindings are scoped to the backup bucket only.

Set `BACKUP_BUCKET=gs://lifeguestbook-cbert-backups` in `functions/.env.lifeguestbook-cbert` and deploy functions. Test once by hand, then check the operation:

```powershell
gcloud scheduler jobs run firebase-schedule-firestoreExport-us-central1 --location us-central1 --project lifeguestbook-cbert
```

```powershell
gcloud firestore operations list --project lifeguestbook-cbert --limit 3
```

```powershell
gcloud storage ls gs://lifeguestbook-cbert-backups/firestore/
```

Exports older than 90 days are deleted by `ops/backup-bucket.lifecycle.json`. Restore with `gcloud firestore import gs://lifeguestbook-cbert-backups/firestore/<timestamp>/` (into a scratch project or database first).

Media in Cloud Storage is not part of a Firestore export. Soft delete (above) covers accidental deletes; for a full off-site copy, add a Storage Transfer Service job to a second bucket later.

### robots.txt and sitemap.xml

`public/robots.txt` and `public/sitemap.xml` ship with the web build. The sitemap lists the homepage, the three product pages, FAQ, privacy and terms on `https://lifeguestbook.com`; `tests/seo-files.test.ts` fails if a product page is added without a sitemap entry. Memorial pages are not listed: they are link-only by default and unknown or private `/m/<slug>` links answer `404` with `noindex`.

---

## Owner checklist (manual steps)

- [ ] T-1: export the GoDaddy zone file and run the `Resolve-DnsName` snapshot
- [ ] T-1: lower TTL to 600 on `@` A and `www` only
- [ ] T-1: copy the target records from Firebase console → Hosting → Custom domains
- [ ] T-1: Authentication → Authorized domains: add `lifeguestbook.com`, `www.lifeguestbook.com`
- [ ] T-1: OAuth consent screen: name, links, authorized domains, In production; OAuth web client JS origin; API key referrers
- [ ] T-1: verify secret names with `functions:secrets:get` (metadata only)
- [ ] T-1: managed backups + PITR; create backup bucket, IAM bindings, lifecycle rules (`tmp/` and backups)
- [ ] T-0: pre-flight (`npm ci`, typecheck, tests, build, `check:deploy` on staging), note current commit
- [ ] T-0: GoDaddy: replace apex A / www rows, remove forwarding, keep Resend rows
- [ ] T-0: `APP_ORIGIN=https://lifeguestbook.com`, `BACKUP_BUCKET=…` in `functions/.env.lifeguestbook-cbert`
- [ ] T-0: `npm run deploy`
- [ ] T-0: `npm run check:deploy -- https://lifeguestbook.com` (0 failed) and the manual checks in step 11
- [ ] T-0: confirm the Stripe workstream has set live keys and the webhook at `https://lifeguestbook.com/api/stripe/webhook`
- [ ] T+1: `gcloud firestore fields ttls list` shows both policies ACTIVE; first `firestoreExport` succeeded
- [ ] T+2: TTL back to 3600; Search Console property + sitemap submitted
