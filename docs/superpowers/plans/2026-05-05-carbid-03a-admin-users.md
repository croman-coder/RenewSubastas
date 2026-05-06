# CARBID Plan 3a — Admin Layout + Users CRUD

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Build the admin sidebar shell and the full user-management workflow (list with filters, create new user, view detail, change role/status, delete, generate password reset link). Reuses Plan 2a Cloud Functions; adds zero new server logic.

**Architecture:**

- `[locale]/(protected)/admin/layout.tsx` adds a left sidebar with the admin nav. The existing `(protected)/layout.tsx` topbar stays.
- All admin routes are role-gated by `requireRole(locale, ['admin'])` on every page.
- User list is a Server Component that pages through Firestore (`startAfter` cursor in URL), then renders a client table.
- Create/edit/delete actions call existing Cloud Functions via `httpsCallable` from client components.

**Spec reference:** §6 admin dashboard table (Users tab); §5 Cloud Functions table.

**Prerequisites:** Plans 1, 2a, 2b, 2c complete.

---

## File Structure (end state)

```
apps/web/src/
├── components/ui/                + table, badge (new shadcn primitives)
├── lib/admin/
│   └── list-users.ts             server helper — Firestore paginated query
└── app/[locale]/(protected)/admin/
    ├── layout.tsx                admin sidebar
    ├── page.tsx                  KPIs placeholder (Plan 3c)
    └── users/
        ├── page.tsx              list (server)
        ├── users-table.tsx       client (filters + table)
        ├── user-row-actions.tsx  client (dropdown menu per row)
        ├── new/
        │   ├── page.tsx          create page (server)
        │   └── create-user-form.tsx  client
        └── [uid]/
            ├── page.tsx          detail (server)
            └── edit-role-form.tsx client
```

---

## Task 1: Add shadcn primitives + admin nav layout

- [ ] **Step 1.1: Add shadcn**

```
cd apps/web
npx shadcn@latest add table badge dropdown-menu --yes --overwrite
```

- [ ] **Step 1.2: i18n strings — append to messages/es.json under root**

```json
"admin": {
  "nav": {
    "home": "Inicio",
    "users": "Usuarios",
    "vehicles": "Vehículos",
    "auctions": "Subastas",
    "audit": "Auditoría",
    "config": "Configuración"
  },
  "users": {
    "title": "Usuarios",
    "createNew": "Crear usuario",
    "filters": {
      "search": "Buscar por nombre, email o documento",
      "role": "Rol",
      "status": "Estado",
      "all": "Todos"
    },
    "columns": {
      "name": "Nombre",
      "email": "Email",
      "role": "Rol",
      "status": "Estado",
      "createdAt": "Creado"
    },
    "status": {
      "active": "Activo",
      "disabled": "Desactivado"
    },
    "actions": {
      "viewEdit": "Ver / editar",
      "changeRole": "Cambiar rol",
      "disable": "Desactivar",
      "enable": "Reactivar",
      "delete": "Eliminar",
      "resetPassword": "Generar link de reseteo"
    },
    "empty": "No hay usuarios que coincidan con los filtros.",
    "create": {
      "title": "Crear usuario",
      "subtitle": "Los usuarios admin/staff deben usar email de @santarosa.com.py.",
      "role": "Rol",
      "email": "Correo",
      "firstName": "Nombre",
      "lastName": "Apellido",
      "documentType": "Tipo de documento",
      "documentNumber": "Número",
      "phone": "Teléfono",
      "submit": "Crear y enviar link",
      "submitting": "Creando…",
      "success": "Usuario creado. Link de reseteo:",
      "errors": {
        "documentInvalid": "Documento inválido para Paraguay.",
        "emailDomain": "Los usuarios admin y staff deben usar @santarosa.com.py.",
        "duplicate": "Ya existe un usuario con ese email.",
        "generic": "No se pudo crear el usuario."
      }
    },
    "detail": {
      "back": "← Volver a la lista",
      "tabsProfile": "Perfil",
      "tabsActivity": "Actividad",
      "tabsAudit": "Auditoría",
      "actionsTitle": "Acciones de administración",
      "changeRoleTitle": "Cambiar rol o estado",
      "saveChanges": "Guardar cambios",
      "saving": "Guardando…",
      "saved": "Cambios guardados.",
      "deleteAccount": "Eliminar cuenta",
      "deleteConfirmText": "Esta acción es irreversible. Para confirmar, escribe ELIMINAR",
      "resetPassword": "Generar link de reseteo",
      "resetPasswordCopy": "Copia el link y envíalo al usuario:",
      "errors": { "generic": "Error al ejecutar la acción." }
    }
  }
}
```

