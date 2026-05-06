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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">{t('errors.notLive')}</p>
        </CardContent>
      </Card>
    );
  }

  const quickIncrements = [minRequired, minRequired + bidIncrement, minRequired + bidIncrement * 2];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isWinning && <p className="text-sm text-success font-medium">{t('winning')}</p>}
        <p className="text-xs text-text-muted">
          {t('minRequired', { amount: minRequired.toLocaleString() })} ·{' '}
          {t('increment', { amount: bidIncrement.toLocaleString() })}
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
          <div className="space-y-2 pt-2 border-t border-text-subtle/20">
            <Label htmlFor="manual">{t('amount')}</Label>
            <div className="flex gap-2">
              <Input
                id="manual"
                type="number"
                step="1"
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
      </CardContent>
    </Card>
  );
}
