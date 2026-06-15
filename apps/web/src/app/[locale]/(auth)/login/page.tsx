import { useTranslations } from 'next-intl';
import { Gavel, ShieldCheck, Sparkles } from 'lucide-react';
import { RenewWordmark } from '@/components/brand/renew-wordmark';
import { PixelGrid } from '@/components/brand/pixel-grid';
import { LoginForm } from './login-form';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PageProps {
  params: { locale: string };
  searchParams?: { from?: string; error?: string };
}

const ERROR_KEY: Record<string, string> = {
  disabled: 'errors.accountDisabled',
  expired: 'errors.sessionExpired',
  no_role: 'errors.noRole',
};

export default function LoginPage({ params: { locale }, searchParams }: PageProps) {
  const t = useTranslations('auth.login');
  const errorKey = searchParams?.error ? ERROR_KEY[searchParams.error] : undefined;

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base">
      {/* Layered background effects:
            1. soft ink wash top-right
            2. soft ink wash bottom-left
            3. faint diagonal grid pattern for depth
          All purely decorative — pointer-events disabled. Tints are now
          neutral grayscale to match the Renew B&W palette; no chromatic
          accents creep into the chrome. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-32 w-[36rem] h-[36rem] rounded-full bg-text-strong/[0.04] blur-[120px]" />
        <div className="absolute -bottom-48 -left-32 w-[40rem] h-[40rem] rounded-full bg-text-strong/[0.05] blur-[140px]" />
        {/* Animated monochrome dot-matrix, faded toward the edges so the
            content stays the focus. */}
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
        {/* 21st.dev Sign In Flow accent lines drawing in over the grid. */}
        <div className="accent-lines">
          <div className="hline" />
          <div className="hline" />
          <div className="hline" />
          <div className="vline" />
          <div className="vline" />
          <div className="vline" />
        </div>
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
        {/* Left side: brand + value props (hidden on mobile) */}
        <aside className="hidden lg:flex flex-col justify-between px-12 py-12 xl:px-16">
          <div className="animate-in fade-in slide-in-from-left-4 duration-700">
            <RenewWordmark size="lg" />
            <p className="mt-2 text-sm uppercase tracking-[0.2em] text-text-muted">
              Subastas de vehículos · Paraguay
            </p>
          </div>

          <div
            className="space-y-8 max-w-md animate-in fade-in slide-in-from-left-6 duration-700"
            style={{ animationDelay: '120ms', animationFillMode: 'both' }}
          >
            <h2 className="text-4xl xl:text-5xl font-bold tracking-tight text-text-strong leading-[1.05]">
              Comprá tu próximo vehículo{' '}
              <span className="underline decoration-2 underline-offset-[6px]">con confianza</span>.
            </h2>
            <p className="text-base text-text-muted leading-relaxed">
              Pujá en tiempo real y recibí notificaciones al instante cuando alguien supera tu
              oferta.
            </p>

            <ul className="space-y-4 pt-4">
              <Feature
                icon={Gavel}
                title="Subastas en vivo"
                description="Anti-sniping de 60 segundos: nadie te roba la subasta sobre la hora."
              />
              <Feature
                icon={Sparkles}
                title="Catálogo seleccionado"
                description="Vehículos verificados por Santa Rosa Automotores, listos para subastar."
              />
              <Feature
                icon={ShieldCheck}
                title="Operaciones seguras"
                description="Verificación de identidad y reset de contraseña asistido por administrador."
              />
            </ul>
          </div>

          <p
            className="text-xs text-text-muted/70 animate-in fade-in duration-1000"
            style={{ animationDelay: '300ms', animationFillMode: 'both' }}
          >
            © {new Date().getFullYear()} Renew Subastas · Santa Rosa SA
          </p>
        </aside>

        {/* Right side: login card */}
        <section className="relative flex items-center justify-center overflow-hidden px-5 py-10 sm:px-8 lg:px-12">
          <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Mobile-only wordmark. The desktop view shows it on the left aside. */}
            <div className="lg:hidden flex flex-col items-center mb-10">
              <RenewWordmark size="md" />
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-text-muted">
                Subastas de vehículos
              </p>
            </div>

            <div
              className={
                'glass-surface relative rounded-3xl p-7 sm:p-8 ' +
                'before:absolute before:inset-x-0 before:top-0 before:h-px ' +
                'before:bg-gradient-to-r before:from-copper/0 before:via-copper/60 before:to-copper/0'
              }
            >
              <header className="space-y-1.5 mb-6">
                <p className="text-[11px] uppercase tracking-[0.12em] text-copper font-semibold">
                  {t('subtitle')}
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-text-strong">{t('title')}</h1>
              </header>

              {errorKey && (
                <div className="mb-4 animate-in fade-in slide-in-from-top-1 duration-300">
                  <Alert variant="destructive">
                    <AlertDescription>{t(errorKey)}</AlertDescription>
                  </Alert>
                </div>
              )}

              <LoginForm
                {...(searchParams?.from !== undefined ? { from: searchParams.from } : {})}
                locale={locale}
              />
            </div>

            <p className="mt-6 text-center text-xs text-text-muted">
              ¿No tenés cuenta? Solicitala a tu administrador.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Gavel;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3.5">
      <span className="shrink-0 w-9 h-9 rounded-lg bg-copper/10 ring-1 ring-copper/20 grid place-items-center text-copper">
        <Icon className="w-4 h-4" strokeWidth={2.25} />
      </span>
      <div>
        <p className="text-sm font-semibold text-text-strong tracking-tight">{title}</p>
        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </li>
  );
}
