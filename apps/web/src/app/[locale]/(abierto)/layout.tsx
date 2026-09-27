import { AppShell } from '@/components/shell/app-shell';
import { PublicTopbar } from '@/components/public/public-topbar';
import { LegalFooter } from '@/components/legal/legal-footer';
import { getOptionalUser } from '@/lib/auth/server';
import { loadCompany } from '@/lib/legal/load-company';

/**
 * Páginas que puede abrir cualquiera (spec 2026-09-26 §3). Con sesión activa
 * (lo que devuelve getOptionalUser), el mismo AppShell que (protected). Sin
 * sesión, con una cookie vencida/no verificable, o con una cuenta
 * deshabilitada o sin rol (casos en los que getOptionalUser devuelve null),
 * el chrome público del landing — así lo decide la spec 2026-09-26 §3. Una
 * cuenta deshabilitada de todas formas no puede sostener una sesión válida:
 * el soft-delete revoca sus tokens y /api/session rechaza a quien no esté
 * activo. El MFA de staff se exige al emitir la cookie de sesión
 * (/api/session), no acá, así que este layout no lo afecta.
 */
export default async function OpenLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const user = await getOptionalUser();
  if (user)
    return (
      <AppShell locale={locale} user={user}>
        {children}
      </AppShell>
    );
  const company = await loadCompany();
  return (
    <div className="min-h-dvh flex flex-col bg-bg-base">
      <PublicTopbar locale={locale} />
      <main id="contenido" className="flex-1 mx-auto w-full max-w-7xl px-4 md:px-8 py-6 md:py-8">
        {children}
      </main>
      <LegalFooter locale={locale} company={company} />
    </div>
  );
}
