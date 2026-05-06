# CARBID Plan 9 — CI/CD + Production Hardening

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Make CARBID deployable to production. Add GitHub Actions CI (lint/typecheck/test/build on PRs, deploy on main), Netlify + Firebase deploy automation, transactional email (Resend), App Check + reCAPTCHA, Sentry error tracking, monitoring/backups, security headers, and a production runbook.

**Architecture:**

- **CI**: 3 GitHub Actions workflows — `pr.yml` (verify), `deploy-staging.yml` (auto on main → carbid-staging), `deploy-prod.yml` (manual or tag-triggered → carbid-59ef5).
- **Hosting**: Netlify (web) + Firebase (functions/firestore/storage).
- **Email**: Resend with simple HTML templates. New Cloud Function `sendBidNotification` triggered by Firestore writes; another `sendWelcomeEmail` triggered after `createUser`.
- **App Check**: reCAPTCHA v3 web provider; protect callables and Firestore reads.
- **Sentry**: Next.js client + server SDK + functions SDK.
- **Backups**: scheduled Firestore export to GCS bucket (manual setup for prod, doc only).
- **Security headers**: tighten Netlify CSP for production.

**Spec reference:** §3 (deploy targets), §5 (App Check, rate-limit), §10 (observability).

**Prerequisites:** Plans 1-8 complete. User has accounts at: GitHub (repo), Netlify, Firebase, Resend (free tier), Sentry (free tier).

---

## Manual Prereqs (user actions, no code)

Mark each before running CI:

- [ ] GitHub repo created and `main` branch protected
- [ ] Netlify site connected to the repo (auto-detects `netlify.toml`)
- [ ] Firebase staging (`carbid-staging`) and prod (`carbid-59ef5`) projects ready
- [ ] Service account key for `carbid-staging` AND `carbid-59ef5` (downloaded JSON for GitHub secrets)
- [ ] Resend account + API key + verified `santarosa.com.py` domain
- [ ] Sentry organization + 2 projects: `carbid-web`, `carbid-functions`
- [ ] reCAPTCHA v3 site keys for web App Check
- [ ] GCP API key restricted by HTTP referrer

These are **not blockers** for the code in this plan. Code is written assuming env vars are set; missing env vars cause graceful no-op.

---

## File Structure (end state)

```
.github/workflows/
├── pr.yml
├── deploy-staging.yml
└── deploy-prod.yml

functions/src/notifications/
├── sendWelcomeEmail.ts
└── sendBidOutbid.ts

apps/web/src/
├── lib/firebase/app-check.ts        new — reCAPTCHA v3 wiring (client)
├── instrumentation.ts                Sentry server-side init
├── instrumentation-client.ts         Sentry browser init
└── sentry.server.config.ts / sentry.edge.config.ts / sentry.client.config.ts

functions/src/
├── lib/sentry.ts                     Sentry init for functions
└── lib/email.ts                      Resend wrapper

netlify.toml                          add CSP + Sentry env

docs/
├── PRODUCTION_RUNBOOK.md             new
└── superpowers/specs/...              (existing)
```

---

## Task 1: GitHub Actions PR workflow

- [ ] **Step 1.1: Create** `.github/workflows/pr.yml`:

```yaml
name: PR Checks
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Build shared packages
        run: pnpm --filter @carbid/shared-types build
      - name: Lint
        run: pnpm lint
      - name: Typecheck
        run: pnpm typecheck
      - name: Test (no emulators)
        run: |
          pnpm --filter @carbid/shared-types test
      - name: Web build
        run: pnpm --filter @carbid/web build
        env:
          NEXT_PUBLIC_FIREBASE_API_KEY: ci-fake
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ci.firebaseapp.com
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: ci-project
          NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: ci.appspot.com
          NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0'
          NEXT_PUBLIC_FIREBASE_APP_ID: '1:0:web:ci'
      - name: Functions build
        run: pnpm --filter @carbid/functions build
      - name: Format check
        run: pnpm format:check
```

> **Note**: Functions tests require live emulators which can't run cleanly in plain CI. Two options:
> (a) Skip functions tests in PR CI, run them in a nightly job or pre-deploy.
> (b) Start Firebase emulators in CI via `firebase emulators:exec`. This works but is slow (~3 min boot). Choose (a) for MVP — flag in self-review.

