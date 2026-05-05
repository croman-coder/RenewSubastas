# CARBID Plan 2b — Login UI + Session Cookie + Role Middleware

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Make the web app authenticated end-to-end: a `/login` page that signs users in via Firebase Auth, an httpOnly session cookie established server-side via `firebase-admin`, a middleware that gates routes by role, and per-role landing pages (placeholders to be filled by Plans 3-5).

**Architecture:**

1. Client signs in with Firebase Auth (email/password) → receives an ID token.
2. Client POSTs the ID token to `/api/session` (Next.js Route Handler). The server uses `firebase-admin` to verify the token and mint a **session cookie** (5-day TTL), then sets it as `Set-Cookie: __session=...; HttpOnly; Secure; SameSite=Lax`.
3. The middleware reads `__session`, calls `firebase-admin.auth().verifySessionCookie(cookie, /* checkRevoked */ true)` to extract `uid` and custom claims (`role`, `status`).
4. Middleware redirects:
   - Unauthenticated user hitting protected route → `/login?from=<path>`
   - Authenticated buyer hitting `/admin/*` → `/auctions`
   - Status `disabled` → `/login?error=disabled` (after invalidating cookie)
5. Logout: client signs out + DELETE `/api/session` to clear the cookie.

**Tech Stack:** Next.js 14 Route Handlers, firebase (client) v10, firebase-admin v12 (server-side, web app), shadcn/ui, react-hook-form + zod, sonner.

**Spec reference:** `docs/superpowers/specs/2026-05-05-carbid-mvp-design.md` §3 (stack), §5 (security), §6 (settings & layout).

**Prerequisites:** Plan 1 + Plan 2a complete; emulators (Auth + Firestore) start when running tests.

---

## File Structure (end state)

```
apps/web/
├── components.json                              shadcn config (created in Task 1)
├── src/
│   ├── lib/
│   │   ├── firebase/
│   │   │   ├── client.ts                        web wrapper around @carbid/firebase-client
│   │   │   └── admin.ts                         server-side firebase-admin singleton
│   │   ├── auth/
│   │   │   ├── session.ts                       session cookie name + helpers (server)
│   │   │   ├── AuthProvider.tsx                 client context (auth user)
│   │   │   ├── useAuth.ts
│   │   │   └── constants.ts                     SESSION_COOKIE_NAME, ROLE_HOME paths
│   │   └── env.server.ts                        server env vars (zod)
│   ├── components/
│   │   └── ui/                                  shadcn components: button, input, label, card, form, alert, sonner
│   ├── app/
│   │   ├── api/
│   │   │   └── session/
│   │   │       └── route.ts                     POST + DELETE handlers
│   │   └── [locale]/
│   │       ├── layout.tsx                       (existing) wrap with AuthProvider
│   │       ├── page.tsx                         redirect logic by role
│   │       ├── (auth)/
│   │       │   └── login/
│   │       │       ├── page.tsx
│   │       │       └── login-form.tsx           client component
│   │       └── (protected)/
│   │           ├── layout.tsx                   role-aware shell (topbar + sidebar)
│   │           ├── admin/page.tsx               placeholder
│   │           ├── staff/page.tsx               placeholder
│   │           └── auctions/page.tsx            placeholder (buyer home)
│   └── middleware.ts                            extended for auth + role redirects
└── messages/{es,en}.json                        new namespaces: auth, errors
```

---

## Task 1: shadcn-ui init + needed components

- [ ] **Step 1.1: Initialize shadcn**

```bash
cd apps/web
npx shadcn-ui@latest init -d
```

Use these answers when prompted (or pass via `-d` flag for defaults):

- TypeScript: Yes
- Style: Default
- Base color: Neutral
- CSS variables: Yes
- Tailwind config path: `./tailwind.config.ts`
- Components alias: `@/components`
- Utils alias: `@/lib/utils`
- React Server Components: Yes

This creates `apps/web/components.json` and updates `tailwind.config.ts` and `globals.css`.

