import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb, adminStorage } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';

const InputSchema = z.object({ vehicleId: z.string().min(1) });

export interface DeleteVehicleResult {
  ok: true;
}

/**
 * Permanently destroys a vehicle and its photos.
 *
 * Guardrails:
 *   - Admin-only. Staff can archive but not delete.
 *   - The vehicle must NOT be `in_auction` or `sold` — those have live or
 *     historical financial state attached and shouldn't disappear silently.
 *     The admin must cancel/finalize the auction first.
 *   - Storage cleanup is best-effort: if a single image fails to delete (e.g.
 *     already gone), the function continues so the Firestore record doesn't
 *     end up half-deleted.
 *
 * Auctions, bids, and audit_logs that reference this vehicle remain in place
 * as historical evidence — they're not the vehicle, they're the record of
 * what happened to it.
 */
export async function deleteVehicleHandler(req: CallableRequest): Promise<DeleteVehicleResult> {
  requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { vehicleId } = parsed.data;

  const ref = adminDb().doc(`vehicles/${vehicleId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Vehicle not found');
  const data = snap.data()!;
  const status = data['status'] as string | undefined;

  if (status === 'in_auction' || status === 'sold') {
    throw new HttpsError(
      'failed-precondition',
      `Cannot delete a vehicle in status "${status}". Cancel the auction first.`,
    );
  }

  // Pull every storage path we know about. Two shapes are supported because
  // older docs only stored the public URL, while newer ones include the path.
  const images = (data['images'] as Array<Record<string, unknown>> | undefined) ?? [];
  const paths = new Set<string>();
  for (const img of images) {
    const explicit = img['storagePath'] as string | undefined;
    if (explicit) {
      paths.add(explicit);
      continue;
    }
    const url = (img['url'] as string | undefined) ?? (img['thumbnailUrl'] as string | undefined);
    if (!url) continue;
    const m = /\/o\/([^?]+)/.exec(url);
    if (m && m[1]) paths.add(decodeURIComponent(m[1]));
  }

  const bucket = adminStorage().bucket();
  // Best-effort: never let a missing file block the deletion.
  await Promise.all(
    Array.from(paths).map(async (p) => {
      try {
        await bucket.file(p).delete({ ignoreNotFound: true });
      } catch (err) {
        console.warn(`deleteVehicle: failed to delete storage path ${p}`, err);
      }
    }),
  );

  // Also wipe anything still under vehicles/{id}/ that we might have missed —
  // typical paths are vehicles/{id}/full-NN.jpg and vehicles/{id}/thumb-NN.jpg.
  try {
    await bucket.deleteFiles({ prefix: `vehicles/${vehicleId}/` });
  } catch (err) {
    console.warn(`deleteVehicle: prefix cleanup failed for vehicles/${vehicleId}/`, err);
  }

  await ref.delete();

  await writeAuditLog({
    actorUid: req.auth?.uid ?? 'unknown',
    action: 'vehicle.delete',
    resourceType: 'vehicle',
    resourceId: vehicleId,
    before: {
      make: data['make'],
      model: data['model'],
      year: data['year'],
      status,
    },
  });

  return { ok: true };
}

export const deleteVehicle = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true' },
  deleteVehicleHandler,
);
