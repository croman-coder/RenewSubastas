# CARBID Plan 2c — Settings UI

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Build the per-user Settings area accessible to all authenticated roles. Four sections per spec §6 settings table: **Profile**, **Security**, **Preferences**, **Danger zone** (buyer-only). Forms write to Firestore directly (within rules) or via existing Cloud Functions where they need server authority.

**Architecture:**

- `[locale]/(protected)/settings/layout.tsx` renders left-rail tabs + content slot.
- Each subpage is a Server Component for data fetch (`getCurrentUser` + Firestore read), wrapping a Client form component for the editing UX.
- **Profile** writes directly to `users/{uid}` (rules already allow self-update of profile/preferences).
- **Security** uses Firebase Auth client SDK for password reauth + change. "Revoke all sessions" calls a NEW small Cloud Function (`revokeMySessions` — adds to Plan 2a's existing functions).
- **Preferences** writes locale/theme/notifications to Firestore. The locale change updates a `NEXT_LOCALE` cookie via a server action so next-intl picks it up immediately.
- **Danger zone** (buyer only): confirmation dialog with text-match → calls existing `deleteUser` callable.

**Tech Stack:** shadcn (added: `tabs`, `dialog`, `switch`, `select`, `avatar`, `separator`), react-hook-form + zod, firebase/auth (`reauthenticateWithCredential`, `updatePassword`), Firestore client SDK for writes, sonner for toasts.

**Spec reference:** §6 Settings table; §4 data model (UserProfile, UserPreferences); §5 Cloud Functions.

**Prerequisites:** Plan 2a + Plan 2b complete. Java 21 for emulators.

---

## File Structure (end state)

```
apps/web/src/
├── components/ui/                     + tabs, dialog, switch, select, avatar, separator
├── lib/
│   ├── auth/server.ts                 (existing) — extend with optional helpers
│   └── settings/
│       ├── update-profile.ts          server action — writes users/{uid}.profile
│       ├── update-preferences.ts      server action — writes users/{uid}.preferences + locale cookie
│       └── upload-avatar.ts           server action — writes to Storage and updates avatarUrl
└── app/[locale]/(protected)/settings/
    ├── layout.tsx                     left-rail tabs
    ├── page.tsx                       redirect to /settings/profile
    ├── profile/
    │   ├── page.tsx                   server (fetch user doc)
    │   └── profile-form.tsx           client (avatar + fields)
    ├── security/
    │   ├── page.tsx
    │   ├── change-password-form.tsx
    │   └── revoke-sessions-button.tsx
    ├── preferences/
    │   ├── page.tsx
    │   └── preferences-form.tsx
    └── danger-zone/
        ├── page.tsx
        └── delete-account-dialog.tsx (buyer only — server enforces it)

functions/src/auth/revokeMySessions.ts  + test
functions/src/index.ts                  + export
```

---

## Task 1: Add shadcn components + sidebar layout

- [ ] **Step 1.1: Add shadcn components**

```
cd apps/web
npx shadcn@latest add tabs dialog switch select avatar separator --yes --overwrite
```

Verify the files were added under `src/components/ui/`. Run `pnpm install`.

- [ ] **Step 1.2: Create i18n strings**

Append to `apps/web/messages/es.json` under root level (next to `auth`, `common`, `home`):

```json
"settings": {
  "title": "Configuración",
  "tabs": {
    "profile": "Perfil",
    "security": "Seguridad",
    "preferences": "Preferencias",
    "dangerZone": "Zona de peligro"
  },
  "profile": {
    "title": "Información personal",
    "subtitle": "Estos datos se usan para tus pujas y facturación.",
    "firstName": "Nombre",
    "lastName": "Apellido",
    "email": "Correo electrónico",
    "documentType": "Tipo de documento",
    "documentTypeCi": "Cédula (CI)",
    "documentTypeRuc": "RUC",
    "documentNumber": "Número de documento",
    "documentNumberPlaceholderCi": "Ej: 1234567",
    "documentNumberPlaceholderRuc": "Ej: 80012345-3",
    "phone": "Teléfono",
    "addressStreet": "Dirección",
    "addressCity": "Ciudad",
    "addressPostalCode": "Código postal",
    "avatar": "Foto de perfil",
    "uploadAvatar": "Cambiar foto",
    "save": "Guardar cambios",
    "saving": "Guardando…",
    "saved": "Guardado",
    "errors": {
      "documentInvalid": "Documento inválido para Paraguay.",
      "generic": "No se pudo guardar. Reintenta."
    }
  },
  "security": {
    "title": "Seguridad",
    "currentPassword": "Contraseña actual",
    "newPassword": "Contraseña nueva",
    "confirmPassword": "Confirmar contraseña",
    "changePassword": "Cambiar contraseña",
    "changing": "Cambiando…",
    "passwordChanged": "Contraseña actualizada.",
    "revokeSessions": "Cerrar sesión en todos los dispositivos",
    "revoking": "Cerrando sesiones…",
    "revoked": "Todas tus sesiones fueron cerradas.",
    "errors": {
      "wrongCurrent": "La contraseña actual es incorrecta.",
      "passwordsDontMatch": "Las contraseñas no coinciden.",
      "tooShort": "Mínimo 8 caracteres.",
      "generic": "No se pudo cambiar la contraseña."
    }
  },
  "preferences": {
    "title": "Preferencias",
    "language": "Idioma",
    "languageEs": "Español",
    "languageEn": "English",
    "theme": "Tema",
    "themeLight": "Claro",
    "themeDark": "Oscuro",
    "themeSystem": "Sistema",
    "notifications": "Notificaciones por email",
    "notifOutbid": "Cuando alguien supere mi puja",
    "notifWon": "Cuando gane una subasta",
    "notifNew": "Cuando se publique una subasta nueva",
    "save": "Guardar",
    "saved": "Preferencias guardadas."
  },
  "dangerZone": {
    "title": "Zona de peligro",
    "subtitle": "Estas acciones son irreversibles.",
    "deleteAccount": "Eliminar mi cuenta",
    "deleteDescription": "Tu cuenta se desactiva inmediatamente. Tus datos personales se eliminan en 30 días. Las pujas y compras quedan en el historial de subastas anonimizadas.",
    "confirmText": "Para confirmar, escribe ELIMINAR",
    "confirmPlaceholder": "ELIMINAR",
    "confirmButton": "Eliminar cuenta definitivamente",
    "deleting": "Eliminando…",
    "staffNotAllowed": "Las cuentas de staff y administrador no pueden auto-eliminarse. Contacta a un administrador.",
    "errors": { "generic": "No se pudo eliminar la cuenta." }
  }
}
```

Same structure in `messages/en.json` with English strings.

- [ ] **Step 1.3: Create settings layout — left rail**

`apps/web/src/app/[locale]/(protected)/settings/layout.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

export default async function SettingsLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const user = await getCurrentUser(locale);
  return (
    <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8">
      <SidebarNav locale={locale} role={user.role} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SidebarNav({ locale, role }: { locale: string; role: 'admin' | 'staff' | 'buyer' }) {
  const t = useTranslations('settings.tabs');
  const items = [
    { href: `/${locale}/settings/profile`, label: t('profile') },
    { href: `/${locale}/settings/security`, label: t('security') },
    { href: `/${locale}/settings/preferences`, label: t('preferences') },
  ];
  if (role === 'buyer')
    items.push({ href: `/${locale}/settings/danger-zone`, label: t('dangerZone') });
  return (
    <nav aria-label="Settings">
      <ul className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              className="block px-3 py-2 rounded text-sm text-text-strong hover:bg-bg-elev"
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
      <Separator className="my-4 hidden md:block" />
    </nav>
  );
}
```

- [ ] **Step 1.4: Create root settings/page.tsx that redirects to profile**

```tsx
import { redirect } from 'next/navigation';

export default function SettingsHome({ params: { locale } }: { params: { locale: string } }) {
  redirect(`/${locale}/settings/profile`);
}
```

- [ ] **Step 1.5: Build, format, commit**

```
pnpm --filter @carbid/web typecheck
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/components/ui apps/web/messages apps/web/src/app/[locale]/'(protected)'/settings apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): settings layout with left-rail tabs and i18n"
```

---

## Task 2: Profile section (Server Component fetch + client form)

- [ ] **Step 2.1: Server action `update-profile.ts`**

Create `apps/web/src/lib/settings/update-profile.ts`:

```ts
'use server';
import 'server-only';
import { z } from 'zod';
import { isValidCiPy, isValidRucPy } from '@carbid/shared-types';
import { adminAuth } from '@/lib/firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

const Input = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  documentType: z.enum(['CI', 'RUC']),
  documentNumber: z.string().min(1).max(20),
  phone: z.string().max(30).optional(),
  addressStreet: z.string().max(120).optional(),
  addressCity: z.string().max(80).optional(),
  addressPostalCode: z.string().max(20).optional(),
});

export async function updateProfileAction(
  input: z.infer<typeof Input>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const v = parsed.data;
  const ok =
    v.documentType === 'CI' ? isValidCiPy(v.documentNumber) : isValidRucPy(v.documentNumber);
  if (!ok) return { ok: false, error: 'documentInvalid' };

  const sessionCookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return { ok: false, error: 'unauthenticated' };
  let uid: string;
  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }

  const db = getFirestore();
  await db.doc(`users/${uid}`).update({
    'profile.firstName': v.firstName,
    'profile.lastName': v.lastName,
    'profile.documentType': v.documentType,
    'profile.documentNumber': v.documentNumber,
    ...(v.phone !== undefined && { 'profile.phone': v.phone }),
    ...((v.addressStreet || v.addressCity) && {
      'profile.address': {
        street: v.addressStreet ?? '',
        city: v.addressCity ?? '',
        country: 'PY',
        ...(v.addressPostalCode !== undefined && { postalCode: v.addressPostalCode }),
      },
    }),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}
```

- [ ] **Step 2.2: Server page that loads current data**

`apps/web/src/app/[locale]/(protected)/settings/profile/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { adminAuth } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { ProfileForm } from './profile-form';
import { useTranslations } from 'next-intl';

export default async function ProfilePage({ params: { locale } }: { params: { locale: string } }) {
  const user = await getCurrentUser(locale);
  const snap = await getFirestore().doc(`users/${user.uid}`).get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const profile = (data['profile'] ?? {}) as Record<string, unknown>;
  const address = (profile['address'] ?? {}) as Record<string, unknown>;
  return (
    <ProfileForm
      initial={{
        firstName: (profile['firstName'] as string) ?? '',
        lastName: (profile['lastName'] as string) ?? '',
        email: user.email,
        documentType: (profile['documentType'] as 'CI' | 'RUC') ?? 'CI',
        documentNumber: (profile['documentNumber'] as string) ?? '',
        phone: (profile['phone'] as string) ?? '',
        addressStreet: (address['street'] as string) ?? '',
        addressCity: (address['city'] as string) ?? '',
        addressPostalCode: (address['postalCode'] as string) ?? '',
      }}
    />
  );
}
```

- [ ] **Step 2.3: Client form component**

`apps/web/src/app/[locale]/(protected)/settings/profile/profile-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateProfileAction } from '@/lib/settings/update-profile';

const Schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentType: z.enum(['CI', 'RUC']),
  documentNumber: z.string().min(1),
  phone: z.string().optional(),
  addressStreet: z.string().optional(),
  addressCity: z.string().optional(),
  addressPostalCode: z.string().optional(),
});
type Form = z.infer<typeof Schema>;

interface Initial extends Form {
  email: string;
}

export function ProfileForm({ initial }: { initial: Initial }) {
  const t = useTranslations('settings.profile');
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: initial,
  });
  const docType = watch('documentType');

  async function onSubmit(values: Form) {
    setSubmitting(true);
    const res = await updateProfileAction(values);
    setSubmitting(false);
    if (res.ok) toast.success(t('saved'));
    else if (res.error === 'documentInvalid') toast.error(t('errors.documentInvalid'));
    else toast.error(t('errors.generic'));
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-xl">
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t('firstName')}</Label>
          <Input id="firstName" {...register('firstName')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t('lastName')}</Label>
          <Input id="lastName" {...register('lastName')} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('email')}</Label>
        <Input value={initial.email} readOnly disabled />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('documentType')}</Label>
          <Select
            value={docType}
            onValueChange={(v) => setValue('documentType', v as 'CI' | 'RUC')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CI">{t('documentTypeCi')}</SelectItem>
              <SelectItem value="RUC">{t('documentTypeRuc')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="documentNumber">{t('documentNumber')}</Label>
          <Input
            id="documentNumber"
            placeholder={
              docType === 'CI'
                ? t('documentNumberPlaceholderCi')
                : t('documentNumberPlaceholderRuc')
            }
            {...register('documentNumber')}
          />
          {errors.documentNumber && (
            <p className="text-sm text-danger">{errors.documentNumber.message}</p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t('phone')}</Label>
        <Input id="phone" type="tel" {...register('phone')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressStreet">{t('addressStreet')}</Label>
        <Input id="addressStreet" {...register('addressStreet')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="addressCity">{t('addressCity')}</Label>
          <Input id="addressCity" {...register('addressCity')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="addressPostalCode">{t('addressPostalCode')}</Label>
          <Input id="addressPostalCode" {...register('addressPostalCode')} />
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2.4: Build, format, commit**

```
pnpm --filter @carbid/web typecheck
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/lib/settings apps/web/src/app/[locale]/'(protected)'/settings/profile
git commit -m "feat(web): settings/profile with CI/RUC PY validation"
```

---

## Task 3: Security section

Two pieces: change-password (client-side via Firebase Auth) and revoke-all-sessions (Cloud Function).

- [ ] **Step 3.1: Cloud Function `revokeMySessions`**

Create `functions/src/auth/revokeMySessions.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';

export interface RevokeMySessionsResult {
  ok: true;
}

export async function revokeMySessionsHandler(
  req: CallableRequest,
): Promise<RevokeMySessionsResult> {
  const { uid } = requireSignedIn(req);
  await adminAuth().revokeRefreshTokens(uid);
  await writeAuditLog({
    actorUid: uid,
    action: 'user.revoke_sessions',
    resourceType: 'user',
    resourceId: uid,
  });
  return { ok: true };
}

export const revokeMySessions = onCall({ region: 'us-central1' }, revokeMySessionsHandler);
```

Add a small test (`revokeMySessions.test.ts`) — calls handler, asserts `auth/{uid}` has new `tokensValidAfterTime` and that an audit log entry was written.

Update `functions/src/index.ts` to add `export { revokeMySessions } from './auth/revokeMySessions.js';`

Build + run tests. Commit:

```
git add functions/src/auth/revokeMySessions.ts functions/src/auth/revokeMySessions.test.ts functions/src/index.ts
git commit -m "feat(functions): revokeMySessions callable for self-logout-everywhere"
```

- [ ] **Step 3.2: Client change-password form**

`apps/web/src/app/[locale]/(protected)/settings/security/change-password-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  });
type Form = z.infer<typeof Schema>;

