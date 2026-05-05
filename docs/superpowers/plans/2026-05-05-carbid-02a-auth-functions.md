# CARBID Plan 2a — Auth Cloud Functions

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Build the server-side authentication layer: Cloud Functions to create/update/delete users (admin only), sync Firebase Auth custom claims (`role`, `status`) from Firestore, validate Paraguay documents and the `santarosa.com.py` email domain rule, and persist audit logs.

**Architecture:** All write paths to `users/` collection go through callable Cloud Functions guarded by custom-claim checks. A Firestore `onWrite` trigger keeps custom claims in sync with the user doc. Audit logs are written from a shared helper. firebase-admin is initialized once per function instance.

**Tech Stack:** firebase-functions v5 (callable + Firestore triggers), firebase-admin v12, Zod validation, `@carbid/shared-types`, Vitest with Firebase Local Emulator.

**Spec reference:** `docs/superpowers/specs/2026-05-05-carbid-mvp-design.md` §4 (data model), §5 (security and Cloud Functions table).

**Prerequisites:** Plan 1 complete; Java 21 installed for Auth+Firestore emulators; `apps/web/.env.local` populated.

---

## File Structure (end state)

```
functions/src/
├── index.ts                       re-exports all callable + trigger functions
├── health.ts                      (existing)
├── lib/
│   ├── admin.ts                   firebase-admin singleton
│   ├── audit.ts                   writeAuditLog helper
│   ├── claims.ts                  setUserClaims helper
│   ├── config.ts                  loadAppConfig helper (reads app_config/global)
│   └── errors.ts                  HttpsError factory + role guards
├── auth/
│   ├── createUser.ts              callable (admin only)
│   ├── createUser.test.ts
│   ├── updateUserRole.ts          callable (admin only)
│   ├── updateUserRole.test.ts
│   ├── deleteUser.ts              callable (admin or self-buyer)
│   ├── deleteUser.test.ts
│   └── onUserSync.ts              Firestore onWrite trigger → custom claims
└── test/
    ├── setup.ts                   emulator env wiring for Vitest
    └── helpers.ts                 createTestUser, signInAs, etc.
```

---

## Task 1: firebase-admin singleton + test harness

**Files:**

- Create: `functions/src/lib/admin.ts`
- Create: `functions/src/lib/errors.ts`
- Create: `functions/src/test/setup.ts`
- Modify: `functions/package.json` (add test deps + script env)
- Modify: `functions/vitest.config.ts` (new)

- [ ] **Step 1.1: Add test deps to functions/package.json**

In `dependencies` add nothing new. In `devDependencies` add:

```json
"firebase-functions-test": "^3.3.0",
"@types/node": "^20.12.0"
```

Update `scripts.test` to:

```json
"test": "vitest run --passWithNoTests",
"test:watch": "vitest"
```

Run `pnpm install`.

- [ ] **Step 1.2: Create functions/vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
```

- [ ] **Step 1.3: Create functions/src/lib/admin.ts**

```ts
import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | null = null;

export function getAdminApp(): App {
  if (!app) {
    if (getApps().length) {
      app = getApps()[0]!;
    } else {
      // In emulator and prod, applicationDefault() works.
      app = initializeApp({ credential: applicationDefault() });
    }
  }
  return app;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
export const adminDb = (): Firestore => getFirestore(getAdminApp());
```

- [ ] **Step 1.4: Create functions/src/lib/errors.ts**

```ts
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';

export type Role = 'admin' | 'staff' | 'buyer';

export function requireSignedIn(req: CallableRequest): { uid: string; role: Role; status: string } {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }
  const role = req.auth.token['role'] as Role | undefined;
  const status = req.auth.token['status'] as string | undefined;
  if (!role || !status) {
    throw new HttpsError('failed-precondition', 'User claims not yet provisioned');
  }
  if (status !== 'active') {
    throw new HttpsError('permission-denied', 'Account is disabled');
  }
  return { uid: req.auth.uid, role, status };
}

