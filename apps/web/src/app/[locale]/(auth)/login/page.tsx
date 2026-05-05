import { useTranslations } from 'next-intl';
import { CarbidWordmark } from '@/components/brand/carbid-wordmark';
import { LoginForm } from './login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PageProps {
  params: { locale: string };
  searchParams?: { from?: string; error?: string };
}

const ERROR_KEY: Record<string, string> = {
  disabled: 'errors.accountDisabled',
  expired: 'errors.sessionExpired',
  no_role: 'errors.noRole',
};

export default function LoginPage({ params: { locale }, searchParams }: PageProps) {
  const t = useTranslations('auth.login');
  const errorKey = searchParams?.error ? ERROR_KEY[searchParams.error] : undefined;
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-bg-base">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <CarbidWordmark size="lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorKey && (
              <Alert variant="destructive">
                <AlertDescription>{t(errorKey)}</AlertDescription>
              </Alert>
            )}
            <LoginForm
              {...(searchParams?.from !== undefined ? { from: searchParams.from } : {})}
              locale={locale}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
