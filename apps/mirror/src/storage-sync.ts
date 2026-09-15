/**
 * Cloud Storage bucket → local directory + `storage_objects`.
 *
 * Lists every object in the bucket (181 today, 155 MB) and downloads the
 * ones whose md5 or generation differs from what the mirror last recorded.
 * Objects that vanished from the bucket are soft-deleted in the index; the
 * local file is KEPT — a mirror whose job is to protect against losing data
 * must not delete data because the source did. Reclaiming disk is a manual
 * decision, and 155 MB doesn't force it.
 *
 * Files land at `<storageDir>/<bucket>/<object name>`, so the tree on disk
 * mirrors the bucket one-to-one and a future migration to MinIO/S3/Supabase
 * Storage is a plain upload of that directory.
 */
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { storage } from './firebase.js';
import type { MirrorStore } from './store.js';
import { log } from './log.js';

export async function storageSync(
  store: MirrorStore,
  bucketName: string,
  storageDir: string,
): Promise<{ seen: number; downloaded: number; deleted: number; bytes: number }> {
  const runId = await store.startRun('storage');
  let seen = 0;
  let downloaded = 0;
  let bytes = 0;
  try {
    const bucket = storage().bucket(bucketName);
    const [files] = await bucket.getFiles({ autoPaginate: true });
    const known = await store.getStorageIndex();
    const names: string[] = [];

    for (const f of files) {
      seen++;
      names.push(f.name);
      const md5 = (f.metadata.md5Hash as string | undefined) ?? null;
      const generation = f.metadata.generation ? String(f.metadata.generation) : null;
      const size = Number(f.metadata.size ?? 0);
      const localPath = join(storageDir, bucketName, f.name);

      const prev = known.get(f.name);
      let onDisk = false;
      try {
        const s = await stat(localPath);
        onDisk = s.size === size;
      } catch {
        onDisk = false;
      }
      const unchanged = prev && prev.md5 === md5 && prev.generation === generation && onDisk;

      if (!unchanged) {
        await mkdir(dirname(localPath), { recursive: true });
        // Download to a temp name and rename: a crash mid-download never
        // leaves a truncated file under the real name.
        const tmp = `${localPath}.part`;
        await f.download({ destination: tmp });
        await rename(tmp, localPath);
        downloaded++;
        bytes += size;
      }

      await store.upsertStorageObject({
        name: f.name,
        bucket: bucketName,
        size,
        content_type: (f.metadata.contentType as string | undefined) ?? null,
        md5,
        generation,
        updated_at: f.metadata.updated
          ? new Date(f.metadata.updated as string).toISOString()
          : null,
        local_path: localPath,
      });
    }

    const deleted = await store.softDeleteStorageNotIn(names);
    await store.finishRun(runId, { ok: true, seen, upserted: downloaded, deleted });
    log.info(
      `storage: ${seen} objetos, ${downloaded} bajados (${(bytes / 1024 / 1024).toFixed(1)} MB), ${deleted} desaparecidos`,
    );
    return { seen, downloaded, deleted, bytes };
  } catch (err) {
    await store.finishRun(runId, { ok: false, seen, upserted: downloaded, error: String(err) });
    throw err;
  }
}