> **IMPORTANT:** the shadcn init will ADD shadcn-style CSS variables (`--background`, `--foreground`, etc.) to globals.css. We already have our OKLCH tokens (`--bg-base`, `--copper`, etc.). Both can coexist. shadcn components reference shadcn vars, but we will progressively override with ours via Tailwind classes. Do NOT delete our existing OKLCH section.

- [ ] **Step 1.2: Add required components**

```bash
cd apps/web
npx shadcn-ui@latest add button input label card form alert sonner
```

This adds files under `src/components/ui/`. Verify each file was created.

- [ ] **Step 1.3: Verify build still passes**

```
pnpm --filter @carbid/web typecheck
pnpm --filter @carbid/web build
```

- [ ] **Step 1.4: Commit**

```
git add apps/web/components.json apps/web/src/components/ui apps/web/tailwind.config.ts apps/web/src/app/globals.css apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): init shadcn-ui with button, input, label, card, form, alert, sonner"
```

---

## Task 2: Server env + firebase-admin in web app

The web app needs `firebase-admin` to mint and verify session cookies in API routes and middleware. This is server-side only.

- [ ] **Step 2.1: Add firebase-admin to apps/web deps**

Edit `apps/web/package.json` — add to `dependencies`:

```
"firebase-admin": "^12.1.0"
```

Run `pnpm install`.

- [ ] **Step 2.2: Create apps/web/src/lib/env.server.ts**

```ts
import { z } from 'zod';

const ServerEnvSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  // For local dev, we connect admin SDK to emulators when these are set:
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
});

export const serverEnv = ServerEnvSchema.parse({
  FIREBASE_PROJECT_ID:
    process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ?? process.env['FIREBASE_PROJECT_ID'],
  FIREBASE_CLIENT_EMAIL: process.env['FIREBASE_CLIENT_EMAIL'],
  FIREBASE_PRIVATE_KEY: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
  FIREBASE_AUTH_EMULATOR_HOST: process.env['FIREBASE_AUTH_EMULATOR_HOST'],
  FIRESTORE_EMULATOR_HOST: process.env['FIRESTORE_EMULATOR_HOST'],
});
```

- [ ] **Step 2.3: Create apps/web/src/lib/firebase/admin.ts**

```ts
import 'server-only';
import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { serverEnv } from '../env.server';

let app: App | null = null;

export function getAdminApp(): App {
  if (!app) {
    if (getApps().length) {
      app = getApps()[0]!;
    } else if (serverEnv.FIREBASE_AUTH_EMULATOR_HOST) {
      // Emulator: no credentials needed
      app = initializeApp({ projectId: serverEnv.FIREBASE_PROJECT_ID });
    } else if (serverEnv.FIREBASE_CLIENT_EMAIL && serverEnv.FIREBASE_PRIVATE_KEY) {
      app = initializeApp({
        credential: cert({
          projectId: serverEnv.FIREBASE_PROJECT_ID,
          clientEmail: serverEnv.FIREBASE_CLIENT_EMAIL,
          privateKey: serverEnv.FIREBASE_PRIVATE_KEY,
        }),
      });
    } else {
      app = initializeApp({ credential: applicationDefault() });
    }
  }
  return app;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
```

- [ ] **Step 2.4: Add server-only to apps/web deps if not present**

```
pnpm --filter @carbid/web add server-only
```

- [ ] **Step 2.5: Typecheck and commit**

```
pnpm --filter @carbid/web typecheck
git add apps/web/package.json apps/web/src/lib pnpm-lock.yaml
git commit -m "feat(web): add firebase-admin for server-side session handling"
```

---

## Task 3: Firebase client wrapper in web app

- [ ] **Step 3.1: Create apps/web/src/lib/firebase/client.ts**

