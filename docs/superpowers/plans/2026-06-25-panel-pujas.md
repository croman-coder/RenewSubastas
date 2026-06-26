# Panel de Pujas (admin + staff) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a admin y staff una página `/staff/bids` que muestre la actividad de pujas (en vivo e histórica) con identidad y contacto del pujador, drill-down por pujador y por subasta, y el estado de envío de los emails de aviso.

**Architecture:** Backend Firebase (Cloud Functions + Firestore). La lectura de pujas usa `collectionGroup('bids')` desde el cliente (reglas ya permiten roles internos). La identidad/contacto se resuelve con un nuevo callable `resolveBidders` (admin/staff). Cada email transaccional ahora deja un registro en una colección `notifications` (la escribe el server, la lee el panel) para mostrar enviado/omitido/falló. El frontend es Next.js 14: shell server-rendered con gate de rol + componente cliente con `onSnapshot`.

**Tech Stack:** TypeScript, Firebase Functions v2, Firestore, Next.js 14 (App Router), Zod, Vitest (+ emuladores Firebase), Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-25-panel-pujas-design.md`

---

## Estructura de archivos

Backend (`functions/`):

- Modify `functions/src/lib/email.ts` — `sendEmail` devuelve `SendEmailResult`.
- Create `functions/src/lib/notify.ts` — tipo `NotificationType` + helper `recordNotification`.
- Create `functions/src/lib/notify.test.ts` — tests del helper.
- Modify `functions/src/lib/email.test.ts` (si no existe, crear) — tests del retorno de `sendEmail`.
- Modify `functions/src/notifications/sendBidOutbid.ts` — registra notificación.
- Modify `functions/src/notifications/sendAuctionWon.ts` — registra notificación.
- Modify `functions/src/notifications/sendBidOutbid.test.ts` / `sendAuctionWon.test.ts` (si existen) o crear — verifican el registro.
- Create `functions/src/auctions/resolveBidders.ts` — callable.
- Create `functions/src/auctions/resolveBidders.test.ts` — tests.
- Modify `functions/src/index.ts` — exporta `resolveBidders`.
- Modify `firestore.rules` — regla de `notifications`.
- Modify `firestore.indexes.json` — índices de `notifications`.

Frontend (`apps/web/`):

- Modify `apps/web/src/components/shell/nav-config.ts` — ítem "Pujas" (admin + staff) + IconKey `activity`.
- Modify `apps/web/src/components/shell/sidebar-nav.tsx` — mapea `activity` a un icono Lucide.
- Create `apps/web/src/app/[locale]/(protected)/staff/bids/page.tsx` — shell + gate.
- Create `apps/web/src/app/[locale]/(protected)/staff/bids/bids-activity.tsx` — tabla cliente (métricas, filtros, live, email status).
- Create `apps/web/src/app/[locale]/(protected)/staff/bids/bidder/[uid]/page.tsx` — ficha del pujador.
- Create `apps/web/src/app/[locale]/(protected)/staff/bids/bidder/[uid]/bidder-detail.tsx` — detalle cliente del pujador.

Convención de estilo del frontend: copiar el look de `apps/web/src/app/[locale]/(protected)/sales/sales-table.tsx` (clases Tailwind `bg-bg-elev`, `text-text-strong`, etc.) y el patrón `onSnapshot` + caché por uid.

---

## Notas de ejecución

- Antes de tests/emuladores: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"` (Java lo exigen los emuladores).
- Tests de functions: desde `functions/`, con el emulador corriendo, `pnpm vitest run <archivo>`. El setup (`src/test/setup.ts`) ya apunta a `127.0.0.1:9099`/`8080`.
- Para levantar el emulador: desde la raíz, `firebase emulators:start --only auth,firestore,functions,storage --project carbid-staging` (con el PATH de Java).
- Frontend: el paquete `@carbid/web` no tiene runner de tests unitarios; se verifica con `pnpm --filter @carbid/web typecheck`, `pnpm lint`, y en el navegador (`pnpm dev:web`, puerto 3100/3200).
- Commits frecuentes, uno por tarea.

---

## Task 1: `sendEmail` devuelve resultado + helper `recordNotification`

**Files:**

- Modify: `functions/src/lib/email.ts`
- Create: `functions/src/lib/notify.ts`
- Create: `functions/src/lib/email.test.ts`
- Create: `functions/src/lib/notify.test.ts`

- [ ] **Step 1: Escribir el test del retorno de `sendEmail`**

Create `functions/src/lib/email.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sendEmail } from './email.js';

describe('sendEmail', () => {
  it('returns skipped when RESEND_API_KEY is not configured', async () => {
    // In the emulator/test env the secret is unset, so the client is null.
    const res = await sendEmail({
      to: 'someone@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
    });
    expect(res.status).toBe('skipped');
  });
});
```

- [ ] **Step 2: Correr el test y verque falla**

Run: `cd functions && pnpm vitest run src/lib/email.test.ts`
Expected: FAIL (hoy `sendEmail` devuelve `void`, `res` es `undefined`).

- [ ] **Step 3: Cambiar `sendEmail` para devolver `SendEmailResult`**

En `functions/src/lib/email.ts`, reemplazar la firma y los `return`:

```ts
export interface SendEmailResult {
  status: 'sent' | 'skipped' | 'failed';
  resendId?: string;
  reason?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
  from,
}: SendEmailArgs): Promise<SendEmailResult> {
  const c = getClient();
  if (!c) {
    console.warn('[email] RESEND_API_KEY not set — skipping send', { to, subject });
    return { status: 'skipped', reason: 'no_api_key' };
  }
  try {
    const result = await c.emails.send({
      from: await resolveFrom(from),
      to,
      subject,
      html,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    });
    if (result.error) {
      console.error('[email] resend rejected send', { to, subject, error: result.error });
      return { status: 'failed', reason: String(result.error?.message ?? result.error) };
    }
    console.log('[email] sent', { to, subject, id: result.data?.id });
    return { status: 'sent', ...(result.data?.id ? { resendId: result.data.id } : {}) };
  } catch (err) {
    console.error('[email] send threw', { to, subject, err });
    return { status: 'failed', reason: err instanceof Error ? err.message : 'unknown' };
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd functions && pnpm vitest run src/lib/email.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir el test de `recordNotification`**

Create `functions/src/lib/notify.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminDb } from './admin.js';
import { recordNotification } from './notify.js';

async function clearNotifications() {
  const docs = await adminDb().collection('notifications').listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
}

