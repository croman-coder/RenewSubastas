import { notFound, redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/server';
import { loadAuction } from '@/lib/buyer/load-auction';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { auctionPath } from '@/lib/buyer/public-auction';
import { AuctionDetailView } from './auction-detail-view';
import { ViewTracker } from '@/components/insights/view-tracker';

interface Props {
  params: { locale: string; id: string };
}

export default async function AuctionDetailPage({ params: { locale, id } }: Props) {
  const user = await getOptionalUser();
  if (!user) {
    // Igual que antes de que esta ruta saliera de (protected); la Task 6 lo
    // reemplaza por la vista pública.
    redirect(`/${locale}/login?from=${encodeURIComponent(auctionPath(locale, id))}`);
  }

  const [auction, config] = await Promise.all([loadAuction(id), loadAppConfigSnapshot()]);
  if (!auction) notFound();
  // loadAuction lee con el Admin SDK, que se saltea firestore.rules —
  // replicamos el mismo gate de audience que imponen las reglas para que un
  // comprador retail no llegue a una subasta wholesale (precio, VIN, chapa)
  // solo por conocer su id. Staff/admin/finanzas ven todo, igual que las
  // reglas.
  if (user.role === 'buyer' && auction.audience !== (user.audience ?? 'retail')) notFound();

  return (
    <>
      <ViewTracker auctionId={id} />
      <AuctionDetailView
        locale={locale}
        initial={auction}
        myUid={user.uid}
        allowManualIncrement={config.bid.allowManualIncrement}
        financingConfig={config.financing}
        currencyConfig={config.currency}
      />
    </>
  );
}