```ts
'use client';
import { initFirebaseClient, loadFirebaseEnv } from '@carbid/firebase-client';

export const fb = initFirebaseClient(
  loadFirebaseEnv({
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'],
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'],
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'],
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'],
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env['NEXT_PUBLIC_FIREBASE_APP_ID'],
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env['NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'],
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: process.env['NEXT_PUBLIC_USE_FIREBASE_EMULATORS'],
  }),
);
```

- [ ] **Step 3.2: Create apps/web/src/lib/auth/constants.ts**

```ts
export const SESSION_COOKIE_NAME = '__session';
export const SESSION_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export type Role = 'admin' | 'staff' | 'buyer';

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  staff: '/staff',
  buyer: '/auctions',
};
```

- [ ] **Step 3.3: Commit**

```
git add apps/web/src/lib
git commit -m "feat(web): firebase client + auth constants (session, role homes)"
```

---

## Task 4: /api/session route handler (POST=login, DELETE=logout)

- [ ] **Step 4.1: Create apps/web/src/app/api/session/route.ts**

```ts
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from '@/lib/auth/constants';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const idToken = (body as { idToken?: unknown })?.idToken;
  if (typeof idToken !== 'string' || idToken.length === 0) {
    return NextResponse.json({ error: 'missing_id_token' }, { status: 400 });
  }

  try {
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    if (decoded.status !== 'active') {
      return NextResponse.json({ error: 'account_disabled' }, { status: 403 });
    }
    const sessionCookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_TTL_MS,
    });

    const res = NextResponse.json({ ok: true, role: decoded.role, uid: decoded.uid });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      maxAge: SESSION_TTL_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: 'invalid_token', detail: String(err) }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE_NAME, value: '', maxAge: 0, path: '/' });
  return res;
}
```

- [ ] **Step 4.2: Commit**

```
git add apps/web/src/app/api
git commit -m "feat(web): /api/session POST/DELETE for cookie auth"
```

---

## Task 5: AuthProvider + useAuth hook (client)

- [ ] **Step 5.1: Create apps/web/src/lib/auth/AuthProvider.tsx**

```tsx
'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(fb.auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 5.2: Wrap [locale]/layout.tsx with AuthProvider**

Edit `apps/web/src/app/[locale]/layout.tsx`. Add import and wrap:

```tsx
import { AuthProvider } from '@/lib/auth/AuthProvider';
// ...inside the JSX, wrap NextIntlClientProvider's children:
<NextIntlClientProvider messages={messages} locale={locale}>
  <AuthProvider>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  </AuthProvider>
