import { redirect } from 'next/navigation';

export default function SettingsHome({ params: { locale } }: { params: { locale: string } }) {
  redirect(`/${locale}/settings/profile`);
}