describe('recordNotification', () => {
  beforeEach(clearNotifications);

  it('writes a notification doc with status and context', async () => {
    await recordNotification({
      type: 'bid_outbid',
      toUid: 'buyer-1',
      toEmail: 'buyer1@example.com',
      auctionId: 'auc-1',
      bidId: 'bid-1',
      result: { status: 'sent', resendId: 're_123' },
    });
    const snap = await adminDb().collection('notifications').get();
    expect(snap.size).toBe(1);
    const d = snap.docs[0].data();
    expect(d.type).toBe('bid_outbid');
    expect(d.toUid).toBe('buyer-1');
    expect(d.auctionId).toBe('auc-1');
    expect(d.bidId).toBe('bid-1');
    expect(d.status).toBe('sent');
    expect(d.resendId).toBe('re_123');
  });

  it('records skipped with reason and null bidId', async () => {
    await recordNotification({
      type: 'auction_won',
      toUid: 'buyer-2',
      toEmail: '',
      auctionId: 'auc-2',
      result: { status: 'skipped', reason: 'no_email' },
    });
    const snap = await adminDb().collection('notifications').get();
    const d = snap.docs[0].data();
    expect(d.status).toBe('skipped');
    expect(d.reason).toBe('no_email');
    expect(d.bidId).toBeNull();
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `cd functions && pnpm vitest run src/lib/notify.test.ts`
Expected: FAIL ("Cannot find module './notify.js'").

- [ ] **Step 7: Implementar `recordNotification`**

Create `functions/src/lib/notify.ts`:

```ts
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './admin.js';
import type { SendEmailResult } from './email.js';

export type NotificationType = 'bid_outbid' | 'auction_won';

export interface RecordNotificationInput {
  type: NotificationType;
  toUid: string;
  toEmail: string;
  auctionId: string;
  /** The bid that triggered the notification (for bid_outbid). */
  bidId?: string;
  result: SendEmailResult;
}

/**
 * Persists the outcome of a transactional email so the admin/staff Pujas
 * panel can show whether each bidder was actually notified. Server-only:
 * the `notifications` collection is read-only to admin/staff via rules and
 * never writable from the client.
 */
export async function recordNotification(input: RecordNotificationInput): Promise<void> {
  await adminDb()
    .collection('notifications')
    .add({
      type: input.type,
      toUid: input.toUid,
      toEmail: input.toEmail,
      auctionId: input.auctionId,
      bidId: input.bidId ?? null,
      status: input.result.status,
      reason: input.result.reason ?? null,
      resendId: input.result.resendId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
}
```

- [ ] **Step 8: Correr ambos tests y verificar que pasan**

Run: `cd functions && pnpm vitest run src/lib/email.test.ts src/lib/notify.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Typecheck**

Run: `cd functions && pnpm typecheck`
Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add functions/src/lib/email.ts functions/src/lib/notify.ts functions/src/lib/email.test.ts functions/src/lib/notify.test.ts
git commit -m "feat(functions): sendEmail returns result + recordNotification helper"
```

---

## Task 2: Registrar notificaciones en los senders

Los senders dejan de hacer early-return silencioso cuando el usuario no tiene email o tiene el aviso apagado: registran un `skipped` para que el panel lo muestre.

**Files:**

- Modify: `functions/src/notifications/sendBidOutbid.ts`
- Modify: `functions/src/notifications/sendAuctionWon.ts`
- Create: `functions/src/notifications/sendBidOutbid.test.ts`

- [ ] **Step 1: Escribir el test de registro en `sendBidOutbid`**

Create `functions/src/notifications/sendBidOutbid.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminDb } from '../lib/admin.js';

async function clearAll() {
  for (const c of ['notifications', 'users']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

// The trigger logic is exercised by writing the bid doc shape it reads and
// invoking the exported handler. We export a testable handler from the module.
import { handleBidOutbid } from './sendBidOutbid.js';

describe('sendBidOutbid notification record', () => {
  beforeEach(clearAll);

  it('records skipped:no_email when the displaced bidder has no email', async () => {
    await adminDb()
      .doc('users/displaced-1')
      .set({
        uid: 'displaced-1',
        profile: { firstName: 'Ana', lastName: 'Díaz' },
        preferences: { notifications: { outbidEmail: true } },
      });
    await adminDb()
      .doc('auctions/auc-1')
      .set({
        vehicleSnapshot: { make: 'Toyota', model: 'Corolla', year: 2021 },
      });

    await handleBidOutbid({
      auctionId: 'auc-1',
      bidId: 'bid-9',
      newBid: {
        buyerUid: 'buyer-2',
        amount: 12500,
        displacedBuyerUid: 'displaced-1',
        displacedAmount: 12000,
      },
    });

    const snap = await adminDb().collection('notifications').get();
    expect(snap.size).toBe(1);
    const d = snap.docs[0].data();
    expect(d.type).toBe('bid_outbid');
    expect(d.toUid).toBe('displaced-1');
    expect(d.status).toBe('skipped');
    expect(d.reason).toBe('no_email');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd functions && pnpm vitest run src/notifications/sendBidOutbid.test.ts`
Expected: FAIL ("handleBidOutbid is not exported").

- [ ] **Step 3: Refactor `sendBidOutbid` para extraer un handler testeable y registrar la notificación**

Reemplazar el cuerpo de `functions/src/notifications/sendBidOutbid.ts` por:

```ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import { recordNotification } from '../lib/notify.js';
import {
  emailShell,
  body,
  badge,
  heading,
  statPair,
  ctaButton,
  SITE_URL,
} from '../lib/email-templates.js';

export interface BidOutbidEvent {
  auctionId: string;
  bidId: string;
  newBid: {
    buyerUid?: string;
    amount?: number;
    displacedBuyerUid?: string;
    displacedAmount?: number;
  };
}

export async function handleBidOutbid(e: BidOutbidEvent): Promise<void> {
  const { auctionId, bidId, newBid } = e;
  const displacedUid = newBid.displacedBuyerUid;
  if (!displacedUid || displacedUid === newBid.buyerUid) return;

  const userSnap = await adminDb().doc(`users/${displacedUid}`).get();
  const email = userSnap.data()?.['email'] as string | undefined;
  const wantsOutbidEmail =
    (userSnap.data()?.['preferences']?.notifications?.outbidEmail as boolean) ?? true;

  if (!email) {
    await recordNotification({
      type: 'bid_outbid',
      toUid: displacedUid,
      toEmail: '',
      auctionId,
      bidId,
      result: { status: 'skipped', reason: 'no_email' },
    });
    return;
  }
  if (!wantsOutbidEmail) {
    await recordNotification({
      type: 'bid_outbid',
      toUid: displacedUid,
      toEmail: email,
      auctionId,
      bidId,
      result: { status: 'skipped', reason: 'pref_off' },
    });
    return;
  }

  const auction = (await adminDb().doc(`auctions/${auctionId}`).get()).data();
  const v = (auction?.['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
  const fmtUsd = (n: number) =>
    n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const myBid = (newBid.displacedAmount as number) ?? 0;
  const newAmount = (newBid.amount as number) ?? 0;

  const html = emailShell(
    body(
      badge('Te superaron', 'danger') +
        heading(
          'Otro postor tomó la delantera',
          `Tu puja en el <strong style="color:#0a0a0a;">${v['make']} ${v['model']} ${v['year']}</strong> fue superada. Todavía estás a tiempo de recuperar la punta.`,
        ) +
        statPair(
          { label: 'Tu puja', value: `USD ${fmtUsd(myBid)}` },
          { label: 'Puja actual', value: `USD ${fmtUsd(newAmount)}`, strong: true },
        ) +
        ctaButton(`${SITE_URL}/es/auctions/${auctionId}`, 'Volver a pujar'),
    ),
  );

  const result = await sendEmail({
    to: email,
    subject: `Te superaron · ${v['make']} ${v['model']} ${v['year']}`,
    html,
  });
  await recordNotification({
    type: 'bid_outbid',
    toUid: displacedUid,
    toEmail: email,
    auctionId,
    bidId,
    result,
  });
}

export const sendBidOutbid = onDocumentCreated(
  {
    document: 'auctions/{auctionId}/bids/{bidId}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const newBid = event.data?.data();
    if (!newBid) return;
    await handleBidOutbid({
      auctionId: event.params['auctionId'] as string,
      bidId: event.params['bidId'] as string,
      newBid: {
        buyerUid: newBid['buyerUid'] as string | undefined,
        amount: newBid['amount'] as number | undefined,
        displacedBuyerUid: newBid['displacedBuyerUid'] as string | undefined,
        displacedAmount: newBid['displacedAmount'] as number | undefined,
      },
    });
  },
);
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd functions && pnpm vitest run src/notifications/sendBidOutbid.test.ts`
Expected: PASS.

- [ ] **Step 5: Registrar la notificación en `sendAuctionWon`**

En `functions/src/notifications/sendAuctionWon.ts`: importar el helper y reemplazar los early-returns + el `await sendEmail(...)` final. Cambios concretos:

1. Agregar import: `import { recordNotification } from '../lib/notify.js';`
2. Reemplazar el bloque `if (!email || !wantsEmail) return;` (línea ~54) por:

```ts
if (!email) {
  await recordNotification({
    type: 'auction_won',
    toUid: winnerUid,
    toEmail: '',
    auctionId: event.params['auctionId'] as string,
    result: { status: 'skipped', reason: 'no_email' },
  });
  return;
}
if (!wantsEmail) {
  await recordNotification({
    type: 'auction_won',
    toUid: winnerUid,
    toEmail: email,
    auctionId: event.params['auctionId'] as string,
    result: { status: 'skipped', reason: 'pref_off' },
  });
  return;
}
```

3. Reemplazar el `await sendEmail({ ... })` final (líneas ~124-128) por:

```ts
const result = await sendEmail({
  to: email,
  subject: `¡Ganaste la subasta! ${v['make']} ${v['model']} ${v['year']}`,
  html,
});
await recordNotification({
  type: 'auction_won',
  toUid: winnerUid,
  toEmail: email,
  auctionId,
  result,
});
```

(Nota: `auctionId` ya está declarado más arriba en la función como `const auctionId = event.params['auctionId']`.)

- [ ] **Step 6: Typecheck + lint**

Run: `cd functions && pnpm typecheck && pnpm lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add functions/src/notifications/sendBidOutbid.ts functions/src/notifications/sendAuctionWon.ts functions/src/notifications/sendBidOutbid.test.ts
git commit -m "feat(functions): record email send outcome for outbid/won notifications"
```

---

## Task 3: Callable `resolveBidders`

**Files:**

- Create: `functions/src/auctions/resolveBidders.ts`
- Create: `functions/src/auctions/resolveBidders.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Escribir los tests**

Create `functions/src/auctions/resolveBidders.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminDb } from '../lib/admin.js';
import { resolveBiddersHandler } from './resolveBidders.js';

function asRole(role: string, data: Record<string, unknown>): CallableRequest {
  return {
    auth: { uid: `${role}-uid`, token: { role, status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearUsers() {
  const docs = await adminDb().collection('users').listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
}

describe('resolveBidders', () => {
  beforeEach(async () => {
    await clearUsers();
    await adminDb()
      .doc('users/b1')
      .set({
        uid: 'b1',
        email: 'b1@example.com',
        profile: {
          firstName: 'Juan',
          lastName: 'Pérez',
          phone: '+595971000111',
          documentNumber: '1234567',
        },
      });
  });

  it('returns only name/email/phone for admin', async () => {
    const res = await resolveBiddersHandler(asRole('admin', { uids: ['b1'] }));
    expect(res['b1']).toEqual({
      displayName: 'Juan Pérez',
      email: 'b1@example.com',
      phone: '+595971000111',
    });
    // never leaks other fields
    expect((res['b1'] as Record<string, unknown>)['documentNumber']).toBeUndefined();
  });

  it('allows staff', async () => {
    const res = await resolveBiddersHandler(asRole('staff', { uids: ['b1'] }));
    expect(res['b1'].displayName).toBe('Juan Pérez');
  });

  it('rejects finanzas and buyer', async () => {
    await expect(resolveBiddersHandler(asRole('finanzas', { uids: ['b1'] }))).rejects.toMatchObject(
      {
        code: 'permission-denied',
      },
    );
    await expect(resolveBiddersHandler(asRole('buyer', { uids: ['b1'] }))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('omits unknown uids', async () => {
    const res = await resolveBiddersHandler(asRole('admin', { uids: ['b1', 'ghost'] }));
    expect(res['b1']).toBeDefined();
    expect(res['ghost']).toBeUndefined();
  });

  it('rejects batches over the limit', async () => {
    const uids = Array.from({ length: 51 }, (_, i) => `u${i}`);
    await expect(resolveBiddersHandler(asRole('admin', { uids }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd functions && pnpm vitest run src/auctions/resolveBidders.test.ts`
Expected: FAIL ("Cannot find module './resolveBidders.js'").

- [ ] **Step 3: Implementar el callable**

Create `functions/src/auctions/resolveBidders.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { requireSignedIn } from '../lib/errors.js';

const MAX_UIDS = 50;

const InputSchema = z.object({
  uids: z.array(z.string().min(1)).min(1).max(MAX_UIDS),
});

export interface BidderContact {
  displayName: string;
  email: string;
  phone: string;
}

/**
 * Resolves bidder contact (name/email/phone ONLY) for the Pujas panel.
 * Admin and staff only — the same narrow exposure used by getWinnerContact,
 * so the client never bulk-reads the users collection. Unknown uids are
 * omitted from the result.
 */
export async function resolveBiddersHandler(
  req: CallableRequest,
): Promise<Record<string, BidderContact>> {
  const { role } = requireSignedIn(req);
  if (role !== 'admin' && role !== 'staff') {
    throw new HttpsError('permission-denied', 'Solo admin o staff pueden ver el contacto.');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');

  const uniqueUids = Array.from(new Set(parsed.data.uids));
  const refs = uniqueUids.map((uid) => adminDb().doc(`users/${uid}`));
  const snaps = await adminDb().getAll(...refs);

  const out: Record<string, BidderContact> = {};
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const u = snap.data() ?? {};
    const profile = (u['profile'] ?? {}) as Record<string, unknown>;
    out[snap.id] = {
      displayName:
        `${(profile['firstName'] as string) ?? ''} ${(profile['lastName'] as string) ?? ''}`.trim(),
      email: (u['email'] as string) ?? '',
      phone: (profile['phone'] as string) ?? '',
    };
  }
  return out;
}

export const resolveBidders = onCall({ region: 'us-central1' }, resolveBiddersHandler);
```

- [ ] **Step 4: Exportar en `index.ts`**

En `functions/src/index.ts`, después de `export { getWinnerContact } ...`, agregar:

```ts
export { resolveBidders } from './auctions/resolveBidders.js';
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd functions && pnpm vitest run src/auctions/resolveBidders.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck + lint**

Run: `cd functions && pnpm typecheck && pnpm lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add functions/src/auctions/resolveBidders.ts functions/src/auctions/resolveBidders.test.ts functions/src/index.ts
git commit -m "feat(functions): resolveBidders callable (admin/staff bidder contact)"
```

---

## Task 4: Reglas e índices de `notifications`

**Files:**

- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Agregar la regla de `notifications`**

En `firestore.rules`, dentro de `match /databases/{db}/documents {`, junto a las otras colecciones (por ejemplo después del bloque `audit_logs`), agregar:

```
    // Email notification log (te-superaron / ganaste). Written only by the
    // server (Admin SDK bypasses rules); read by admin/staff for the Pujas
    // panel. Holds toEmail, so keep it off-limits to buyers/finanzas.
    match /notifications/{id} {
      allow read:  if isAdmin() || isStaff();
      allow write: if false;
    }
```

- [ ] **Step 2: Agregar los índices de `notifications`**

En `firestore.indexes.json`, agregar al array `indexes` (antes del cierre `]`):

```json
    {
      "collectionGroup": "notifications",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "notifications",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "toUid", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
```

Y al array `fieldOverrides`, agregar (para ordenar por fecha sin filtro):

```json
{
  "collectionGroup": "notifications",
  "fieldPath": "createdAt",
  "indexes": [{ "order": "DESCENDING", "queryScope": "COLLECTION" }]
}
```

- [ ] **Step 3: Verificar JSON válido**

Run: `cd "/Users/croman/Desktop/App Subastas/carbid" && node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Verificación manual de la regla (emulador)**

Con el emulador corriendo, abrir http://127.0.0.1:4000/firestore, crear a mano un doc en `notifications`, y comprobar en la pestaña Rules Playground que un token `role:admin` puede leer y `role:buyer` no. (El paquete no tiene harness de tests de reglas; esta verificación es manual.)

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat(rules): notifications collection read for admin/staff + indexes"
```

---

## Task 5: Ítem de navegación "Pujas" (admin + staff)

**Files:**

- Modify: `apps/web/src/components/shell/nav-config.ts`
- Modify: `apps/web/src/components/shell/sidebar-nav.tsx`

- [ ] **Step 1: Agregar el IconKey `activity`**

En `nav-config.ts`, agregar `'activity'` a la unión `IconKey`:

```ts
export type IconKey =
  | 'home'
  | 'users'
  | 'car'
  | 'gavel'
  | 'audit'
  | 'settings'
  | 'heart'
  | 'trophy'
  | 'key'
  | 'activity';
```

- [ ] **Step 2: Agregar el ítem al menú de admin y de staff**

En `getNavItems`, en el array de `role === 'admin'`, insertar después del ítem de `sales` (Ventas):

```ts
      { href: `/${locale}/staff/bids`, label: 'Pujas', icon: 'activity' },
```

En el array de `role === 'staff'`, insertar después del ítem de `auctions`:

```ts
      { href: `/${locale}/staff/bids`, label: 'Pujas', icon: 'activity' },
```

(Se usa label literal `'Pujas'`, igual que el ítem `'Contraseñas'` existente; no hace falta tocar i18n.)

- [ ] **Step 3: Mapear el icono en `sidebar-nav.tsx`**

En `apps/web/src/components/shell/sidebar-nav.tsx`: importar `Activity` de `lucide-react` (junto a los otros imports de iconos) y agregar a `ICON_MAP`:

```ts
  activity: Activity,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @carbid/web typecheck`
Expected: sin errores (si falta el mapeo, TS marca que `ICON_MAP` no cubre todos los `IconKey`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/nav-config.ts apps/web/src/components/shell/sidebar-nav.tsx
git commit -m "feat(web): add Pujas nav item for admin and staff"
```

---

## Task 6: Página `/staff/bids` (shell + gate)

**Files:**

- Create: `apps/web/src/app/[locale]/(protected)/staff/bids/page.tsx`

- [ ] **Step 1: Crear la página (gate admin+staff, excluye finanzas)**

Create `apps/web/src/app/[locale]/(protected)/staff/bids/page.tsx`:

```tsx
import { requireRole } from '@/lib/auth/server';
import { BidsActivity } from './bids-activity';

export default async function BidsPage({ params: { locale } }: { params: { locale: string } }) {
  // The /staff layout admits admin+staff+finanzas; this page is admin+staff
  // only — finanzas must not see bidder activity/contact.
  await requireRole(locale, ['admin', 'staff']);
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Pujas
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          Actividad de pujas
        </h1>
        <p className="text-sm text-text-muted">
          Quién está pujando, con qué montos y si recibieron el aviso por email. En vivo e
          histórico.
        </p>
      </header>
      <BidsActivity locale={locale} />
    </div>
  );
}
```

- [ ] **Step 2: Crear un placeholder mínimo de `BidsActivity` para compilar**

Create `apps/web/src/app/[locale]/(protected)/staff/bids/bids-activity.tsx` (se completa en Task 7):

```tsx
'use client';
export function BidsActivity({ locale }: { locale: string }) {
  return (
    <div data-locale={locale} className="text-sm text-text-muted">
      Cargando…
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + verificación en navegador**

Run: `pnpm --filter @carbid/web typecheck`
Luego con `pnpm dev:web` corriendo y logueado como admin: navegar a `/es/staff/bids` y confirmar que carga (placeholder "Cargando…") y que aparece "Pujas" en el menú. Logueado como **finanzas**, `/es/staff/bids` debe redirigir (gate).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/[locale]/(protected)/staff/bids/page.tsx" "apps/web/src/app/[locale]/(protected)/staff/bids/bids-activity.tsx"
git commit -m "feat(web): /staff/bids page shell with admin+staff gate"
```

---

## Task 7: Componente `BidsActivity` (métricas + tabla live + filtros + email status)

**Files:**

- Modify: `apps/web/src/app/[locale]/(protected)/staff/bids/bids-activity.tsx`

Patrón de referencia para estilo y `onSnapshot` + caché por uid: `apps/web/src/app/[locale]/(protected)/sales/sales-table.tsx`.

- [ ] **Step 1: Implementar el componente completo**

Reemplazar el contenido de `bids-activity.tsx` por:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collectionGroup, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Gavel, AlertTriangle, Mail, MailX, MailCheck } from 'lucide-react';
import { fb } from '@/lib/firebase/client';

interface BidRow {
  id: string;
  auctionId: string;
  buyerUid: string;
  buyerFallback: string; // firstName + initial from buyerSnapshot
  amount: number;
  createdAtMs: number;
  displacedBuyerUid: string | null;
}
interface NotifRow {
  bidId: string | null;
  status: 'sent' | 'skipped' | 'failed';
  reason: string | null;
}
interface BidderContact {
  displayName: string;
  email: string;
  phone: string;
}

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

export function BidsActivity({ locale }: { locale: string }) {
  const [bids, setBids] = useState<BidRow[]>([]);
  const [notifs, setNotifs] = useState<Record<string, NotifRow>>({});
  const [contacts, setContacts] = useState<Record<string, BidderContact>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Live feed of the latest bids across all auctions.
  useEffect(() => {
    const q = query(collectionGroup(fb.db, 'bids'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snap) => {
        setBids(
          snap.docs.map((d) => {
            const a = d.data();
            const bs = (a['buyerSnapshot'] ?? {}) as { firstName?: string; lastInitial?: string };
            return {
              id: d.id,
              auctionId: (a['auctionId'] as string) ?? '',
              buyerUid: (a['buyerUid'] as string) ?? '',
              buyerFallback: `${bs.firstName ?? ''} ${bs.lastInitial ?? ''}`.trim() || '—',
              amount: (a['amount'] as number) ?? 0,
              createdAtMs:
                (a['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
              displacedBuyerUid: (a['displacedBuyerUid'] as string | undefined) ?? null,
            };
          }),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  // Live notification log (to colour the "Aviso" column and the failed card).
  useEffect(() => {
    const q = query(
      collectionGroup(fb.db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(200),
    );
    // notifications is a top-level collection; use collection() instead.
    return onSnapshot(q, (snap) => {
      const next: Record<string, NotifRow> = {};
      snap.docs.forEach((d) => {
        const n = d.data();
        const bidId = (n['bidId'] as string | null) ?? null;
        if (bidId) {
          next[bidId] = {
            bidId,
            status: (n['status'] as NotifRow['status']) ?? 'sent',
            reason: (n['reason'] as string | null) ?? null,
          };
        }
      });
      setNotifs(next);
    });
  }, []);

  // Resolve bidder names/contact in batches, cached by uid.
  useEffect(() => {
    const missing = Array.from(
      new Set(bids.map((b) => b.buyerUid).filter((u) => u && !contacts[u])),
    );
    if (missing.length === 0) return;
    const resolve = httpsCallable<{ uids: string[] }, Record<string, BidderContact>>(
      fb.functions,
      'resolveBidders',
    );
    resolve({ uids: missing.slice(0, 50) })
      .then(({ data }) => setContacts((prev) => ({ ...prev, ...data })))
      .catch(() => {});
  }, [bids, contacts]);

  const failedCount = useMemo(
    () => Object.values(notifs).filter((n) => n.status === 'failed').length,
    [notifs],
  );
  const todayCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return bids.filter((b) => b.createdAtMs >= start.getTime()).length;
  }, [bids]);
  const activeBidders = useMemo(
    () => new Set(bids.map((b) => b.buyerUid).filter(Boolean)).size,
    [bids],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Metric label="Pujas hoy" value={String(todayCount)} />
        <Metric label="Pujadores activos" value={String(activeBidders)} />
        <Metric label="Avisos fallidos" value={String(failedCount)} danger={failedCount > 0} />
      </div>

      <ul className="space-y-2">
        {bids.map((b) => {
          const c = contacts[b.buyerUid];
          const name = c?.displayName || b.buyerFallback;
          const notif = b.displacedBuyerUid ? notifs[b.id] : undefined;
          const isOpen = expanded === b.id;
          return (
            <li
              key={b.id}
              className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 hover:border-text-subtle/30"
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : b.id)}
                className="w-full text-left p-3 flex items-center gap-3"
              >
                <Gavel className="w-4 h-4 text-text-muted/50 shrink-0" />
                <span className="text-xs text-text-muted num-tab w-12 shrink-0">
                  {ago(b.createdAtMs)}
                </span>
                <span className="flex-1 min-w-0 truncate text-text-strong">{name}</span>
                <span className="num-tab font-semibold text-text-strong shrink-0">
                  USD {fmtUsd(b.amount)}
                </span>
                <AvisoBadge notif={notif} hasDisplaced={!!b.displacedBuyerUid} />
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-1 text-xs text-text-muted flex flex-wrap gap-x-5 gap-y-1 border-t border-text-subtle/10">
                  <span>
                    <Mail className="inline w-3 h-3 mr-1" />
                    {c?.email || '—'}
                  </span>
                  <span>{c?.phone || '—'}</span>
                  <Link
                    href={`/${locale}/staff/bids/bidder/${b.buyerUid}` as `/${string}`}
                    className="ml-auto text-text-strong underline underline-offset-2"
                  >
                    Ver historial →
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      className={`rounded-xl p-3 ${danger ? 'bg-danger/10 ring-1 ring-danger/20' : 'bg-bg-elev/40'}`}
    >
      <div className={`text-xs ${danger ? 'text-danger' : 'text-text-muted'}`}>{label}</div>
      <div
        className={`text-xl font-semibold num-tab ${danger ? 'text-danger' : 'text-text-strong'}`}
      >
        {value}
      </div>
    </div>
  );
}

function AvisoBadge({ notif, hasDisplaced }: { notif?: NotifRow; hasDisplaced: boolean }) {
  if (!hasDisplaced) return <span className="w-16 shrink-0" />;
  if (!notif) {
    return <span className="text-[11px] text-text-muted/60 w-16 shrink-0 text-right">…</span>;
  }
  if (notif.status === 'sent') {
    return (
      <span
        className="text-[11px] text-emerald-600 dark:text-emerald-300 w-16 shrink-0 text-right"
        title="Aviso enviado"
      >
        <MailCheck className="inline w-3.5 h-3.5" /> enviado
      </span>
    );
  }
  if (notif.status === 'failed') {
    return (
      <span
        className="text-[11px] text-danger w-16 shrink-0 text-right"
        title={notif.reason ?? 'falló'}
      >
        <AlertTriangle className="inline w-3.5 h-3.5" /> falló
      </span>
    );
  }
  return (
    <span
      className="text-[11px] text-text-muted w-16 shrink-0 text-right"
      title={notif.reason ?? 'omitido'}
    >
      <MailX className="inline w-3.5 h-3.5" /> omitido
    </span>
  );
}
```

> Nota de implementación: `notifications` es una colección de nivel superior, así que la suscripción debe usar `collection(fb.db, 'notifications')` en vez de `collectionGroup`. Corregir el import y la query en el segundo `useEffect` (usar `collection`). Se dejó marcado en el comentario del código.

- [ ] **Step 2: Corregir la query de notifications a `collection`**

En el segundo `useEffect`, cambiar el import a incluir `collection` y usar:

```tsx
const q = query(collection(fb.db, 'notifications'), orderBy('createdAt', 'desc'), limit(200));
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @carbid/web typecheck && pnpm lint`
Expected: sin errores.

- [ ] **Step 4: Verificación en navegador**

Con `pnpm dev:web` + emulador con datos demo (`pnpm seed:demo`), logueado como admin: ir a `/es/staff/bids`. Confirmar:

- Se ven las pujas con nombre completo (resuelto por `resolveBidders`).
- Clic en una fila despliega email/teléfono y "Ver historial".
- Las métricas (pujas hoy, pujadores activos, avisos fallidos) muestran números.
- Hacer una puja desde una cuenta comprador (otra ventana) → aparece en vivo.

Capturar screenshot como evidencia.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/[locale]/(protected)/staff/bids/bids-activity.tsx"
git commit -m "feat(web): bids activity table with live feed, contact and email status"
```

---

## Task 8: Ficha del pujador `/staff/bids/bidder/[uid]`

**Files:**

- Create: `apps/web/src/app/[locale]/(protected)/staff/bids/bidder/[uid]/page.tsx`
- Create: `apps/web/src/app/[locale]/(protected)/staff/bids/bidder/[uid]/bidder-detail.tsx`

- [ ] **Step 1: Crear la página (gate)**

Create `.../bidder/[uid]/page.tsx`:

```tsx
import { requireRole } from '@/lib/auth/server';
import { BidderDetail } from './bidder-detail';

export default async function BidderPage({
  params: { locale, uid },
}: {
  params: { locale: string; uid: string };
}) {
  await requireRole(locale, ['admin', 'staff']);
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Pujador
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-strong">
          Historial de pujas
        </h1>
      </header>
      <BidderDetail uid={uid} locale={locale} />
    </div>
  );
}
```

- [ ] **Step 2: Crear el detalle cliente**

Create `.../bidder/[uid]/bidder-detail.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { collectionGroup, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { fb } from '@/lib/firebase/client';

interface Bid {
  id: string;
  auctionId: string;
  amount: number;
  createdAtMs: number;
  status: string;
}
interface Contact {
  displayName: string;
  email: string;
  phone: string;
}
const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BidderDetail({ uid, locale }: { uid: string; locale: string }) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);

  useEffect(() => {
    const q = query(
      collectionGroup(fb.db, 'bids'),
      where('buyerUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(200),
    );
    getDocs(q).then((snap) =>
      setBids(
        snap.docs.map((d) => {
          const a = d.data();
          return {
            id: d.id,
            auctionId: (a['auctionId'] as string) ?? '',
            amount: (a['amount'] as number) ?? 0,
            createdAtMs:
              (a['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
            status: (a['status'] as string) ?? '',
          };
        }),
      ),
    );
  }, [uid]);

  useEffect(() => {
    httpsCallable<{ uids: string[] }, Record<string, Contact>>(
      fb.functions,
      'resolveBidders',
    )({
      uids: [uid],
    })
      .then(({ data }) => setContact(data[uid] ?? null))
      .catch(() => {});
  }, [uid]);

  const stats = useMemo(() => {
    const auctions = new Set(bids.map((b) => b.auctionId));
    const max = bids.reduce((m, b) => Math.max(m, b.amount), 0);
    return { total: bids.length, auctions: auctions.size, max };
  }, [bids]);

  return (
    <div className="space-y-4" data-locale={locale}>
      <div className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 p-4">
        <p className="font-medium text-text-strong">{contact?.displayName || uid}</p>
        <p className="text-sm text-text-muted">
          {contact?.email || '—'} · {contact?.phone || '—'}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Pujas" value={String(stats.total)} />
        <Metric label="Subastas" value={String(stats.auctions)} />
        <Metric label="Monto máx." value={`USD ${fmtUsd(stats.max)}`} />
      </div>
      <ul className="space-y-2">
        {bids.map((b) => (
          <li
            key={b.id}
            className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 p-3 flex items-center gap-3 text-sm"
          >
            <span className="num-tab font-semibold text-text-strong">USD {fmtUsd(b.amount)}</span>
            <span className="text-text-muted text-xs">{b.status}</span>
            <span className="ml-auto text-text-muted text-xs">
              {new Date(b.createdAtMs).toLocaleString('es-PY')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 bg-bg-elev/40">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-lg font-semibold num-tab text-text-strong">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @carbid/web typecheck && pnpm lint`
Expected: sin errores. (Nota: el query `where('buyerUid','==',uid) orderBy('createdAt','desc')` usa el índice CG `buyerUid`+`createdAt` que ya existe.)

- [ ] **Step 4: Verificación en navegador**

Desde `/es/staff/bids`, clic en "Ver historial" de un pujador → confirma que carga su contacto, stats y lista de pujas.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/[locale]/(protected)/staff/bids/bidder"
git commit -m "feat(web): bidder drill-down page with cross-auction history"
```

---

## Task 9: Verificación integral + build

- [ ] **Step 1: Suite de functions completa**

Run (con emulador y PATH de Java): `cd functions && pnpm vitest run`
Expected: todos PASS (incluye los nuevos de email/notify/resolveBidders/sendBidOutbid y los existentes).

- [ ] **Step 2: Lint + typecheck + build del monorepo**

Run: `cd "/Users/croman/Desktop/App Subastas/carbid" && pnpm lint && pnpm typecheck && pnpm build`
Expected: todo verde.

- [ ] **Step 3: Smoke manual end-to-end**

Emulador + `pnpm seed && pnpm seed:demo` + `pnpm dev:web`:

1. Admin → `/es/staff/bids`: ve actividad con nombres + contacto a un clic.
2. Comprador A puja; Comprador B lo supera → en el panel aparece la nueva puja y, en la fila que tomó la punta, el "Aviso" (omitido/falló, porque en local sin Resend será `skipped`).
3. Staff → `/es/staff/bids` funciona; Finanzas → redirige.
4. Clic en un pujador → su historial.

- [ ] **Step 4: Commit final (si quedaron ajustes)**

```bash
git add -A
git commit -m "test: verify bids panel end-to-end"
```

---

## Self-review (cobertura del spec)

- §3 acceso/ubicación → Task 5 (nav) + Task 6 (página + gate). ✔
- §4.1 métricas → Task 7 (Metric cards: hoy, activos, fallidos). ✔
- §4.2 filtros → Task 7 cubre la tabla live; filtros por subasta/pujador/fecha quedan como mejora incremental sobre el mismo componente (el feed live + métricas y el drill-down por pujador cubren el caso principal de v1). **Nota de alcance:** si se requieren los 3 filtros explícitos en v1, agregar un Step a Task 7 con selects que filtren el array `bids` en memoria (no requiere nuevos índices para el caso "hoy/7d/30d" sobre el set cargado).
- §4.3 tabla + estado + columna Aviso → Task 7. ✔
- §4.4 drill-down por pujador → Task 8. ✔
- §4.5 escalera por subasta → **no incluida como tarea separada**; la subcolección ya se puede ver en `staff/auctions/[id]`. Si se quiere la escalera enriquecida con identidad, es una mejora análoga a Task 8 (reusar `resolveBidders`). Marcado como follow-up.
- §5.2 resolveBidders → Task 3. ✔
- §5.3 tracking emails → Tasks 1–2. ✔
- §6 seguridad → Tasks 3,4,6 (gates + reglas + callable authz). ✔
- §8 testing → Tasks 1–3 (unit) + Task 9 (integral). ✔

**Follow-ups conscientes (no v1 estricto):** filtros explícitos por subasta/fecha y escalera enriquecida por subasta. Confirmar con el usuario si entran en v1 o se difieren.
