import { ImageResponse } from 'next/og';
import { loadPublicAuction } from '@/lib/buyer/load-public-auction';
import { photoDataUri } from '@/lib/seo/og-photo';
import { formatAmount } from '@/lib/format/money';
import { formatDateTimePy } from '@/lib/format/date';
import { vehicleAlt } from '@/lib/format/vehicle-alt';

export const runtime = 'nodejs';
// Se regenera como mucho cada 5 minutos por subasta (spec §7): alcanza para el
// precio de una vista previa reenviada por WhatsApp y es barato para Netlify.
export const revalidate = 300;
export const alt = 'Vehículo en subasta · Renew Subastas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params: { id } }: { params: { id: string } }) {
  // Una subasta mayorista o un id desconocido reciben la tarjeta genérica: no se filtra nada privado.
  const d = await loadPublicAuction(id);
  const photo = d?.images[0] ? await photoDataUri(d.images[0].url) : null;
  const title = d
    ? vehicleAlt(d.make, d.model, d.year)
    : 'Subastas de vehículos usados certificados';
  const price = d ? `USD ${formatAmount(d.currentBid > 0 ? d.currentBid : d.startingPrice)}` : '';
  const when =
    d?.status === 'live'
      ? `Cierra el ${formatDateTimePy('es', d.endsAtMs)}`
      : d?.status === 'scheduled'
        ? `Abre el ${formatDateTimePy('es', d.startsAtMs)}`
        : '';

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: '#0a0a0a' }}>
      {photo ? (
        <img src={photo} width={630} height={630} style={{ objectFit: 'cover' }} alt="" />
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '56px 56px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            letterSpacing: 5,
            color: '#a1a1aa',
            textTransform: 'uppercase',
          }}
        >
          Renew Subastas
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 58,
              lineHeight: 1.05,
              fontWeight: 700,
              color: '#fafafa',
            }}
          >
            {title}
          </div>
          {price ? (
            <div
              style={{
                display: 'flex',
                marginTop: 20,
                fontSize: 44,
                fontWeight: 700,
                color: '#fafafa',
              }}
            >
              {price}
            </div>
          ) : null}
          {when ? (
            <div style={{ display: 'flex', marginTop: 12, fontSize: 28, color: '#a1a1aa' }}>
              {when}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#71717a' }}>renewsubastas.com.py</div>
      </div>
    </div>,
    size,
  );
}
