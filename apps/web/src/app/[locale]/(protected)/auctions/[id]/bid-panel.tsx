'use client';
import { useState, type ReactNode } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trophy, Gavel } from 'lucide-react';
import { BlurNumber } from '@/components/brand/blur-number';
import { SoldBanner } from '@/components/auctions/sold-banner';
import { didBuyerWinAuction } from '@/lib/auctions/win-state';
import { classifyBuyNowError } from '@/lib/auctions/buy-now-error';
import { isSoldOutcome } from '@/lib/auctions/sold-outcome';

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
  /** endsAt in ms. When it has passed, the auction is effectively over even
   *  if the scheduled tick hasn't flipped status to 'ended' yet. */
  endsAtMs: number;
  startingPrice: number;
  currentBid: number;
  bidCount: number;
  bidIncrement: number;
  currentBidderUid: string | null;
  /** Authoritative outcome/winner, written only by closeAuctionAsSold. Used
   *  for "did I win", never for "am I currently leading" — see iWon below. */
  outcome: string | null;
  winnerUid: string | null;
  /** Precio de compra directa. null cuando la subasta no la admite. */
  buyNowPrice: number | null;
  make: string;
  model: string;
  year: number;
  myUid: string;
  allowManualIncrement: boolean;
}

export function BidPanel({
  auctionId,
  status,
  endsAtMs,
  startingPrice,
  currentBid,
  bidCount,
  bidIncrement,
  currentBidderUid,
  outcome,
  winnerUid,
  buyNowPrice,
  make,
  model,
  year,
  myUid,
  allowManualIncrement,
}: Props) {
  const t = useTranslations('buyer.auctions.detail.bidPanel');
  const router = useRouter();
  const locale = (useParams().locale as string) ?? 'es';
  const minRequired = toCents(currentBid > 0 ? currentBid + bidIncrement : startingPrice);
  const [manual, setManual] = useState(minRequired.toFixed(2));
  const [busy, setBusy] = useState(false);
  // Amount staged for confirmation; null when the confirm dialog is closed.
  // Placing a bid is irreversible and money-critical, so neither the
  // quick-bid chips nor the manual submit call the network directly — they
  // stage the amount here and the dialog gates the actual call.
  const [pendingBid, setPendingBid] = useState<number | null>(null);
  // Gates the "Compra ya" confirmation dialog. Separate from pendingBid: a
  // buy-now has no amount to stage (the price is fixed), just a yes/no.
  const [confirmBuyNow, setConfirmBuyNow] = useState(false);
  // Time-based end: the status field flips to 'ended' only on the next
  // scheduled tick (up to ~1 min late). The clock is the source of truth for
  // whether bidding is still open, so we close the panel as soon as endsAt
  // passes instead of waiting for the tick.
  const timeEnded = Date.now() >= endsAtMs;
  const isLive = status === 'live' && !timeEnded;
  const ended = status === 'ended' || status === 'cancelled' || timeEnded;
  // "Va ganando" is still the highest bidder while the auction runs. "Ganó"
  // is not: only an adjudicated `outcome: 'sold'` close counts, so a
  // showroom sale (or any other non-sold close) never congratulates whoever
  // happened to be leading — see win-state.ts.
  const isWinning = currentBidderUid === myUid && currentBid > 0;
  const iWon = didBuyerWinAuction({ ended, outcome, winnerUid, myUid });
  // For everyone who isn't the winner: a unit that sold (on the platform or
  // in the showroom) is a materially different fact from one that simply
  // ran out with no sale (reserve_not_met/no_bids/cancelled), and this panel
  // used to say "Subasta finalizada." for all four alike — the same gap the
  // catalog cards' SoldBanner exists to close, just reached by a direct link
  // to the detail page instead of the catalog.
  const isSold = isSoldOutcome(outcome);
  const canBuyNow = buyNowPrice !== null && bidCount === 0;
  // Shared by the Compra ya card and the confirmation dialog so both always
  // show the exact same figure. '' only when canBuyNow is false, in which
  // case nothing that reads it is rendered.
  const buyNowPriceLabel = buyNowPrice !== null ? buyNowPrice.toLocaleString('es-PY') : '';

  // The buy-now callable closes the auction outright — no amount to stage,
  // just a confirmation. Kept separate from submitBid: different callable,
  // different success copy, and a different (yes/no, not amount) dialog.
  async function doBuyNow() {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'buyNow')({ auctionId });
      toast.success('¡Compra confirmada! Revisá tu correo para abonar la seña.');
      router.refresh();
    } catch (e) {
      const classification = classifyBuyNowError(e as { code?: string; message?: string });
      if (classification.kind === 'profile_incomplete') {
        toast.error(t('errors.profileIncomplete'), {
          action: {
            label: t('errors.profileIncompleteCta'),
            onClick: () => router.push(`/${locale}/settings/profile`),
          },
        });
      } else {
        toast.error(classification.text);
      }
    } finally {
      setBusy(false);
      setConfirmBuyNow(false);
    }
  }

  // The actual network call, extracted out of the old placeBid so the
  // confirmation dialog's confirm button can invoke it directly. Error
  // handling, the busy state and the toasts are unchanged from before.
  async function submitBid(amount: number) {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'placeBid')({ auctionId, amount });
      toast.success(t('success', { amount: fmtUsd(amount) }));
      // No router.refresh() here: the auction detail subscribes to the
      // auction doc via onSnapshot, so the new price, bid count and end time
      // stream in on their own. Forcing an RSC refetch added a full
      // server round-trip that kept the button in "Pujando…" long after the
      // bid had already landed.
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
      } else if (msg.includes('profile_incomplete')) {
        toast.error(t('errors.profileIncomplete'), {
          action: {
            label: t('errors.profileIncompleteCta'),
            onClick: () => router.push(`/${locale}/settings/profile`),
          },
        });
      } else {
        toast.error(t('errors.generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  // Validates the amount and stages it for confirmation instead of
  // submitting straight away — bidding is irreversible and money-critical,
  // so a single mis-tap (quick-bid chips are a tight grid on mobile) should
  // never be enough to fire it. submitBid runs only once the user confirms.
  function placeBid(rawAmount: number) {
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
    setPendingBid(amount);
  }

  async function confirmPendingBid() {
    if (pendingBid === null) return;
    await submitBid(pendingBid);
    setPendingBid(null);
  }

  if (!isLive) {
    // Auction over and this buyer holds the top bid -> they won.
    if (iWon) {
      return (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 animate-in fade-in zoom-in-95 duration-300">
          <div
            aria-hidden
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none"
          />
          <div className="relative flex items-start gap-3">
            <span className="w-10 h-10 rounded-full bg-emerald-500/20 grid place-items-center shrink-0">
              <Trophy
                className="w-5 h-5 text-emerald-700 dark:text-emerald-300"
                strokeWidth={2.5}
                style={{ filter: 'drop-shadow(0 0 6px currentColor)' }}
              />
            </span>
            <div className="min-w-0">
              <p
                className="text-lg font-bold tracking-tight text-emerald-700 dark:text-emerald-300 leading-tight"
                style={{ textShadow: '0 0 12px rgba(16,185,129,0.45)' }}
              >
                ¡Ganaste la subasta!
              </p>
              <p className="text-sm text-emerald-700/80 dark:text-emerald-300/70 mt-1 leading-relaxed">
                Adjudicaste este vehículo por USD {fmtUsd(currentBid)}. Te enviamos los pasos para
                pagar la seña por correo.
              </p>
            </div>
          </div>
        </div>
      );
    }
    // Sold to someone else (platform sale) or sold in the showroom: this
    // buyer didn't win, but the unit is unambiguously gone — the same mark
    // the catalog cards use, not the generic "nothing to report" box below.
    // An unsold, closed auction (reserve_not_met/no_bids/cancelled) and a
    // sold one are different facts and must not read the same on the one
    // page a buyer can land on directly from a shared link.
    if (isSold) {
      return <SoldBanner variant="detail" />;
    }
    return (
      <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev/50 p-5 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-zinc-500/15 text-zinc-400 grid place-items-center">
            <Gavel className="w-4 h-4" strokeWidth={2.5} />
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-text-strong">{t('title')}</h3>
        </div>
        <p className="text-sm text-text-muted">
          {ended ? 'Subasta finalizada.' : t('errors.notLive')}
        </p>
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

  // Reuses the same fmtUsd formatting the rest of the panel uses so the
  // confirmation dialog shows the exact amount that will be submitted.
  const pendingAmountLabel = pendingBid !== null ? fmtUsd(pendingBid) : '';

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
                className="w-5 h-5 text-emerald-700 dark:text-emerald-300"
                strokeWidth={2.5}
                style={{ filter: 'drop-shadow(0 0 6px currentColor)' }}
              />
            </span>
            <div className="min-w-0">
              <p
                className="text-base sm:text-lg font-bold tracking-tight text-emerald-700 dark:text-emerald-300 leading-tight"
                style={{ textShadow: '0 0 12px rgba(16,185,129,0.45)' }}
              >
                {t('winning')}
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300/70 mt-0.5">
                Sos el mejor postor por ahora
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Compra ya: only while nobody has bid yet — the moment a first bid
          lands, the price is set by competition instead, and the button
          must disappear (canBuyNow already folds in bidCount === 0). */}
      {canBuyNow && (
        <>
          <div className="rounded-xl border border-copper/30 bg-copper/[0.06] p-4 space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
                Compra ya
              </p>
              <p className="mt-0.5 text-2xl font-semibold num-tab tracking-tight text-text-strong">
                USD {buyNowPriceLabel}
              </p>
            </div>
            <Button type="button" className="w-full" onClick={() => setConfirmBuyNow(true)}>
              Comprar ahora
            </Button>
            <p className="text-xs text-text-muted">Cerrás la compra al instante.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-text-subtle/20" />o pujá
            <span className="h-px flex-1 bg-text-subtle/20" />
          </div>
        </>
      )}

      {/* Min / Increment / Max as three compact stat tiles — easier to
          scan than a cramped run-on sentence. */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Mínimo"
          value={
            <>
              USD <BlurNumber value={minRequired} format={fmtUsd} />
            </>
          }
          strong
        />
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
              'group rounded-xl px-2 py-2.5 text-center transition-[background-color,border-color,opacity,transform] duration-200 ' +
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
              type="text"
              inputMode="decimal"
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

      <Dialog
        open={pendingBid !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingBid(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar puja</DialogTitle>
            <DialogDescription>
              Vas a pujar USD {pendingAmountLabel} por este vehículo. Las pujas son en firme y no se
              pueden retirar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingBid(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy} onClick={confirmPendingBid}>
              {busy ? t('submitting') : 'Confirmar puja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Separate from the bid-confirm dialog above: a buy-now has a fixed
          price (nothing to stage), and a click here costs thousands of
          dollars instantly instead of just placing a bid, so the vehicle and
          price are spelled out explicitly rather than left implicit. */}
      <Dialog
        open={confirmBuyNow}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmBuyNow(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar compra</DialogTitle>
            <DialogDescription>
              Vas a comprar el {make} {model} {year} por USD {buyNowPriceLabel}. La subasta cierra
              al instante y tenés 24 h para abonar la seña.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmBuyNow(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy} onClick={doBuyNow}>
              {busy ? 'Comprando…' : 'Confirmar compra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
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
