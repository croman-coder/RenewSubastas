'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, collectionGroup, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Gavel, AlertTriangle, Mail, MailX, MailCheck } from 'lucide-react';
import { fb } from '@/lib/firebase/client';

interface BidRow {
  id: string;
  auctionId: string;
  buyerUid: string;
  buyerFallback: string;
  amount: number;
  createdAtMs: number;
  displacedBuyerUid: string | null;
}
interface NotifRow {
  status: 'sent' | 'skipped' | 'failed';
  reason: string | null;
}
interface BidderContact {
  displayName: string;
  email: string;
  phone: string;
}

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

export function BidsActivity({ locale }: { locale: string }) {
  const [bids, setBids] = useState<BidRow[]>([]);
  const [notifs, setNotifs] = useState<Record<string, NotifRow>>({});
  const [contacts, setContacts] = useState<Record<string, BidderContact>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Live feed of the latest bids across all auctions.
  useEffect(() => {
    const q = query(collectionGroup(fb.db, 'bids'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snap) => {
        setBids(
          snap.docs.map((d) => {
            const a = d.data();
            const bs = (a['buyerSnapshot'] ?? {}) as { firstName?: string; lastInitial?: string };
            return {
              id: d.id,
              auctionId: (a['auctionId'] as string) ?? '',
              buyerUid: (a['buyerUid'] as string) ?? '',
              buyerFallback: `${bs.firstName ?? ''} ${bs.lastInitial ?? ''}`.trim() || '—',
              amount: (a['amount'] as number) ?? 0,
              createdAtMs:
                (a['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
              displacedBuyerUid: (a['displacedBuyerUid'] as string | undefined) ?? null,
            };
          }),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  // Live notification log (colours the "Aviso" column and the failed card).
  useEffect(() => {
    const q = query(collection(fb.db, 'notifications'), orderBy('createdAt', 'desc'), limit(200));
    return onSnapshot(
      q,
      (snap) => {
        const next: Record<string, NotifRow> = {};
        snap.docs.forEach((d) => {
          const n = d.data();
          const bidId = (n['bidId'] as string | null) ?? null;
          if (bidId) {
            next[bidId] = {
              status: (n['status'] as NotifRow['status']) ?? 'sent',
              reason: (n['reason'] as string | null) ?? null,
            };
          }
        });
        setNotifs(next);
      },
      () => {},
    );
  }, []);

  // Resolve bidder names/contact in batches, cached by uid.
  useEffect(() => {
    const missing = Array.from(
      new Set(bids.map((b) => b.buyerUid).filter((u) => u && !contacts[u])),
    );
    if (missing.length === 0) return;
    const resolve = httpsCallable<{ uids: string[] }, Record<string, BidderContact>>(
      fb.functions,
      'resolveBidders',
    );
    resolve({ uids: missing.slice(0, 50) })
      .then(({ data }) => setContacts((prev) => ({ ...prev, ...data })))
      .catch(() => {});
  }, [bids, contacts]);

  const failedCount = useMemo(
    () => Object.values(notifs).filter((n) => n.status === 'failed').length,
    [notifs],
  );
  const todayCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return bids.filter((b) => b.createdAtMs >= start.getTime()).length;
  }, [bids]);
  const activeBidders = useMemo(
    () => new Set(bids.map((b) => b.buyerUid).filter(Boolean)).size,
    [bids],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Metric label="Pujas hoy" value={String(todayCount)} />
        <Metric label="Pujadores activos" value={String(activeBidders)} />
        <Metric label="Avisos fallidos" value={String(failedCount)} danger={failedCount > 0} />
      </div>

      {bids.length === 0 ? (
        <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev/30 px-6 py-16 text-center">
          <Gavel className="w-10 h-10 mx-auto text-text-muted/50 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-text-muted">
            Todavía no hay pujas. Cuando alguien puje, aparece acá en tiempo real.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {bids.map((b) => {
            const c = contacts[b.buyerUid];
            const name = c?.displayName || b.buyerFallback;
            const notif = b.displacedBuyerUid ? notifs[b.id] : undefined;
            const isOpen = expanded === b.id;
            return (
              <li
                key={b.id}
                className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 hover:border-text-subtle/30"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : b.id)}
                  className="w-full text-left p-3 flex items-center gap-3"
                >
                  <Gavel className="w-4 h-4 text-text-muted/50 shrink-0" />
                  <span className="text-xs text-text-muted num-tab w-12 shrink-0">
                    {ago(b.createdAtMs)}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-text-strong">{name}</span>
                  <span className="num-tab font-semibold text-text-strong shrink-0">
                    USD {fmtUsd(b.amount)}
                  </span>
                  <AvisoBadge notif={notif} hasDisplaced={!!b.displacedBuyerUid} />
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 text-xs text-text-muted flex flex-wrap gap-x-5 gap-y-1 border-t border-text-subtle/10">
                    <span>
                      <Mail className="inline w-3 h-3 mr-1" />
                      {c?.email || '—'}
                    </span>
                    <span>{c?.phone || '—'}</span>
                    <Link
                      href={`/${locale}/staff/bids/bidder/${b.buyerUid}` as `/${string}`}
                      className="ml-auto text-text-strong underline underline-offset-2"
                    >
                      Ver historial →
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      className={`rounded-xl p-3 ${danger ? 'bg-danger/10 ring-1 ring-danger/20' : 'bg-bg-elev/40'}`}
    >
      <div className={`text-xs ${danger ? 'text-danger' : 'text-text-muted'}`}>{label}</div>
      <div
        className={`text-xl font-semibold num-tab ${danger ? 'text-danger' : 'text-text-strong'}`}
      >
        {value}
      </div>
    </div>
  );
}

function AvisoBadge({
  notif,
  hasDisplaced,
}: {
  notif?: NotifRow | undefined;
  hasDisplaced: boolean;
}) {
  if (!hasDisplaced) return <span className="w-16 shrink-0" />;
  if (!notif) {
    return <span className="text-[11px] text-text-muted/60 w-16 shrink-0 text-right">…</span>;
  }
  if (notif.status === 'sent') {
    return (
      <span
        className="text-[11px] text-emerald-600 dark:text-emerald-300 w-16 shrink-0 text-right"
        title="Aviso enviado"
      >
        <MailCheck className="inline w-3.5 h-3.5" /> enviado
      </span>
    );
  }
  if (notif.status === 'failed') {
    return (
      <span
        className="text-[11px] text-danger w-16 shrink-0 text-right"
        title={notif.reason ?? 'falló'}
      >
        <AlertTriangle className="inline w-3.5 h-3.5" /> falló
      </span>
    );
  }
  return (
    <span
      className="text-[11px] text-text-muted w-16 shrink-0 text-right"
      title={notif.reason ?? 'omitido'}
    >
      <MailX className="inline w-3.5 h-3.5" /> omitido
    </span>
  );
}
