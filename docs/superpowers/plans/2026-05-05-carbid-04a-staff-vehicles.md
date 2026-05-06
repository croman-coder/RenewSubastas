# CARBID Plan 4a — Staff Vehicles

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Staff (and admin) can create vehicles in the system: a single-page form with all spec fields, multi-image upload to Firebase Storage, edit, and a "ready for auction" status transition. Vehicles are listed scoped to the creator (admins see all).

**Architecture:**

- Vehicle writes go DIRECTLY from the client to Firestore — Firestore rules already allow `staff` and `admin` to create/update.
- Image uploads go to `vehicles/{vehicleId}/{filename}` in Firebase Storage. Storage rules already restrict by role + active status.
- Thumbnail generation (`storage.onImageUpload` Cloud Function trigger) is deferred to Plan 9 — for MVP we just store the same URL as both `url` and `thumbnailUrl`.
- Vehicle list is a Server Component reading via admin SDK with cursor pagination.

**Spec reference:** §4 (Vehicle schema), §5 (storage rules), §6 (Staff dashboard table — Vehicles section).

**Prerequisites:** Plans 1-3b complete.

---

## File Structure (end state)

```
apps/web/src/
├── lib/staff/
│   └── list-vehicles.ts
└── app/[locale]/(protected)/staff/
    ├── layout.tsx                 staff sidebar
    ├── page.tsx                   stays placeholder (KPIs in Plan 4b/3c)
    └── vehicles/
        ├── page.tsx               list (server)
        ├── vehicles-table.tsx     client
        ├── new/
        │   ├── page.tsx
        │   └── vehicle-form.tsx
        ├── [id]/
        │   ├── page.tsx
        │   └── vehicle-form.tsx   reused via `mode` prop
        └── _components/
            └── image-uploader.tsx
```

---

## Task 1: Staff layout + i18n + shadcn primitives

- [ ] **Step 1.1: Add shadcn primitives**

```
cd apps/web
npx shadcn@latest add textarea checkbox --yes --overwrite
```

- [ ] **Step 1.2: Add i18n keys** — append to `messages/es.json` next to existing `admin`:

```json
"staff": {
  "nav": {
    "home": "Inicio",
    "vehicles": "Mis vehículos",
    "auctions": "Mis subastas"
  },
  "vehicles": {
    "title": "Mis vehículos",
    "createNew": "Nuevo vehículo",
    "filters": { "status": "Estado", "all": "Todos" },
    "columns": {
      "vehicle": "Vehículo",
      "year": "Año",
      "status": "Estado",
      "createdAt": "Creado"
    },
    "status": {
      "draft": "Borrador",
      "ready": "Listo",
      "in_auction": "En subasta",
      "sold": "Vendido",
      "archived": "Archivado"
    },
    "empty": "Aún no has cargado vehículos.",
    "loadMore": "Cargar más",
    "form": {
      "title": "Datos del vehículo",
      "make": "Marca",
      "model": "Modelo",
      "year": "Año",
      "vin": "VIN (opcional)",
      "mileage": "Kilometraje",
      "transmission": "Transmisión",
      "transmissionManual": "Manual",
      "transmissionAutomatic": "Automática",
      "transmissionCvt": "CVT",
      "fuelType": "Combustible",
      "fuelGasoline": "Nafta",
      "fuelDiesel": "Diésel",
      "fuelHybrid": "Híbrido",
      "fuelElectric": "Eléctrico",
      "color": "Color",
      "condition": "Condición",
      "conditionNew": "Nuevo",
      "conditionUsed": "Usado",
      "conditionDamaged": "Dañado",
      "descriptionEs": "Descripción (Español)",
      "descriptionEn": "Descripción (Inglés, opcional)",
      "images": "Fotos",
      "imagesHint": "Hasta 20 imágenes. Primera = principal.",
      "addImages": "Agregar imágenes",
      "uploading": "Subiendo…",
      "removeImage": "Quitar",
      "save": "Guardar",
      "saving": "Guardando…",
      "saved": "Guardado.",
      "publishToAuction": "Marcar como listo (publicable)",
      "backToDraft": "Volver a borrador",
      "errors": {
        "generic": "No se pudo guardar.",
        "imageTooLarge": "Imagen mayor a 10 MB.",
        "imageWrongType": "Solo se aceptan imágenes."
      }
    }
  }
}
```

And same in `messages/en.json` with English.

