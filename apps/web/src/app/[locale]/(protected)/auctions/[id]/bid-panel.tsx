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

// Snap to cents. Existing dirty data (e.g. a currentBid that ended up as
// 16002.55555555 from a previous bug) would otherwise propagate into the
// next minRequired and into the quick-bid buttons.
const toCents = (n: number) => Math.round(n * 100) / 100;
const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const minRequired = toCents(currentBid > 0 ? currentBid + bidIncrement : startingPrice);
  const [manual, setManual] = useState(minRequired.toFixed(2));
  const [busy, setBusy] = useState(false);
  const isLive = status === 'live';
  const isWinning = currentBidderUid === myUid && currentBid > 0;

  async function placeBid(rawAmount: number) {
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      toast.error('Ingresá un monto válido.');
      return;
    }
    // Snap to cents before sending so the server's 2-decimal validator never
    // rejects a perfectly-intentional bid because of float arithmetic.
    const amount = toCents(rawAmount);
    if (amount > MAX_BID_USD) {
      toast.error(`El monto máximo permitido es USD ${fmtUsd(MAX_BID_USD)}.`);
      return;
    }
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'placeBid')({ auctionId, amount });
      toast.success(t('success', { amount: fmtUsd(amount) }));
      router.refresh();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? '';
      const code = (e as { code?: string }).code ?? '';
      if (code.includes('resource-exhausted') || msg.includes('rate limit')) {
        toast.error(t('errors.rateLimit'));
      } else if (msg.includes('exceeds the maximum') || msg.includes('maximum allowed')) {
        toast.error(`El monto máximo permitido es USD ${fmtUsd(MAX_BID_USD)}.`);
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

  const quickIncrements = [
    minRequired,
    toCents(minRequired + bidIncrement),
    toCents(minRequired + bidIncrement * 2),
  ];

  // Delta labels for the quick-bid chips: first is the minimum, the
  // next two show how far above the minimum they jump (+inc, +2·inc).
  const quickMeta = [
    { amt: quickIncrements[0]!, tag: 'Mínimo' },
    { amt: quickIncrements[1]!, tag: `+${fmtUsd(bidIncrement)}` },
    { amt: quickIncrements[2]!, tag: `+${fmtUsd(bidIncrement * 2)}` },
  ];

  return (
    <div className="ink-mesh rounded-2xl border border-text-subtle/15 bg-bg-elev/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-md bg-text-strong text-bg-base grid place-items-center">
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

      {/* Min / Increment / Max as three compact stat tiles — easier to
          scan than a cramped run-on sentence. */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Mínimo" value={`USD ${fmtUsd(minRequired)}`} strong />
        <StatTile label="Incremento" value={`USD ${fmtUsd(bidIncrement)}`} />
        <StatTile label="Máximo" value={`USD ${fmtUsd(MAX_BID_USD)}`} />
      </div>

      {/* Quick-bid chips: prominent amount + a small delta tag so the
          buyer knows what each jump costs at a glance. The first chip
          (minimum) is filled ink as the recommended one-tap action. */}
      <div className="grid grid-cols-3 gap-2">
        {quickMeta.map((q, i) => (
          <button
            key={q.amt}
            type="button"
            disabled={busy}
            onClick={() => placeBid(q.amt)}
            className={
              'group rounded-xl px-2 py-2.5 text-center transition-all duration-200 ' +
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] ' +
              (i === 0
                ? 'bg-text-strong text-bg-base hover:opacity-90'
                : 'border border-text-subtle/25 text-text-strong hover:border-text-strong/50 hover:bg-bg-deep/40')
            }
          >
            <span className="block text-[10px] uppercase tracking-[0.06em] opacity-70">
              {q.tag}
            </span>
            <span className="block num-tab text-sm font-semibold mt-0.5">USD {fmtUsd(q.amt)}</span>
          </button>
        ))}
      </div>

      {allowManualIncrement && (
        <div className="space-y-2 pt-3 border-t border-text-subtle/15">
          <Label htmlFor="manual" className="text-xs uppercase tracking-[0.08em] text-text-muted">
            {t('amount')}
          </Label>
          {/* USD prefix sits inside the field so the input reads as a
              currency amount, and the submit is a full-width primary
              CTA below — bigger tap target, clearer hierarchy. */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted pointer-events-none">
              USD
            </span>
            <Input
              id="manual"
              type="number"
              step="0.01"
              inputMode="decimal"
              min={minRequired}
              max={MAX_BID_USD}
              value={manual}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d+(\.\d{0,2})?$/.test(v)) setManual(v);
              }}
              onBlur={() => {
                const n = Number(manual);
                if (Number.isFinite(n) && n > 0) setManual(toCents(n).toFixed(2));
              }}
              className="num-tab h-12 pl-12 text-lg font-semibold"
            />
          </div>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              const n = Number(manual);
              if (Number.isFinite(n)) placeBid(n);
            }}
            className="w-full h-12 text-base"
          >
            {busy ? (
              t('submitting')
            ) : (
              <>
                <Gavel className="w-4 h-4 mr-1.5" strokeWidth={2.5} /> {t('submit')}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        'rounded-xl px-2.5 py-2 ' +
        (strong
          ? 'bg-text-strong/[0.06] ring-1 ring-text-subtle/25'
          : 'bg-bg-deep/40 ring-1 ring-text-subtle/10')
      }
    >
      <p className="text-[9px] uppercase tracking-[0.08em] text-text-muted font-semibold">
        {label}
      </p>
      <p className="num-tab text-xs font-semibold text-text-strong mt-0.5 truncate">{value}</p>
    </div>
  );
}
