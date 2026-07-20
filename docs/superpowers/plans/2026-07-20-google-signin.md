# Google Sign-In + retail self-registration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Continuar con Google" button to the Renew Subastas login that both signs in and self-registers users as `buyer` + `retail` + `active`, with the role forced server-side.

**Architecture:** Client does `signInWithPopup(Google)` → calls a new `registerGoogleBuyer` callable (forces buyer/retail, creates the user doc, sets claims) → force-refreshes the ID token → `POST /api/session` (same path as password login). CI/RUC becomes optional at signup and is enforced at bid time in `placeBid`.

**Tech Stack:** Next.js 14 (App Router), next-intl, Firebase Auth/Firestore, Firebase Cloud Functions v2 (`onCall`), Zod, Vitest (emulator-backed), Netlify.

**Spec:** `docs/superpowers/specs/2026-07-20-google-signin-retail-design.md`
**Branch:** `feat/google-signin`

---

## File Structure

**Backend (functions):**

- Create `functions/src/auth/registerGoogleBuyer.ts` — the self-registration callable.
- Create `functions/src/auth/registerGoogleBuyer.test.ts` — emulator tests.
- Modify `functions/src/index.ts` — export the callable.
- Modify `functions/src/auctions/placeBid.ts` — profile-complete gate.
- Modify `functions/src/auctions/placeBid.test.ts` — gate tests.
- Modify `functions/src/_shared/user.ts` — make document fields optional (mirror).

**Shared types:**

- Modify `packages/shared-types/src/user.ts` — make document fields optional (canonical).
- Create `packages/shared-types/src/user.test.ts` — schema test.

**Web:**

- Create `apps/web/src/lib/auth/post-session.ts` — shared session-cookie helper.
- Modify `apps/web/src/app/[locale]/(auth)/login/login-form.tsx` — use helper + mount button.
- Create `apps/web/src/app/[locale]/(auth)/login/google-signin-button.tsx` — the button.
- Modify `apps/web/src/app/[locale]/(protected)/auctions/[id]/bid-panel.tsx` — gate toast.
- Modify `apps/web/messages/es.json` and `apps/web/messages/en.json` — i18n strings.
- Modify `netlify.toml` — CSP `frame-src` for the Firebase popup helper.

---

## Prerequisites

- On branch `feat/google-signin` (already created off `origin/main`).
- Functions/shared-types tests are Vitest. **Functions tests need the Firebase emulators running** (Firestore + Auth). In a separate terminal: `pnpm emulators`. Leave it running for every `@carbid/functions` test step.

---

## Task 1: Make document fields optional in the user schema

**Files:**

- Modify: `packages/shared-types/src/user.ts:30-31`
- Modify: `functions/src/_shared/user.ts:26-27`
- Test: `packages/shared-types/src/user.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/shared-types/src/user.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { UserProfileSchema } from './user.js';

describe('UserProfileSchema', () => {
  it('accepts a profile without documentType/documentNumber (Google self-signup)', () => {
    const parsed = UserProfileSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Gomez',
      audience: 'retail',
    });
    expect(parsed.success).toBe(true);
  });

  it('still accepts a full profile with document', () => {
    const parsed = UserProfileSchema.safeParse({
      firstName: 'Juan',
      lastName: 'Perez',
      documentType: 'CI',
      documentNumber: '1234567',
    });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carbid/shared-types test`
Expected: FAIL — first case rejected (`documentType`/`documentNumber` currently required).

- [ ] **Step 3: Make the fields optional (canonical)**

In `packages/shared-types/src/user.ts`, change lines 30-31 from:

```ts
  documentType: DocumentTypeSchema,
  documentNumber: z.string().min(1),
```

to:

```ts
  documentType: DocumentTypeSchema.optional(),
  documentNumber: z.string().min(1).optional(),
```

- [ ] **Step 4: Mirror the change in functions**

In `functions/src/_shared/user.ts`, change lines 26-27 from:

```ts
  documentType: DocumentTypeSchema,
  documentNumber: z.string().min(1),
```

to:

```ts
  documentType: DocumentTypeSchema.optional(),
  documentNumber: z.string().min(1).optional(),
```

- [ ] **Step 5: Rebuild shared-types (so web/functions consume new types) and run tests**

