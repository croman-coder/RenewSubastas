import { AppShell } from '@/components/shell/app-shell';

interface LayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function ProtectedLayout({ children, params: { locale } }: LayoutProps) {
  return <AppShell locale={locale}>{children}</AppShell>;
}
