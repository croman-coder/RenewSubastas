'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Trophy, BadgeCheck, CircleAlert, Hourglass } from 'lucide-react';
import { fb } from '@/lib/firebase/client';

interface WinnerContact {
  displayName: string;
  email: string;
  phone: string;
}

interface SaleRow {
  auctionId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  finalPrice: number;
  paymentStatus: 'pending_payment' | 'paid' | 'forfeited' | null;
  paymentDepositUsd: number | null;
  winnerUid: string;
  endedAtMs: number;
}

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Realtime admin sales table. Lists every ended+sold auction with the
 * winning vehicle, final price, deposit, and payment status. Driven by
 * a Firestore onSnapshot so a freshly-closed auction (or an admin
 * marking a deposit paid) appears without a page refresh.
 *
 * Winner identity is resolved lazily per row and cached in component
 * state — we don't block the whole table on N user lookups, each row
 * fills in its buyer name as the read resolves.
 */
export function SalesTable({ locale }: { locale: string }) {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [winners, setWinners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(fb.db, 'auctions'),
      where('status', '==', 'ended'),
      where('outcome', '==', 'sold'),
      orderBy('updatedAt', 'desc'),
      limit(100),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: SaleRow[] = snap.docs.map((d) => {
          const a = d.data();
          const v = (a['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
          return {
            auctionId: d.id,
            make: (v['make'] as string) ?? '',
            model: (v['model'] as string) ?? '',
            year: (v['year'] as number) ?? 0,
            thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
            finalPrice: (a['finalPrice'] as number) ?? 0,
            paymentStatus:
              (a['paymentStatus'] as 'pending_payment' | 'paid' | 'forfeited' | undefined) ?? null,
            paymentDepositUsd: (a['paymentDepositUsd'] as number | undefined) ?? null,
            winnerUid: (a['winnerUid'] as string) ?? '',
            endedAtMs:
              (a['updatedAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
          };
        });
        setRows(next);
        setLoading(false);

        // Resolve any winner names we don't have yet. Winner contact comes
        // from the getWinnerContact callable (validates the uid is the actual
        // winner of that auction and returns only name/email/phone) instead of
        // a direct users read — finanzas no longer has blanket PII access.
        const resolveWinner = httpsCallable<
          { auctionId: string; winnerUid: string },
          WinnerContact
        >(fb.functions, 'getWinnerContact');
        const seen = new Set<string>();
        next
          .filter((r) => r.winnerUid && !winners[r.winnerUid])
          .forEach(async (r) => {
            if (seen.has(r.winnerUid)) return;
            seen.add(r.winnerUid);
            try {
              const { data } = await resolveWinner({
                auctionId: r.auctionId,
                winnerUid: r.winnerUid,
              });
              const name = data.displayName || data.email || r.winnerUid;
              setWinners((prev) => ({ ...prev, [r.winnerUid]: name }));
            } catch {
              setWinners((prev) => ({ ...prev, [r.winnerUid]: r.winnerUid }));
            }
          });
      },
      () => setLoading(false),
    );
    return () => unsub();
    // Intentionally empty deps: the listener is set up once for the
    // component lifetime. `winners` is read inside but only to skip
    // already-resolved lookups; capturing the initial empty map is
    // fine since the setter uses the functional updater form.
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev/30 px-6 py-16 text-center">
        <Trophy className="w-10 h-10 mx-auto text-text-muted/50 mb-3" strokeWidth={1.5} />
        <p className="text-sm text-text-muted">
          Todavía no hay subastas vendidas. Cuando una subasta cierre con ganador, aparece acá en
          tiempo real.
        </p>
      </div>
    );
  }

  return (
    <ul className="stagger-in space-y-3">
      {rows.map((r) => (
        <li
          key={r.auctionId}
          className="hover-lift rounded-xl border border-text-subtle/15 bg-bg-elev/40 p-4 flex items-center gap-4 hover:border-text-subtle/30 hover:bg-bg-elev/60"
        >
          {r.thumbnailUrl ? (
            <img
              src={r.thumbnailUrl}
              alt=""
              className="w-16 h-16 object-cover rounded-lg shrink-0"
            />
          ) : (
            <div className="w-16 h-16 bg-bg-deep rounded-lg shrink-0 grid place-items-center">
              <Trophy className="w-5 h-5 text-text-muted/40" strokeWidth={1.5} />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="font-medium text-text-strong truncate">
              {r.make} {r.model}{' '}
              <span className="text-text-muted num-tab font-normal">{r.year}</span>
            </p>
            <p className="text-sm text-text-strong num-tab font-semibold">
              USD {fmtUsd(r.finalPrice)}
              {r.paymentDepositUsd != null && (
                <span className="text-text-muted font-normal">
                  {' '}
                  · seña USD {fmtUsd(r.paymentDepositUsd)}
                </span>
              )}
            </p>
            <p className="text-xs text-text-muted truncate">
              Ganador: {winners[r.winnerUid] ?? '…'}
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <PaymentBadge status={r.paymentStatus} />
            <Link
              href={`/${locale}/staff/auctions/${r.auctionId}` as `/${string}`}
              className="text-xs text-text-muted hover:text-text-strong underline underline-offset-2"
            >
              Ver detalle
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PaymentBadge({ status }: { status: 'pending_payment' | 'paid' | 'forfeited' | null }) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded px-1.5 py-0.5">
        <BadgeCheck className="w-3 h-3" /> Seña confirmada
      </span>
    );
  }
  if (status === 'forfeited') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-danger bg-danger/10 ring-1 ring-danger/20 rounded px-1.5 py-0.5">
        <CircleAlert className="w-3 h-3" /> Liberada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30 rounded px-1.5 py-0.5">
      <Hourglass className="w-3 h-3" /> Pendiente de seña
    </span>
  );
}