Same structure in `messages/en.json` with English translations.

- [ ] **Step 1.3: Create admin layout**

`apps/web/src/app/[locale]/(protected)/admin/layout.tsx`:

```tsx
import { requireRole } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';

export default async function AdminLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  await requireRole(locale, ['admin']);
  const t = await getTranslations('admin.nav');
  const items = [
    { href: `/${locale}/admin`, label: t('home') },
    { href: `/${locale}/admin/users`, label: t('users') },
    { href: `/${locale}/admin/audit`, label: t('audit') },
    { href: `/${locale}/admin/config`, label: t('config') },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 max-w-7xl mx-auto p-6">
      <nav aria-label="Admin">
        <ul className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {items.map((it) => (
            <li key={it.href}>
              <a
                href={it.href}
                className="block px-3 py-2 rounded text-sm text-text-strong hover:bg-bg-elev"
              >
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
```

- [ ] **Step 1.4: Stub `/admin/audit` and `/admin/config` placeholder pages so the nav links don't 404**

`apps/web/src/app/[locale]/(protected)/admin/audit/page.tsx`:

```tsx
export default function AuditPage() {
  return <p className="text-text-muted">El visor de auditoría llega en el Plan 3b.</p>;
}
```

Same with `apps/web/src/app/[locale]/(protected)/admin/config/page.tsx`.

- [ ] **Step 1.5: Build, format, commit**

```
pnpm --filter @carbid/web typecheck
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/components/ui apps/web/messages apps/web/src/app/[locale]/'(protected)'/admin apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): admin layout with sidebar nav + i18n strings"
```

---

## Task 2: List users page

- [ ] **Step 2.1: Helper `apps/web/src/lib/admin/list-users.ts`**

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface UserListItem {
  uid: string;
  email: string;
  role: 'admin' | 'staff' | 'buyer';
  status: 'active' | 'disabled';
  firstName: string;
  lastName: string;
  documentType: 'CI' | 'RUC';
  documentNumber: string;
  createdAt: number; // ms epoch
}

export interface ListUsersFilter {
  role?: 'admin' | 'staff' | 'buyer';
  status?: 'active' | 'disabled';
  pageSize?: number;
  cursor?: string; // last createdAt as string
}

export interface ListUsersResult {
  items: UserListItem[];
  nextCursor: string | null;
}

export async function listUsers(filter: ListUsersFilter): Promise<ListUsersResult> {
  const db = getFirestore(getAdminApp());
  let q = db.collection('users').orderBy('createdAt', 'desc');
  if (filter.role) q = q.where('role', '==', filter.role);
  if (filter.status) q = q.where('status', '==', filter.status);
  const pageSize = Math.min(filter.pageSize ?? 25, 100);
  if (filter.cursor) {
    const cursorMs = Number(filter.cursor);
    if (!Number.isNaN(cursorMs)) q = q.startAfter(new Date(cursorMs));
  }
  q = q.limit(pageSize + 1);

  const snap = await q.get();
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items: UserListItem[] = docs.slice(0, pageSize).map((d) => {
    const data = d.data();
    const profile = (data['profile'] ?? {}) as Record<string, unknown>;
    const createdAt =
      (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return {
      uid: d.id,
      email: (data['email'] as string) ?? '',
      role: (data['role'] as 'admin' | 'staff' | 'buyer') ?? 'buyer',
      status: (data['status'] as 'active' | 'disabled') ?? 'active',
      firstName: (profile['firstName'] as string) ?? '',
      lastName: (profile['lastName'] as string) ?? '',
      documentType: (profile['documentType'] as 'CI' | 'RUC') ?? 'CI',
      documentNumber: (profile['documentNumber'] as string) ?? '',
      createdAt,
    };
  });
  const nextCursor = hasMore ? String(items[items.length - 1]!.createdAt) : null;
  return { items, nextCursor };
}
```

- [ ] **Step 2.2: List page**

`apps/web/src/app/[locale]/(protected)/admin/users/page.tsx`:

```tsx
import { listUsers } from '@/lib/admin/list-users';
import { UsersTable } from './users-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { role?: string; status?: string; cursor?: string };
}

