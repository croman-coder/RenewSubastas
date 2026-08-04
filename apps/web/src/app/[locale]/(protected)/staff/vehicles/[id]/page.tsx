import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/server';
import { EditVehicleForm } from './edit-vehicle-form';

interface Props {
  params: { locale: string; id: string };
}

function extractStoragePath(url: string): string {
  // Firebase download URLs have the storage path between '/o/' and '?'.
  try {
    const m = /\/o\/([^?]+)/.exec(url);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch {
    /* noop */
  }
  return '';
}

export default async function VehicleDetailPage({ params: { locale, id } }: Props) {
  // This page had NO auth check at all — it read straight through the Admin
  // SDK (which bypasses firestore.rules) with no session or role gate.
  await requireRole(locale, ['admin', 'staff']);
  const snap = await getFirestore(getAdminApp()).doc(`vehicles/${id}`).get();
  if (!snap.exists) notFound();
  const data = snap.data()!;
  const description = (data['description'] ?? {}) as { es?: string; en?: string };
  const images =
    (data['images'] as Array<{ url: string; thumbnailUrl: string; order: number }>) ?? [];

  return (
    <EditVehicleForm
      locale={locale}
      vehicleId={id}
      initial={{
        audience: (data['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail',
        make: (data['make'] as string) ?? '',
        model: (data['model'] as string) ?? '',
        year: (data['year'] as number) ?? new Date().getFullYear(),
        vin: (data['vin'] as string) ?? '',
        licensePlate: (data['licensePlate'] as string) ?? '',
        mileage: (data['mileage'] as number | undefined) ?? null,
        transmission: (data['transmission'] as 'manual' | 'automatic' | 'cvt') ?? 'manual',
        fuelType: (data['fuelType'] as 'gasoline' | 'diesel' | 'hybrid' | 'electric') ?? 'gasoline',
        color: (data['color'] as string) ?? '',
        condition: (data['condition'] as 'new' | 'used' | 'damaged') ?? 'used',
        descriptionEs: description.es ?? '',
        descriptionEn: description.en ?? '',
        status:
          (data['status'] as 'draft' | 'ready' | 'in_auction' | 'sold' | 'archived') ?? 'draft',
        images: images.map((img, i) => ({
          url: img.url,
          thumbnailUrl: img.thumbnailUrl,
          order: i,
          storagePath: extractStoragePath(img.url),
        })),
      }}
    />
  );
}
