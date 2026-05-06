# CARBID Production Runbook

Operational guide for deploying, monitoring, and recovering CARBID in production.

Last updated: 2026-05-05

---

## 1. First-deploy checklist

Before the first prod deploy (`carbid-59ef5`):

### 1.1 Firebase project setup

- [ ] Auth → Sign-in method: enable Email/Password
- [ ] Firestore → Create database (Native mode, region `southamerica-east1`)
- [ ] Storage → Get started (same region)
- [ ] Project settings → Service accounts → Generate new private key (download JSON)
- [ ] App Check → Register web app with reCAPTCHA v3 provider, copy site key

### 1.2 GCP API key restriction

1. https://console.cloud.google.com/apis/credentials?project=carbid-59ef5
2. Edit the auto-generated browser key:
   - Application restrictions → HTTP referrers: `carbid.com.py/*`, `*.netlify.app/*`
   - API restrictions → Restrict to: Identity Toolkit, Firestore, Cloud Storage, Cloud Functions, Firebase App Check, Firebase Installations
3. Save.

### 1.3 Resend

1. Create account at resend.com
2. Add domain `santarosa.com.py` and verify DNS (SPF + DKIM records)
3. Generate API key (full access for now; restrict later)
4. Save key for step 1.5.

### 1.4 Sentry

1. Create org `carbid` at sentry.io
2. Create 2 projects: `carbid-web` (Next.js platform), `carbid-functions` (Node.js)
3. Copy DSN for each
4. Settings → Auth Tokens → Create token with `project:write` and `release:admin` scopes (for source maps upload)

### 1.5 GitHub repository secrets

Settings → Secrets and variables → Actions:

**Staging environment:**

- `STAGING_NEXT_PUBLIC_FIREBASE_API_KEY`
- `STAGING_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = `carbid-staging.firebaseapp.com`
- `STAGING_NEXT_PUBLIC_FIREBASE_PROJECT_ID` = `carbid-staging`
- `STAGING_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = `carbid-staging.firebasestorage.app`
- `STAGING_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `STAGING_NEXT_PUBLIC_FIREBASE_APP_ID`
- `STAGING_RECAPTCHA_SITE_KEY`
- `STAGING_SENTRY_DSN` (carbid-web project DSN)
- `STAGING_FIREBASE_SA_JSON` (full content of staging service account JSON)
- `NETLIFY_SITE_ID_STAGING`

**Production environment:**

- `PROD_*` (same set with prod values, project `carbid-59ef5`)
- `NETLIFY_SITE_ID_PROD`

**Shared:**

- `NETLIFY_AUTH_TOKEN` (Netlify personal access token)
- `SENTRY_AUTH_TOKEN` (org-level auth token)

### 1.6 Firebase Functions secrets (per project)

```bash
firebase use carbid-staging
firebase functions:secrets:set RESEND_API_KEY
# paste API key when prompted

firebase use carbid-59ef5
firebase functions:secrets:set RESEND_API_KEY
```

### 1.7 First admin in production

After functions are deployed (CI runs deploy-prod once):

```bash
cd functions
GOOGLE_APPLICATION_CREDENTIALS=/path/to/prod-sa.json \
GCLOUD_PROJECT=carbid-59ef5 \
  pnpm bootstrap-admin admin@santarosa.com.py "Nombre" "Apellido" "1234567" "TempStrongPassword#1"
```

Then immediately log in to `https://carbid.com.py/es/login`, change the password via Settings → Security.

---

## 2. Routine deploys

### 2.1 Staging

Auto-deploys on push to `main`. Watch the run at GitHub Actions → Deploy Staging.

### 2.2 Production

Triggered by tag push:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The `deploy-prod` workflow has a `production` environment. If you've enabled "Required reviewers" in GitHub → Settings → Environments → production, the run waits for approval before deploying.

Alternative: manual via Actions UI → Deploy Production → Run workflow.

---

## 3. Rolling back

### 3.1 Web (Netlify)

- Netlify dashboard → Deploys → click previous successful deploy → "Publish deploy".
- Takes ~10 seconds, no rebuild needed.

### 3.2 Cloud Functions

```bash
firebase functions:rollback <functionName> --project carbid-59ef5
```

Or list versions: `gcloud functions versions list <functionName>`.

### 3.3 Firestore Rules

```bash
git checkout <previous-sha> -- firestore.rules
firebase deploy --only firestore:rules --project carbid-59ef5
```

---

## 4. Backups

### 4.1 Firestore automated daily export

Configure once in production via Cloud Scheduler:

```bash
gcloud scheduler jobs create http firestore-daily-backup \
  --location=southamerica-east1 \
  --schedule="0 4 * * *" \
  --time-zone="America/Asuncion" \
  --uri="https://firestore.googleapis.com/v1/projects/carbid-59ef5/databases/(default):exportDocuments" \
  --http-method=POST \
  --oauth-service-account-email=carbid-backup@carbid-59ef5.iam.gserviceaccount.com \
  --message-body='{"outputUriPrefix":"gs://carbid-backups-prod"}'
```

