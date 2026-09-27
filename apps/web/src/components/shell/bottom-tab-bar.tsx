'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ICON_MAP, isActive } from './sidebar-nav';
import type { NavItem } from './nav-config';

// La ficha de una subasta (/es/auctions/abc): ahí manda la barra fija de
// puja (BidDock) y dos barras apiladas le quitarían media pantalla al auto.
const AUCTION_DETAIL = /^\/[^/]+\/auctions\/[^/]+$/;

/**
 * Pestañas del comprador en el celular (spec 2026-09-27 §3 y §5.1): los
 * cuatro destinos del menú lateral al alcance del pulgar, en lugar de la
 * hamburguesa. Sólida (bg-elev + hairline), sin vidrio.
 *
 * Inactivas en text-muted y no text-subtle como decía la spec: a 11 px,
 * subtle sobre bg-elev no llega a AA. La activa se distingue por la barra de
 * tinta de 3 px, text-strong y el trazo más grueso.
 */
export function BottomTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (pathname && AUCTION_DETAIL.test(pathname)) return null;

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-text-subtle/15 bg-bg-elev pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid h-16 grid-cols-4">
        {items.map((it) => {
          const active = isActive(pathname, it.href, it.exact);
          const Icon = ICON_MAP[it.icon];
          return (
            <li key={it.href} className="min-w-0">
              <Link
                href={it.href as `/${string}`}
                prefetch
                {...(active ? { 'aria-current': 'page' as const } : {})}
                className={
                  'relative flex h-16 flex-col items-center justify-center gap-1 ' +
                  'text-[11px] font-semibold [touch-action:manipulation] ' +
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-strong/40 ' +
                  (active ? 'text-text-strong' : 'text-text-muted hover:text-text-strong')
                }
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 rounded-b-full bg-text-strong"
                  />
                )}
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                <span className="max-w-full truncate px-1">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
