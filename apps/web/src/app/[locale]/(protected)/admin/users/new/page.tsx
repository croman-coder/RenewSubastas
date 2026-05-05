import { useTranslations } from 'next-intl';
import { CreateUserForm } from './create-user-form';

export default function NewUserPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations('admin.users.create');
  return (
    <div className="max-w-xl space-y-6">
      <a href={`/${locale}/admin/users`} className="text-sm text-text-muted hover:text-text-strong">
        ← Usuarios
      </a>
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      <CreateUserForm locale={locale} />
    </div>
  );
}
