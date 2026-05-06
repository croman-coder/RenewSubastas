import { KeyRound } from 'lucide-react';
import { listPasswordResetRequests } from '@/lib/admin/list-password-reset-requests';
import { ResetRequestsTable } from './reset-requests-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { status?: string };
}

export default async function PasswordResetsPage({ params: { locale }, searchParams }: PageProps) {
  const status =
    searchParams?.status === 'resolved'
      ? 'resolved'
      : searchParams?.status === 'pending'
        ? 'pending'
        : 'pending';
  const data = await listPasswordResetRequests({ status });

  return (
    <div className="space-y-6">
      <header className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-300 grid place-items-center">
            <KeyRound className="w-4 h-4" strokeWidth={2.25} />
          </span>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
            Solicitudes de contraseña
          </h1>
        </div>
        <p className="text-sm text-text-muted">
          Buyers que olvidaron su contraseña. Verificá su identidad antes de generar el link y
          enviarlo por canal seguro (WhatsApp, llamada).
        </p>
      </header>

      <ResetRequestsTable locale={locale} items={data.items} currentStatus={status} />
    </div>
  );
}