Run: `pnpm --filter @carbid/shared-types build && pnpm --filter @carbid/shared-types test`
Expected: build OK, both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/user.ts packages/shared-types/src/user.test.ts functions/src/_shared/user.ts
git commit -m "feat(schema): make user document fields optional for self-signup"
```

---

## Task 2: `registerGoogleBuyer` callable

**Files:**

- Create: `functions/src/auth/registerGoogleBuyer.ts`
- Test: `functions/src/auth/registerGoogleBuyer.test.ts`
- Modify: `functions/src/index.ts:13` (add export after `revokeMySessions`)

> **Note:** A brand-new Google user has **no custom claims**, so this callable must **not** use `requireSignedIn` (it throws `failed-precondition: User claims not yet provisioned` when claims are missing). It does its own `req.auth` check instead.

- [ ] **Step 1: Write the failing test**

Create `functions/src/auth/registerGoogleBuyer.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { registerGoogleBuyerHandler } from './registerGoogleBuyer.js';

function asGoogleUser(uid: string, name = 'Ana Gomez', email = 'ana@gmail.com'): CallableRequest {
  return {
    auth: {
      uid,
      token: { email, name, firebase: { sign_in_provider: 'google.com', identities: {} } } as never,
    },
    rawRequest: {} as never,
    data: {},
  } as CallableRequest;
}

