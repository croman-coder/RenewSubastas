import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY, type SendEmailArgs } from '../lib/email.js';
import { emailShell, body, badge, heading } from '../lib/email-templates.js';

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
 */
export async function runDailyUnsoldDigest(
  now: number = Date.now(),
  deps: Deps = { send: sendEmail },
): Promise<UnsoldDigestResult> {
  const db = adminDb();
  const cutoff = Timestamp.fromMillis(now - UNSOLD_THRESHOLD_DAYS * DAY_MS);

  // Single range filter; status/alert filtering happens in memory — vehicle
  // counts are small (hundreds at most) and this avoids composite-index and
  // not-in constraints.
  const snap = await db
    .collection('vehicles')
    .where('firstListedAt', '<=', cutoff)
    .limit(500)
    .get();

  const pending = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string })
    .filter((v) => v['status'] !== 'sold' && v['status'] !== 'archived' && !v['unsoldAlertAt']);

  if (pending.length === 0) return { scanned: snap.size, alerted: [] };

  // Recipients: every active admin/staff.
  const staffSnap = await db
    .collection('users')
    .where('role', 'in', ['admin', 'staff'])
    .where('status', '==', 'active')
    .get();
  const recipients = staffSnap.docs
    .map((d) => d.data()['email'] as string | undefined)
    .filter((e): e is string => !!e);

  const rows = pending
    .map((v) => {
      const listedAt = (v['firstListedAt'] as Timestamp).toMillis();
      const days = Math.floor((now - listedAt) / DAY_MS);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;color:#0a0a0a;font-size:14px;">
          ${v['make']} ${v['model']} <span style="color:#71717a;">${v['year']}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;color:#dc2626;font-weight:600;font-size:14px;">
          ${days} días
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;">
          <a href="https://renewsubastas.com.py/es/staff/insights/${v.id}" style="color:#0a0a0a;">Ver reporte</a>
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

  return { scanned: snap.size, alerted: pending.map((v) => v.id) };
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
