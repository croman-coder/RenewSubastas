# CI workflows

Only one workflow lives here: `pr.yml` (lint, typecheck, tests — including the
emulator-backed `@carbid/functions` suite — web build, functions build, format
check). **There are deliberately no deploy workflows.** Please read this before
adding one back.

The functions tests run under `firebase-tools emulators:exec` with only `auth`
and `firestore` started: no test exercises the functions emulator (handlers are
called directly) and the single Storage-touching test mocks `adminStorage`. It
runs with no `--import`, so a test that quietly depends on seeded emulator data
will fail in CI even though it passes locally against `.emulator-data`.

## How CARBID actually deploys

**Web** — Netlify is git-connected to this repo with production branch `main`.
Pushing to `main` builds and publishes <https://renewsubastas.com.py>
automatically. Netlify injects the `NEXT_PUBLIC_FIREBASE_*` env vars itself, so
they must never be duplicated into GitHub secrets.

To ship a branch without merging:

```bash
npx -y netlify deploy --build --prod --filter @carbid/web \
  --site 5ecfa35d-a428-452f-9c48-115a0b257114
```

**Backend** (Firestore rules, indexes, Storage rules, Cloud Functions) — manual,
from a machine logged into the Firebase CLI:

```bash
firebase deploy --project carbid-staging
# syntax check only:
firebase deploy --only firestore:rules,storage --project carbid-staging --dry-run
```

## Two things that will bite you

**1. The Firebase project named `carbid-staging` IS production.** Its display
name is "RENEW Subastas"; the `-staging` suffix in the project ID is a
historical misnomer. It is the project the live site's env vars point at
(`NEXT_PUBLIC_FIREBASE_PROJECT_ID=carbid-staging`, sender `615909978578`).
There is **no staging environment**. `firebase deploy --project carbid-staging`
reaches real users immediately. The unrelated project `carbid-59ef5` (display
name "carbid") is not used by anything.

**2. Rules and web must ship together.** Rules apply the instant they deploy;
the web only changes once Netlify finishes. Any client↔rules contract change is
broken in between. This happened on 2026-08-05: the payment-proofs Storage path
went from `{auctionId}/{uid}-{ts}.ext` to `{auctionId}/{uid}/{ts}.ext` in
`storage.rules` while the live web still wrote the old shape, so buyers could
not upload their comprobante for ~3 hours. Deploy rules first, web immediately
after, and check what commit is actually live before you start.

## Why the old deploy workflows were deleted

`deploy-staging.yml` (push to `main`) and `deploy-prod.yml` (tag `v*`) were
removed on 2026-08-05. They had never succeeded — no `STAGING_*` secret was ever
created, so the web build step failed on empty Firebase env and every later step
was skipped. They were not merely dead, they were dangerous:

- `deploy-staging.yml` ran `firebase deploy --project carbid-staging`, i.e. it
  would have pushed rules and functions **straight to production on every merge
  to `main`**, with no review gate.
- Both used `netlify-cli deploy --dir apps/web/.next`, which publishes the raw
  build directory. For an SSR Next.js app that yields a broken static tree — and
  with `--prod`, it would have overwritten the real site.
- `deploy-prod.yml` targeted `carbid-59ef5`, which is not the production project
  at all.

So the failure was the only thing keeping them safe. Anyone "fixing staging CI"
by adding the missing secrets would have silently armed all three problems at
once. If you want deploys in CI again, write them fresh against the facts above
— do not restore these files from git history.