Bucket retention: set 30-day lifecycle rule on `gs://carbid-backups-prod`.

### 4.2 Restore

```bash
gcloud firestore import gs://carbid-backups-prod/2026-05-04T04:00:00_12345 \
  --project carbid-59ef5
```

---

## 5. Monitoring & alerts

### 5.1 Dashboards (bookmark these)

- Cloud Logging: https://console.cloud.google.com/logs/query?project=carbid-59ef5
- Cloud Monitoring: https://console.cloud.google.com/monitoring?project=carbid-59ef5
- Sentry web: https://sentry.io/organizations/carbid/issues/?project=carbid-web
- Sentry functions: https://sentry.io/organizations/carbid/issues/?project=carbid-functions
- Netlify analytics: https://app.netlify.com/sites/carbid/analytics

### 5.2 Recommended alerts (Cloud Monitoring)

Create these as alert policies:

| Alert                            | Threshold     | Notification  |
| -------------------------------- | ------------- | ------------- |
| `placeBid` p95 latency > 1s      | 5 min window  | Email on-call |
| `tickAuctions` failed invocation | Any failure   | Email on-call |
| Functions error rate > 5%        | 10 min window | Email on-call |
| Storage quota > 80%              | hourly        | Email         |
| Firestore reads > 100k/h         | sustained 1h  | Slack/email   |

### 5.3 SLO targets (informal MVP)

- p95 `placeBid` < 500 ms
- Functions error rate < 1%
- `tickAuctions` cron success rate 100%

---

## 6. Incident response

### 6.1 If functions emulator/prod fails to start

1. Check Cloud Logging for the error.
2. Common cause: missing env vars / secrets.
3. Re-deploy from CI: re-run last successful Actions workflow.

### 6.2 If a buyer reports "can't place bid"

1. Sentry issues → filter by `placeBid`.
2. If `failed-precondition` is the bulk: auction may already be closed (check `endsAt`).
3. If `resource-exhausted`: rate limit hit (10/min). Confirm with user; usually transient.

### 6.3 If admin can't log in

1. Verify Auth user still exists in Firebase Console → Authentication.
2. Check `users/{uid}.status === 'active'`.
3. If custom claims out of sync: trigger `onUserSync` by editing the user doc (no-op write).

### 6.4 If many buyers report "subasta cerró antes de tiempo"

1. Check `auction.endsAt` in Firestore.
2. Cross-reference Anti-sniping window: `app_config.bid.antiSnipingSeconds`.
3. If cron ran early: check Cloud Scheduler job history.

### 6.5 Emergency: rotate compromised API keys

1. Generate a new browser API key in GCP Console.
2. Update `PROD_NEXT_PUBLIC_FIREBASE_API_KEY` GitHub secret.
3. Re-run `Deploy Production` workflow.
4. Old key is auto-rejected within 5 min.
5. For Firebase Auth/Functions service accounts: revoke in IAM, generate new, update `PROD_FIREBASE_SA_JSON`.

---

## 7. Routine maintenance

### 7.1 Monthly

- Verify Sentry alerts firing correctly (clear stale issues).
- Review `audit_logs` collection size; archive entries older than 90 days if needed.
- Verify backups: download a recent export from `gs://carbid-backups-prod` and test-import to a scratch project.

### 7.2 Quarterly

- Update dependencies: `pnpm update --interactive`. PR review through staging before prod.
- Rotate `RESEND_API_KEY`.
- Review Firestore Security Rules against the latest spec.

### 7.3 Yearly

- Audit GCP IAM: who has access to what project.
- Review Sentry sampling rates (currently 10% traces).
- Re-verify domain ownership for `santarosa.com.py` in Resend.

---

## 8. Useful commands

```bash
# Tail functions logs
firebase functions:log --project carbid-59ef5 --only placeBid

# Manually trigger tickAuctions
firebase functions:shell --project carbid-59ef5
# > tickAuctions()

# Wipe a stuck rate limit
gcloud firestore documents delete \
  rate_limits/bids_<uid> \
  --project carbid-59ef5

# Snapshot prod data into staging for repro
gcloud firestore export gs://carbid-backups-prod/manual-$(date +%s) \
  --project carbid-59ef5
gcloud firestore import gs://carbid-backups-prod/manual-... \
  --project carbid-staging
```

---

## 9. On-call escalation (placeholder)

| Severity | Definition                                      | Response time     |
| -------- | ----------------------------------------------- | ----------------- |
| P0       | Site down, no one can log in or bid             | < 15 min          |
| P1       | Subset of users affected (e.g. one role broken) | < 1 hour          |
| P2       | Cosmetic / non-blocking                         | Next business day |

Contacts: (fill in actual names/numbers when on-call rotation is set up).
