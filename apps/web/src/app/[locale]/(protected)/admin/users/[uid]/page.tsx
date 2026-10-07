import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { formatDateTimePy } from '@/lib/format/date';
import {
  formatDocument,
  formatPhoneForReading,
  phoneDigits,
  registrationLabel,
  telUrl,
  whatsappUrl,
} from '@/lib/admin/contact-links';
import { loadUserActivity } from '@/lib/admin/load-user-activity';
import { EditRoleForm } from './edit-role-form';

interface Props {
  params: { locale: string; uid: string };
}

export default async function UserDetailPage({ params: { locale, uid } }: Props) {
  const t = await getTranslations('admin.users.detail');
  const snap = await getFirestore(getAdminApp()).doc(`users/${uid}`).get();
  if (!snap.exists) notFound();
  const data = snap.data()!;
  const profile = (data['profile'] ?? {}) as Record<string, unknown>;
  const address = (profile['address'] ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  // La página ya está bajo el guard de rol admin de (protected)/admin/layout.tsx
  // (requireRole(['admin'])): estos datos personales no salen de ahí.
  const phoneRaw = str(profile['phone']);
  const digits = phoneDigits(phoneRaw);
  const phoneShown = formatPhoneForReading(phoneRaw);
  const documentShown = formatDocument(
    str(profile['documentType']),
    str(profile['documentNumber']),
  );
  const addressShown = [str(address['street']), str(address['city']), str(address['postalCode'])]
    .filter(Boolean)
    .join(', ');
  const createdAtMs =
    (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  const email = (data['email'] as string | undefined) ?? '';
  const isBuyer = data['role'] === 'buyer';
  // Solo los compradores pujan: para el resto la sección no aporta nada.
  const activity = isBuyer ? await loadUserActivity(uid) : null;
  const count = (n: number | null) => (n === null ? '—' : String(n));

  return (
    <div className="max-w-2xl space-y-6">
      <a href={`/${locale}/admin/users`} className="text-sm text-text-muted hover:text-text-strong">
        {t('back')}
      </a>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-text-strong">
          {str(profile['firstName'])} {str(profile['lastName'])}
        </h1>
        <p className="text-text-muted text-sm">{email}</p>
        <p className="text-xs text-text-muted">
          Tipo actual:{' '}
          <span className="text-text-strong font-medium">
            {data['role'] === 'admin'
              ? 'Admin'
              : data['role'] === 'staff'
                ? 'Staff'
                : profile['audience'] === 'wholesale'
                  ? 'Wholesale'
                  : 'Retail'}
          </span>
        </p>
      </header>
      <section
        aria-labelledby="client-data-title"
        className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 space-y-4 shadow-card"
      >
        <h2 id="client-data-title" className="text-lg font-medium text-text-strong">
          Datos del cliente
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-text-muted">Teléfono</dt>
          <dd className="space-y-2">
            {digits ? (
              <>
                <p className="text-text-strong">{phoneShown}</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={whatsappUrl(digits)} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={telUrl(digits)}>Llamar</a>
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-text-muted">Sin teléfono cargado</p>
            )}
          </dd>
          <dt className="text-text-muted">Email</dt>
          <dd className="text-text-strong break-all">
            {email ? (
              <a href={`mailto:${email}`} className="underline underline-offset-4">
                {email}
              </a>
            ) : (
              '—'
            )}
          </dd>
          <dt className="text-text-muted">Documento</dt>
          <dd className="text-text-strong">{documentShown ?? '—'}</dd>
          <dt className="text-text-muted">Dirección</dt>
          <dd className="text-text-strong">{addressShown || '—'}</dd>
          <dt className="text-text-muted">Registro</dt>
          <dd className="text-text-strong">
            {registrationLabel(data['provider'] as string | undefined)}
          </dd>
          <dt className="text-text-muted">Alta</dt>
          <dd className="text-text-strong">
            {createdAtMs ? formatDateTimePy(locale, createdAtMs) : '—'}
          </dd>
        </dl>
      </section>
      {activity && (
        <section
          aria-labelledby="client-activity-title"
          className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 space-y-4 shadow-card"
        >
          <h2 id="client-activity-title" className="text-lg font-medium text-text-strong">
            Actividad
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-text-muted">Pujas</dt>
            <dd className="text-text-strong">{count(activity.bidCount)}</dd>
            <dt className="text-text-muted">Subastas ganadas</dt>
            <dd className="text-text-strong">{count(activity.wonCount)}</dd>
            <dt className="text-text-muted">Última puja</dt>
            <dd className="text-text-strong">
              {activity.lastBidAtMs ? formatDateTimePy(locale, activity.lastBidAtMs) : '—'}
            </dd>
          </dl>
        </section>
      )}
      <Separator />
      <section className="space-y-4">
        <h2 className="text-lg font-medium text-text-strong">{t('changeRoleTitle')}</h2>
        <EditRoleForm
          uid={uid}
          locale={locale}
          initialRole={data['role'] as 'admin' | 'staff' | 'buyer'}
          initialAudience={(profile['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail'}
          initialStatus={data['status'] as 'active' | 'disabled'}
        />
      </section>
    </div>
  );
}
