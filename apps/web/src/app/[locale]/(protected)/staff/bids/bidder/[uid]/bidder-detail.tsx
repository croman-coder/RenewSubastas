'use client';
import { useEffect, useMemo, useState } from 'react';
import { collectionGroup, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { fb } from '@/lib/firebase/client';

interface Bid {
  id: string;
  auctionId: string;
  amount: number;
  createdAtMs: number;
  status: string;
}
interface Contact {
  displayName: string;
  email: string;
  phone: string;
}
const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BidderDetail({ uid, locale }: { uid: string; locale: string }) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);

  useEffect(() => {
    const q = query(
      collectionGroup(fb.db, 'bids'),
      where('buyerUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(200),
    );
    getDocs(q).then((snap) =>
      setBids(
        snap.docs.map((d) => {
          const a = d.data();
          return {
            id: d.id,
            auctionId: (a['auctionId'] as string) ?? '',
            amount: (a['amount'] as number) ?? 0,
            createdAtMs:
              (a['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
            status: (a['status'] as string) ?? '',
          };
        }),
      ),
    );
  }, [uid]);

  useEffect(() => {
    httpsCallable<{ uids: string[] }, Record<string, Contact>>(
      fb.functions,
      'resolveBidders',
    )({ uids: [uid] })
      .then(({ data }) => setContact(data[uid] ?? null))
      .catch(() => {});
  }, [uid]);

  const stats = useMemo(() => {
    const auctions = new Set(bids.map((b) => b.auctionId));
    const max = bids.reduce((m, b) => Math.max(m, b.amount), 0);
    return { total: bids.length, auctions: auctions.size, max };
  }, [bids]);

  return (
    <div className="space-y-4" data-locale={locale}>
      <div className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 p-4">
        <p className="font-medium text-text-strong">{contact?.displayName || uid}</p>
        <p className="text-sm text-text-muted">
          {contact?.email || '—'} · {contact?.phone || '—'}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Pujas" value={String(stats.total)} />
        <Metric label="Subastas" value={String(stats.auctions)} />
        <Metric label="Monto máx." value={`USD ${fmtUsd(stats.max)}`} />
      </div>
      <ul className="space-y-2">
        {bids.map((b) => (
          <li
            key={b.id}
            className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 p-3 flex items-center gap-3 text-sm"
          >
            <span className="num-tab font-semibold text-text-strong">USD {fmtUsd(b.amount)}</span>
            <span className="text-text-muted text-xs">{b.status}</span>
            <span className="ml-auto text-text-muted text-xs">
              {new Date(b.createdAtMs).toLocaleString('es-PY')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 bg-bg-elev/40">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-lg font-semibold num-tab text-text-strong">{value}</div>
    </div>
  );
}
