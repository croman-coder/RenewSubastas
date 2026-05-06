# CARBID Plan 3b — Admin Audit Log + Global Configuration

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Build the admin audit log viewer (paginated table) and the global configuration page (`/admin/config`) with four sections — currency, bid increments, financing, emails — backed by a new `updateGlobalConfig` Cloud Function with admin authorization and audit logging.

**Architecture:**

- Audit log: server component reads `audit_logs` collection (admin-only via Firestore rules) with pagination cursor; renders client table.
- Global config: stored at `app_config/global` (singleton). Server component reads it; one form per section persists via a new `updateGlobalConfig` callable. The form's Zod schema reuses `AppConfigSchema` from `@carbid/shared-types`.
- Config Cloud Function validates input, merges with existing doc, writes audit log.

**Spec reference:** §4 (`app_config/global` schema), §5 (Cloud Functions table — `config.updateGlobalConfig`), §6 (admin Configuración page).

**Prerequisites:** Plans 1, 2a, 2b, 2c, 3a complete.

---

## File Structure (end state)

```
functions/src/
├── config/
│   ├── updateGlobalConfig.ts
│   └── updateGlobalConfig.test.ts
└── index.ts (+ export)

apps/web/src/
├── lib/admin/
│   ├── list-audit.ts
│   └── load-app-config.ts
└── app/[locale]/(protected)/admin/
    ├── audit/
    │   ├── page.tsx
    │   └── audit-table.tsx
    └── config/
        ├── page.tsx
        ├── currency-form.tsx
        ├── bid-form.tsx
        ├── financing-form.tsx
        └── emails-form.tsx
```

---

## Task 1: Cloud Function `updateGlobalConfig` (TDD)

- [ ] **Step 1.1: Implement** `functions/src/config/updateGlobalConfig.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';

// Each section is independently updatable. The handler accepts a partial
// of any subset of sections and writes them via dot-paths so other admins
// editing concurrently don't clobber each other's changes.
const InputSchema = z.object({
  currency: z
    .object({
      primary: z.enum(['USD', 'PYG']).optional(),
      showSecondary: z.boolean().optional(),
      pygPerUsd: z.number().positive().optional(),
    })
    .optional(),
  bid: z
    .object({
      fixedIncrementUsd: z.number().positive().optional(),
      allowManualIncrement: z.boolean().optional(),
      antiSnipingSeconds: z.number().int().positive().optional(),
    })
    .optional(),
  financing: z
    .object({
      enabled: z.boolean().optional(),
      allowedTerms: z.array(z.number().int().positive()).optional(),
      annualInterestRate: z.number().nonnegative().optional(),
      downPaymentPercent: z.number().min(0).max(1).optional(),
      minFinanceableUsd: z.number().nonnegative().optional(),
      notes: z.object({ es: z.string(), en: z.string().optional() }).optional(),
    })
    .optional(),
  emails: z
    .object({
      adminStaffDomain: z.string().min(3).optional(),
      fromAddress: z.string().email().optional(),
      fromName: z.string().min(1).optional(),
    })
    .optional(),
});

export interface UpdateGlobalConfigResult {
  ok: true;
}

export async function updateGlobalConfigHandler(
  req: CallableRequest,
): Promise<UpdateGlobalConfigResult> {
  const { uid: actorUid } = requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const v = parsed.data;

  const ref = adminDb().doc('app_config/global');
  const before = (await ref.get()).data() ?? {};

  const update: Record<string, unknown> = {
    updatedBy: actorUid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (v.currency) {
    if (v.currency.primary !== undefined) update['currency.primary'] = v.currency.primary;
    if (v.currency.showSecondary !== undefined)
      update['currency.showSecondary'] = v.currency.showSecondary;
    if (v.currency.pygPerUsd !== undefined) {
      update['currency.pygPerUsd'] = v.currency.pygPerUsd;
      update['currency.pygPerUsdUpdatedAt'] = FieldValue.serverTimestamp();
    }
  }
  if (v.bid) {
    if (v.bid.fixedIncrementUsd !== undefined)
      update['bid.fixedIncrementUsd'] = v.bid.fixedIncrementUsd;
    if (v.bid.allowManualIncrement !== undefined)
      update['bid.allowManualIncrement'] = v.bid.allowManualIncrement;
    if (v.bid.antiSnipingSeconds !== undefined)
      update['bid.antiSnipingSeconds'] = v.bid.antiSnipingSeconds;
  }
  if (v.financing) {
    if (v.financing.enabled !== undefined) update['financing.enabled'] = v.financing.enabled;
    if (v.financing.allowedTerms !== undefined)
      update['financing.allowedTerms'] = v.financing.allowedTerms;
    if (v.financing.annualInterestRate !== undefined)
      update['financing.annualInterestRate'] = v.financing.annualInterestRate;
    if (v.financing.downPaymentPercent !== undefined)
      update['financing.downPaymentPercent'] = v.financing.downPaymentPercent;
    if (v.financing.minFinanceableUsd !== undefined)
      update['financing.minFinanceableUsd'] = v.financing.minFinanceableUsd;
    if (v.financing.notes !== undefined) update['financing.notes'] = v.financing.notes;
  }
  if (v.emails) {
    if (v.emails.adminStaffDomain !== undefined)
      update['emails.adminStaffDomain'] = v.emails.adminStaffDomain;
    if (v.emails.fromAddress !== undefined) update['emails.fromAddress'] = v.emails.fromAddress;
    if (v.emails.fromName !== undefined) update['emails.fromName'] = v.emails.fromName;
  }

  await ref.set(update, { merge: true });

  await writeAuditLog({
    actorUid,
    action: 'app_config.update',
    resourceType: 'app_config',
    resourceId: 'global',
    before,
    after: v as Record<string, unknown>,
  });

  return { ok: true };
}

export const updateGlobalConfig = onCall({ region: 'us-central1' }, updateGlobalConfigHandler);
```