- [ ] **Step 1.3: Replace `apps/web/src/app/[locale]/(protected)/staff/layout.tsx`** (it currently doesn't exist — staff is a single placeholder page):

```tsx
import { requireRole } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';

export default async function StaffLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  await requireRole(locale, ['admin', 'staff']);
  const t = await getTranslations('staff.nav');
  const items = [
    { href: `/${locale}/staff`, label: t('home') },
    { href: `/${locale}/staff/vehicles`, label: t('vehicles') },
    { href: `/${locale}/staff/auctions`, label: t('auctions') },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 max-w-7xl mx-auto p-6">
      <nav aria-label="Staff">
        <ul className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {items.map((it) => (
            <li key={it.href}>
              <a
                href={it.href}
                className="block px-3 py-2 rounded text-sm text-text-strong hover:bg-bg-elev"
              >
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
```

- [ ] **Step 1.4: Stub `staff/auctions/page.tsx`** so the link doesn't 404:

```tsx
export default function StaffAuctionsHome() {
  return (
    <main className="space-y-2">
      <h1 className="text-2xl font-semibold text-text-strong">Mis subastas</h1>
      <p className="text-text-muted">Llega en el Plan 4b.</p>
    </main>
  );
}
```

- [ ] **Step 1.5: Build, format, commit**

```
pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/components/ui apps/web/messages apps/web/src/app/[locale]/'(protected)'/staff apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): staff sidebar layout + i18n strings"
```

---

## Task 2: Vehicles list

- [ ] **Step 2.1: Helper `apps/web/src/lib/staff/list-vehicles.ts`**:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface VehicleListItem {
  id: string;
  make: string;
  model: string;
  year: number;
  status: 'draft' | 'ready' | 'in_auction' | 'sold' | 'archived';
  thumbnailUrl: string | null;
  createdAt: number;
  createdBy: string;
}

export interface ListVehiclesFilter {
  scopedToUid?: string; // staff sees own; admin sees all if undefined
  status?: VehicleListItem['status'];
  pageSize?: number;
  cursor?: string;
}

export interface ListVehiclesResult {
  items: VehicleListItem[];
  nextCursor: string | null;
}

export async function listVehicles(filter: ListVehiclesFilter): Promise<ListVehiclesResult> {
  const db = getFirestore(getAdminApp());
  let q: FirebaseFirestore.Query = db.collection('vehicles').orderBy('updatedAt', 'desc');
  if (filter.scopedToUid) q = q.where('createdBy', '==', filter.scopedToUid);
  if (filter.status) q = q.where('status', '==', filter.status);
  const pageSize = Math.min(filter.pageSize ?? 25, 100);
  if (filter.cursor) {
    const ms = Number(filter.cursor);
    if (!Number.isNaN(ms)) q = q.startAfter(new Date(ms));
  }
  q = q.limit(pageSize + 1);

  const snap = await q.get();
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items: VehicleListItem[] = docs.slice(0, pageSize).map((d) => {
    const data = d.data();
    const updatedAt =
      (data['updatedAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    const images =
      (data['images'] as Array<{ thumbnailUrl?: string; url?: string }> | undefined) ?? [];
    const firstImg = images[0];
    return {
      id: d.id,
      make: (data['make'] as string) ?? '',
      model: (data['model'] as string) ?? '',
      year: (data['year'] as number) ?? 0,
      status: (data['status'] as VehicleListItem['status']) ?? 'draft',
      thumbnailUrl: firstImg?.thumbnailUrl ?? firstImg?.url ?? null,
      createdAt: updatedAt,
      createdBy: (data['createdBy'] as string) ?? '',
    };
  });
  const nextCursor = hasMore ? String(items[items.length - 1]!.createdAt) : null;
  return { items, nextCursor };
}
```

- [ ] **Step 2.2: Server page** `apps/web/src/app/[locale]/(protected)/staff/vehicles/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { listVehicles } from '@/lib/staff/list-vehicles';
import { VehiclesTable } from './vehicles-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { status?: string; cursor?: string };
}

export default async function VehiclesListPage({ params: { locale }, searchParams }: PageProps) {
  const user = await getCurrentUser(locale);
  const status =
    searchParams?.status === 'draft' ||
    searchParams?.status === 'ready' ||
    searchParams?.status === 'in_auction' ||
    searchParams?.status === 'sold' ||
    searchParams?.status === 'archived'
      ? searchParams.status
      : undefined;
  const data = await listVehicles({
    ...(user.role === 'staff' ? { scopedToUid: user.uid } : {}),
    ...(status && { status }),
    ...(searchParams?.cursor && { cursor: searchParams.cursor }),
  });
  return (
    <VehiclesTable
      locale={locale}
      items={data.items}
      nextCursor={data.nextCursor}
      currentStatus={status ?? null}
    />
  );
}
```

- [ ] **Step 2.3: Client table** `vehicles-table.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { VehicleListItem } from '@/lib/staff/list-vehicles';

interface Props {
  locale: string;
  items: VehicleListItem[];
  nextCursor: string | null;
  currentStatus: VehicleListItem['status'] | null;
}

export function VehiclesTable({ locale, items, nextCursor, currentStatus }: Props) {
  const t = useTranslations('staff.vehicles');
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    router.replace(`/${locale}/staff/vehicles?${next.toString()}` as `/${string}`);
  }

  function loadMore() {
    if (!nextCursor) return;
    const next = new URLSearchParams(sp.toString());
    next.set('cursor', nextCursor);
    router.replace(`/${locale}/staff/vehicles?${next.toString()}` as `/${string}`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <Link href={`/${locale}/staff/vehicles/new` as `/${string}`}>
          <Button>{t('createNew')}</Button>
        </Link>
      </header>
      <Select
        value={currentStatus ?? 'all'}
        onValueChange={(v) => setParam('status', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder={t('filters.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.all')}</SelectItem>
          <SelectItem value="draft">{t('status.draft')}</SelectItem>
          <SelectItem value="ready">{t('status.ready')}</SelectItem>
          <SelectItem value="in_auction">{t('status.in_auction')}</SelectItem>
          <SelectItem value="sold">{t('status.sold')}</SelectItem>
          <SelectItem value="archived">{t('status.archived')}</SelectItem>
        </SelectContent>
      </Select>
      <div className="border border-text-subtle/20 rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.vehicle')}</TableHead>
              <TableHead>{t('columns.year')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.createdAt')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-text-muted py-8">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <Link
                    href={`/${locale}/staff/vehicles/${v.id}` as `/${string}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    {v.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnailUrl} alt="" className="w-12 h-12 object-cover rounded" />
                    ) : (
                      <div className="w-12 h-12 bg-bg-deep rounded" />
                    )}
                    <span>
                      {v.make} {v.model}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="num-tab">{v.year}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t(`status.${v.status}`)}</Badge>
                </TableCell>
                <TableCell className="text-text-muted text-sm num-tab">
                  {new Date(v.createdAt).toLocaleDateString(locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {nextCursor && (
        <Button variant="outline" onClick={loadMore}>
          {t('loadMore')}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2.4: Build + commit**

```
pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/lib/staff apps/web/src/app/[locale]/'(protected)'/staff/vehicles/page.tsx apps/web/src/app/[locale]/'(protected)'/staff/vehicles/vehicles-table.tsx
git commit -m "feat(web): staff vehicles list with status filter and pagination"
```

---

## Task 3: Image uploader component

- [ ] **Step 3.1: Create `apps/web/src/app/[locale]/(protected)/staff/vehicles/_components/image-uploader.tsx`**:

```tsx
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
```

NOTE: `fb.storage` must be exported from `@carbid/firebase-client`. Check `packages/firebase-client/src/client.ts` — `initFirebaseClient` already returns `storage`. The web wrapper at `apps/web/src/lib/firebase/client.ts` returns the entire object as `fb`, so `fb.storage` should already be accessible. If it isn't, fix the wrapper.

- [ ] **Step 3.2: Commit**

```
git add apps/web/src/app/[locale]/'(protected)'/staff/vehicles/_components
git commit -m "feat(web): image uploader for vehicle photos"
```

---

## Task 4: Vehicle form (new + edit)

- [ ] **Step 4.1: New page** `apps/web/src/app/[locale]/(protected)/staff/vehicles/new/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { VehicleForm } from './vehicle-form';

export default async function NewVehiclePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await getCurrentUser(locale);
  return <VehicleForm mode="create" locale={locale} actorUid={user.uid} />;
}
```

- [ ] **Step 4.2: Form** `apps/web/src/app/[locale]/(protected)/staff/vehicles/new/vehicle-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageUploader, type UploadedImage } from '../_components/image-uploader';

const Schema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2100),
  vin: z.string().optional(),
  mileage: z.coerce.number().nonnegative().optional(),
  transmission: z.enum(['manual', 'automatic', 'cvt']),
  fuelType: z.enum(['gasoline', 'diesel', 'hybrid', 'electric']),
  color: z.string().optional(),
  condition: z.enum(['new', 'used', 'damaged']),
  descriptionEs: z.string().min(1),
  descriptionEn: z.string().optional(),
});
type FormValues = z.infer<typeof Schema>;

interface Props {
  mode: 'create';
  locale: string;
  actorUid: string;
}

export function VehicleForm({ locale, actorUid }: Props) {
  const t = useTranslations('staff.vehicles.form');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  // Pre-allocate the vehicle id so image uploads can use it before doc is saved.
  const [vehicleId] = useState(() => doc(collection(fb.db, 'vehicles')).id);
  const [images, setImages] = useState<UploadedImage[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      make: '',
      model: '',
      year: new Date().getFullYear(),
      vin: '',
      transmission: 'manual',
      fuelType: 'gasoline',
      color: '',
      condition: 'used',
      descriptionEs: '',
      descriptionEn: '',
    },
  });
  const transmission = watch('transmission');
  const fuelType = watch('fuelType');
  const condition = watch('condition');

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const ref = doc(fb.db, 'vehicles', vehicleId);
      const payload: Record<string, unknown> = {
        id: vehicleId,
        make: values.make,
        model: values.model,
        year: values.year,
        transmission: values.transmission,
        fuelType: values.fuelType,
        condition: values.condition,
        description: values.descriptionEn
          ? { es: values.descriptionEs, en: values.descriptionEn }
          : { es: values.descriptionEs },
        images: images.map((img, i) => ({
          url: img.url,
          thumbnailUrl: img.thumbnailUrl,
          order: i,
        })),
        status: 'draft',
        createdBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (values.vin) payload['vin'] = values.vin;
      if (values.mileage !== undefined) payload['mileage'] = values.mileage;
      if (values.color) payload['color'] = values.color;
      await setDoc(ref, payload);
      toast.success(t('saved'));
      router.replace(`/${locale}/staff/vehicles/${vehicleId}` as `/${string}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <a
        href={`/${locale}/staff/vehicles`}
        className="text-sm text-text-muted hover:text-text-strong"
      >
        ← Mis vehículos
      </a>
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="make">{t('make')}</Label>
          <Input id="make" {...register('make')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">{t('model')}</Label>
          <Input id="model" {...register('model')} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="year">{t('year')}</Label>
          <Input id="year" type="number" {...register('year')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mileage">{t('mileage')}</Label>
          <Input id="mileage" type="number" {...register('mileage')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">{t('color')}</Label>
          <Input id="color" {...register('color')} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="vin">{t('vin')}</Label>
        <Input id="vin" {...register('vin')} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>{t('transmission')}</Label>
          <Select
            value={transmission}
            onValueChange={(v) => setValue('transmission', v as FormValues['transmission'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">{t('transmissionManual')}</SelectItem>
              <SelectItem value="automatic">{t('transmissionAutomatic')}</SelectItem>
              <SelectItem value="cvt">{t('transmissionCvt')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('fuelType')}</Label>
          <Select
            value={fuelType}
            onValueChange={(v) => setValue('fuelType', v as FormValues['fuelType'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gasoline">{t('fuelGasoline')}</SelectItem>
              <SelectItem value="diesel">{t('fuelDiesel')}</SelectItem>
              <SelectItem value="hybrid">{t('fuelHybrid')}</SelectItem>
              <SelectItem value="electric">{t('fuelElectric')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('condition')}</Label>
          <Select
            value={condition}
            onValueChange={(v) => setValue('condition', v as FormValues['condition'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">{t('conditionNew')}</SelectItem>
              <SelectItem value="used">{t('conditionUsed')}</SelectItem>
              <SelectItem value="damaged">{t('conditionDamaged')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="descriptionEs">{t('descriptionEs')}</Label>
        <Textarea id="descriptionEs" rows={4} {...register('descriptionEs')} />
        {errors.descriptionEs && <p className="text-sm text-danger">required</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="descriptionEn">{t('descriptionEn')}</Label>
        <Textarea id="descriptionEn" rows={3} {...register('descriptionEn')} />
      </div>
      <div className="space-y-2">
        <Label>{t('images')}</Label>
        <ImageUploader vehicleId={vehicleId} initial={images} onChange={setImages} />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4.3: Commit**

```
pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/app/[locale]/'(protected)'/staff/vehicles/new
git commit -m "feat(web): staff/vehicles/new — create vehicle form with image upload"
```

---

## Task 5: Vehicle detail page with edit + status transitions

- [ ] **Step 5.1: Server page** `apps/web/src/app/[locale]/(protected)/staff/vehicles/[id]/page.tsx`:

```tsx
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import { EditVehicleForm } from './edit-vehicle-form';

interface Props {
  params: { locale: string; id: string };
}

export default async function VehicleDetailPage({ params: { locale, id } }: Props) {
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
        make: (data['make'] as string) ?? '',
        model: (data['model'] as string) ?? '',
        year: (data['year'] as number) ?? new Date().getFullYear(),
        vin: (data['vin'] as string) ?? '',
        mileage: data['mileage'] as number | undefined,
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
          storagePath: extractPath(img.url),
        })),
      }}
    />
  );
}