</NextIntlClientProvider>;
```

- [ ] **Step 5.3: Typecheck and commit**

```
pnpm --filter @carbid/web typecheck
git add apps/web/src/lib/auth apps/web/src/app/[locale]/layout.tsx
git commit -m "feat(web): AuthProvider with onAuthStateChanged listener"
```

---

## Task 6: Login page + form

- [ ] **Step 6.1: Add translations**

Edit `apps/web/messages/es.json`. Add to root:

```json
"auth": {
  "login": {
    "title": "Iniciar sesión",
    "subtitle": "Ingresa con tu cuenta CARBID",
    "email": "Correo electrónico",
    "password": "Contraseña",
    "submit": "Entrar",
    "submitting": "Entrando…",
    "errors": {
      "invalidCredentials": "Correo o contraseña inválidos.",
      "accountDisabled": "Cuenta desactivada. Contacta al administrador.",
      "generic": "Error al iniciar sesión. Intenta nuevamente."
    }
  }
}
```

Edit `apps/web/messages/en.json` likewise:

```json
"auth": {
  "login": {
    "title": "Sign in",
    "subtitle": "Sign in with your CARBID account",
    "email": "Email",
    "password": "Password",
    "submit": "Sign in",
    "submitting": "Signing in…",
    "errors": {
      "invalidCredentials": "Invalid email or password.",
      "accountDisabled": "Account disabled. Contact the administrator.",
      "generic": "Sign-in failed. Please try again."
    }
  }
}
```

- [ ] **Step 6.2: Add react-hook-form, zod resolver**

```
pnpm --filter @carbid/web add react-hook-form @hookform/resolvers
```

- [ ] **Step 6.3: Create apps/web/src/app/[locale]/(auth)/login/login-form.tsx**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';
import { ROLE_HOME, type Role } from '@/lib/auth/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
type Form = z.infer<typeof Schema>;

export function LoginForm({ from }: { from?: string }) {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(Schema),
  });

  async function onSubmit(data: Form) {
    setSubmitting(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(fb.auth, data.email, data.password);
      const idToken = await cred.user.getIdToken(true);
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j.error === 'account_disabled') setError(t('errors.accountDisabled'));
        else setError(t('errors.generic'));
        await fb.auth.signOut();
        return;
      }
      const { role } = (await res.json()) as { role: Role };
      router.replace(from && from.startsWith('/') ? from : ROLE_HOME[role]);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setError(t('errors.invalidCredentials'));
      } else {
        setError(t('errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6.4: Create apps/web/src/app/[locale]/(auth)/login/page.tsx**

```tsx
import { useTranslations } from 'next-intl';
import { CarbidWordmark } from '@/components/brand/carbid-wordmark';
import { LoginForm } from './login-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { from?: string; error?: string };
}) {
  const t = useTranslations('auth.login');
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <CarbidWordmark size="lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm from={searchParams?.from} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
```

- [ ] **Step 6.5: Build, typecheck**

```
pnpm --filter @carbid/web typecheck
pnpm --filter @carbid/web build
```

- [ ] **Step 6.6: Commit**

```
git add apps/web/src/app apps/web/messages apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): login page with email/password and session cookie exchange"
```

---

## Task 7: Middleware with auth + role guards

The existing middleware does locale routing only. Extend it.

- [ ] **Step 7.1: Replace apps/web/src/middleware.ts**

```ts
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, ROLE_HOME, type Role } from '@/lib/auth/constants';

const intl = createIntlMiddleware({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localeDetection: true,
});

const PUBLIC_PATHS = ['/login'];
const ROLE_PREFIXES: Record<Role, string[]> = {
  admin: ['/admin', '/staff', '/auctions', '/buyer', '/settings'],
  staff: ['/staff', '/auctions', '/settings'],
  buyer: ['/auctions', '/buyer', '/settings'],
};

function stripLocale(path: string): { locale: string | null; rest: string } {
  const m = /^\/(es|en)(\/.*|$)/.exec(path);
  if (!m) return { locale: null, rest: path };
  return { locale: m[1] ?? null, rest: m[2] ?? '/' };
}

function isPublic(rest: string): boolean {
  if (rest === '/' || rest === '') return true;
  return PUBLIC_PATHS.some((p) => rest === p || rest.startsWith(`${p}/`));
}

