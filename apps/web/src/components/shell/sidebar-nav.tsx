'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Users,
  Car,
  Gavel,
  ClipboardList,
  Settings,
  Heart,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { IconKey, NavItem } from './nav-config';

const ICON_MAP: Record<IconKey, LucideIcon> = {
  home: Home,
  users: Users,
  car: Car,
  gavel: Gavel,
  audit: ClipboardList,
  settings: Settings,
  heart: Heart,
  trophy: Trophy,
};

interface Props {
  items: NavItem[];
  /** Called when a nav item is activated (used by the mobile drawer to close itself). */
  onNavigate?: () => void;
}

export function SidebarNav({ items, onNavigate }: Props) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="space-y-1">
      {items.map((it) => {
        const active = isActive(pathname, it.href, it.exact);
        const Icon = ICON_MAP[it.icon];
        return (
          <Link
            key={it.href}
            href={it.href as `/${string}`}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            {...(active ? { 'aria-current': 'page' as const } : {})}
            className={
              'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ' +
              'transition-all duration-200 ' +
              (active
                ? 'bg-copper/10 text-copper'
                : 'text-text-muted hover:text-text-strong hover:bg-bg-elev/60')
            }
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-copper"
              />
            )}
            <Icon
              className={
                'w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ' +
                (active ? 'text-copper' : '')
              }
              strokeWidth={active ? 2.5 : 2}
            />
            <span className="truncate">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function isActive(pathname: string | null, href: string, exact: boolean | undefined): boolean {
  if (!pathname) return false;
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}