- [ ] **Step 1.2: Test** `functions/src/config/updateGlobalConfig.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminDb } from '../lib/admin.js';
import { updateGlobalConfigHandler } from './updateGlobalConfig.js';

function asAdmin(uid = 'admin-uid', data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid, token: { role: 'admin', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

function asStaff(data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid: 'staff-uid', token: { role: 'staff', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearConfig() {
  await adminDb()
    .doc('app_config/global')
    .delete()
    .catch(() => undefined);
  const logs = await adminDb().collection('audit_logs').listDocuments();
  await Promise.all(logs.map((d) => d.delete()));
}

describe('updateGlobalConfig', () => {
  beforeEach(async () => {
    await clearConfig();
  });

  it('rejects non-admin', async () => {
    await expect(
      updateGlobalConfigHandler(asStaff({ currency: { primary: 'USD' } })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects invalid currency value', async () => {
    await expect(
      updateGlobalConfigHandler(asAdmin('admin-1', { currency: { primary: 'EUR' } })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('persists currency section partial update', async () => {
    await updateGlobalConfigHandler(
      asAdmin('admin-1', { currency: { primary: 'USD', pygPerUsd: 7400 } }),
    );
    const snap = await adminDb().doc('app_config/global').get();
    const data = snap.data();
    expect(data?.['currency'].primary).toBe('USD');
    expect(data?.['currency'].pygPerUsd).toBe(7400);
    expect(data?.['updatedBy']).toBe('admin-1');
  });

  it('merges sections without clobbering siblings', async () => {
    await updateGlobalConfigHandler(asAdmin('admin-1', { currency: { primary: 'USD' } }));
    await updateGlobalConfigHandler(
      asAdmin('admin-2', {
        bid: { fixedIncrementUsd: 500, allowManualIncrement: true, antiSnipingSeconds: 60 },
      }),
    );
    const snap = await adminDb().doc('app_config/global').get();
    const data = snap.data();
    expect(data?.['currency'].primary).toBe('USD');
    expect(data?.['bid'].fixedIncrementUsd).toBe(500);
  });

  it('writes audit log', async () => {
    await updateGlobalConfigHandler(asAdmin('admin-7', { financing: { enabled: true } }));
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'app_config.update')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('admin-7');
  });
});
```

- [ ] **Step 1.3: Update functions/src/index.ts** — add `export { updateGlobalConfig } from './config/updateGlobalConfig.js';`

- [ ] **Step 1.4: Run tests, build, commit**

```
pnpm --filter @carbid/functions test  # expects 35 tests (30 prior + 5 new)
pnpm --filter @carbid/functions build
git add functions/src/config functions/src/index.ts
git commit -m "feat(functions): updateGlobalConfig callable with audit log"
```

---

## Task 2: Audit log viewer

- [ ] **Step 2.1: Helper** `apps/web/src/lib/admin/list-audit.ts`:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface AuditEntry {
  id: string;
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: number;
}