function allowedForRole(role: Role, rest: string): boolean {
  if (rest === '/' || rest === '') return true;
  return ROLE_PREFIXES[role].some((p) => rest === p || rest.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const { locale, rest } = stripLocale(url.pathname);

  // Run intl FIRST (it may rewrite or redirect)
  const intlRes = intl(req);
  if (intlRes && intlRes.headers.get('location')) return intlRes;

  // Skip auth on static / api
  if (rest.startsWith('/api') || rest.startsWith('/_next') || rest.includes('.'))
    return intlRes ?? NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Try to verify session
  let role: Role | null = null;
  let active = false;
  if (cookie) {
    try {
      const decoded = await adminAuth().verifySessionCookie(cookie, true);
      role = (decoded['role'] as Role | undefined) ?? null;
      active = decoded['status'] === 'active';
    } catch {
      // Invalid/expired → treat as no session
      role = null;
      active = false;
    }
  }

  const localePrefix = locale ? `/${locale}` : '/es';

  // Public route → allow
  if (isPublic(rest)) {
    // If already authenticated and visiting /login, redirect to role home
    if (rest === '/login' && role && active) {
      url.pathname = `${localePrefix}${ROLE_HOME[role]}`;
      return NextResponse.redirect(url);
    }
    return intlRes ?? NextResponse.next();
  }

  // Protected route — must be authenticated
  if (!role || !active) {
    url.pathname = `${localePrefix}/login`;
    url.searchParams.set('from', rest);
    return NextResponse.redirect(url);
  }

  // Authenticated but wrong role
  if (!allowedForRole(role, rest)) {
    url.pathname = `${localePrefix}${ROLE_HOME[role]}`;
    url.searchParams.delete('from');
    return NextResponse.redirect(url);
  }

  return intlRes ?? NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
```

- [ ] **Step 7.2: Build, typecheck**

```
pnpm --filter @carbid/web typecheck
pnpm --filter @carbid/web build
```

If the build fails because middleware can't run firebase-admin in the Edge runtime, force Node runtime. Edit middleware.ts and ADD at the top:

```ts
export const runtime = 'nodejs';
```

(Next.js 14 supports Node runtime middleware via `nodejs` flag in App Router; verify your Next.js version supports this. If not, the fallback is to verify the cookie in a Server Component layout instead of middleware — see §Notes below.)

> **Notes**: As of Next.js 14, middleware defaults to Edge runtime which cannot run firebase-admin (it depends on Node-only crypto and `https.Agent`). The `runtime = 'nodejs'` directive is supported in Next.js 14.2+. If unsupported, move the auth check from middleware into a server-component `(protected)/layout.tsx` that calls `adminAuth().verifySessionCookie()` and redirects via `next/navigation.redirect()`. The middleware then only does locale routing.

- [ ] **Step 7.3: Commit**

```
git add apps/web/src/middleware.ts
git commit -m "feat(web): middleware verifies session cookie and gates routes by role"
```

---

## Task 8: Protected layout + per-role placeholder pages

- [ ] **Step 8.1: Create apps/web/src/app/[locale]/(protected)/layout.tsx**

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, type Role } from '@/lib/auth/constants';

export default async function ProtectedLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) redirect(`/${locale}/login`);
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    if (decoded['status'] !== 'active') redirect(`/${locale}/login?error=disabled`);
    const role = decoded['role'] as Role;
    return (
      <div className="min-h-screen flex flex-col">
        <ProtectedTopbar locale={locale} role={role} email={decoded.email ?? ''} />
        <div className="flex-1">{children}</div>
      </div>
    );
  } catch {
    redirect(`/${locale}/login`);
  }
}

function ProtectedTopbar({ locale, role, email }: { locale: string; role: Role; email: string }) {
  return (
    <header className="border-b border-text-subtle/20 px-6 py-3 flex items-center justify-between bg-bg-elev">
      <div className="flex items-center gap-3">
        <a href={`/${locale}`} className="font-wordmark font-bold tracking-tight">
          <span className="text-copper">CAR</span>
          <span className="text-ink">BID</span>
        </a>
        <span className="text-xs uppercase text-text-muted bg-bg-deep rounded px-2 py-0.5">
          {role}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-text-muted">{email}</span>
        <LogoutButton locale={locale} />
      </div>
    </header>
  );
}

import { LogoutButton } from './logout-button';
```

- [ ] **Step 8.2: Create apps/web/src/app/[locale]/(protected)/logout-button.tsx**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export function LogoutButton({ locale }: { locale: string }) {
  const t = useTranslations('common');
  const router = useRouter();
  async function onClick() {
    await fetch('/api/session', { method: 'DELETE' });
    await signOut(fb.auth);
    router.replace(`/${locale}/login`);
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      {t('signOut')}
    </Button>
  );
}
```

- [ ] **Step 8.3: Create per-role placeholder pages**

`apps/web/src/app/[locale]/(protected)/admin/page.tsx`:

```tsx
export default function AdminHome() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>
      <p className="text-text-muted">Esta sección se construirá en el Plan 3.</p>
    </main>
  );
}
```

`apps/web/src/app/[locale]/(protected)/staff/page.tsx`:

```tsx
export default function StaffHome() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Staff dashboard</h1>
      <p className="text-text-muted">Esta sección se construirá en el Plan 4.</p>
    </main>
  );
}
```

`apps/web/src/app/[locale]/(protected)/auctions/page.tsx`:

```tsx
export default function BuyerAuctionsHome() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Subastas</h1>
      <p className="text-text-muted">Catálogo de subastas. Plan 5.</p>
    </main>
  );
}
```

- [ ] **Step 8.4: Update root [locale]/page.tsx to redirect by role**

Replace the existing home page:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, ROLE_HOME, type Role } from '@/lib/auth/constants';

export default async function HomePage({ params: { locale } }: { params: { locale: string } }) {
  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) redirect(`/${locale}/login`);
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const role = decoded['role'] as Role;
    if (decoded['status'] !== 'active') redirect(`/${locale}/login?error=disabled`);
    redirect(`/${locale}${ROLE_HOME[role]}`);
  } catch {
    redirect(`/${locale}/login`);
  }
}
```