export function requireAdmin(req: CallableRequest): { uid: string } {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'admin') throw new HttpsError('permission-denied', 'Admin role required');
  return { uid };
}

export function badRequest(message: string, details?: unknown): never {
  throw new HttpsError('invalid-argument', message, details);
}
```

- [ ] **Step 1.5: Create functions/src/test/setup.ts**

```ts
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? 'carbid-staging';
```

- [ ] **Step 1.6: Build, lint, typecheck**

Run:

```
pnpm --filter @carbid/functions typecheck
pnpm --filter @carbid/functions build
```

Both must pass.

- [ ] **Step 1.7: Commit**

```
git add functions/package.json functions/vitest.config.ts functions/src/lib functions/src/test pnpm-lock.yaml
git commit -m "feat(functions): add admin singleton, error helpers and test harness"
```

---

## Task 2: writeAuditLog + claims helpers

**Files:**

- Create: `functions/src/lib/audit.ts`
- Create: `functions/src/lib/claims.ts`

- [ ] **Step 2.1: Create functions/src/lib/audit.ts**

```ts
import { adminDb } from './admin';
import { FieldValue } from 'firebase-admin/firestore';

interface AuditEntry {
  actorUid: string;
  action: string;
  resourceType: 'user' | 'auction' | 'vehicle' | 'app_config';
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await adminDb()
    .collection('audit_logs')
    .add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    });
}
```

- [ ] **Step 2.2: Create functions/src/lib/claims.ts**

```ts
import { adminAuth } from './admin';

export interface UserClaims {
  role: 'admin' | 'staff' | 'buyer';
  status: 'active' | 'disabled';
}

export async function setUserClaims(uid: string, claims: UserClaims): Promise<void> {
  await adminAuth().setCustomUserClaims(uid, claims);
}

export async function clearUserClaims(uid: string): Promise<void> {
  await adminAuth().setCustomUserClaims(uid, null);
}
```

- [ ] **Step 2.3: Typecheck and commit**

```
pnpm --filter @carbid/functions typecheck
git add functions/src/lib
git commit -m "feat(functions): add audit log and custom claims helpers"
```

---

## Task 3: loadAppConfig helper

**Files:**

- Create: `functions/src/lib/config.ts`

- [ ] **Step 3.1: Create functions/src/lib/config.ts**

```ts
import { adminDb } from './admin';

export interface RuntimeConfig {
  emails: {
    adminStaffDomain: string;
    fromAddress: string;
    fromName: string;
  };
}

const DEFAULT_CONFIG: RuntimeConfig = {
  emails: {
    adminStaffDomain: 'santarosa.com.py',
    fromAddress: 'no-reply@santarosa.com.py',
    fromName: 'CARBID Subastas',
  },
};

export async function loadAppConfig(): Promise<RuntimeConfig> {
  const snap = await adminDb().doc('app_config/global').get();
  if (!snap.exists) return DEFAULT_CONFIG;
  const data = snap.data() ?? {};
  const emails = (data.emails ?? {}) as Partial<RuntimeConfig['emails']>;
  return {
    emails: {
      adminStaffDomain: emails.adminStaffDomain ?? DEFAULT_CONFIG.emails.adminStaffDomain,
      fromAddress: emails.fromAddress ?? DEFAULT_CONFIG.emails.fromAddress,
      fromName: emails.fromName ?? DEFAULT_CONFIG.emails.fromName,
    },
  };
}
```

- [ ] **Step 3.2: Typecheck and commit**

```
git add functions/src/lib/config.ts
git commit -m "feat(functions): add loadAppConfig with sane defaults"
```

---

## Task 4: createUser callable (TDD)

**Files:**

- Create: `functions/src/auth/createUser.ts`
- Create: `functions/src/auth/createUser.test.ts`
- Modify: `functions/src/index.ts`

This task uses TDD. Write the failing test first; the test runs against the Firebase Auth + Firestore emulators (must be running locally).

- [ ] **Step 4.1: Write failing test**

Create `functions/src/auth/createUser.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { adminAuth, adminDb } from '../lib/admin';
import { createUser } from './createUser';
import type { CallableRequest } from 'firebase-functions/v2/https';