- [ ] **Step 1.2: Commit**

```
git add .github/workflows/pr.yml
git commit -m "ci: PR workflow — lint typecheck shared-types tests web+functions builds"
```

---

## Task 2: Deploy workflows (staging + prod)

- [ ] **Step 2.1: Staging deploy** `.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy Staging
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @carbid/shared-types build
      - run: pnpm --filter @carbid/functions build
      - run: pnpm --filter @carbid/web build
        env:
          NEXT_PUBLIC_FIREBASE_API_KEY: ${{ secrets.STAGING_NEXT_PUBLIC_FIREBASE_API_KEY }}
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${{ secrets.STAGING_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN }}
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${{ secrets.STAGING_NEXT_PUBLIC_FIREBASE_PROJECT_ID }}
          NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: ${{ secrets.STAGING_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }}
          NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.STAGING_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID }}
          NEXT_PUBLIC_FIREBASE_APP_ID: ${{ secrets.STAGING_NEXT_PUBLIC_FIREBASE_APP_ID }}
          NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'false'
          NEXT_PUBLIC_RECAPTCHA_SITE_KEY: ${{ secrets.STAGING_RECAPTCHA_SITE_KEY }}
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          NEXT_PUBLIC_SENTRY_DSN: ${{ secrets.STAGING_SENTRY_DSN }}
      # Firebase deploy (functions, rules, indexes, storage rules)
      - name: Set up service account
        run: echo '${{ secrets.STAGING_FIREBASE_SA_JSON }}' > $HOME/sa.json
      - name: Deploy Firebase
        run: |
          npx firebase-tools@13 deploy \
            --only functions,firestore:rules,firestore:indexes,storage:rules \
            --project carbid-staging \
            --non-interactive
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ env.HOME }}/sa.json
      - name: Cleanup credentials
        if: always()
        run: rm -f $HOME/sa.json
      # Netlify deploy
      - name: Netlify deploy
        run: |
          npx netlify-cli@17 deploy \
            --dir apps/web/.next \
            --site ${{ secrets.NETLIFY_SITE_ID_STAGING }} \
            --auth ${{ secrets.NETLIFY_AUTH_TOKEN }} \
            --prod
```

- [ ] **Step 2.2: Production deploy** `.github/workflows/deploy-prod.yml` — same template, but:
- Triggered on tag `v*` push OR `workflow_dispatch`.
- Uses `PROD_*` secrets and `--project carbid-59ef5`.
- Adds `environment: production` (GitHub manual approval gate).

```yaml
name: Deploy Production
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production # requires manual approval if GitHub env protection rule is set
    # ... same body but with PROD_* secrets and --project carbid-59ef5
```

(Replicate the same steps as staging with PROD\_ prefixes.)

- [ ] **Step 2.3: Commit**

```
git add .github/workflows/deploy-staging.yml .github/workflows/deploy-prod.yml
git commit -m "ci: deploy workflows for staging (auto on main) and prod (tag v*)"
```

> **Required GitHub secrets** (user must set these in repo Settings → Secrets):
> Staging: `STAGING_NEXT_PUBLIC_FIREBASE_*`, `STAGING_RECAPTCHA_SITE_KEY`, `STAGING_SENTRY_DSN`, `STAGING_FIREBASE_SA_JSON`, `NETLIFY_SITE_ID_STAGING`, `NETLIFY_AUTH_TOKEN`.
> Prod: same with `PROD_*` prefix and `NETLIFY_SITE_ID_PROD`.
> Shared: `SENTRY_AUTH_TOKEN`, `RESEND_API_KEY` (set as Functions secret separately, not GH secret).

---

## Task 3: Resend email integration

- [ ] **Step 3.1: Add Resend dep** to functions:

```
pnpm --filter @carbid/functions add resend
```

- [ ] **Step 3.2: Helper** `functions/src/lib/email.ts`:

```ts
import { Resend } from 'resend';
import { defineSecret } from 'firebase-functions/params';

export const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = RESEND_API_KEY.value();
  if (!key) return null; // graceful no-op when not configured
  if (!client) client = new Resend(key);
  return client;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  const c = getClient();
  if (!c) {
    console.warn('[email] RESEND_API_KEY not set — skipping send', { to, subject });
    return;
  }
  await c.emails.send({
    from: 'CARBID Subastas <no-reply@santarosa.com.py>',
    to,
    subject,
    html,
  });
}
```