- [ ] **Step 8.5: Build, typecheck**

```
pnpm --filter @carbid/web typecheck
pnpm --filter @carbid/web build
```

- [ ] **Step 8.6: Commit**

```
git add apps/web/src/app
git commit -m "feat(web): protected layout with role-based topbar and placeholder dashboards"
```

---

## Task 9: End-to-end smoke test

- [ ] **Step 9.1: Start emulators (terminal 1)**

```
firebase emulators:start --only auth,firestore --project carbid-staging
```

- [ ] **Step 9.2: Bootstrap a test admin (terminal 2)**

```
cd functions
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=carbid-staging \
  pnpm bootstrap-admin admin@santarosa.com.py "Test" "Admin" "1234567"
```

A reset link is printed. Open it in a browser, set a password (e.g. `Carbid123!`).

- [ ] **Step 9.3: Start dev server (terminal 3)**

```
cd apps/web
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=carbid-staging \
  pnpm dev --port 3100
```

- [ ] **Step 9.4: Manual smoke flow**

1. Open `http://localhost:3100` → redirects to `/es/login`.
2. Enter `admin@santarosa.com.py` + the password you set → submits.
3. Browser receives `__session` cookie (httpOnly), redirects to `/es/admin`.
4. Sees the Admin dashboard placeholder with topbar showing "ADMIN" badge and email.
5. Click "Cerrar sesión" → returns to `/es/login`, cookie cleared.
6. Try visiting `/es/staff` while not logged in → redirects to login with `?from=/staff`.

If any step fails, capture the network/server logs and debug.

- [ ] **Step 9.5: Stop emulators and dev server**

- [ ] **Step 9.6: Final commit (only if format/lint adjustments)**

```
git status
# if dirty:
git commit -am "chore: format after login plan"
```

---

## Self-Review

**Spec coverage**:

- Login flow with Firebase Auth + httpOnly session cookie ✅
- Middleware role guards ✅
- Logout flow that revokes the cookie ✅
- Protected layout with role context ✅
- i18n strings for auth ✅

**Out of scope (next plans):**

- Settings UI (Plan 2c)
- Admin user management UI (Plan 3)
- Real dashboards beyond placeholders (Plans 3-5)

**Type consistency**: `Role` type centralized in `@/lib/auth/constants`; spec roles match data model.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-05-carbid-02b-login-session.md`.

Pre-flight before executing:

- Plan 2a complete and 27 tests green.
- Java 21 installed.
- shadcn-ui will run interactively during Task 1; the implementer should accept default answers via `-d`.

Recommended execution: subagent-driven, batched as:

- Batch M: Tasks 1-3 (shadcn + firebase wiring on web)
- Batch N: Tasks 4-5 (session API + AuthProvider)
- Batch O: Task 6 (login page + form)
- Batch P: Tasks 7-8 (middleware + protected layout + placeholders)
- Batch Q (manual): Task 9 (smoke test by user)
