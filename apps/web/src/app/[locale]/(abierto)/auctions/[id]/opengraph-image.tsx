import { ImageResponse } from 'next/og';
import { loadPublicAuction } from '@/lib/buyer/load-public-auction';
import { photoDataUri } from '@/lib/seo/og-photo';
import { formatAmount } from '@/lib/format/money';
import { formatDateTimePy } from '@/lib/format/date';
import { vehicleAlt } from '@/lib/format/vehicle-alt';

export const runtime = 'nodejs';
// En la práctica vale 30 s, no 5 minutos: Next 14.2 baja el revalidate de la
// ruta al del unstable_cache más corto que llama (loadPublicAuction, 30 s), y
// con ese valor se cachea también la foto que baja fetch. La ruta es dinámica
// (ƒ en el build): cada pedido que llega al servidor dibuja la imagen con
// datos de hasta 30 s. Lo que evita dibujarla en cada vista previa es
// CACHE_5_MIN, más abajo.
export const revalidate = 300;
export const alt = 'Vehículo en subasta · Renew Subastas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Cinco minutos en el navegador y en la CDN (spec §7). Sin esto next/og manda
 * `public, immutable, max-age=31536000` y Netlify guarda la imagen un año: la
 * URL no cambia con el precio, así que la vista previa de cada subasta quedaba
 * congelada en su primer precio y en "Abre el…" aunque ya estuviera en vivo
 * (visto el 26/9/2026 en la imagen de la portada: "Netlify Durable", ttl de un
 * año). Va en minúsculas a propósito: ImageResponse pone su valor por defecto
 * bajo esa misma clave y la nuestra lo reemplaza; con otra grafía quedarían
 * los dos valores juntos.
 */
const CACHE_5_MIN = 'public, max-age=300, s-maxage=300, stale-while-revalidate=600';

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
    { ...size, headers: { 'cache-control': CACHE_5_MIN } },
  );
}