- [ ] **Step 3.3: Welcome email trigger** — modify `functions/src/auth/createUser.ts` to call `sendEmail` after the password reset link is generated:

After `const resetLink = await adminAuth().generatePasswordResetLink(input.email);`, add:

```ts
await sendEmail({
  to: input.email,
  subject: 'Bienvenido a CARBID',
  html: `<p>Hola ${input.firstName},</p>
    <p>Se creó tu cuenta CARBID con rol <b>${input.role}</b>.</p>
    <p>Configura tu contraseña aquí:</p>
    <p><a href="${resetLink}">Configurar contraseña</a></p>
    <p>— CARBID Subastas</p>`,
});
```

Import: `import { sendEmail, RESEND_API_KEY } from '../lib/email.js';`

In `onCall(...)` options, declare the secret: `onCall({ region: 'us-central1', secrets: [RESEND_API_KEY] }, ...)`.

- [ ] **Step 3.4: Outbid email trigger** — new `functions/src/notifications/sendBidOutbid.ts`:

```ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { adminAuth, adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';

export const sendBidOutbid = onDocumentCreated(
  {
    document: 'auctions/{auctionId}/bids/{bidId}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const newBid = event.data?.data();
    if (!newBid) return;

    // Find the previous winning bid (now outbid)
    const auctionId = event.params['auctionId'] as string;
    const prevQ = await adminDb()
      .collection(`auctions/${auctionId}/bids`)
      .where('status', '==', 'outbid')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const prevBid = prevQ.docs[0]?.data();
    if (!prevBid || prevBid['buyerUid'] === newBid['buyerUid']) return;

    const userSnap = await adminDb().doc(`users/${prevBid['buyerUid']}`).get();
    const profile = (userSnap.data()?.['profile'] ?? {}) as Record<string, string>;
    const email = userSnap.data()?.['email'] as string | undefined;
    const wantsOutbidEmail =
      (userSnap.data()?.['preferences']?.notifications?.outbidEmail as boolean) ?? true;
    if (!email || !wantsOutbidEmail) return;

    const auction = (await adminDb().doc(`auctions/${auctionId}`).get()).data();
    const v = (auction?.['vehicleSnapshot'] ?? {}) as Record<string, unknown>;

    await sendEmail({
      to: email,
      subject: 'Te superaron en una subasta',
      html: `<p>Hola ${profile['firstName'] ?? ''},</p>
        <p>Tu puja en <b>${v['make']} ${v['model']} ${v['year']}</b> fue superada.</p>
        <p>Nueva puja: USD ${(newBid['amount'] as number).toLocaleString()}</p>
        <p>Visita la subasta para volver a pujar.</p>
        <p>— CARBID Subastas</p>`,
    });
  },
);
```

- [ ] **Step 3.5: Wire export + commit**

`functions/src/index.ts`:

```ts
export { sendBidOutbid } from './notifications/sendBidOutbid.js';
```

```
pnpm --filter @carbid/functions build
git add functions/src/lib/email.ts functions/src/notifications functions/src/auth/createUser.ts functions/src/index.ts pnpm-lock.yaml
git commit -m "feat(functions): Resend integration — welcome email + outbid notification"
```

> User must run `firebase functions:secrets:set RESEND_API_KEY` once in production for these to work.

---

## Task 4: App Check (reCAPTCHA v3)

- [ ] **Step 4.1: Web client wiring** `apps/web/src/lib/firebase/app-check.ts`:

```ts
'use client';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';

export function initAppCheck(app: FirebaseApp) {
  if (typeof window === 'undefined') return;
  const siteKey = process.env['NEXT_PUBLIC_RECAPTCHA_SITE_KEY'];
  if (!siteKey) return; // not enabled locally
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.warn('[appcheck] init failed', e);
  }
}
```

- [ ] **Step 4.2: Wire into Firebase client** — modify `packages/firebase-client/src/client.ts`'s `initFirebaseClient` to optionally call AppCheck. To avoid a circular import, expose AppCheck wiring as a separate exported function:

Update `apps/web/src/lib/firebase/client.ts`:

