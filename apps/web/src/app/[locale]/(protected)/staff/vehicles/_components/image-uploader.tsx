'use client';
import { useState } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {images.map((img, i) => (
          <div key={img.storagePath} className="relative group">
            <img
              src={img.thumbnailUrl}
              alt=""
              className="w-full aspect-square object-cover rounded border border-text-subtle/20"
            />
            {i === 0 && (
              <span className="absolute top-1 left-1 text-xs bg-copper/90 text-white px-1.5 py-0.5 rounded">
                #1
              </span>
            )}
            <button
              type="button"
              onClick={() => removeImage(i)}
              className="absolute top-1 right-1 text-xs bg-danger text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100"
            >
              {t('removeImage')}
            </button>
          </div>
        ))}
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
        <p className="text-xs text-text-muted mt-1">{t('imagesHint')}</p>
      </div>
    </div>
  );
}
