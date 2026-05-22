'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface BidEntry {
  id: string;
  buyerSnapshot: { firstName: string; lastInitial: string };
  amount: number;
  createdAt: number;
}

interface InitialAuction {
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  thumbnailUrl: string | null;
  startingPrice: number;
  currentBid: number;
  bidCount: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  outcome: 'sold' | 'reserve_not_met' | 'no_bids' | null;
  finalPrice: number | null;
  endsAtMs: number;
  startsAtMs: number;
  winner: { firstName: string; lastName: string; email: string } | null;
  payment: {
    status: 'pending_payment' | 'paid' | 'forfeited' | null;
    depositUsd: number | null;
    deadlineMs: number | null;
    note: string | null;
  };
}

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AuctionDetailView({
  locale,
  auctionId,
  isAdmin,
  initial,
}: {
  locale: string;
  auctionId: string;
  isAdmin: boolean;
  initial: InitialAuction;
}) {
  const t = useTranslations('staff.auctions.detail');
  const tStatus = useTranslations('staff.auctions.status');
  const router = useRouter();
  const [bids, setBids] = useState<BidEntry[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [status, setStatus] = useState(initial.status);
  const [payment, setPayment] = useState(initial.payment);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const canCancel = status === 'scheduled' || status === 'live';
  const isSold = status === 'ended' && initial.outcome === 'sold';

  async function recordPayment(action: 'paid' | 'forfeited') {
    const label = action === 'paid' ? 'Confirmar seña recibida' : 'Liberar adjudicación';
    if (!window.confirm(`¿${label}? Esta acción queda asentada en el audit log.`)) return;
    const note =
      action === 'paid'
        ? (window.prompt('Referencia (opcional): número de transferencia, fecha, etc.', '') ??
          undefined)
        : (window.prompt('Motivo de la liberación (opcional):', '') ?? undefined);
    setPaymentBusy(true);
    try {
      await httpsCallable(
        fb.functions,
        'confirmAuctionPayment',
      )({ auctionId, action, ...(note ? { note } : {}) });
      setPayment((prev) => ({
        ...prev,
        status: action,
        ...(note ? { note } : {}),
      }));
      toast.success(action === 'paid' ? 'Seña confirmada' : 'Adjudicación liberada');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo registrar el cambio');
    } finally {
      setPaymentBusy(false);
    }
  }

  async function handleCancel() {
    if (!canCancel) return;
    const msg =
      status === 'live'
        ? '¿Cancelar esta subasta EN VIVO? Los bids registrados se mantendrán pero la subasta no tendrá ganador.'
        : '¿Cancelar esta subasta programada?';
    if (!window.confirm(msg)) return;
    setCancelling(true);
    try {
      await httpsCallable(fb.functions, 'cancelAuction')({ auctionId });
      setStatus('cancelled');
      toast.success('Subasta cancelada');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo cancelar la subasta');
    } finally {
      setCancelling(false);
    }
  }

  useEffect(() => {
    const q = query(
      collection(fb.db, 'auctions', auctionId, 'bids'),
      orderBy('amount', 'desc'),
      limit(50),
    );
    return onSnapshot(q, (snap) => {
      setBids(
        snap.docs.map((d) => {
          const data = d.data();
          const buyer = (data['buyerSnapshot'] ?? {}) as {
            firstName?: string;
            lastInitial?: string;
          };
          const createdAt =
            (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return {
            id: d.id,
            buyerSnapshot: {
              firstName: buyer.firstName ?? '',
              lastInitial: buyer.lastInitial ?? '',
            },
            amount: (data['amount'] as number) ?? 0,
            createdAt,
          };
        }),
      );
    });
  }, [auctionId]);

  const displayPrice = initial.currentBid > 0 ? initial.currentBid : initial.startingPrice;

  return (
    <div className="max-w-2xl space-y-6">
      <a
        href={`/${locale}/staff/auctions`}
        className="text-sm text-text-muted hover:text-text-strong"
      >
        {t('back')}
      </a>
      <header className="flex items-center gap-4">
        {initial.thumbnailUrl && (
          <img src={initial.thumbnailUrl} alt="" className="w-20 h-20 object-cover rounded" />
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-text-strong">
            {initial.vehicleMake} {initial.vehicleModel} {initial.vehicleYear}
          </h1>
          <Badge variant="secondary">{tStatus(status)}</Badge>
        </div>
        {canCancel && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={cancelling}
            onClick={handleCancel}
          >
            {cancelling ? 'Cancelando…' : 'Cancelar subasta'}
          </Button>
        )}
      </header>
      <section className="space-y-1">
        <p className="text-text-muted text-sm">{t('currentBid')}</p>
        <p className="text-3xl font-semibold num-tab">USD {fmtUsd(displayPrice)}</p>
        <p className="text-text-muted text-sm">
          {t('ends')}: {new Date(initial.endsAtMs).toLocaleString(locale)}
        </p>
      </section>

      {isSold && (
        <section className="rounded-2xl border border-text-subtle/15 bg-bg-elev/40 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-text-strong">Pago y seña</h2>
              <p className="text-xs text-text-muted">
                Ganador:{' '}
                <span className="text-text-strong font-medium">
                  {initial.winner ? `${initial.winner.firstName} ${initial.winner.lastName}` : '—'}
                </span>{' '}
                {initial.winner?.email && (
                  <a
                    href={`mailto:${initial.winner.email}`}
                    className="text-text-strong underline underline-offset-2"
                  >
                    {initial.winner.email}
                  </a>
                )}
              </p>
            </div>
            <PaymentStatusBadge status={payment.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-text-muted">Monto seña</p>
              <p className="text-text-strong font-medium num-tab">
                {payment.depositUsd != null ? `USD ${fmtUsd(payment.depositUsd)}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-text-muted">Plazo</p>
              <p className="text-text-strong num-tab">
                {payment.deadlineMs
                  ? new Date(payment.deadlineMs).toLocaleString(locale, {
                      timeZone: 'America/Asuncion',
                    })
                  : '—'}
              </p>
            </div>
          </div>

          {payment.note && (
            <p className="text-xs text-text-muted bg-bg-deep/40 rounded-md px-3 py-2">
              Nota: {payment.note}
            </p>
          )}

          {isAdmin && payment.status !== 'paid' && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                size="sm"
                disabled={paymentBusy}
                onClick={() => recordPayment('paid')}
              >
                {paymentBusy ? 'Guardando…' : 'Confirmar seña recibida'}
              </Button>
              {payment.status !== 'forfeited' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paymentBusy}
                  onClick={() => recordPayment('forfeited')}
                >
                  Liberar adjudicación
                </Button>
              )}
            </div>
          )}
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-lg font-medium text-text-strong">{t('bidsTitle')}</h2>
        {bids.length === 0 ? (
          <p className="text-text-muted text-sm">{t('noBidsYet')}</p>
        ) : (
          <ul className="divide-y divide-text-subtle/20 border border-text-subtle/20 rounded">
            {bids.map((b) => (
              <li key={b.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {b.buyerSnapshot.firstName} {b.buyerSnapshot.lastInitial}.
                </span>
                <span className="num-tab">
                  USD {b.amount.toLocaleString()}
                  <span className="text-text-muted text-xs ml-2">
                    {new Date(b.createdAt).toLocaleTimeString(locale)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PaymentStatusBadge({
  status,
}: {
  status: 'pending_payment' | 'paid' | 'forfeited' | null;
}) {
  if (status === 'paid') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30 border-0">
        Seña confirmada
      </Badge>
    );
  }
  if (status === 'forfeited') {
    return (
      <Badge className="bg-danger/15 text-danger ring-1 ring-danger/30 border-0">Liberada</Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30 border-0">
      Pendiente
    </Badge>
  );
}