export default async function UsersListPage({ params: { locale }, searchParams }: PageProps) {
  const role = searchParams?.role as 'admin' | 'staff' | 'buyer' | undefined;
  const status = searchParams?.status as 'active' | 'disabled' | undefined;
  const data = await listUsers({
    ...(role && { role }),
    ...(status && { status }),
    ...(searchParams?.cursor && { cursor: searchParams.cursor }),
  });
  return (
    <UsersTable
      locale={locale}
      items={data.items}
      nextCursor={data.nextCursor}
      currentRole={role ?? null}
      currentStatus={status ?? null}
    />
  );
}
```

- [ ] **Step 2.3: Client table `users-table.tsx`**

```tsx
'use client';
import Link from 'next/link';
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
import { UserRowActions } from './user-row-actions';
import type { UserListItem } from '@/lib/admin/list-users';

export function UsersTable({
  locale,
  items,
  nextCursor,
  currentRole,
  currentStatus,
}: {
  locale: string;
  items: UserListItem[];
  nextCursor: string | null;
  currentRole: 'admin' | 'staff' | 'buyer' | null;
  currentStatus: 'active' | 'disabled' | null;
}) {
  const t = useTranslations('admin.users');
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    router.replace(`/${locale}/admin/users?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link href={`/${locale}/admin/users/new`}>
          <Button>{t('createNew')}</Button>
        </Link>
      </header>
      <div className="flex gap-3">
        <Select
          value={currentRole ?? 'all'}
          onValueChange={(v) => setParam('role', v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('filters.role')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            <SelectItem value="admin">admin</SelectItem>
            <SelectItem value="staff">staff</SelectItem>
            <SelectItem value="buyer">buyer</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={currentStatus ?? 'all'}
          onValueChange={(v) => setParam('status', v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('filters.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            <SelectItem value="active">{t('status.active')}</SelectItem>
            <SelectItem value="disabled">{t('status.disabled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="border border-text-subtle/20 rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.name')}</TableHead>
              <TableHead>{t('columns.email')}</TableHead>
              <TableHead>{t('columns.role')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.createdAt')}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-text-muted py-8">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((u) => (
              <TableRow key={u.uid}>
                <TableCell>
                  <Link href={`/${locale}/admin/users/${u.uid}`} className="hover:underline">
                    {u.firstName} {u.lastName}
                  </Link>
                </TableCell>
                <TableCell className="text-text-muted">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{u.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === 'active' ? 'default' : 'outline'}>
                    {u.status === 'active' ? t('status.active') : t('status.disabled')}
                  </Badge>
                </TableCell>
                <TableCell className="text-text-muted text-sm num-tab">
                  {new Date(u.createdAt).toLocaleDateString(locale)}
                </TableCell>
                <TableCell>
                  <UserRowActions locale={locale} user={u} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {nextCursor && (
        <Button
          variant="outline"
          onClick={() => {
            const next = new URLSearchParams(sp.toString());
            next.set('cursor', nextCursor);
            router.replace(`/${locale}/admin/users?${next.toString()}`);
          }}
        >
          Cargar más
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2.4: Row actions menu `user-row-actions.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { UserListItem } from '@/lib/admin/list-users';

export function UserRowActions({ locale, user }: { locale: string; user: UserListItem }) {
  const t = useTranslations('admin.users.actions');
  const router = useRouter();

  async function toggleStatus() {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      await httpsCallable(fb.functions, 'updateUserRole')({ uid: user.uid, status: newStatus });
      toast.success('OK');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function deleteUser() {
    if (!confirm('¿Eliminar este usuario?')) return;
    try {
      await httpsCallable(fb.functions, 'deleteUser')({ uid: user.uid });
      toast.success('Eliminado');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function resetPassword() {
    try {
      const res = await httpsCallable<{ uid: string }, { resetLink: string }>(
        fb.functions,
        'generatePasswordReset',
      )({ uid: user.uid });
      const link = res.data.resetLink;
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado al portapapeles');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          ⋯
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => router.push(`/${locale}/admin/users/${user.uid}`)}>
          {t('viewEdit')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={resetPassword}>{t('resetPassword')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={toggleStatus}>
          {user.status === 'active' ? t('disable') : t('enable')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={deleteUser} className="text-danger">
          {t('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2.5: Build, commit**

```
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/lib/admin apps/web/src/app/[locale]/'(protected)'/admin/users
git commit -m "feat(web): admin/users list with filters, pagination, row actions"
```

---

## Task 3: Create-user page

- [ ] **Step 3.1: Page** `admin/users/new/page.tsx`:

```tsx
import { CreateUserForm } from './create-user-form';
import { useTranslations } from 'next-intl';

export default function NewUserPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations('admin.users.create');
  return (
    <div className="max-w-xl space-y-6">
      <a href={`/${locale}/admin/users`} className="text-sm text-text-muted hover:text-text-strong">
        ← Usuarios
      </a>
      <header>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      <CreateUserForm locale={locale} />
    </div>
  );
}
```

- [ ] **Step 3.2: Client form**

`create-user-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
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
import { Alert, AlertDescription } from '@/components/ui/alert';

const Schema = z.object({
  role: z.enum(['admin', 'staff', 'buyer']),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentType: z.enum(['CI', 'RUC']),
  documentNumber: z.string().min(1),
  phone: z.string().optional(),
});
type FormValues = z.infer<typeof Schema>;

export function CreateUserForm({ locale }: { locale: string }) {
  const t = useTranslations('admin.users.create');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      role: 'buyer',
      documentType: 'CI',
      email: '',
      firstName: '',
      lastName: '',
      documentNumber: '',
      phone: '',
    },
  });
  const role = watch('role');
  const docType = watch('documentType');

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setResetLink(null);
    try {
      const result = await httpsCallable<FormValues, { uid: string; resetLink: string }>(
        fb.functions,
        'createUser',
      )(values);
      setResetLink(result.data.resetLink);
      toast.success('Usuario creado');
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (msg.includes('Invalid CI') || msg.includes('Invalid RUC'))
        toast.error(t('errors.documentInvalid'));
      else if (msg.includes('email must use domain')) toast.error(t('errors.emailDomain'));
      else if (msg.includes('already-exists')) toast.error(t('errors.duplicate'));
      else toast.error(t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>{t('role')}</Label>
        <Select
          value={role}
          onValueChange={(v) => setValue('role', v as 'admin' | 'staff' | 'buyer')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">admin</SelectItem>
            <SelectItem value="staff">staff</SelectItem>
            <SelectItem value="buyer">buyer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" type="email" {...register('email')} />
        {errors.email && <p className="text-sm text-danger">Invalid</p>}
      </div>
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
              <SelectItem value="CI">CI</SelectItem>
              <SelectItem value="RUC">RUC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="documentNumber">{t('documentNumber')}</Label>
          <Input id="documentNumber" {...register('documentNumber')} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t('phone')}</Label>
        <Input id="phone" type="tel" {...register('phone')} />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? t('submitting') : t('submit')}
      </Button>
      {resetLink && (
        <Alert>
          <AlertDescription className="space-y-2">
            <p className="text-sm">{t('success')}</p>
            <code className="block text-xs bg-bg-deep p-2 rounded break-all">{resetLink}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard.writeText(resetLink).then(() => toast.success('Copiado'))
              }
            >
              Copiar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => router.push(`/${locale}/admin/users`)}
            >
              Volver a la lista
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
```

- [ ] **Step 3.3: Build, commit**

```
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/app/[locale]/'(protected)'/admin/users/new
git commit -m "feat(web): admin/users/new — create user form via createUser CF"
```

---

## Task 4: User detail + change role/status

- [ ] **Step 4.1: Detail page (server)**

`admin/users/[uid]/page.tsx`:

```tsx
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EditRoleForm } from './edit-role-form';
import { Separator } from '@/components/ui/separator';

interface Props {
  params: { locale: string; uid: string };
}

export default async function UserDetailPage({ params: { locale, uid } }: Props) {
  const t = useTranslations('admin.users.detail');
  const snap = await getFirestore(getAdminApp()).doc(`users/${uid}`).get();
  if (!snap.exists) notFound();
  const data = snap.data()!;
  const profile = (data['profile'] ?? {}) as Record<string, string>;

  return (
    <div className="max-w-2xl space-y-6">
      <a href={`/${locale}/admin/users`} className="text-sm text-text-muted hover:text-text-strong">
        {t('back')}
      </a>
      <header>
        <h1 className="text-2xl font-semibold">
          {profile['firstName']} {profile['lastName']}
        </h1>
        <p className="text-text-muted text-sm">{data['email'] as string}</p>
      </header>
      <Separator />
      <section className="space-y-4">
        <h2 className="text-lg font-medium">{t('changeRoleTitle')}</h2>
        <EditRoleForm
          uid={uid}
          locale={locale}
          initialRole={data['role'] as 'admin' | 'staff' | 'buyer'}
          initialStatus={data['status'] as 'active' | 'disabled'}
          email={data['email'] as string}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 4.2: Edit role form**

`edit-role-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  uid: string;
  locale: string;
  initialRole: 'admin' | 'staff' | 'buyer';
  initialStatus: 'active' | 'disabled';
  email: string;
}

export function EditRoleForm({ uid, locale, initialRole, initialStatus }: Props) {
  const t = useTranslations('admin.users.detail');
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'updateUserRole')({ uid, role, status });
      toast.success(t('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (!confirm(t('deleteConfirmText'))) return;
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'deleteUser')({ uid });
      router.replace(`/${locale}/admin/users`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Rol</Label>
          <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">admin</SelectItem>
              <SelectItem value="staff">staff</SelectItem>
              <SelectItem value="buyer">buyer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="disabled">Desactivado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? t('saving') : t('saveChanges')}
        </Button>
        <Button variant="destructive" onClick={deleteUser} disabled={busy}>
          {t('deleteAccount')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.3: Build, commit**

```
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/app/[locale]/'(protected)'/admin/users/'[uid]'
git commit -m "feat(web): admin user detail with role/status edit and delete"
```

---

## Task 5: Smoke test (manual)

- Login as admin.
- /admin/users → ve admin existente.
- Crear nuevo: rol=buyer, email=test@gmail.com, documentos válidos → recibe reset link.
- Volver a la lista → buyer aparece. Filtrar por role=buyer.
- Click en el buyer → cambiar a status=disabled → guardar → ver badge actualizado.
- Cambiar de vuelta a active.
- Reset password desde el menú de fila → link copiado al portapapeles.
- Eliminar buyer → confirmación → desaparece.

---

## Self-Review

Spec coverage (admin/users portion of §6):

- Tabla con filtros (role, status, search) — search por nombre/email/doc fue OMITIDO en este plan; es trivial post-MVP con un text input que filtra cliente. Documentar.
- Acciones por fila (ver/editar, cambiar rol, activar/desactivar, eliminar) — ✅
- Botón "Crear usuario" con form completo — ✅ (envía email de bienvenida pendiente de Plan 9 con servicio de email)
- Detalle de usuario con tabs perfil/actividad/audit — solo perfil + acciones; tabs activity/audit deferidos a 3b cuando exista el log.

Out of scope (deferred):

- Search by free text (post-MVP simple addition)
- Email send for reset link (Plan 9)
- Activity tab (Plan 4 / 5 once auctions/bids exist)
- Audit tab (Plan 3b)

---

## Execution Handoff

Recommended batches:

- Batch X: Task 1 (layout + i18n + shadcn)
- Batch Y: Task 2 (list)
- Batch Z: Tasks 3-4 (create + detail)
- Batch AA (manual): Task 5 (smoke)
