import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BadgeCheck, CircleAlert, Trophy } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/server';
import { loadWonAuction } from '@/lib/buyer/load-won-auction';
import { CopyableField } from './copyable-field';
import { Countdown } from './countdown';
import { PaymentProofUpload } from './payment-proof-upload';

interface PageProps {
  params: { locale: string; audience: 'retail' | 'wholesale'; auctionId: string };
}

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function WonDetailPage({
  params: { locale, audience, auctionId },
}: PageProps) {
  const user = await getCurrentUser(locale);
  const w = await loadWonAuction(user.uid, auctionId);
  if (!w) notFound();

  const status = w.paymentStatus;
  const deadline = w.paymentDeadlineMs;
  const depositPct = Math.round(w.paymentDepositPercent * 100);

  const statusChip =
    status === 'paid' ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded-md px-2 py-0.5">
        <BadgeCheck className="w-3.5 h-3.5" /> Seña confirmada
      </span>
    ) : status === 'forfeited' ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-danger bg-danger/10 ring-1 ring-danger/20 rounded-md px-2 py-0.5">
        <CircleAlert className="w-3.5 h-3.5" /> Adjudicación liberada
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30 rounded-md px-2 py-0.5">
        <Trophy className="w-3.5 h-3.5" /> Pendiente de seña
      </span>
    );

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <Link
          href={`/${locale}/${audience}/won`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-strong transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Mis subastas ganadas
        </Link>
      </div>

      <header className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
        <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted font-semibold">
          Ganaste · {w.year}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text-strong">
            {w.make} {w.model}
          </h1>
          {statusChip}
        </div>
        <p className="text-sm text-text-muted">
          Precio final ofertado:{' '}
          <span className="text-text-strong font-semibold num-tab">USD {fmtUsd(w.finalPrice)}</span>
        </p>
      </header>

      {status === 'pending_payment' && deadline && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Trophy
              className="w-5 h-5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-300"
              strokeWidth={2.25}
            />
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-text-strong">
                Tu tiempo para formalizar la compra
              </h2>
              <p className="text-sm text-text-muted mt-0.5">
                Transferí la seña antes de que termine el plazo. Si no, la adjudicación se libera y
                el vehículo vuelve al catálogo.
              </p>
            </div>
          </div>
          <Countdown deadlineMs={deadline} locale={locale} />
        </section>
      )}

      {status === 'forfeited' && (
        <section className="rounded-2xl border border-danger/30 bg-danger/[0.06] p-5">
          <p className="text-sm text-text-strong">
            La adjudicación fue liberada porque venció el plazo para la seña. Si querés volver a
            intentar la compra, contactá a Santa Rosa Automotores.
          </p>
        </section>
      )}

      {status === 'paid' && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5">
          <p className="text-sm text-text-strong">
            Recibimos tu seña. Un asesor de Santa Rosa va a contactarte para coordinar la entrega.
          </p>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">
          Datos para la transferencia
        </h2>
        <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev/40 p-5 sm:p-6 space-y-1">
          <div className="flex items-baseline justify-between gap-4 pb-3 mb-3 border-b border-text-subtle/15">
            <span className="text-xs uppercase tracking-[0.12em] text-text-muted">Monto seña</span>
            <span className="text-2xl font-bold tracking-tight text-text-strong num-tab">
              USD {fmtUsd(w.paymentDepositUsd ?? w.finalPrice * w.paymentDepositPercent)}
            </span>
          </div>
          <p className="text-xs text-text-muted -mt-2 mb-3">
            ({depositPct}% del precio final · USD {fmtUsd(w.finalPrice)})
          </p>

          {w.bank.accountHolder || w.bank.bankName || w.bank.bankNamePyg ? (
            <div className="space-y-4">
              {(w.bank.accountHolder || w.bank.ruc) && (
                <div className="divide-y divide-text-subtle/10">
                  {w.bank.accountHolder && (
                    <CopyableField label="Titular" value={w.bank.accountHolder} />
                  )}
                  {w.bank.ruc && <CopyableField label="RUC" value={w.bank.ruc} />}
                </div>
              )}
              {(w.bank.bankName || w.bank.accountNumber) && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-1">
                    Cuenta en dólares (USD)
                  </p>
                  <div className="divide-y divide-text-subtle/10">
                    {w.bank.bankName && <CopyableField label="Banco" value={w.bank.bankName} />}
                    {w.bank.accountType && (
                      <CopyableField label="Tipo de cuenta" value={w.bank.accountType} />
                    )}
                    {w.bank.accountNumber && (
                      <CopyableField label="Número de cuenta" value={w.bank.accountNumber} />
                    )}
                  </div>
                </div>
              )}
              {(w.bank.bankNamePyg || w.bank.accountNumberPyg) && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-1">
                    Cuenta en guaraníes (PYG)
                  </p>
                  <div className="divide-y divide-text-subtle/10">
                    {w.bank.bankNamePyg && (
                      <CopyableField label="Banco" value={w.bank.bankNamePyg} />
                    )}
                    {w.bank.accountTypePyg && (
                      <CopyableField label="Tipo de cuenta" value={w.bank.accountTypePyg} />
                    )}
                    {w.bank.accountNumberPyg && (
                      <CopyableField label="Número de cuenta" value={w.bank.accountNumberPyg} />
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted italic">
              Santa Rosa SA se va a contactar con vos para enviarte los datos de la cuenta.
            </p>
          )}
        </div>

        {w.bank.instructionsEs && (
          <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
            {w.bank.instructionsEs}
          </p>
        )}

        {(w.bank.contactEmail || w.bank.contactPhone) && (
          <p className="text-xs text-text-muted">
            ¿Dudas?{' '}
            {w.bank.contactEmail && (
              <a
                href={`mailto:${w.bank.contactEmail}`}
                className="text-text-strong underline underline-offset-2 hover:text-text-strong"
              >
                {w.bank.contactEmail}
              </a>
            )}
            {w.bank.contactEmail && w.bank.contactPhone && ' · '}
            {w.bank.contactPhone && (
              <a
                href={`tel:${w.bank.contactPhone}`}
                className="text-text-strong underline underline-offset-2"
              >
                {w.bank.contactPhone}
              </a>
            )}
          </p>
        )}
      </section>

      {/* Upload de comprobante. Solo mientras la seña sigue pendiente —
          una vez confirmada (paid) o liberada (forfeited) no tiene sentido
          adjuntar. Si ya subió uno, el componente muestra el estado
          enviado. */}
      {status === 'pending_payment' && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">
            Confirmá tu pago
          </h2>
          <PaymentProofUpload auctionId={auctionId} existingProofUrl={w.paymentProofUrl} />
        </section>
      )}
    </div>
  );
}