function extractPath(url: string): string {
  // Best-effort: parse storage path from download URL. For Firebase Storage URLs,
  // the path lives between '/o/' and '?'.
  try {
    const m = /\/o\/([^?]+)/.exec(url);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch {
    /* noop */
  }
  return '';
}
```

- [ ] **Step 5.2: Edit form** `edit-vehicle-form.tsx` — copy of `new/vehicle-form.tsx` adapted to:
  - Take `initial` prop including `status` and `images`
  - Use `setDoc(ref, payload, { merge: true })` (not new doc)
  - Show status badge at top
  - Add a "Marcar como listo" button (only when status === 'draft' and at least 1 image): writes `status: 'ready'`. Conversely "Volver a borrador" when status === 'ready'.
  - If status is 'in_auction', 'sold', 'archived', the form is read-only (show but disable save).

The full file is structurally identical to `new/vehicle-form.tsx` with these adaptations. Implementation note: keep `vehicleId` from props (no `useState(() => doc(...).id)`); pass `initial` images to `ImageUploader`.

(Verbose 280-line file; follow the same imports and JSX pattern. Use `register` defaultValues from `initial` mapped fields.)

- [ ] **Step 5.3: Commit**

```
pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/app/[locale]/'(protected)'/staff/vehicles/'[id]'
git commit -m "feat(web): staff vehicle detail — edit + status transitions"
```

---

## Task 6: Smoke test (manual)

Login as admin (or seed a staff user — see helper below).

Optional: seed a staff user. Run from repo root:

```
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=carbid-staging \
node -e "
const a = require('firebase-admin');
a.initializeApp({projectId:'carbid-staging'});
(async ()=>{
  const u = await a.auth().createUser({email:'staff@santarosa.com.py', password:'Carbid123!', emailVerified:true});
  await a.auth().setCustomUserClaims(u.uid, {role:'staff', status:'active'});
  await a.firestore().doc('users/'+u.uid).set({uid:u.uid, role:'staff', email:'staff@santarosa.com.py', status:'active', profile:{firstName:'Staff',lastName:'Test',documentType:'CI',documentNumber:'1234567'}, preferences:{locale:'es',theme:'system',notifications:{outbidEmail:true,auctionWonEmail:true,newAuctionEmail:false}}, createdBy:'bootstrap', createdAt:a.firestore.FieldValue.serverTimestamp(), updatedAt:a.firestore.FieldValue.serverTimestamp()});
  console.log('staff seeded');
})()"
```

Test flow:

1. Navigate to `/staff/vehicles` → empty state
2. Click "Nuevo vehículo" → fill form (make: Toyota, model: Corolla, year: 2020, transmission: automatic, fuel: gasoline, condition: used, descripción ES required, mileage 50000) → upload 1-2 images → "Guardar"
3. Lands on detail → status = "Borrador", badge visible.
4. Click "Marcar como listo" → status badge updates to "Listo"
5. Back to list → vehicle appears with thumbnail.

---

## Self-Review

Spec coverage (§6 Staff dashboard — Vehicles section):

- Wizard de 3 pasos → simplificado a single-page form (multi-step deferred to post-MVP UX iteration; functionally equivalent for the same data captured)
- Hasta 20 imágenes → upload supports many; hard limit not enforced (can be added with a count check; trivial)
- Reorder de imágenes → deferred (drag-drop) — uploads in order, primary = first
- Estados draft → ready → in_auction → sold → archived ✅
- "Publicar a subasta" — implemented as status toggle to `ready`. The actual `createAuction` flow is Plan 4b.

Out of scope:

- Drag-drop image reorder (post-MVP)
- 3-step wizard UX (post-MVP)
- Thumbnail generation Cloud Function (Plan 9)
- Hard limit of 20 images (trivial future check)

---

## Execution Handoff

Recommended batches:

- Batch EE: Task 1 (layout + i18n)
- Batch FF: Task 2 (list)
- Batch GG: Tasks 3-4 (uploader + new form)
- Batch HH: Task 5 (edit + status)
- Batch II (manual): Task 6 (smoke)
