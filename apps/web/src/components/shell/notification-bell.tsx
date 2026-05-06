'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, Inbox } from 'lucide-react';
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
import { CarbidMark } from '@/components/brand/carbid-mark';
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

  function markAllAsRead() {
    if (items.length === 0) return;
    const newest = items[0]!.ts;
    setLastSeen(newest);
    try {
      window.localStorage.setItem(storageKey, String(newest));
    } catch {
      /* localStorage may be disabled in private browsing */
    }
  }

  const empty = items.length === 0;
  const groups = useMemo(() => groupByDay(items), [items]);

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
          <>
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-ping opacity-75"
            />
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-4 text-center num-tab ring-2 ring-bg-elev"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[22rem] p-0 overflow-hidden rounded-2xl border-text-subtle/15"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-text-subtle/15 bg-bg-elev/60">
          <div className="flex items-center gap-2.5">
            <CarbidMark size={28} ring={false} className="rounded-lg" />
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-text-strong leading-none">
                Notificaciones
              </h3>
              <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted mt-1">
                Últimas notificaciones
              </p>
            </div>
          </div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-[10px] uppercase tracking-[0.08em] text-copper font-semibold hover:text-text-strong transition-colors"
            >
              Marcar como leído
            </button>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted">Al día</span>
          )}
        </header>

        {empty ? (
          <EmptyState role={role} />
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            {groups.map((group, gi) => (
              <div key={group.label}>
                <div className="sticky top-0 z-10 px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] font-semibold text-text-muted/80 bg-bg-elev/95 backdrop-blur border-b border-text-subtle/10">
                  {group.label}
                </div>
                <ul className="py-1">
                  {group.items.map((it, ii) => {
                    const isUnread = it.ts > lastSeen;
                    return (
                      <li key={it.id}>
                        <Link
                          href={it.href as `/${string}`}
                          onClick={() => setOpen(false)}
                          className={
                            'group relative flex gap-3 px-4 py-3 text-sm transition-colors ' +
                            'hover:bg-bg-deep/50 ' +
                            (isUnread ? 'bg-copper/[0.04]' : '')
                          }
                          style={{
                            animationDelay: `${(gi * 4 + ii) * 30}ms`,
                            animationFillMode: 'both',
                          }}
                        >
                          {isUnread && (
                            <span
                              aria-hidden
                              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-copper"
                            />
                          )}
                          <CarbidMark size={40} className="shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p
                              className={
                                'truncate ' +
                                (isUnread ? 'font-semibold text-text-strong' : 'text-text-strong')
                              }
                            >
                              {it.title}
                            </p>
                            <p className="truncate text-xs text-text-muted mt-0.5">{it.subtitle}</p>
                            <p className="text-[10px] text-text-muted/70 num-tab mt-1">
                              {formatStamp(it.ts)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
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
    <div className="px-6 py-12 text-center">
      <Inbox className="w-9 h-9 mx-auto text-text-muted/40 mb-3" strokeWidth={1.5} />
      <p className="text-xs text-text-muted">{msg}</p>
    </div>
  );
}

interface NotificationGroup {
  label: string;
  items: NotificationItem[];
}

/**
 * Splits the notification feed into Today / Yesterday / This week / Earlier
 * sections. Mirrors the visual hierarchy of the reference design (Hoy /
 * Ayer / Semana pasada) so users skim time context, not raw timestamps.
 */
function groupByDay(items: NotificationItem[]): NotificationGroup[] {
  if (items.length === 0) return [];
  const now = new Date();
  const startOfDay = (d: Date) => {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r.getTime();
  };
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 86_400_000;
  // Monday of the current ISO week.
  const dow = (now.getDay() + 6) % 7; // 0..6 with Monday=0
  const weekStart = todayStart - dow * 86_400_000;

  const buckets: Record<string, NotificationItem[]> = {
    Hoy: [],
    Ayer: [],
    'Esta semana': [],
    Anteriores: [],
  };
  for (const it of items) {
    if (it.ts >= todayStart) buckets['Hoy']!.push(it);
    else if (it.ts >= yesterdayStart) buckets['Ayer']!.push(it);
    else if (it.ts >= weekStart) buckets['Esta semana']!.push(it);
    else buckets['Anteriores']!.push(it);
  }
  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, items: list }));
}

function formatStamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const date = d.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  return `${date} ${time}`;
}
