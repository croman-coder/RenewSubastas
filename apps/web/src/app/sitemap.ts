import type { MetadataRoute } from 'next';
import { buildSitemap } from '@/lib/seo/sitemap-entries';
import { listLandingAuctions } from '@/lib/buyer/landing-auctions';

// En la práctica se regenera como mucho cada 60 s, no cada hora: Next 14.2 baja
// el revalidate de la ruta al del unstable_cache más corto que llama, y la
// lista del landing (listLandingAuctions) cachea 60 s. Es aceptable porque
// solo se regenera cuando un buscador pide el sitemap, y así una subasta nueva
// aparece antes. El 3600 queda como techo.
export const revalidate = 3600;

/**
 * La portada y las páginas legales, más cada subasta minorista abierta, que
 * tiene página pública (spec 2026-09-26). Si no se puede leer el catálogo,
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
