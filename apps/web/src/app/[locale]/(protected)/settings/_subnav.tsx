'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SettingsSubnav({ items }: { items: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Configuración"
      className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none"
    >
      <ul className="flex gap-1 border-b border-text-subtle/15 min-w-max md:min-w-0">
        {items.map((it) => {
          const active = pathname === it.href || pathname?.startsWith(it.href + '/');
          return (
            <li key={it.href}>
              <Link
                href={it.href as `/${string}`}
                aria-current={active ? 'page' : undefined}
                className={
                  'inline-block px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ' +
                  (active
                    ? 'border-copper text-copper'
                    : 'border-transparent text-text-muted hover:text-text-strong')
                }
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
