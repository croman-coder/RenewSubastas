'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trophy, Gavel } from 'lucide-react';

// Mirrors the cap enforced server-side in placeBid. Anything above this is a
// typo or abuse; we surface the validation client-side too so the user gets
// immediate feedback without a round-trip.
const MAX_BID_USD = 200_000;

interface Props {
  auctionId: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  startingPrice: number;
  currentBid: number;
  bidIncrement: number;
  currentBidderUid: string | null;
  myUid: string;
  allowManualIncrement: boolean;
}

export function BidPanel({
  auctionId,
  status,
  startingPrice,
  currentBid,
  bidIncrement,
  currentBidderUid,
  myUid,
  allowManualIncrement,
}: Props) {
  const t = useTranslations('buyer.auctions.detail.bidPanel');
  const router = useRouter();
  const minRequired = currentBid > 0 ? currentBid + bidIncrement : startingPrice;
  const [manual, setManual] = useState(String(minRequired));
  const [busy, setBusy] = useState(false);
  const isLive = status === 'live';
  const isWinning = currentBidderUid === myUid && currentBid > 0;

  async function placeBid(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Ingresá un monto válido.');
      return;
    }
    if (amount > MAX_BID_USD) {
      toast.error(`El monto máximo permitido es USD ${MAX_BID_USD.toLocaleString()}.`);
      return;
    }
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'placeBid')({ auctionId, amount });
      toast.success(t('success', { amount: amount.toLocaleString() }));
      router.refresh();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? '';
      const code = (e as { code?: string }).code ?? '';
      if (code.includes('resource-exhausted') || msg.includes('rate limit')) {
        toast.error(t('errors.rateLimit'));
      } else if (msg.includes('exceeds the maximum') || msg.includes('maximum allowed')) {
        toast.error(`El monto máximo permitido es USD ${MAX_BID_USD.toLocaleString()}.`);
      } else if (msg.includes('at least') || msg.includes('below')) {
        toast.error(t('errors.tooLow'));
      } else if (msg.includes('ended') || msg.includes('not live')) {
        toast.error(t('errors.notLive'));
      } else {
        toast.error(t('errors.generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!isLive) {
    return (
      <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev/50 p-5 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-zinc-500/15 text-zinc-400 grid place-items-center">
            <Gavel className="w-4 h-4" strokeWidth={2.5} />
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-text-strong">{t('title')}</h3>
        </div>
        <p className="text-sm text-text-muted">{t('errors.notLive')}</p>
      </div>
    );
  }

  const quickIncrements = [minRequired, minRequired + bidIncrement, minRequired + bidIncrement * 2];

  return (
    <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-md bg-copper/15 text-copper grid place-items-center">
          <Gavel className="w-4 h-4" strokeWidth={2.5} />
        </span>
        <h3 className="text-sm font-semibold tracking-tight text-text-strong">{t('title')}</h3>
      </div>

      {isWinning && (
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 animate-in fade-in zoom-in-95 duration-300">
          <div
            aria-hidden
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-emerald-500/20 blur-2xl pointer-events-none"
          />
          <div className="relative flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-emerald-500/20 grid place-items-center shrink-0">
              <Trophy
                className="w-5 h-5 text-emerald-300"
                strokeWidth={2.5}
                style={{ filter: 'drop-shadow(0 0 6px currentColor)' }}
              />
            </span>
            <div className="min-w-0">
              <p
                className="text-base sm:text-lg font-bold tracking-tight text-emerald-300 leading-tight"
                style={{ textShadow: '0 0 12px rgba(16,185,129,0.45)' }}
              >
                {t('winning')}
              </p>
              <p className="text-xs text-emerald-300/70 mt-0.5">Sos el mejor postor por ahora</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-text-muted num-tab">
        Mínimo:{' '}
        <span className="text-text-strong font-medium">USD {minRequired.toLocaleString()}</span> ·
        Incremento:{' '}
        <span className="text-text-strong font-medium">USD {bidIncrement.toLocaleString()}</span> ·
        Máximo:{' '}
        <span className="text-text-strong font-medium">USD {MAX_BID_USD.toLocaleString()}</span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {quickIncrements.map((amt) => (
          <Button
            key={amt}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => placeBid(amt)}
            className="num-tab"
          >
            USD {amt.toLocaleString()}
          </Button>
        ))}
      </div>
      {allowManualIncrement && (
        <div className="space-y-2 pt-3 border-t border-text-subtle/15">
          <Label htmlFor="manual">{t('amount')}</Label>
          <div className="flex gap-2">
            <Input
              id="manual"
              type="number"
              step="1"
              min={minRequired}
              max={MAX_BID_USD}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              className="num-tab"
            />
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                const n = Number(manual);
                if (Number.isFinite(n)) placeBid(n);
              }}
            >
              {busy ? t('submitting') : t('submit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