async function clearAll() {
  const auth = adminAuth();
  const list = await auth.listUsers();
  await Promise.all(list.users.map((u) => auth.deleteUser(u.uid).catch(() => {})));
  for (const c of ['users', 'audit_logs']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

describe('registerGoogleBuyer', () => {
  beforeEach(clearAll);

  it('creates a buyer+retail+active user doc + claims for a new Google user', async () => {
    await adminAuth().createUser({ uid: 'g1', email: 'ana@gmail.com' });
    const res = await registerGoogleBuyerHandler(asGoogleUser('g1'));
    expect(res).toMatchObject({ uid: 'g1', role: 'buyer', audience: 'retail' });

    const d = (await adminDb().doc('users/g1').get()).data()!;
    expect(d['role']).toBe('buyer');
    expect(d['status']).toBe('active');
    expect(d['profile'].audience).toBe('retail');
    expect(d['profile'].firstName).toBe('Ana');
    expect(d['profile'].lastName).toBe('Gomez');
    expect(d['profile'].documentNumber).toBeUndefined();

    const claims = (await adminAuth().getUser('g1')).customClaims;
    expect(claims).toMatchObject({ role: 'buyer', status: 'active', audience: 'retail' });
  });

  it('does not overwrite an existing account (keeps staff role)', async () => {
    await adminAuth().createUser({ uid: 's1', email: 'staff@santarosa.com.py' });
    await adminDb()
      .doc('users/s1')
      .set({
        uid: 's1',
        role: 'staff',
        email: 'staff@santarosa.com.py',
        status: 'active',
        profile: { firstName: 'Staff', lastName: 'One' },
      });
    const res = await registerGoogleBuyerHandler(
      asGoogleUser('s1', 'Staff One', 'staff@santarosa.com.py'),
    );
    expect(res.role).toBe('staff');
    const d = (await adminDb().doc('users/s1').get()).data()!;
    expect(d['role']).toBe('staff');
  });

  it('rejects non-google providers', async () => {
    const req = {
      auth: { uid: 'x', token: { firebase: { sign_in_provider: 'password' } } as never },
      rawRequest: {} as never,
      data: {},
    } as CallableRequest;
    await expect(registerGoogleBuyerHandler(req)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects unauthenticated calls', async () => {
    const req = { rawRequest: {} as never, data: {} } as CallableRequest;
    await expect(registerGoogleBuyerHandler(req)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (emulators must be running): `pnpm --filter @carbid/functions test registerGoogleBuyer`
Expected: FAIL — `registerGoogleBuyerHandler` not found / module missing.

- [ ] **Step 3: Write the callable**

Create `functions/src/auth/registerGoogleBuyer.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Role, Audience } from '../_shared/index.js';
import { adminDb } from '../lib/admin.js';
import { setUserClaims } from '../lib/claims.js';
import { writeAuditLog } from '../lib/audit.js';

export interface RegisterGoogleBuyerResult {
  uid: string;
  role: Role;
  audience: Audience | null;
}

/**
 * Public self-registration via Google. A first-time Google user has NO custom
 * claims yet, so we deliberately do NOT use requireSignedIn (which demands
 * role/status). We only require an authenticated Google user, then force
 * buyer/retail server-side — the client can send nothing to influence the role.
 */
export async function registerGoogleBuyerHandler(
  req: CallableRequest,
): Promise<RegisterGoogleBuyerResult> {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }
  const { uid, token } = req.auth;
  if (token.firebase?.sign_in_provider !== 'google.com') {
    throw new HttpsError('failed-precondition', 'not_google');
  }

  const userRef = adminDb().doc(`users/${uid}`);
  const snap = await userRef.get();

  // Existing account (recurring buyer, or a staff/admin who linked Google to the
  // same email). Never overwrite — return their real role/audience.
  if (snap.exists) {
    const data = snap.data()!;
    const role = (data['role'] as Role) ?? 'buyer';
    const audience =
      ((data['profile'] as Record<string, unknown> | undefined)?.['audience'] as
        | Audience
        | undefined) ?? null;
    return { uid, role, audience };
  }

  // New self-registration: force buyer + retail + active, no document yet.
  const displayName = ((token.name as string | undefined) ?? '').trim();
  const [firstName = '', ...rest] = displayName.split(/\s+/);
  const lastName = rest.join(' ');

  await userRef.set({
    uid,
    role: 'buyer',
    email: token.email ?? '',
    status: 'active',
    provider: 'google',
    profile: {
      firstName,
      lastName,
      audience: 'retail',
    },
    preferences: {
      locale: 'es',
      theme: 'system',
      notifications: {
        outbidEmail: true,
        auctionWonEmail: true,
        newAuctionEmail: false,
      },
    },
    createdBy: 'self:google',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Set claims directly so the client's forced token refresh right after this
  // call already carries them. onUserSync fires too and is idempotent.
  await setUserClaims(uid, { role: 'buyer', status: 'active', audience: 'retail' });

  await writeAuditLog({
    actorUid: uid,
    action: 'user.self_register',
    resourceType: 'user',
    resourceId: uid,
    after: { role: 'buyer', audience: 'retail', provider: 'google' },
  });

  return { uid, role: 'buyer', audience: 'retail' };
}

export const registerGoogleBuyer = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true',
  },
  registerGoogleBuyerHandler,
);
```

- [ ] **Step 4: Export it in `functions/src/index.ts`**

After line 13 (`export { revokeMySessions } from './auth/revokeMySessions.js';`) add:

```ts
export { registerGoogleBuyer } from './auth/registerGoogleBuyer.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @carbid/functions test registerGoogleBuyer`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add functions/src/auth/registerGoogleBuyer.ts functions/src/auth/registerGoogleBuyer.test.ts functions/src/index.ts
git commit -m "feat(auth): registerGoogleBuyer callable for public retail self-signup"
```

---

## Task 3: Bid gate — require a completed profile in `placeBid`

**Files:**

- Modify: `functions/src/auctions/placeBid.ts` (after the buyer-profile read, ~line 90)
- Test: `functions/src/auctions/placeBid.test.ts`

- [ ] **Step 1: Write the failing test**

In `functions/src/auctions/placeBid.test.ts`, add a no-document seeder next to `seedBuyer` (after line 44):

```ts
async function seedBuyerNoDoc(uid: string) {
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role: 'buyer',
      email: `${uid}@example.com`,
      status: 'active',
      profile: { firstName: 'Ana', lastName: 'Gomez', audience: 'retail' },
      preferences: { locale: 'es', theme: 'system', notifications: {} },
      createdBy: 'self:google',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
}
```

Then add a test inside the existing `describe('placeBid', ...)` block:

```ts
it('rejects a bid when the buyer has no document (profile incomplete)', async () => {
  await seedBuyerNoDoc('nb1');
  const auctionId = await seedAuction({ status: 'live' });
  await expect(placeBidHandler(asBuyer('nb1', { auctionId, amount: 5000 }))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carbid/functions test placeBid`
Expected: FAIL — the no-doc bid currently succeeds (no gate yet).

- [ ] **Step 3: Add the gate**

In `functions/src/auctions/placeBid.ts`, immediately after the `buyerSnapshot` block (after line 90, before `const result = await db.runTransaction`), insert:

```ts
// Buyers self-registered via Google enter without a document. Money can't
// move without one, so the bid is blocked until the profile is completed
// at /settings/profile. Enforced here (server-authoritative), surfaced in
// the client as a friendly toast with a link.
if (!profile['documentType'] || !profile['documentNumber']) {
  throw new HttpsError('failed-precondition', 'profile_incomplete');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @carbid/functions test placeBid`
Expected: PASS — the new test passes and all existing placeBid tests still pass (they seed a document).

- [ ] **Step 5: Commit**

```bash
git add functions/src/auctions/placeBid.ts functions/src/auctions/placeBid.test.ts
git commit -m "feat(bids): block bids until buyer profile has a document"
```

---

## Task 4: Shared `postSession` helper (refactor login-form)

**Files:**

- Create: `apps/web/src/lib/auth/post-session.ts`
- Modify: `apps/web/src/app/[locale]/(auth)/login/login-form.tsx:46-98`

- [ ] **Step 1: Create the helper**

Create `apps/web/src/lib/auth/post-session.ts`:

```ts
import type { Audience, Role } from '@/lib/auth/constants';

export type PostSessionResult =
  | { ok: true; role: Role; audience: Audience | null }
  | { ok: false; error: string };

/**
 * Exchanges a Firebase ID token for a session cookie via /api/session.
 * Shared by the password login form and the Google sign-in button so the
 * error taxonomy (account_disabled, server_misconfigured, forbidden_origin…)
 * lives in one place.
 */
export async function postSession(idToken: string): Promise<PostSessionResult> {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? 'generic' };
  }
  const { role, audience } = (await res.json()) as { role: Role; audience: Audience | null };
  return { ok: true, role, audience };
}
```

- [ ] **Step 2: Refactor `login-form.tsx` to use it**

Add the import near the other `@/lib` imports (after line 11):

```ts
import { postSession } from '@/lib/auth/post-session';
```

The line `const idToken = await cred.user.getIdToken(true);` already exists (line 51) — **keep it**. Replace only from the next line (`const res = await fetch('/api/session'...`, line 52) through the `return;` that ends the success path (line 85) with:

```ts
const result = await postSession(idToken);
if (!result.ok) {
  if (result.error === 'account_disabled') {
    setError(t('errors.accountDisabled'));
  } else if (
    result.error === 'server_misconfigured' ||
    result.error === 'session_creation_failed'
  ) {
    setError('Servicio no disponible. El equipo fue notificado. Probá de nuevo en unos minutos.');
  } else if (result.error === 'forbidden_origin') {
    setError('Origen no permitido. Cerrá la pestaña y volvé a abrir el sitio.');
  } else {
    setError(t('errors.generic'));
  }
  await fb.auth.signOut();
  return;
}
const { role, audience } = result;
const target = from && from.startsWith('/') ? from : homeFor(role, audience ?? undefined);
setEntering(true);
router.replace(`/${locale}${target}`);
router.refresh();
return;
```

(The `signInWithEmailAndPassword` line and the surrounding `try/catch` stay as-is. `Role`/`Audience` type imports on line 11 can remain.)

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @carbid/web typecheck`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth/post-session.ts apps/web/src/app/[locale]/\(auth\)/login/login-form.tsx
git commit -m "refactor(auth): extract postSession helper from login form"
```

---

## Task 5: i18n strings

**Files:**

- Modify: `apps/web/messages/es.json` (`auth.login` + `buyer.auctions.detail.bidPanel.errors`)
- Modify: `apps/web/messages/en.json` (same keys)

- [ ] **Step 1: Add Spanish strings**

In `apps/web/messages/es.json`, inside `auth.login`, add these keys (alongside `submit`, `submitting`):

```json
      "googleButton": "Continuar con Google",
      "orDivider": "o",
```

And inside `auth.login.errors`, add:

```json
        "googleFailed": "No se pudo continuar con Google. Probá de nuevo.",
        "popupBlocked": "El navegador bloqueó la ventana de Google. Habilitá los pop-ups y reintentá."
```

Inside `buyer.auctions.detail.bidPanel.errors`, add:

```json
        "profileIncomplete": "Completá tu perfil (documento) para poder pujar.",
        "profileIncompleteCta": "Completar perfil"
```

- [ ] **Step 2: Add matching English strings**

In `apps/web/messages/en.json`, inside `auth.login`:

```json
      "googleButton": "Continue with Google",
      "orDivider": "or",
```

Inside `auth.login.errors`:

```json
        "googleFailed": "Couldn't continue with Google. Please try again.",
        "popupBlocked": "The browser blocked the Google popup. Allow pop-ups and retry."
```

Inside `buyer.auctions.detail.bidPanel.errors`:

```json
        "profileIncomplete": "Complete your profile (document) to place a bid.",
        "profileIncompleteCta": "Complete profile"
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "require('./apps/web/messages/es.json'); require('./apps/web/messages/en.json'); console.log('ok')"`
Expected: prints `ok` (no JSON parse error).

- [ ] **Step 4: Commit**

```bash
git add apps/web/messages/es.json apps/web/messages/en.json
git commit -m "i18n: strings for Google sign-in and bid profile gate"
```

---

## Task 6: `GoogleSignInButton` component + mount in login form

**Files:**

- Create: `apps/web/src/app/[locale]/(auth)/login/google-signin-button.tsx`
- Modify: `apps/web/src/app/[locale]/(auth)/login/login-form.tsx` (import + render after `</form>`)

- [ ] **Step 1: Create the button component**

Create `apps/web/src/app/[locale]/(auth)/login/google-signin-button.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Loader2 } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { postSession } from '@/lib/auth/post-session';
import { homeFor } from '@/lib/auth/constants';
import { Button } from '@/components/ui/button';

function GoogleGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export function GoogleSignInButton({ from, locale }: { from?: string; locale: string }) {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const cred = await signInWithPopup(fb.auth, new GoogleAuthProvider());
      // Provision (or resolve) the account server-side; forces buyer/retail
      // for new users, no-ops for existing ones.
      await httpsCallable(fb.functions, 'registerGoogleBuyer')();
      // Force-refresh so the JWT carries the freshly-set custom claims.
      const idToken = await cred.user.getIdToken(true);
      const result = await postSession(idToken);
      if (!result.ok) {
        toast.error(
          result.error === 'account_disabled'
            ? t('errors.accountDisabled')
            : t('errors.googleFailed'),
        );
        await signOut(fb.auth);
        return;
      }
      const target =
        from && from.startsWith('/') ? from : homeFor(result.role, result.audience ?? undefined);
      router.replace(`/${locale}${target}`);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      // User closed/cancelled the popup — not an error worth surfacing.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      if (code === 'auth/popup-blocked') {
        toast.error(t('errors.popupBlocked'));
        return;
      }
      toast.error(t('errors.googleFailed'));
      await signOut(fb.auth).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={busy}
      className="w-full h-11 rounded-xl gap-2 border-text-subtle/20"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <GoogleGlyph />}
      {busy ? t('submitting') : t('googleButton')}
    </Button>
  );
}
```

- [ ] **Step 2: Mount it in `login-form.tsx`**

Add the import (after the `ForgotPasswordDialog` import, ~line 17):

```ts
import { GoogleSignInButton } from './google-signin-button';
```

Immediately after the closing `</form>` tag (before the fragment closes with `</>`), add:

```tsx
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <span className="w-full border-t border-text-subtle/20" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-bg-base px-3 text-xs uppercase tracking-[0.08em] text-text-muted">
              {t('orDivider')}
            </span>
          </div>
        </div>
        <GoogleSignInButton from={from} locale={locale} />
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web build`
Expected: PASS.

- [ ] **Step 4: Manual verification (emulators + dev server)**

With `pnpm emulators` and `pnpm dev:web` running, open `http://localhost:3100/es/login`. Expected: the "o" divider + "Continuar con Google" button render below the password form. (Full popup flow needs real Google OAuth; verified in staging/prod — see deploy checklist.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/\(auth\)/login/google-signin-button.tsx apps/web/src/app/[locale]/\(auth\)/login/login-form.tsx
git commit -m "feat(auth): Google sign-in button on the login page"
```

---

## Task 7: Bid-panel client gate handling

**Files:**

- Modify: `apps/web/src/app/[locale]/(protected)/auctions/[id]/bid-panel.tsx`

- [ ] **Step 1: Add router + locale access**

In `bid-panel.tsx`, ensure these imports exist (add if missing, near the top):

```ts
import { useRouter, useParams } from 'next/navigation';
```

Inside the component, near `const t = useTranslations('buyer.auctions.detail.bidPanel');`, add:

```ts
const router = useRouter();
const locale = (useParams().locale as string) ?? 'es';
```

- [ ] **Step 2: Handle the `profile_incomplete` error**

In the `catch (e)` block, add a branch before the final `else` (before line 96 `} else {`):

```ts
      } else if (msg.includes('profile_incomplete')) {
        toast.error(t('errors.profileIncomplete'), {
          action: {
            label: t('errors.profileIncompleteCta'),
            onClick: () => router.push(`/${locale}/settings/profile`),
          },
        });
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/\(protected\)/auctions/\[id\]/bid-panel.tsx
git commit -m "feat(bids): surface profile-incomplete gate with a link to settings"
```

---

## Task 8: CSP — allow the Firebase popup helper iframe

**Files:**

- Modify: `netlify.toml` (the `Content-Security-Policy` header, `frame-src` directive)

- [ ] **Step 1: Update `frame-src`**

In `netlify.toml`, in the `Content-Security-Policy` value, change:

```
frame-src 'self' https://www.google.com https://www.recaptcha.net;
```

to:

```
frame-src 'self' https://www.google.com https://www.recaptcha.net https://*.firebaseapp.com https://accounts.google.com;
```

(`*.firebaseapp.com` covers the Firebase Auth popup handler; `accounts.google.com` covers the Google account chooser when rendered in a frame.)

- [ ] **Step 2: Verify the value of `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`**

Run: `grep NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN apps/web/.env.local`
Expected: a `*.firebaseapp.com` domain. If it is a **custom** auth domain instead, add that exact host to `frame-src` as well.

- [ ] **Step 3: Commit**

```bash
git add netlify.toml
git commit -m "fix(csp): allow Firebase auth popup helper in frame-src"
```

---

## Task 9: Manual configuration + deploy

> Not code — a checklist for the operator. Do the Firebase config before/with the web deploy so the popup works in prod.

- [ ] **Step 1: Firebase Auth config (Firebase Console → project `carbid-59ef5`)**
  - Authentication → Sign-in method → **Google**: enabled (done).
  - Authentication → Settings → **Authorized domains**: ensure `renewsubastas.com.py`, the site's `*.netlify.app` domain, and `localhost` are present.
  - Authentication → Settings → **User account linking**: set to **"Link accounts that use the same email"** (one account per email) to avoid duplicate identities.

- [ ] **Step 2: Deploy functions** (new callable + placeBid gate + schema mirror)

```bash
pnpm --filter @carbid/shared-types build
pnpm --filter @carbid/functions deploy
```

Expected: `registerGoogleBuyer` deploys; `placeBid` updates.

- [ ] **Step 3: Deploy web** (prod is NOT git-connected — manual Netlify deploy)

```bash
git checkout main && git pull   # after this branch is merged
/tmp/nlcli/node_modules/.bin/netlify deploy --build --prod \
  --filter @carbid/web --site 5ecfa35d-a428-452f-9c48-115a0b257114
```

(If netlify-cli is gone: `npm i -g netlify-cli`; login persists in `~/.config/netlify`.)

- [ ] **Step 4: Smoke test in prod**
  - Open `https://renewsubastas.com.py/es/login` → "Continuar con Google" visible.
  - Complete Google sign-in with a fresh Google account → lands on `/es/retail`.
  - Verify in Firestore: `users/{uid}` has `role: buyer`, `profile.audience: retail`, no `documentNumber`.
  - Try to bid → blocked with "Completá tu perfil" toast + link.
  - Complete document in `/settings/profile` → bid succeeds.

- [ ] **Step 5: Merge the branch**

```bash
gh pr create --base main --head feat/google-signin --title "feat: Google sign-in + retail self-registration"
# review, then squash-merge
```

---

## Notes

- **Deploy coupling:** the bid gate is server-authoritative (Task 3, functions) and the schema is optional (Task 1). Deploy functions **before or together with** web so a self-signed-up buyer can never bid without a document.
- **App Check:** `registerGoogleBuyer` uses the same `enforceAppCheck` gate as other callables; App Check is already initialized client-side, so the popup + callable pass through.