```ts
'use client';
import { initFirebaseClient, loadFirebaseEnv } from '@carbid/firebase-client';
import { initAppCheck } from './app-check';

const env = loadFirebaseEnv({
  /* same as before */
});
export const fb = initFirebaseClient(env);

if (!env.useEmulators) {
  initAppCheck(fb.app);
}
```

- [ ] **Step 4.3: Functions enforce App Check** — add to all callables `enforceAppCheck: true`:

Modify each `onCall(...)` invocation in `functions/src/auth/*.ts`, `functions/src/auctions/*.ts`, `functions/src/config/*.ts` to:

```ts
onCall({ region: 'us-central1', enforceAppCheck: process.env['NODE_ENV'] === 'production' }, ...)
```

(Soft enforce — only in production. In emulator/dev, skipped.)

- [ ] **Step 4.4: Commit**

```
git add apps/web/src/lib/firebase/app-check.ts apps/web/src/lib/firebase/client.ts functions/src
git commit -m "feat: App Check (reCAPTCHA v3) wiring + enforceAppCheck on callables in prod"
```

---

## Task 5: Sentry instrumentation

- [ ] **Step 5.1: Web** — install `@sentry/nextjs`:

```
pnpm --filter @carbid/web add @sentry/nextjs
```

Run `npx @sentry/wizard@latest -i nextjs` interactively to scaffold (creates `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`). Skip if user prefers manual.

Manual config alternative — create `apps/web/sentry.client.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';
const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0.1, replaysSessionSampleRate: 0.0 });
}
```

Mirror in `sentry.server.config.ts` and `sentry.edge.config.ts`.

- [ ] **Step 5.2: Functions** — install `@sentry/node`:

```
pnpm --filter @carbid/functions add @sentry/node
```

Create `functions/src/lib/sentry.ts`:

```ts
import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0.1 });
  initialized = true;
}

export { Sentry };
```

Wrap each callable handler:

```ts
import { initSentry, Sentry } from '../lib/sentry.js';
initSentry();
// inside handler catch blocks:
Sentry.captureException(err);
```

For MVP, just initialize and let unhandled rejections bubble — Sentry's Node SDK auto-captures.

- [ ] **Step 5.3: Commit**

```
git add apps/web/sentry.* apps/web/package.json functions/src/lib/sentry.ts functions/package.json pnpm-lock.yaml
git commit -m "feat: Sentry instrumentation for Next.js + Cloud Functions"
```

---

## Task 6: Production runbook

- [ ] **Step 6.1: Create** `docs/PRODUCTION_RUNBOOK.md` with:
  - First-deploy checklist
  - Required GitHub secrets list
  - Required Firebase secrets (`firebase functions:secrets:set RESEND_API_KEY`)
  - How to bootstrap first admin in prod
  - How to roll back (Netlify deploy → revert; Firebase functions → previous version)
  - Backup/restore Firestore (gcloud firestore export/import)
  - Incident response steps
  - On-call dashboard links (Sentry, Cloud Logging, Netlify analytics)

The runbook should be ~200 lines of actionable text. Include exact commands.

---

## Task 7: Tighten Netlify CSP

- [ ] **Step 7.1: Update** `netlify.toml`:

Add to `[[headers]].values`:

```toml
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.google.com https://*.firebaseapp.com https://browser.sentry-cdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://us-central1-*.cloudfunctions.net https://*.sentry.io wss://*.firebaseio.com; frame-src 'self' https://www.google.com;"
```

- [ ] **Step 7.2: Commit**

```
git add netlify.toml
git commit -m "feat(deploy): tighten CSP for Firebase, Sentry, fonts; reduce attack surface"
```

---

## Self-Review

Spec coverage (§3, §10):

- CI: PR + staging + prod deploy ✅
- Email transactional via Resend ✅
- App Check ✅
- Sentry ✅
- Production runbook ✅
- CSP tightening ✅

Out of scope (deferred):

- Functions tests in CI (require emulators) — flagged
- Cloud Monitoring custom dashboards (do via console; runbook lists which metrics)
- Backup automation (gcloud command in runbook; cron-trigger for prod is a Cloud Scheduler config done manually)

---

## Execution Handoff

Recommended batches:

- Batch VV: Tasks 1+2 (CI workflows)
- Batch WW: Task 3 (Resend)
- Batch XX: Tasks 4+5 (App Check + Sentry)
- Batch YY: Tasks 6+7 (runbook + CSP)
