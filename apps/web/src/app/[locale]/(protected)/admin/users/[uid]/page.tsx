import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Separator } from '@/components/ui/separator';
import { EditRoleForm } from './edit-role-form';

interface Props {
  params: { locale: string; uid: string };
}

export default async function UserDetailPage({ params: { locale, uid } }: Props) {
  const t = await getTranslations('admin.users.detail');
  const snap = await getFirestore(getAdminApp()).doc(`users/${uid}`).get();
  if (!snap.exists) notFound();
  const data = snap.data()!;
  const profile = (data['profile'] ?? {}) as Record<string, string>;

  return (
    <div className="max-w-2xl space-y-6">
      <a href={`/${locale}/admin/users`} className="text-sm text-text-muted hover:text-text-strong">
        {t('back')}
      </a>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-text-strong">
          {profile['firstName']} {profile['lastName']}
        </h1>
        <p className="text-text-muted text-sm">{data['email'] as string}</p>
        <p className="text-xs text-text-muted">
          Tipo actual:{' '}
          <span className="text-text-strong font-medium">
            {data['role'] === 'admin'
              ? 'Admin'
              : data['role'] === 'staff'
                ? 'Staff'
                : (profile['audience'] as string | undefined) === 'wholesale'
                  ? 'Wholesale'
                  : 'Retail'}
          </span>
        </p>
      </header>
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
