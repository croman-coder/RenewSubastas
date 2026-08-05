import Link from 'next/link';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { RenewWordmark } from '@/components/brand/renew-wordmark';
import { LegalFooter } from './legal-footer';
import { LEGAL_VERSION_DATE, type LegalSection } from '@/lib/legal/company-facts';
import type { Company } from '@/lib/legal/load-company';
import { companyIsComplete } from '@/lib/legal/load-company';

interface Props {
  locale: string;
  title: string;
  intro: string;
  sections: LegalSection[];
  company: Company;
}

/**
 * Shared shell for the three legal pages.
 *
 * Its own chrome rather than AppShell or PublicTopbar: these URLs are linked
 * from the footer on every surface and must render identically whether or not
 * there's a session, so a shell that branches on the user would only add ways
 * to get it wrong.
 */
export function LegalPage({ locale, title, intro, sections, company }: Props) {
  const incomplete = !companyIsComplete(company);

  return (
    <div className="min-h-dvh flex flex-col bg-bg-base">
      <a
        href="#contenido"
        className={
          'sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 ' +
          'focus:rounded-md focus:bg-text-strong focus:text-bg-base focus:px-4 focus:py-2 focus:text-sm focus:font-semibold'
        }
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 border-b border-text-subtle/15 bg-bg-base/85 backdrop-blur supports-[backdrop-filter]:bg-bg-base/70">
        <div className="mx-auto max-w-3xl px-4 md:px-8 h-14 flex items-center justify-between gap-4">
          <Link
            href={`/${locale}` as `/${string}`}
            className="flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
            aria-label="Renew Subastas — inicio"
          >
            <RenewWordmark size="sm" />
          </Link>
          <Link
            href={`/${locale}` as `/${string}`}
            className={
              'inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium ' +
              'text-text-muted hover:text-text-strong hover:bg-bg-elev/60 ' +
              '[touch-action:manipulation] transition-colors duration-200 ' +
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40'
            }
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
            Volver
          </Link>
        </div>
      </header>

      <main id="contenido" className="flex-1 mx-auto w-full max-w-3xl px-4 md:px-8 py-8 md:py-12">
        <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted font-medium">
          Información legal
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-text-strong text-balance">
          {title}
        </h1>
        <p className="mt-3 text-sm sm:text-base text-text-muted text-pretty">{intro}</p>
        <p className="mt-2 text-xs text-text-subtle">Última actualización: {LEGAL_VERSION_DATE}</p>

        {incomplete && (
          <div
            role="status"
            className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3"
          >
            <AlertTriangle
              className="w-4 h-4 mt-0.5 shrink-0 text-amber-400"
              strokeWidth={2.25}
              aria-hidden="true"
            />
            <p className="text-sm text-amber-200/90">
              Faltan cargar los datos de la empresa (razón social, RUC, domicilio o contacto) en
              Configuración → Datos de la empresa. Hasta completarlos, este documento queda
              incompleto.
            </p>
          </div>
        )}

        <div className="mt-8 space-y-8">
          {sections.map((s, i) => (
            <section key={s.heading} aria-labelledby={`sec-${i}`} className="scroll-mt-20">
              <h2
                id={`sec-${i}`}
                className="text-lg sm:text-xl font-semibold tracking-tight text-text-strong"
              >
                {s.heading}
              </h2>
              {s.body.map((p, j) => (
                <p key={j} className="mt-2 text-sm sm:text-[15px] leading-relaxed text-text-muted">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-3 space-y-2">
                  {s.bullets.map((b, j) => (
                    <li
                      key={j}
                      className="relative pl-5 text-sm sm:text-[15px] leading-relaxed text-text-muted"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-[0.6em] w-1.5 h-1.5 rounded-full bg-text-subtle"
                      />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>

      <LegalFooter locale={locale} company={company} />
    </div>
  );
}
