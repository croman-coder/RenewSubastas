import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/server';
import { loadStaffStats } from '@/lib/staff/load-staff-stats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PageProps {
  params: { locale: string };
}

export default async function StaffHome({ params: { locale } }: PageProps) {
  const user = await getCurrentUser(locale);
  const s = await loadStaffStats(user.uid);

  const totalVehicles =
    s.vehicles.draft + s.vehicles.ready + s.vehicles.inAuction + s.vehicles.sold;
  const totalAuctions = s.auctions.scheduled + s.auctions.live + s.auctions.ended;

  return (
    <div className="space-y-6">
      <header className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
        <h1 className="text-2xl font-semibold text-text-strong">Mi panel</h1>
        <p className="text-sm text-text-muted">Resumen de tus vehículos y subastas.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={`/${locale}/staff/vehicles/new` as `/${string}`}>+ Nuevo vehículo</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${locale}/staff/auctions/new` as `/${string}`}>+ Nueva subasta</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Borrador" value={s.vehicles.draft} hint="Vehículos sin completar" />
        <Kpi label="Listos" value={s.vehicles.ready} hint="Listos para subastar" />
        <Kpi label="En subasta" value={s.vehicles.inAuction} hint="Subasta activa" />
        <Kpi label="Vendidos" value={s.vehicles.sold} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mis vehículos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Total" value={totalVehicles} />
            <Row label="Borrador" value={s.vehicles.draft} />
            <Row label="Listos" value={s.vehicles.ready} />
            <Row label="En subasta" value={s.vehicles.inAuction} />
            <Row label="Vendidos" value={s.vehicles.sold} />
            <Link
              href={`/${locale}/staff/vehicles` as `/${string}`}
              className="block text-sm text-text-muted hover:text-text-strong pt-2"
            >
              Ver todos →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mis subastas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Total" value={totalAuctions} />
            <Row label="Programadas" value={s.auctions.scheduled} />
            <Row label="En vivo" value={s.auctions.live} />
            <Row label="Finalizadas" value={s.auctions.ended} />
            <Link
              href={`/${locale}/staff/auctions` as `/${string}`}
              className="block text-sm text-text-muted hover:text-text-strong pt-2"
            >
              Ver todas →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-1">
        <div className="text-3xl font-semibold text-text-strong">{value}</div>
        <div className="text-sm text-text-strong">{label}</div>
        {hint && <div className="text-xs text-text-muted">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-strong font-medium tabular-nums">{value}</span>
    </div>
  );
}
