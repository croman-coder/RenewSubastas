import { RenewWordmark } from '@/components/brand/renew-wordmark';
import { PixelGrid } from '@/components/brand/pixel-grid';
import { RegisterForm } from './register-form';

interface PageProps {
  params: { locale: string };
  searchParams?: { from?: string };
}

/**
 * Public self-registration with email + password, alongside the existing
 * Google button on /login. Own route (rather than a tab/dialog on /login)
 * because the flow has real state — form, "revisá tu correo", resend,
 * verified — and deserves the same full-page treatment as
 * set-password/auth-action rather than being squeezed into a modal.
 *
 * Same branded shell as those two pages (RenewWordmark + PixelGrid +
 * glass-surface card) for visual consistency across every auth-adjacent
 * screen. RegisterForm does all the Firebase work client-side.
 */
export default function RegisterPage({ params: { locale }, searchParams }: PageProps) {
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
            <RegisterForm
              locale={locale}
              {...(searchParams?.from !== undefined ? { from: searchParams.from } : {})}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
