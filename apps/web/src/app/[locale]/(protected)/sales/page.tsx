import { SalesTable } from './sales-table';

export default function AdminSalesPage({ params: { locale } }: { params: { locale: string } }) {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Ventas
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          Subastas vendidas
        </h1>
        <p className="text-sm text-text-muted">
          Vehículos adjudicados con su ganador, monto final, seña y estado de pago. Se actualiza en
          tiempo real.
        </p>
      </header>
      <SalesTable locale={locale} />
    </div>
  );
}
