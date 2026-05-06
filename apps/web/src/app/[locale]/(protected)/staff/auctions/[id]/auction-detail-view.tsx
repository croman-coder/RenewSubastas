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
  endsAtMs: number;
  startsAtMs: number;
}

export function AuctionDetailView({
  locale,
  auctionId,
  initial,
}: {
  locale: string;
  auctionId: string;
  initial: InitialAuction;
}) {
  const t = useTranslations('staff.auctions.detail');
  const tStatus = useTranslations('staff.auctions.status');
  const router = useRouter();
  const [bids, setBids] = useState<BidEntry[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [status, setStatus] = useState(initial.status);
  const canCancel = status === 'scheduled' || status === 'live';

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
        <p className="text-3xl font-semibold num-tab">USD {displayPrice.toLocaleString()}</p>
        <p className="text-text-muted text-sm">
          {t('ends')}: {new Date(initial.endsAtMs).toLocaleString(locale)}
        </p>
      </section>
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