export interface ListAuditFilter {
  action?: string;
  pageSize?: number;
  cursor?: string;
}

export interface ListAuditResult {
  items: AuditEntry[];
  nextCursor: string | null;
}

export async function listAudit(filter: ListAuditFilter): Promise<ListAuditResult> {
  const db = getFirestore(getAdminApp());
  let q: FirebaseFirestore.Query = db.collection('audit_logs').orderBy('createdAt', 'desc');
  if (filter.action) q = q.where('action', '==', filter.action);
  const pageSize = Math.min(filter.pageSize ?? 25, 100);
  if (filter.cursor) {
    const cursorMs = Number(filter.cursor);
    if (!Number.isNaN(cursorMs)) q = q.startAfter(new Date(cursorMs));
  }
  q = q.limit(pageSize + 1);

  const snap = await q.get();
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items: AuditEntry[] = docs.slice(0, pageSize).map((d) => {
    const data = d.data();
    const createdAt =
      (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return {
      id: d.id,
      actorUid: (data['actorUid'] as string) ?? '',
      action: (data['action'] as string) ?? '',
      resourceType: (data['resourceType'] as string) ?? '',
      resourceId: (data['resourceId'] as string) ?? '',
      createdAt,
    };
  });
  const nextCursor = hasMore ? String(items[items.length - 1]!.createdAt) : null;
  return { items, nextCursor };
}
```

- [ ] **Step 2.2: i18n** — add to `messages/es.json` inside `admin` namespace:

```json
"audit": {
  "title": "Auditoría",
  "filters": { "action": "Acción", "all": "Todas" },
  "columns": {
    "createdAt": "Fecha",
    "actor": "Actor",
    "action": "Acción",
    "resource": "Recurso"
  },
  "empty": "No hay registros.",
  "loadMore": "Cargar más"
}
```

And same in en.json.

- [ ] **Step 2.3: Replace stub** `apps/web/src/app/[locale]/(protected)/admin/audit/page.tsx`:

```tsx
import { listAudit } from '@/lib/admin/list-audit';
import { AuditTable } from './audit-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { action?: string; cursor?: string };
}