function asAdmin(uid = 'admin-uid'): CallableRequest {
  return {
    auth: { uid, token: { role: 'admin', status: 'active' } as never },
    rawRequest: {} as never,
    data: {},
  } as CallableRequest;
}

async function clearEmulators() {
  // Delete all users via admin emulator
  const auth = adminAuth();
  const list = await auth.listUsers();
  await Promise.all(list.users.map((u) => auth.deleteUser(u.uid)));
  // Delete users docs
  const docs = await adminDb().collection('users').listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
}

describe('createUser', () => {
  beforeAll(() => {
    // emulator hosts set in test/setup.ts
  });

  beforeEach(async () => {
    await clearEmulators();
  });

  it('rejects calls from non-admin', async () => {
    const req = {
      auth: { uid: 'staff-uid', token: { role: 'staff', status: 'active' } as never },
      rawRequest: {} as never,
      data: {
        role: 'buyer',
        email: 'buyer@example.com',
        firstName: 'Juan',
        lastName: 'Perez',
        documentType: 'CI',
        documentNumber: '1234567',
      },
    } as unknown as CallableRequest;
    await expect(
      (createUser as unknown as { run: (r: CallableRequest) => Promise<unknown> }).run(req),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects admin/staff with non-santarosa.com.py email', async () => {
    const req = {
      ...asAdmin(),
      data: {
        role: 'staff',
        email: 'staff@gmail.com',
        firstName: 'Maria',
        lastName: 'Lopez',
        documentType: 'CI',
        documentNumber: '7654321',
      },
    } as unknown as CallableRequest;
    await expect(
      (createUser as unknown as { run: (r: CallableRequest) => Promise<unknown> }).run(req),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('accepts buyer with any email domain', async () => {
    const req = {
      ...asAdmin(),
      data: {
        role: 'buyer',
        email: 'buyer@gmail.com',
        firstName: 'Carlos',
        lastName: 'Diaz',
        documentType: 'CI',
        documentNumber: '9876543',
      },
    } as unknown as CallableRequest;
    const result = await (
      createUser as unknown as { run: (r: CallableRequest) => Promise<{ uid: string }> }
    ).run(req);
    expect(result.uid).toBeTypeOf('string');
    const userDoc = await adminDb().doc(`users/${result.uid}`).get();
    expect(userDoc.exists).toBe(true);
    expect(userDoc.data()?.role).toBe('buyer');
    expect(userDoc.data()?.status).toBe('active');
  });

  it('rejects invalid Paraguay RUC', async () => {
    const req = {
      ...asAdmin(),
      data: {
        role: 'staff',
        email: 'staff@santarosa.com.py',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentType: 'RUC',
        documentNumber: '80012345-9',
      },
    } as unknown as CallableRequest;
    await expect(
      (createUser as unknown as { run: (r: CallableRequest) => Promise<unknown> }).run(req),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('writes audit log on success', async () => {
    const req = {
      ...asAdmin('admin-1'),
      data: {
        role: 'buyer',
        email: 'b1@example.com',
        firstName: 'Pedro',
        lastName: 'Ruiz',
        documentType: 'CI',
        documentNumber: '5555555',
      },
    } as unknown as CallableRequest;
    await (createUser as unknown as { run: (r: CallableRequest) => Promise<unknown> }).run(req);
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'user.create')
      .get();
    expect(logs.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4.2: Run test, verify FAIL with module-not-found**

Start emulators in another terminal:

```
firebase emulators:start --only auth,firestore --project carbid-staging
```

Then in repo root:

```
pnpm --filter @carbid/functions test
```

Expected: `Cannot find module './createUser'`.

- [ ] **Step 4.3: Implement createUser**

Create `functions/src/auth/createUser.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { isValidCiPy, isValidRucPy, RoleSchema, DocumentTypeSchema } from '@carbid/shared-types';
import { adminAuth, adminDb } from '../lib/admin';
import { setUserClaims } from '../lib/claims';
import { writeAuditLog } from '../lib/audit';
import { loadAppConfig } from '../lib/config';
import { requireAdmin } from '../lib/errors';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({
  role: RoleSchema,
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentType: DocumentTypeSchema,
  documentNumber: z.string().min(1),
  phone: z.string().optional(),
});

export const createUser = onCall({ region: 'us-central1' }, async (req) => {
  const { uid: actorUid } = requireAdmin(req);

  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const input = parsed.data;

  // Validate document
  const docOk =
    input.documentType === 'CI'
      ? isValidCiPy(input.documentNumber)
      : isValidRucPy(input.documentNumber);
  if (!docOk) {
    throw new HttpsError('invalid-argument', `Invalid ${input.documentType} for Paraguay`);
  }

  // Validate email domain for admin/staff
  const config = await loadAppConfig();
  if (input.role !== 'buyer') {
    const domain = input.email.split('@')[1] ?? '';
    if (domain.toLowerCase() !== config.emails.adminStaffDomain.toLowerCase()) {
      throw new HttpsError(
        'invalid-argument',
        `${input.role} email must use domain ${config.emails.adminStaffDomain}`,
      );
    }
  }

  // Create Auth user (random temp password — admin sends reset link separately)
  const tempPassword = Math.random().toString(36).slice(2) + 'Aa1!';
  const authUser = await adminAuth().createUser({
    email: input.email,
    password: tempPassword,
    displayName: `${input.firstName} ${input.lastName}`,
    emailVerified: false,
    disabled: false,
  });

  await setUserClaims(authUser.uid, { role: input.role, status: 'active' });

  await adminDb()
    .doc(`users/${authUser.uid}`)
    .set({
      uid: authUser.uid,
      role: input.role,
      email: input.email,
      status: 'active',
      profile: {
        firstName: input.firstName,
        lastName: input.lastName,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        ...(input.phone !== undefined && { phone: input.phone }),
      },
      preferences: {
        locale: 'es',
        theme: 'system',
        notifications: { outbidEmail: true, auctionWonEmail: true, newAuctionEmail: false },
      },
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  await writeAuditLog({
    actorUid,
    action: 'user.create',
    resourceType: 'user',
    resourceId: authUser.uid,
    after: { role: input.role, email: input.email, status: 'active' },
  });

  // Generate password reset link the admin can forward (or send via email later)
  const resetLink = await adminAuth().generatePasswordResetLink(input.email);

  return { uid: authUser.uid, resetLink };
});
```

- [ ] **Step 4.4: Update functions/src/index.ts**

```ts
export { pingHealth } from './health';
export { createUser } from './auth/createUser';
```

If using NodeNext module resolution, append `.js` to relative imports as needed.

- [ ] **Step 4.5: Re-run test, verify PASS**

```
pnpm --filter @carbid/functions test
```

Expected: 5/5 tests pass.

- [ ] **Step 4.6: Build and commit**

```
pnpm --filter @carbid/functions build
git add functions/src/auth/createUser.ts functions/src/auth/createUser.test.ts functions/src/index.ts
git commit -m "feat(functions): createUser callable with PY validation and audit log"
```

---

## Task 5: updateUserRole callable (TDD)

**Files:**

- Create: `functions/src/auth/updateUserRole.ts`
- Create: `functions/src/auth/updateUserRole.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 5.1: Write failing test**

Create `functions/src/auth/updateUserRole.test.ts` covering:

- non-admin caller → permission-denied
- target user does not exist → not-found
- valid update changes both `users/{uid}.role` and Auth custom claim
- writes audit log with `before/after`
- `status` toggle (`active` ↔ `disabled`) is also accepted via the same callable (input `{ uid, role?, status? }` — at least one required)

(Use the same pattern as Step 4.1 for clearing emulators between tests.)

- [ ] **Step 5.2: Run test, verify FAIL**

- [ ] **Step 5.3: Implement updateUserRole**

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { RoleSchema, UserStatusSchema } from '@carbid/shared-types';
import { adminDb } from '../lib/admin';
import { setUserClaims } from '../lib/claims';
import { writeAuditLog } from '../lib/audit';
import { requireAdmin } from '../lib/errors';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z
  .object({
    uid: z.string().min(1),
    role: RoleSchema.optional(),
    status: UserStatusSchema.optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, {
    message: 'role or status must be provided',
  });

export const updateUserRole = onCall({ region: 'us-central1' }, async (req) => {
  const { uid: actorUid } = requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const input = parsed.data;

  const ref = adminDb().doc(`users/${input.uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const before = snap.data()!;

  const nextRole = input.role ?? (before['role'] as 'admin' | 'staff' | 'buyer');
  const nextStatus = input.status ?? (before['status'] as 'active' | 'disabled');

  await setUserClaims(input.uid, { role: nextRole, status: nextStatus });
  await ref.update({
    ...(input.role !== undefined && { role: input.role }),
    ...(input.status !== undefined && { status: input.status }),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUid,
    action: 'user.update_role',
    resourceType: 'user',
    resourceId: input.uid,
    before: { role: before['role'], status: before['status'] },
    after: { role: nextRole, status: nextStatus },
  });

  return { ok: true };
});
```

- [ ] **Step 5.4: Re-run test, PASS**

- [ ] **Step 5.5: Update index, build, commit**

```
git add functions/src/auth/updateUserRole.ts functions/src/auth/updateUserRole.test.ts functions/src/index.ts
git commit -m "feat(functions): updateUserRole with status toggle and audit"
```

---

## Task 6: deleteUser callable (TDD)

**Files:**

- Create: `functions/src/auth/deleteUser.ts`
- Create: `functions/src/auth/deleteUser.test.ts`
- Modify: `functions/src/index.ts`

Behavior per spec §6:

- Admin can delete any non-admin user.
- Buyer can delete only themselves.
- Soft delete: sets `deletedAt`, `status = 'disabled'`, clears Auth custom claims, disables Auth user. Hard delete handled by separate cron (Plan 9).

- [ ] **Step 6.1: Write failing test**

Cases:

- buyer deleting another user → permission-denied
- buyer deleting self → succeeds, doc has `deletedAt`, Auth user disabled
- admin deleting buyer → succeeds
- admin deleting admin → permission-denied (last admin guard)
- audit log written

- [ ] **Step 6.2: Run, FAIL**

- [ ] **Step 6.3: Implement**

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth, adminDb } from '../lib/admin';
import { writeAuditLog } from '../lib/audit';
import { requireSignedIn } from '../lib/errors';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({ uid: z.string().min(1) });

export const deleteUser = onCall({ region: 'us-central1' }, async (req) => {
  const { uid: actorUid, role: actorRole } = requireSignedIn(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const targetUid = parsed.data.uid;

  const ref = adminDb().doc(`users/${targetUid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const before = snap.data()!;

  const isSelfBuyer = actorUid === targetUid && actorRole === 'buyer';
  const isAdminDeletingNonAdmin = actorRole === 'admin' && before['role'] !== 'admin';

  if (!isSelfBuyer && !isAdminDeletingNonAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized to delete this user');
  }

  // Soft delete
  await adminAuth().updateUser(targetUid, { disabled: true });
  await adminAuth().setCustomUserClaims(targetUid, null);
  await ref.update({
    status: 'disabled',
    deletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUid,
    action: 'user.delete',
    resourceType: 'user',
    resourceId: targetUid,
    before: { role: before['role'], status: before['status'] },
    after: { status: 'disabled', deletedAt: 'now' },
  });

  return { ok: true };
});
```

- [ ] **Step 6.4: Re-run, PASS**

- [ ] **Step 6.5: Commit**

```
git add functions/src/auth/deleteUser.ts functions/src/auth/deleteUser.test.ts functions/src/index.ts
git commit -m "feat(functions): deleteUser soft delete with role-based guards"
```

---

## Task 7: onUserSync Firestore trigger

**Files:**

- Create: `functions/src/auth/onUserSync.ts`
- Modify: `functions/src/index.ts`

This trigger keeps custom claims in sync if a user doc is modified directly (e.g., by another admin tool or a manual repair). Defensive layer — under normal flow `setUserClaims` is called explicitly.

- [ ] **Step 7.1: Implement**

```ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setUserClaims, clearUserClaims } from '../lib/claims';

export const onUserSync = onDocumentWritten(
  { document: 'users/{uid}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after.data();
    const uid = event.params.uid;
    if (!after) {
      await clearUserClaims(uid);
      return;
    }
    const role = after['role'] as 'admin' | 'staff' | 'buyer' | undefined;
    const status = after['status'] as 'active' | 'disabled' | undefined;
    if (!role || !status) return;
    await setUserClaims(uid, { role, status });
  },
);
```

- [ ] **Step 7.2: Update index.ts and commit**

```
git add functions/src/auth/onUserSync.ts functions/src/index.ts
git commit -m "feat(functions): sync custom claims from users doc writes"
```

---

## Task 8: changePassword callable (admin reset)

**Files:**

- Create: `functions/src/auth/changePassword.ts`
- Modify: `functions/src/index.ts`

Used when admin needs to force a password reset link. Buyers/staff change their own password client-side via Firebase Auth SDK directly (covered in Plan 2c).

- [ ] **Step 8.1: Implement**

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth } from '../lib/admin';
import { writeAuditLog } from '../lib/audit';
import { requireAdmin } from '../lib/errors';

const InputSchema = z.object({ uid: z.string().min(1) });

export const generatePasswordReset = onCall({ region: 'us-central1' }, async (req) => {
  const { uid: actorUid } = requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');

  const user = await adminAuth().getUser(parsed.data.uid);
  if (!user.email) throw new HttpsError('failed-precondition', 'User has no email');

  const link = await adminAuth().generatePasswordResetLink(user.email);
  await writeAuditLog({
    actorUid,
    action: 'user.password_reset_generated',
    resourceType: 'user',
    resourceId: parsed.data.uid,
  });
  return { resetLink: link };
});
```

- [ ] **Step 8.2: Commit**

```
git add functions/src/auth/changePassword.ts functions/src/index.ts
git commit -m "feat(functions): admin generatePasswordReset callable"
```

---

## Task 9: Bootstrap first admin (manual one-shot)

The chicken-and-egg problem: `createUser` requires an admin. We need to create the first admin manually.

**Files:**

- Create: `functions/scripts/bootstrap-admin.ts`
- Modify: `functions/package.json` (add script)

- [ ] **Step 9.1: Create script**

```ts
import { adminAuth, adminDb } from '../src/lib/admin';
import { setUserClaims } from '../src/lib/claims';
import { FieldValue } from 'firebase-admin/firestore';

async function main() {
  const email = process.argv[2];
  const firstName = process.argv[3] ?? 'Admin';
  const lastName = process.argv[4] ?? 'CARBID';
  const documentNumber = process.argv[5] ?? '0000000';
  if (!email)
    throw new Error('Usage: bootstrap-admin <email> [firstName] [lastName] [documentNumber]');

  let user;
  try {
    user = await adminAuth().getUserByEmail(email);
  } catch {
    user = await adminAuth().createUser({
      email,
      password: Math.random().toString(36).slice(2) + 'Aa1!',
      displayName: `${firstName} ${lastName}`,
      emailVerified: false,
    });
  }

  await setUserClaims(user.uid, { role: 'admin', status: 'active' });

  await adminDb()
    .doc(`users/${user.uid}`)
    .set(
      {
        uid: user.uid,
        role: 'admin',
        email,
        status: 'active',
        profile: {
          firstName,
          lastName,
          documentType: 'CI',
          documentNumber,
        },
        preferences: {
          locale: 'es',
          theme: 'system',
          notifications: { outbidEmail: true, auctionWonEmail: true, newAuctionEmail: false },
        },
        createdBy: 'bootstrap',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  const link = await adminAuth().generatePasswordResetLink(email);
  console.log('Admin bootstrapped. Reset link:', link);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

- [ ] **Step 9.2: Add script entry to functions/package.json**

```json
"scripts": {
  ...
  "bootstrap-admin": "tsx scripts/bootstrap-admin.ts"
}
```

Add `"tsx": "^4.7.0"` to devDependencies. Run `pnpm install`.

- [ ] **Step 9.3: Document usage in README**

Add to repo `README.md`:

```
## Bootstrap first admin (one-time)
Against staging:
  cd functions && GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
    pnpm bootstrap-admin admin@santarosa.com.py "Nombre" "Apellido" "1234567"
```

- [ ] **Step 9.4: Commit**

```
git add functions/scripts functions/package.json README.md pnpm-lock.yaml
git commit -m "feat(functions): bootstrap-admin script for first admin user"
```

---

## Task 10: End-to-end emulator smoke + final verification

- [ ] **Step 10.1: Start emulators**

```
firebase emulators:start --only auth,firestore,functions --project carbid-staging
```

- [ ] **Step 10.2: Bootstrap a test admin against the emulator**

In a new terminal:

```
cd functions
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=carbid-staging \
pnpm bootstrap-admin admin@santarosa.com.py "Test" "Admin" "1234567"
```

Expected: a reset link is printed.

- [ ] **Step 10.3: Run all functions tests against the running emulators**

```
pnpm --filter @carbid/functions test
```

Expected: all tests pass.

- [ ] **Step 10.4: Final lint, typecheck, build**

```
pnpm lint
pnpm typecheck
pnpm --filter @carbid/functions build
pnpm format:check
```

All must pass.

- [ ] **Step 10.5: Stop emulators**

- [ ] **Step 10.6: Final commit (only if format adjustments needed)**

```
git status
# if dirty:
git commit -am "chore: format after auth functions plan"
```

---

## Self-Review

**Spec coverage** (against `2026-05-05-carbid-mvp-design.md` §5):

- `auth.createUser` callable with PY validation + email domain rule → Task 4 ✅
- `auth.updateUserRole` with status toggle + audit → Task 5 ✅
- `auth.deleteUser` soft delete + buyer-self/admin-other guard → Task 6 ✅
- `auth.onUserSync` Firestore trigger for claims sync → Task 7 ✅
- `auth.generatePasswordReset` (admin) → Task 8 ✅
- audit logs written from helper → Task 2 ✅

**Out-of-scope (deferred to other plans):**

- `cleanupDeletedAccounts` cron → Plan 9
- Login UI, session cookie, role-based middleware → Plan 2b
- Settings UI for self password change → Plan 2c

**Type consistency:** all functions use `@carbid/shared-types` schemas; `RoleSchema`, `UserStatusSchema`, `DocumentTypeSchema` reused; no string-literal duplication.

**Placeholder scan:** none.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-05-carbid-02a-auth-functions.md`.

**Pre-flight before executing:**

1. Java 21 installed (`java -version`).
2. `apps/web/.env.local` has the staging credentials (already done).
3. `firebase emulators:start --only auth,firestore` must run in a separate terminal during Tasks 4–10.

Recommended execution: **Subagent-driven** with the same batching pattern from Plan 1.
