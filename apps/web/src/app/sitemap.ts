import type { MetadataRoute } from 'next';
import { buildSitemap } from '@/lib/seo/sitemap-entries';
import { listLandingAuctions } from '@/lib/buyer/landing-auctions';

// Como mucho una vez por hora: las subastas entran y salen, las páginas fijas no.
export const revalidate = 3600;

/**
 * La portada y las páginas legales, más cada subasta minorista abierta (que
 * tiene página pública desde el 26/9/2026). Si no se puede leer el catálogo,
 * igual sale la parte fija en lugar de fallar el sitemap entero.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await listLandingAuctions().catch((err: unknown) => {
    // Se registra para que una caída del catálogo no pase inadvertida: el
    // sitemap seguiría saliendo, pero sin ninguna subasta.
    console.error('[sitemap] no se pudo leer el catálogo', err);
    return [];
  });
  const open = items
    .filter((a) => a.status === 'live' || a.status === 'scheduled')
    .map((a) => a.id);
  return buildSitemap(open, new Date());
}
