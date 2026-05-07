'use client';
import { useState } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { GripVertical, X } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';

export interface UploadedImage {
  url: string;
  thumbnailUrl: string;
  order: number;
  storagePath: string;
}

interface Props {
  vehicleId: string;
  initial: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
}

export function ImageUploader({ vehicleId, initial, onChange }: Props) {
  const t = useTranslations('staff.vehicles.form');
  const [images, setImages] = useState<UploadedImage[]>(initial);
  const [uploading, setUploading] = useState(false);
  // Native HTML5 drag-and-drop. Two index refs:
  //   `dragging` -> the tile currently being dragged
  //   `dragOver` -> the tile under the pointer (used to paint the drop indicator)
  // Kept in state instead of a ref so React re-renders the indicator.
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const next = [...images];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) continue;
        if (!file.type.startsWith('image/')) {
          toast.error(t('errors.imageWrongType'));
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(t('errors.imageTooLarge'));
          continue;
        }
        const ext = file.name.split('.').pop() ?? 'jpg';
        const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `vehicles/${vehicleId}/${filename}`;
        const r = storageRef(fb.storage, path);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        next.push({ url, thumbnailUrl: url, order: next.length, storagePath: path });
      }
      setImages(next);
      onChange(next);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function removeImage(idx: number) {
    const removed = images[idx];
    if (!removed) return;
    const next = images.filter((_, i) => i !== idx).map((img, i) => ({ ...img, order: i }));
    setImages(next);
    onChange(next);
    try {
      await deleteObject(storageRef(fb.storage, removed.storagePath));
    } catch {
      // best-effort cleanup
    }
  }

  /** Move the image at `from` to position `to`, re-indexing `order`. */
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) {
      return;
    }
    const next = [...images];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    const reindexed = next.map((img, i) => ({ ...img, order: i }));
    setImages(reindexed);
    onChange(reindexed);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {images.map((img, i) => {
          const isDragging = dragging === i;
          const isDragOver = dragOver === i && dragging !== null && dragging !== i;
          return (
            <div
              key={img.storagePath}
              draggable
              onDragStart={(e) => {
                setDragging(i);
                // Use minimal drag image — the empty pixel keeps the tile in
                // place visually while we paint our own drop indicator on
                // siblings, which feels smoother than the browser's default
                // washed-out copy of the element.
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOver !== i) setDragOver(i);
              }}
              onDragLeave={() => {
                if (dragOver === i) setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData('text/plain'));
                if (Number.isFinite(from)) reorder(from, i);
                setDragging(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDragOver(null);
              }}
              className={
                'relative group rounded-lg overflow-hidden border-2 transition-all ' +
                (isDragOver
                  ? 'border-copper ring-2 ring-copper/40 scale-[1.02]'
                  : 'border-text-subtle/20') +
                (isDragging ? ' opacity-40' : '') +
                ' cursor-grab active:cursor-grabbing'
              }
            >
              <img
                src={img.thumbnailUrl}
                alt=""
                draggable={false}
                className="w-full aspect-square object-cover pointer-events-none"
              />

              {/* Drag handle hint (visible on hover/touch) */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-black/55 to-transparent opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center"
              >
                <GripVertical className="w-4 h-4 text-white/90" strokeWidth={2.5} />
              </span>

              {i === 0 && (
                <span className="absolute top-1.5 left-1.5 text-[10px] uppercase tracking-wide bg-copper text-white px-1.5 py-0.5 rounded font-semibold">
                  Principal
                </span>
              )}
              {i !== 0 && (
                <span className="absolute top-1.5 left-1.5 text-[10px] num-tab bg-black/55 text-white px-1.5 py-0.5 rounded font-semibold backdrop-blur-sm">
                  #{i + 1}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label={t('removeImage')}
                className="absolute top-1.5 right-1.5 w-6 h-6 grid place-items-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-500 transition-all"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
      <div>
        <label htmlFor="image-input" className="inline-block">
          <input
            id="image-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPick}
            disabled={uploading}
          />
          <Button type="button" variant="outline" disabled={uploading} asChild>
            <span>{uploading ? t('uploading') : t('addImages')}</span>
          </Button>
        </label>
        <p className="text-xs text-text-muted mt-1">
          {t('imagesHint')} · Arrastrá las fotos para reordenarlas. La primera es la principal.
        </p>
      </div>
    </div>
  );
}
