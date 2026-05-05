import { getCurrentUser } from '@/lib/auth/server';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { PreferencesForm } from './preferences-form';

export default async function PreferencesPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await getCurrentUser(locale);
  const snap = await getFirestore(getAdminApp()).doc(`users/${user.uid}`).get();
  const prefs = (snap.data()?.['preferences'] ?? {}) as Record<string, unknown>;
  const notif = (prefs['notifications'] ?? {}) as Record<string, boolean>;
  return (
    <PreferencesForm
      initial={{
        locale: (prefs['locale'] as 'es' | 'en') ?? 'es',
        theme: (prefs['theme'] as 'light' | 'dark' | 'system') ?? 'system',
        notifications: {
          outbidEmail: notif['outbidEmail'] ?? true,
          auctionWonEmail: notif['auctionWonEmail'] ?? true,
          newAuctionEmail: notif['newAuctionEmail'] ?? false,
        },
      }}
    />
  );
}
