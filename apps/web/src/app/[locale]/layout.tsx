import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { AuthProvider } from '@/lib/auth/AuthProvider';

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <AuthProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </AuthProvider>
    </NextIntlClientProvider>
  );
}
