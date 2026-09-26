// Real thumbnails for vehicle photos uploaded before 2026-09-26, when
// `thumbnailUrl` was the original photo itself (see
// apps/web/src/lib/images/thumbnail.ts — new uploads make their own).
//
//   GOOGLE_APPLICATION_CREDENTIALS=$HOME/keys/carbid-staging-sa.json \
//     pnpm --filter @carbid/functions exec tsx scripts/backfill-thumbnails.ts           # dry run
//   ... scripts/backfill-thumbnails.ts --apply                                        # writes
//
// DRY RUN BY DEFAULT: without --apply it only reads and reports what it would
// do. With --apply it WRITES TO PRODUCTION — the Firebase project named
// carbid-staging IS production:
//   1. uploads vehicles/{id}/thumbs/{name}.webp (800 px wide, EXIF-rotated)
//      next to each original, with a download token like the web uploader's;
//   2. points vehicles/{id}.images[].thumbnailUrl at it;
//   3. points auctions/{id}.vehicleSnapshot.thumbnailUrl at it where it held
//      the original.
//
// Idempotent: a photo whose thumbnailUrl already differs from its url is
// skipped, so a second run does nothing. Originals are never touched.
//
// Auction triggers (sendAuctionWon, sendAuctionLive, sendAuctionSoldOffline,
// sendAuctionSoldInternal) only act on status/outcome transitions, which this
// script never changes — updating a snapshot's thumbnail sends no email.
import { randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';

const APPLY = process.argv.includes('--apply');
const PROJECT = process.env['GCLOUD_PROJECT'] ?? 'carbid-staging';
const BUCKET = process.env['STORAGE_BUCKET'] ?? `${PROJECT}.firebasestorage.app`;
const MAX_WIDTH = 800; // same as THUMB_MAX_WIDTH in the web app

initializeApp({ credential: applicationDefault(), projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket();

interface Img {
  url: string;
  thumbnailUrl?: string;
  order?: number;
  storagePath?: string;
}

/** vehicles/{id}/{name}.jpg → vehicles/{id}/thumbs/{name}.webp (thumbnailPathFor in the web app). */
function thumbPathFor(originalPath: string): string {
  const slash = originalPath.lastIndexOf('/');
  const file = originalPath.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  return `${originalPath.slice(0, slash)}/thumbs/${dot > 0 ? file.slice(0, dot) : file}.webp`;
}

/** Storage path from a Firebase download URL (…/o/<encoded path>?alt=media&token=…). */
function pathFromUrl(url: string): string | null {
  const m = new URL(url).pathname.match(/\/o\/(.+)$/);
  return m ? decodeURIComponent(m[1]!) : null;
}

function needsThumb(img: Img): boolean {
  return !img.thumbnailUrl || img.thumbnailUrl === img.url;
}

async function main() {
  const target = process.env['FIRESTORE_EMULATOR_HOST']
    ? `${PROJECT} — EMULADOR`
    : `${PROJECT} — PRODUCCIÓN`;
  console.log(`${APPLY ? 'APLICANDO EN' : 'SIMULACIÓN sobre'} ${target} (bucket ${BUCKET})\n`);
  const vehicles = await db.collection('vehicles').get();
  const newThumbByOriginal = new Map<string, string>();
  let pending = 0;
  let missing = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const doc of vehicles.docs) {
    const images = ((doc.data()['images'] as Img[] | undefined) ?? []).filter((i) => i?.url);
    const todo = images.filter(needsThumb);
    if (todo.length === 0) continue;

    for (const img of todo) {
      const path = img.storagePath ?? pathFromUrl(img.url);
      if (!path) {
        missing++;
        console.log(`  ${doc.id}: URL sin ruta de Storage, se omite`);
        continue;
      }
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) {
        missing++;
        console.log(`  ${doc.id}: falta el original ${path}, se omite`);
        continue;
      }
      pending++;
      const [meta] = await file.getMetadata();
      bytesBefore += Number(meta.size ?? 0);
      if (!APPLY) continue;

      const [original] = await file.download();
      const thumb = await sharp(original)
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      bytesAfter += thumb.length;
      const thumbPath = thumbPathFor(path);
      const token = randomUUID();
      await bucket.file(thumbPath).save(thumb, {
        resumable: false,
        contentType: 'image/webp',
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
      newThumbByOriginal.set(
        img.url,
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(thumbPath)}?alt=media&token=${token}`,
      );
    }

    if (APPLY) {
      // Re-read inside a transaction so a concurrent staff edit isn't
      // overwritten: only entries whose url we just thumbnailed change.
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const current = (fresh.data()?.['images'] as Img[] | undefined) ?? [];
        const next = current.map((i) =>
          i?.url && needsThumb(i) && newThumbByOriginal.has(i.url)
            ? { ...i, thumbnailUrl: newThumbByOriginal.get(i.url)! }
            : i,
        );
        tx.update(doc.ref, { images: next });
      });
    }
  }

  // Auctions are matched against every original → thumbnail pair the vehicles
  // hold NOW, not just this run's: a run interrupted between the vehicles and
  // the auctions then still fixes those auctions when repeated.
  const thumbByOriginal = new Map<string, string>();
  const stillPending = new Set<string>();
  for (const v of (await db.collection('vehicles').get()).docs) {
    for (const i of (v.data()['images'] as Img[] | undefined) ?? []) {
      if (!i?.url) continue;
      if (needsThumb(i)) stillPending.add(i.url);
      else thumbByOriginal.set(i.url, i.thumbnailUrl!);
    }
  }

  const auctions = await db.collection('auctions').get();
  let auctionsToFix = 0;
  for (const a of auctions.docs) {
    const snap = (a.data()['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const current = snap['thumbnailUrl'] as string | undefined;
    if (!current) continue;
    const next = thumbByOriginal.get(current);
    if (next) {
      auctionsToFix++;
      if (APPLY) await a.ref.update({ 'vehicleSnapshot.thumbnailUrl': next });
    } else if (stillPending.has(current)) {
      auctionsToFix++; // dry run: its vehicle photo gets a thumbnail with --apply
    }
  }

  const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
  console.log(`Fotos sin miniatura propia: ${pending}  ·  sin original: ${missing}`);
  console.log(`Subastas cuya foto apunta al original: ${auctionsToFix}`);
  console.log(`Peso de esos originales: ${mb(bytesBefore)} MB`);
  if (APPLY) console.log(`Peso de las miniaturas nuevas: ${mb(bytesAfter)} MB`);
  else console.log('\nNada se escribió. Para aplicar: agregar --apply');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
