import { RenewWordmark } from '@/components/brand/renew-wordmark';
import { PixelGrid } from '@/components/brand/pixel-grid';
import { EnrollForm } from './enroll-form';

interface PageProps {
  params: { locale: string };
  searchParams?: { from?: string };
}

/**
 * Enrolment of an authenticator app (TOTP) as second factor.
 *
 * Lives in the (auth) group — no session cookie required — because the person
 * arriving here has just signed in with one factor and been REFUSED a cookie
 * by /api/session (`mfa_required`, not enrolled): their role demands a second
 * factor they don't have yet. What they do have is the Firebase client
 * session, which is all enrolment needs. The form redirects to /login if even
 * that is missing.
 *
 * Also reachable voluntarily from Ajustes → Seguridad, for anyone who wants
 * the second factor before it is required of them.
 */
export default function MfaEnrollPage({ params: { locale }, searchParams }: PageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base">
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-32 w-[36rem] h-[36rem] rounded-full bg-text-strong/[0.04] blur-[120px]" />
        <div className="absolute -bottom-48 -left-32 w-[40rem] h-[40rem] rounded-full bg-text-strong/[0.05] blur-[140px]" />
        <div
          className="absolute inset-0"
          style={{
            maskImage: 'radial-gradient(ellipse 85% 70% at 50% 35%, black 25%, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 85% 70% at 50% 35%, black 25%, transparent 80%)',
          }}
        >
          <PixelGrid className="h-full w-full" />
        </div>
      </div>

      <div className="relative z-10 grid min-h-screen place-items-center px-5 py-10">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col items-center mb-8">
            <RenewWordmark size="md" />
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-text-muted">
              Subastas de vehículos
            </p>
          </div>

          <div className="glass-surface relative rounded-3xl p-7 sm:p-8">
            <EnrollForm
              locale={locale}
              {...(searchParams?.from ? { from: searchParams.from } : {})}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
