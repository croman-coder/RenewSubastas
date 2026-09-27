import { AppShell } from '@/components/shell/app-shell';
import { PublicTopbar } from '@/components/public/public-topbar';
import { LegalFooter } from '@/components/legal/legal-footer';
import { getOptionalUser } from '@/lib/auth/server';
import { loadCompany } from '@/lib/legal/load-company';

/**
 * Páginas que puede abrir cualquiera (spec 2026-09-26 §3). Con sesión, el
 * mismo AppShell que (protected) —que llama a getCurrentUser, así que las
 * cuentas deshabilitadas y el gate de MFA de staff se comportan igual que
 * antes—. Sin sesión, el chrome público del landing.
 */
export default async function OpenLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const user = await getOptionalUser();
  if (user) return <AppShell locale={locale}>{children}</AppShell>;
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