export default async function AuditPage({ params: { locale }, searchParams }: PageProps) {
  const data = await listAudit({
    ...(searchParams?.action && { action: searchParams.action }),
    ...(searchParams?.cursor && { cursor: searchParams.cursor }),
  });
  return (
    <AuditTable
      locale={locale}
      items={data.items}
      nextCursor={data.nextCursor}
      currentAction={searchParams?.action ?? null}
    />
  );
}
```

- [ ] **Step 2.4: Client table** `audit-table.tsx`:

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AuditEntry } from '@/lib/admin/list-audit';

interface Props {
  locale: string;
  items: AuditEntry[];
  nextCursor: string | null;
  currentAction: string | null;
}

const ACTIONS = [
  'user.create',
  'user.update_role',
  'user.delete',
  'user.password_reset_generated',
  'user.revoke_sessions',
  'app_config.update',
];

export function AuditTable({ locale, items, nextCursor, currentAction }: Props) {
  const t = useTranslations('admin.audit');
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    router.replace(`/${locale}/admin/audit?${next.toString()}` as `/${string}`);
  }

  function loadMore() {
    if (!nextCursor) return;
    const next = new URLSearchParams(sp.toString());
    next.set('cursor', nextCursor);
    router.replace(`/${locale}/admin/audit?${next.toString()}` as `/${string}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
      <Select
        value={currentAction ?? 'all'}
        onValueChange={(v) => setParam('action', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder={t('filters.action')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.all')}</SelectItem>
          {ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="border border-text-subtle/20 rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.createdAt')}</TableHead>
              <TableHead>{t('columns.actor')}</TableHead>
              <TableHead>{t('columns.action')}</TableHead>
              <TableHead>{t('columns.resource')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-text-muted py-8">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-text-muted text-sm num-tab">
                  {new Date(e.createdAt).toLocaleString(locale)}
                </TableCell>
                <TableCell className="font-mono text-xs">{e.actorUid}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.action}</Badge>
                </TableCell>
                <TableCell className="text-xs text-text-muted">
                  {e.resourceType}/{e.resourceId}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {nextCursor && (
        <Button variant="outline" onClick={loadMore}>
          {t('loadMore')}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2.5: Build, commit**

```
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/lib/admin/list-audit.ts apps/web/src/app/[locale]/'(protected)'/admin/audit apps/web/messages
git commit -m "feat(web): admin audit log viewer with filters and pagination"
```

---

## Task 3: Global config UI (4 sections)

Single page with four cards/forms. Each form independently saves its section via `updateGlobalConfig`.

- [ ] **Step 3.1: Helper** `apps/web/src/lib/admin/load-app-config.ts`:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface AppConfigSnapshot {
  currency: { primary: 'USD' | 'PYG'; showSecondary: boolean; pygPerUsd: number | null };
  bid: { fixedIncrementUsd: number; allowManualIncrement: boolean; antiSnipingSeconds: number };
  financing: {
    enabled: boolean;
    allowedTerms: number[];
    annualInterestRate: number;
    downPaymentPercent: number;
    minFinanceableUsd: number;
    notesEs: string;
    notesEn: string;
  };
  emails: { adminStaffDomain: string; fromAddress: string; fromName: string };
}

const DEFAULTS: AppConfigSnapshot = {
  currency: { primary: 'USD', showSecondary: false, pygPerUsd: null },
  bid: { fixedIncrementUsd: 500, allowManualIncrement: true, antiSnipingSeconds: 60 },
  financing: {
    enabled: false,
    allowedTerms: [12, 24, 36, 48, 60],
    annualInterestRate: 0,
    downPaymentPercent: 0.2,
    minFinanceableUsd: 0,
    notesEs: '',
    notesEn: '',
  },
  emails: {
    adminStaffDomain: 'santarosa.com.py',
    fromAddress: 'no-reply@santarosa.com.py',
    fromName: 'CARBID Subastas',
  },
};

export async function loadAppConfigSnapshot(): Promise<AppConfigSnapshot> {
  const snap = await getFirestore(getAdminApp()).doc('app_config/global').get();
  if (!snap.exists) return DEFAULTS;
  const data = snap.data() ?? {};
  const c = (data['currency'] ?? {}) as Record<string, unknown>;
  const b = (data['bid'] ?? {}) as Record<string, unknown>;
  const f = (data['financing'] ?? {}) as Record<string, unknown>;
  const e = (data['emails'] ?? {}) as Record<string, unknown>;
  const fNotes = (f['notes'] ?? {}) as Record<string, unknown>;
  return {
    currency: {
      primary: (c['primary'] as 'USD' | 'PYG') ?? DEFAULTS.currency.primary,
      showSecondary: (c['showSecondary'] as boolean) ?? DEFAULTS.currency.showSecondary,
      pygPerUsd: (c['pygPerUsd'] as number | null) ?? DEFAULTS.currency.pygPerUsd,
    },
    bid: {
      fixedIncrementUsd: (b['fixedIncrementUsd'] as number) ?? DEFAULTS.bid.fixedIncrementUsd,
      allowManualIncrement:
        (b['allowManualIncrement'] as boolean) ?? DEFAULTS.bid.allowManualIncrement,
      antiSnipingSeconds: (b['antiSnipingSeconds'] as number) ?? DEFAULTS.bid.antiSnipingSeconds,
    },
    financing: {
      enabled: (f['enabled'] as boolean) ?? DEFAULTS.financing.enabled,
      allowedTerms: (f['allowedTerms'] as number[]) ?? DEFAULTS.financing.allowedTerms,
      annualInterestRate:
        (f['annualInterestRate'] as number) ?? DEFAULTS.financing.annualInterestRate,
      downPaymentPercent:
        (f['downPaymentPercent'] as number) ?? DEFAULTS.financing.downPaymentPercent,
      minFinanceableUsd: (f['minFinanceableUsd'] as number) ?? DEFAULTS.financing.minFinanceableUsd,
      notesEs: (fNotes['es'] as string) ?? '',
      notesEn: (fNotes['en'] as string) ?? '',
    },
    emails: {
      adminStaffDomain: (e['adminStaffDomain'] as string) ?? DEFAULTS.emails.adminStaffDomain,
      fromAddress: (e['fromAddress'] as string) ?? DEFAULTS.emails.fromAddress,
      fromName: (e['fromName'] as string) ?? DEFAULTS.emails.fromName,
    },
  };
}
```

- [ ] **Step 3.2: i18n** — add to `messages/es.json` inside `admin`:

```json
"config": {
  "title": "Configuración global",
  "subtitle": "Estos parámetros impactan en toda la app.",
  "save": "Guardar",
  "saving": "Guardando…",
  "saved": "Guardado",
  "errors": { "generic": "No se pudo guardar." },
  "currency": {
    "title": "Moneda",
    "primary": "Moneda primaria",
    "showSecondary": "Mostrar conversión secundaria",
    "pygPerUsd": "Tipo de cambio PYG/USD"
  },
  "bid": {
    "title": "Pujas",
    "fixedIncrementUsd": "Incremento fijo (USD)",
    "allowManualIncrement": "Permitir incremento manual",
    "antiSnipingSeconds": "Anti-sniping (segundos)"
  },
  "financing": {
    "title": "Financiación / Cuotero",
    "enabled": "Habilitar cuotas",
    "allowedTerms": "Plazos permitidos (separados por coma)",
    "annualInterestRate": "Tasa anual (0.18 = 18%)",
    "downPaymentPercent": "Entrada (% como decimal, 0.2 = 20%)",
    "minFinanceableUsd": "Monto mínimo financiable (USD)",
    "notesEs": "Notas legales (ES)",
    "notesEn": "Notas legales (EN, opcional)"
  },
  "emails": {
    "title": "Emails",
    "adminStaffDomain": "Dominio para admin/staff",
    "fromAddress": "From email",
    "fromName": "From nombre"
  }
}
```

And same in en.json with English translations.

- [ ] **Step 3.3: Replace** `apps/web/src/app/[locale]/(protected)/admin/config/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { CurrencyForm } from './currency-form';
import { BidForm } from './bid-form';
import { FinancingForm } from './financing-form';
import { EmailsForm } from './emails-form';
import { Separator } from '@/components/ui/separator';

export default async function AdminConfigPage() {
  const t = useTranslations('admin.config');
  const cfg = await loadAppConfigSnapshot();
  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      <CurrencyForm initial={cfg.currency} />
      <Separator />
      <BidForm initial={cfg.bid} />
      <Separator />
      <FinancingForm initial={cfg.financing} />
      <Separator />
      <EmailsForm initial={cfg.emails} />
    </div>
  );
}
```

- [ ] **Step 3.4: Currency form** `currency-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Initial {
  primary: 'USD' | 'PYG';
  showSecondary: boolean;
  pygPerUsd: number | null;
}

export function CurrencyForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.config');
  const router = useRouter();
  const [primary, setPrimary] = useState(initial.primary);
  const [showSecondary, setShowSecondary] = useState(initial.showSecondary);
  const [pygPerUsd, setPygPerUsd] = useState(initial.pygPerUsd?.toString() ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { primary, showSecondary };
      const n = Number(pygPerUsd);
      if (!Number.isNaN(n) && n > 0) payload.pygPerUsd = n;
      await httpsCallable(fb.functions, 'updateGlobalConfig')({ currency: payload });
      toast.success(t('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-text-strong">{t('currency.title')}</h2>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-2">
          <Label>{t('currency.primary')}</Label>
          <Select value={primary} onValueChange={(v) => setPrimary(v as 'USD' | 'PYG')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="PYG">PYG</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pygPerUsd">{t('currency.pygPerUsd')}</Label>
          <Input
            id="pygPerUsd"
            type="number"
            step="0.01"
            value={pygPerUsd}
            onChange={(e) => setPygPerUsd(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between max-w-lg">
        <span className="text-sm">{t('currency.showSecondary')}</span>
        <Switch checked={showSecondary} onCheckedChange={setShowSecondary} />
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
```

- [ ] **Step 3.5: Bid form** `bid-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Initial {
  fixedIncrementUsd: number;
  allowManualIncrement: boolean;
  antiSnipingSeconds: number;
}

export function BidForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.config');
  const router = useRouter();
  const [increment, setIncrement] = useState(String(initial.fixedIncrementUsd));
  const [allowManual, setAllowManual] = useState(initial.allowManualIncrement);
  const [antiSniping, setAntiSniping] = useState(String(initial.antiSnipingSeconds));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await httpsCallable(
        fb.functions,
        'updateGlobalConfig',
      )({
        bid: {
          fixedIncrementUsd: Number(increment),
          allowManualIncrement: allowManual,
          antiSnipingSeconds: Number(antiSniping),
        },
      });
      toast.success(t('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-text-strong">{t('bid.title')}</h2>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="increment">{t('bid.fixedIncrementUsd')}</Label>
          <Input
            id="increment"
            type="number"
            value={increment}
            onChange={(e) => setIncrement(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="antiSniping">{t('bid.antiSnipingSeconds')}</Label>
          <Input
            id="antiSniping"
            type="number"
            value={antiSniping}
            onChange={(e) => setAntiSniping(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between max-w-lg">
        <span className="text-sm">{t('bid.allowManualIncrement')}</span>
        <Switch checked={allowManual} onCheckedChange={setAllowManual} />
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
```

- [ ] **Step 3.6: Financing form** `financing-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Initial {
  enabled: boolean;
  allowedTerms: number[];
  annualInterestRate: number;
  downPaymentPercent: number;
  minFinanceableUsd: number;
  notesEs: string;
  notesEn: string;
}

export function FinancingForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.config');
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [terms, setTerms] = useState(initial.allowedTerms.join(','));
  const [rate, setRate] = useState(String(initial.annualInterestRate));
  const [down, setDown] = useState(String(initial.downPaymentPercent));
  const [minAmt, setMinAmt] = useState(String(initial.minFinanceableUsd));
  const [notesEs, setNotesEs] = useState(initial.notesEs);
  const [notesEn, setNotesEn] = useState(initial.notesEn);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const allowedTerms = terms
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      const payload: Record<string, unknown> = {
        enabled,
        allowedTerms,
        annualInterestRate: Number(rate),
        downPaymentPercent: Number(down),
        minFinanceableUsd: Number(minAmt),
      };
      if (notesEs) {
        payload.notes = { es: notesEs, ...(notesEn && { en: notesEn }) };
      }
      await httpsCallable(fb.functions, 'updateGlobalConfig')({ financing: payload });
      toast.success(t('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-text-strong">{t('financing.title')}</h2>
      <div className="flex items-center justify-between max-w-lg">
        <span className="text-sm">{t('financing.enabled')}</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="terms">{t('financing.allowedTerms')}</Label>
        <Input id="terms" value={terms} onChange={(e) => setTerms(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="rate">{t('financing.annualInterestRate')}</Label>
          <Input
            id="rate"
            type="number"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="down">{t('financing.downPaymentPercent')}</Label>
          <Input
            id="down"
            type="number"
            step="0.01"
            value={down}
            onChange={(e) => setDown(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="minAmt">{t('financing.minFinanceableUsd')}</Label>
        <Input
          id="minAmt"
          type="number"
          value={minAmt}
          onChange={(e) => setMinAmt(e.target.value)}
        />
      </div>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="notesEs">{t('financing.notesEs')}</Label>
        <Input id="notesEs" value={notesEs} onChange={(e) => setNotesEs(e.target.value)} />
      </div>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="notesEn">{t('financing.notesEn')}</Label>
        <Input id="notesEn" value={notesEn} onChange={(e) => setNotesEn(e.target.value)} />
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
```

- [ ] **Step 3.7: Emails form** `emails-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Initial {
  adminStaffDomain: string;
  fromAddress: string;
  fromName: string;
}

export function EmailsForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.config');
  const router = useRouter();
  const [domain, setDomain] = useState(initial.adminStaffDomain);
  const [from, setFrom] = useState(initial.fromAddress);
  const [name, setName] = useState(initial.fromName);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await httpsCallable(
        fb.functions,
        'updateGlobalConfig',
      )({
        emails: { adminStaffDomain: domain, fromAddress: from, fromName: name },
      });
      toast.success(t('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-text-strong">{t('emails.title')}</h2>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="domain">{t('emails.adminStaffDomain')}</Label>
        <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="from">{t('emails.fromAddress')}</Label>
          <Input id="from" type="email" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">{t('emails.fromName')}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
```

- [ ] **Step 3.8: Build, commit**

```
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/lib/admin/load-app-config.ts apps/web/src/app/[locale]/'(protected)'/admin/config apps/web/messages
git commit -m "feat(web): admin/config — currency, bid, financing, emails sections"
```

---

## Self-Review

Spec coverage:

- Audit table with action filter and pagination ✅
- Configuración global page with 4 sections (moneda, pujas, financiación, emails) ✅
- updateGlobalConfig CF with admin guard, partial updates, audit log ✅

Out of scope:

- Diff viewer for audit before/after (deferred — current view shows fact only)
- Charts/KPIs in admin home (Plan 3c)

---

## Execution Handoff

Recommended batches:

- Batch BB: Task 1 (CF + tests)
- Batch CC: Task 2 (audit viewer)
- Batch DD: Task 3 (config UI — 4 forms in one batch)
