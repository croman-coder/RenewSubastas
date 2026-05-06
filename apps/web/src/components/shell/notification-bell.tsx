'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, Gavel, Sparkles, Inbox } from 'lucide-react';
import {
  collection,
  collectionGroup,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Role } from './nav-config';

interface Props {
  locale: string;
  role: Role;
  /** Stable per-user identity for the lastSeenAt key in localStorage. */
  uid: string;
}

interface NotificationItem {
  id: string;
  /** Unix ms when this happened. */
  ts: number;
  href: string;
  title: string;
  subtitle: string;
}

/**
 * Realtime in-app notifications driven by Firestore listeners.
 *
 * - admin / staff -> last 10 bids across all auctions (collectionGroup 'bids')
 * - buyer         -> last 10 auctions that became scheduled or live
 *
 * "Unread" is anything newer than the last time the user opened the bell,
 * persisted in localStorage so the badge clears across reloads.
 */
export function NotificationBell({ locale, role, uid }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const storageKey = useMemo(() => `carbid:notif:lastSeen:${role}:${uid}`, [role, uid]);
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const v = window.localStorage.getItem(storageKey);
    return v ? Number(v) || 0 : 0;
  });

  useEffect(() => {
    // Auctions feed for buyers, bids feed for admin/staff.
    const isBuyer = role === 'buyer';
    const baseQuery = isBuyer
      ? query(
          collection(fb.db, 'auctions'),
          where('status', 'in', ['scheduled', 'live']),
          orderBy('createdAt', 'desc'),
          limit(10),
        )
      : query(collectionGroup(fb.db, 'bids'), orderBy('createdAt', 'desc'), limit(10));

    const unsub = onSnapshot(
      baseQuery,
      (snap) => {
        const next: NotificationItem[] = snap.docs.map((d) => {
          const data = d.data();
          const ts = (data['createdAt'] as Timestamp | undefined)?.toMillis?.() ?? Date.now();
          if (isBuyer) {
            const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
            return {
              id: d.id,
              ts,
              href: `/${locale}/auctions/${(data['id'] as string) ?? d.id}`,
              title: 'Nueva subasta disponible',
              subtitle: `${(v['make'] as string) ?? '—'} ${(v['model'] as string) ?? ''}`.trim(),
            };
          }
          const buyer = (data['buyerSnapshot'] ?? {}) as {
            firstName?: string;
            lastInitial?: string;
          };
          const auctionId = (data['auctionId'] as string) ?? '';
          const amount = (data['amount'] as number) ?? 0;
          return {
            id: d.id,
            ts,
            href: `/${locale}/staff/auctions/${auctionId}`,
            title: 'Nueva puja',
            subtitle:
              `USD ${amount.toLocaleString()} · ${buyer.firstName ?? 'Buyer'} ${(buyer.lastInitial ?? '').toString()}.`.trim(),
          };
        });
        setItems(next);
      },
      (err) => {
        // Permission denied or missing index — fail closed to keep the bell quiet
        // instead of bubbling up to a render error.
        console.warn('[notifications] listener failed', err);
        setItems([]);
      },
    );
    return () => unsub();
  }, [role, locale]);

  const unread = items.filter((it) => it.ts > lastSeen).length;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && items.length > 0) {
      // Mark everything visible as seen the moment the user opens the panel.
      const newest = items[0]!.ts;
      setLastSeen(newest);
      try {
        window.localStorage.setItem(storageKey, String(newest));
      } catch {
        /* localStorage may be disabled in private browsing */
      }
    }
  }

  const empty = items.length === 0;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ''}`}
        className={
          'relative w-9 h-9 grid place-items-center rounded-lg ' +
          'text-text-muted hover:text-text-strong hover:bg-bg-deep/60 transition-colors ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/40'
        }
      >
        <Bell className="w-5 h-5" strokeWidth={2.25} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-4 text-center num-tab ring-2 ring-bg-elev"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-text-subtle/15">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md bg-copper/10 text-copper grid place-items-center">
              <Bell className="w-3.5 h-3.5" strokeWidth={2.25} />
            </span>
            <h3 className="text-sm font-semibold text-text-strong">Notificaciones</h3>
          </div>
          {unread > 0 && (
            <span className="text-[10px] uppercase tracking-wide text-copper font-semibold">
              {unread} {unread === 1 ? 'nueva' : 'nuevas'}
            </span>
          )}
        </header>
        {empty ? (
          <EmptyState role={role} />
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.map((it) => {
              const isUnread = it.ts > lastSeen;
              return (
                <li key={it.id}>
                  <Link
                    href={it.href as `/${string}`}
                    onClick={() => setOpen(false)}
                    className={
                      'flex gap-3 px-4 py-3 text-sm transition-colors ' +
                      'hover:bg-bg-deep/60 ' +
                      (isUnread ? 'bg-copper/[0.04]' : '')
                    }
                  >
                    <span
                      className={
                        'shrink-0 w-8 h-8 rounded-md grid place-items-center ' +
                        (role === 'buyer'
                          ? 'bg-violet-500/10 text-violet-300'
                          : 'bg-emerald-500/10 text-emerald-300')
                      }
                    >
                      {role === 'buyer' ? (
                        <Sparkles className="w-4 h-4" strokeWidth={2.25} />
                      ) : (
                        <Gavel className="w-4 h-4" strokeWidth={2.25} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={
                          'truncate ' +
                          (isUnread ? 'font-semibold text-text-strong' : 'text-text-strong')
                        }
                      >
                        {it.title}
                      </p>
                      <p className="truncate text-xs text-text-muted">{it.subtitle}</p>
                      <p className="text-[10px] text-text-muted/70 num-tab mt-0.5">
                        {formatRelative(it.ts)}
                      </p>
                    </div>
                    {isUnread && (
                      <span
                        aria-hidden
                        className="self-start mt-1 w-1.5 h-1.5 rounded-full bg-copper"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyState({ role }: { role: Role }) {
  const msg =
    role === 'buyer'
      ? 'Cuando se abran nuevas subastas, te las mostramos acá.'
      : 'Cuando los buyers pujen, aparecerán acá en tiempo real.';
  return (
    <div className="px-6 py-10 text-center">
      <Inbox className="w-8 h-8 mx-auto text-text-muted/50 mb-2" strokeWidth={1.5} />
      <p className="text-xs text-text-muted">{msg}</p>
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'hace unos segundos';
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `hace ${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  const d = Math.floor(diff / 86_400_000);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}
