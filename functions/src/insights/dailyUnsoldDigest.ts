import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY, type SendEmailArgs } from '../lib/email.js';
import { emailShell, body, badge, heading, SITE_URL } from '../lib/email-templates.js';

const UNSOLD_THRESHOLD_DAYS = 7;
const DAY_MS = 24 * 3600_000;

export interface UnsoldDigestResult {
  scanned: number;
  alerted: string[];
}

interface Deps {
  send: (args: SendEmailArgs) => Promise<unknown>;
}

/**
 * Daily 7-days-unsold alert.
 *
 * Finds vehicles first listed >= 7 days ago that never sold and were never
 * alerted, sends ONE digest email to every active admin/staff, then marks
 * each vehicle's `unsoldAlertAt` (idempotency). Marks are written only after
 * the emails succeed — a Resend outage means an automatic retry tomorrow.
 * The red badge in /staff/insights is computed live and does NOT depend on
 * this mark.
 *
 * Paginates through ALL matches (50 pages × 500 docs max) so the backlog
 * doesn't starve new alerts once the first 500 slots fill with sold/archived
 * entries.
 */
export async function runDailyUnsoldDigest(
  now: number = Date.now(),
  deps: Deps = { send: sendEmail },
): Promise<UnsoldDigestResult> {
  const db = adminDb();
  const cutoff = Timestamp.fromMillis(now - UNSOLD_THRESHOLD_DAYS * DAY_MS);

  // Paginate through ALL vehicles that crossed the 7-day threshold.
  // In-memory filter for status/alert so we avoid composite-index and not-in
  // constraints. Safety cap: 50 pages × 500 = 25 000 docs max.
  const pending: (Record<string, unknown> & { id: string })[] = [];
  let scanned = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (let page = 0; page < 50; page++) {
    let q = db
      .collection('vehicles')
      .where('firstListedAt', '<=', cutoff)
      .orderBy('firstListedAt', 'asc')
      .limit(500);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    scanned += snap.size;
    for (const d of snap.docs) {
      const v = { id: d.id, ...d.data() } as Record<string, unknown> & { id: string };
      if (v['status'] !== 'sold' && v['status'] !== 'archived' && !v['unsoldAlertAt'])
        pending.push(v);
    }
    if (snap.size < 500) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  if (pending.length === 0) return { scanned, alerted: [] };

  // Recipients: every active admin/staff.
  const staffSnap = await db
    .collection('users')
    .where('role', 'in', ['admin', 'staff'])
    .where('status', '==', 'active')
    .get();
  const recipients = staffSnap.docs
    .map((d) => d.data()['email'] as string | undefined)
    .filter((e): e is string => !!e);

  // Fix 5: guard against marking vehicles when nobody will receive the email.
  if (recipients.length === 0) {
    console.error('[dailyUnsoldDigest] no admin/staff recipients; skipping marks');
    return { scanned, alerted: [] };
  }

  // Fix 4: enrich each pending vehicle with auction data (views, price, reductions).
  // pending is small (vehicles that just crossed 7 days unsold and not yet alerted).
  const enriched = await Promise.all(
    pending.map(async (v) => {
      const aSnap = await db.collection('auctions').where('vehicleId', '==', v.id).get();

      let viewsUnique = 0;
      let currentPrice: number | null = null;
      let latestEndsAt: number = 0;
      let reductions = 0;

      for (const aDoc of aSnap.docs) {
        const a = aDoc.data();

        // Aggregate unique views across all auctions for this vehicle.
        const u = (a['viewStats'] as Record<string, number> | undefined)?.['unique'] ?? 0;
        viewsUnique += u;

        // Track the latest auction for current price.
        const endsAt: number =
          a['endsAt'] instanceof Timestamp
            ? a['endsAt'].toMillis()
            : ((a['endsAt'] as number) ?? 0);
        if (endsAt > latestEndsAt) {
          latestEndsAt = endsAt;
          const finalPrice = a['finalPrice'] as number | undefined;
          const currentBid = a['currentBid'] as number | undefined;
          const startingPrice = a['startingPrice'] as number | undefined;
          currentPrice =
            finalPrice ??
            (currentBid && currentBid > 0 ? currentBid : null) ??
            startingPrice ??
            null;
        }

        // Count isReduction price changes for this auction.
        const pcSnap = await aDoc.ref
          .collection('priceChanges')
          .where('isReduction', '==', true)
          .get();
        reductions += pcSnap.size;
      }

      return { ...v, viewsUnique, currentPrice, reductions } as Record<string, unknown> & {
        id: string;
        viewsUnique: number;
        currentPrice: number | null;
        reductions: number;
      };
    }),
  );

  const rows = enriched
    .map((v) => {
      const listedAt = (v['firstListedAt'] as Timestamp).toMillis();
      const days = Math.floor((now - listedAt) / DAY_MS);
      const priceDisplay = v.currentPrice != null ? `USD ${v.currentPrice.toLocaleString()}` : '—';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;color:#0a0a0a;font-size:14px;">
          ${v['make']} ${v['model']} <span style="color:#71717a;">${v['year']}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;color:#dc2626;font-weight:600;font-size:14px;">
          ${days} días
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;">
          ${v.viewsUnique} vistas únicas
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;">
          ${priceDisplay}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;">
          ${v.reductions} bajada(s)
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;">
          <a href="${SITE_URL}/es/staff/insights/${v.id}" style="color:#0a0a0a;">Ver reporte</a>
        </td>
      </tr>`;
    })
    .join('');

  const html = emailShell(
    body(
      badge('Alerta de inventario', 'warning') +
        heading(
          `${pending.length} vehículo${pending.length === 1 ? '' : 's'} sin vender hace 7+ días`,
          'Estos vehículos llevan una semana o más publicados sin venderse. Revisá precio y demanda en el reporte.',
        ) +
        `<table style="width:100%;border-collapse:collapse;margin-top:8px;">${rows}</table>`,
    ),
  );

  // One email per recipient; a single failure aborts the marking so tomorrow
  // retries the whole batch.
  for (const to of recipients) {
    await deps.send({
      to,
      subject: `Renew: ${pending.length} vehículo(s) sin vender hace 7+ días`,
      html,
    });
  }

  const batch = db.batch();
  for (const v of pending) {
    batch.update(db.doc(`vehicles/${v.id}`), { unsoldAlertAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();

  return { scanned, alerted: pending.map((v) => v.id) };
}

export const dailyUnsoldDigest = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'America/Asuncion',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async () => {
    const r = await runDailyUnsoldDigest();
    console.log(`dailyUnsoldDigest: scanned=${r.scanned} alerted=${r.alerted.length}`);
  },
);