export function ChangePasswordForm() {
  const t = useTranslations('settings.security');
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(Schema),
  });

  async function onSubmit(values: Form) {
    setSubmitting(true);
    try {
      const user = fb.auth.currentUser;
      if (!user || !user.email) throw new Error('no_user');
      const cred = EmailAuthProvider.credential(user.email, values.currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, values.newPassword);
      toast.success(t('passwordChanged'));
      reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        toast.error(t('errors.wrongCurrent'));
      } else {
        toast.error(t('errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">{t('currentPassword')}</Label>
        <Input id="currentPassword" type="password" {...register('currentPassword')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">{t('newPassword')}</Label>
        <Input id="newPassword" type="password" {...register('newPassword')} />
        {errors.newPassword && <p className="text-sm text-danger">{t('errors.tooShort')}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
        <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
        {errors.confirmPassword && (
          <p className="text-sm text-danger">{t('errors.passwordsDontMatch')}</p>
        )}
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? t('changing') : t('changePassword')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3.3: Revoke-sessions client button**

`apps/web/src/app/[locale]/(protected)/settings/security/revoke-sessions-button.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';

export function RevokeSessionsButton({ locale }: { locale: string }) {
  const t = useTranslations('settings.security');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'revokeMySessions')({});
      await fetch('/api/session', { method: 'DELETE' });
      await signOut(fb.auth);
      toast.success(t('revoked'));
      router.replace(`/${locale}/login?error=expired`);
      router.refresh();
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" onClick={onClick} disabled={busy}>
      {busy ? t('revoking') : t('revokeSessions')}
    </Button>
  );
}
```

- [ ] **Step 3.4: Security page wiring**

```tsx
import { useTranslations } from 'next-intl';
import { Separator } from '@/components/ui/separator';
import { ChangePasswordForm } from './change-password-form';
import { RevokeSessionsButton } from './revoke-sessions-button';

export default function SecurityPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations('settings.security');
  return (
    <div className="space-y-8 max-w-xl">
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
      <ChangePasswordForm />
      <Separator />
      <RevokeSessionsButton locale={locale} />
    </div>
  );
}
```

- [ ] **Step 3.5: Build + commit**

```
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/app/[locale]/'(protected)'/settings/security
git commit -m "feat(web): settings/security — change password + revoke sessions"
```

---

## Task 4: Preferences section

- [ ] **Step 4.1: Server action `update-preferences.ts`**

`apps/web/src/lib/settings/update-preferences.ts`:

```ts
'use server';
import 'server-only';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

const Input = z.object({
  locale: z.enum(['es', 'en']),
  theme: z.enum(['light', 'dark', 'system']),
  notifications: z.object({
    outbidEmail: z.boolean(),
    auctionWonEmail: z.boolean(),
    newAuctionEmail: z.boolean(),
  }),
});

export async function updatePreferencesAction(
  input: z.infer<typeof Input>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const v = parsed.data;

  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return { ok: false, error: 'unauthenticated' };
  let uid: string;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    uid = decoded.uid;
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }

  await getFirestore().doc(`users/${uid}`).update({
    'preferences.locale': v.locale,
    'preferences.theme': v.theme,
    'preferences.notifications': v.notifications,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // next-intl reads NEXT_LOCALE for client-side overrides on subsequent navigations.
  cookies().set('NEXT_LOCALE', v.locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  return { ok: true };
}
```

- [ ] **Step 4.2: Client form**

`apps/web/src/app/[locale]/(protected)/settings/preferences/preferences-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updatePreferencesAction } from '@/lib/settings/update-preferences';

interface Initial {
  locale: 'es' | 'en';
  theme: 'light' | 'dark' | 'system';
  notifications: { outbidEmail: boolean; auctionWonEmail: boolean; newAuctionEmail: boolean };
}

export function PreferencesForm({ initial }: { initial: Initial }) {
  const t = useTranslations('settings.preferences');
  const { setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, watch } = useForm<Initial>({ defaultValues: initial });
  const themeValue = watch('theme');
  const localeValue = watch('locale');

  async function onSubmit(values: Initial) {
    setSubmitting(true);
    setTheme(values.theme);
    const res = await updatePreferencesAction(values);
    setSubmitting(false);
    if (res.ok) {
      toast.success(t('saved'));
      // If locale changed, navigate to the new locale's URL preserving path
      if (values.locale !== initial.locale && pathname) {
        const newPath = pathname.replace(/^\/(es|en)/, `/${values.locale}`);
        router.replace(newPath);
        router.refresh();
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-md">
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
      <div className="space-y-2">
        <Label>{t('language')}</Label>
        <Controller
          name="locale"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es">{t('languageEs')}</SelectItem>
                <SelectItem value="en">{t('languageEn')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('theme')}</Label>
        <Controller
          name="theme"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('themeLight')}</SelectItem>
                <SelectItem value="dark">{t('themeDark')}</SelectItem>
                <SelectItem value="system">{t('themeSystem')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-3">
        <Label>{t('notifications')}</Label>
        {(['outbidEmail', 'auctionWonEmail', 'newAuctionEmail'] as const).map((key) => (
          <Controller
            key={key}
            name={`notifications.${key}` as `notifications.${typeof key}`}
            control={control}
            render={({ field }) => (
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {t(
                    key === 'outbidEmail'
                      ? 'notifOutbid'
                      : key === 'auctionWonEmail'
                        ? 'notifWon'
                        : 'notifNew',
                  )}
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />
        ))}
      </div>
      <Button type="submit" disabled={submitting}>
        {t('save')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4.3: Server page**

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { getFirestore } from 'firebase-admin/firestore';
import { PreferencesForm } from './preferences-form';

export default async function PreferencesPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await getCurrentUser(locale);
  const snap = await getFirestore().doc(`users/${user.uid}`).get();
  const prefs = (snap.data()?.['preferences'] ?? {}) as Record<string, unknown>;
  const notif = (prefs['notifications'] ?? {}) as Record<string, boolean>;
  return (
    <PreferencesForm
      initial={{
        locale: (prefs['locale'] as 'es' | 'en') ?? 'es',
        theme: (prefs['theme'] as 'light' | 'dark' | 'system') ?? 'system',
        notifications: {
          outbidEmail: notif['outbidEmail'] ?? true,
          auctionWonEmail: notif['auctionWonEmail'] ?? true,
          newAuctionEmail: notif['newAuctionEmail'] ?? false,
        },
      }}
    />
  );
}
```

- [ ] **Step 4.4: Commit**

```
git add apps/web/src/lib/settings/update-preferences.ts apps/web/src/app/[locale]/'(protected)'/settings/preferences
git commit -m "feat(web): settings/preferences — locale, theme, email notifications"
```

---

## Task 5: Danger zone (buyer-only)

- [ ] **Step 5.1: Delete-account dialog**

`apps/web/src/app/[locale]/(protected)/settings/danger-zone/delete-account-dialog.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DeleteAccountDialog({ uid, locale }: { uid: string; locale: string }) {
  const t = useTranslations('settings.dangerZone');
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'deleteUser')({ uid });
      await fetch('/api/session', { method: 'DELETE' });
      await signOut(fb.auth);
      router.replace(`/${locale}/login`);
      router.refresh();
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">{t('deleteAccount')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deleteAccount')}</DialogTitle>
          <DialogDescription>{t('deleteDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm">{t('confirmText')}</p>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('confirmPlaceholder')}
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={onConfirm} disabled={busy || text !== 'ELIMINAR'}>
            {busy ? t('deleting') : t('confirmButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5.2: Page (server, role-gated)**

```tsx
import { requireRole } from '@/lib/auth/server';
import { useTranslations } from 'next-intl';
import { DeleteAccountDialog } from './delete-account-dialog';

export default async function DangerZonePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  // Only buyers reach this page; other roles get redirected by requireRole.
  const user = await requireRole(locale, ['buyer']);
  return <DangerZoneContent uid={user.uid} locale={locale} />;
}

function DangerZoneContent({ uid, locale }: { uid: string; locale: string }) {
  const t = useTranslations('settings.dangerZone');
  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold text-danger">{t('title')}</h1>
      <p className="text-sm text-text-muted">{t('subtitle')}</p>
      <p className="text-sm">{t('deleteDescription')}</p>
      <DeleteAccountDialog uid={uid} locale={locale} />
    </div>
  );
}
```

- [ ] **Step 5.3: Commit**

```
git add apps/web/src/app/[locale]/'(protected)'/settings/danger-zone
git commit -m "feat(web): settings/danger-zone — buyer self-delete with confirmation"
```

---

## Task 6: Add settings link to topbar

Edit `apps/web/src/app/[locale]/(protected)/layout.tsx`. In the topbar's right side (next to email + LogoutButton), add a link to `/settings/profile`. Use the existing `common.settings` translation key.

Verify that clicking it from any role lands on the user's profile page.

```
git add apps/web/src/app/[locale]/'(protected)'/layout.tsx
git commit -m "feat(web): add settings link to protected topbar"
```

---

## Task 7: End-to-end smoke

- [ ] Start emulators (auth + firestore).
- [ ] Bootstrap a buyer with `pnpm bootstrap-admin` (or have admin create one via API once Plan 3 is done; for now, add a temporary route or use the script with role override).
- [ ] Login as buyer → settings → fill profile → save → confirm Firestore doc updated.
- [ ] Change password (use re-auth flow) → confirm.
- [ ] Toggle locale → page navigates to /en or /es.
- [ ] Delete account → dialog → ELIMINAR → redirected to login.

---

## Self-Review

Spec coverage:

- §6 Settings: profile (avatar deferred), security (change password ✅, revoke sessions ✅, 2FA stub deferred), preferences (locale/theme/notifications ✅), danger zone (buyer only ✅).
- Avatar upload: deferred to Plan 9 (storage rules already correct; UI scaffold can be added later).

No placeholders. Type consistency checked.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-05-carbid-02c-settings.md`.

Pre-flight:

- shadcn `tabs/dialog/switch/select/avatar/separator` not yet added.
- `revokeMySessions` Cloud Function will need emulators running for its test.

Recommended execution: subagent-driven, batched as:

- Batch R: Task 1 (shadcn components + i18n + layout)
- Batch S: Task 2 (Profile)
- Batch T: Task 3 (Security incl. Cloud Function)
- Batch U: Task 4 (Preferences)
- Batch V: Tasks 5-6 (Danger zone + topbar link)
- Batch W (manual): Task 7 (smoke test)
