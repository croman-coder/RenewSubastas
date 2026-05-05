import { getCurrentUser } from '@/lib/auth/server';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { ProfileForm } from './profile-form';

export default async function ProfilePage({ params: { locale } }: { params: { locale: string } }) {
  const user = await getCurrentUser(locale);
  const snap = await getFirestore(getAdminApp()).doc(`users/${user.uid}`).get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const profile = (data['profile'] ?? {}) as Record<string, unknown>;
  const address = (profile['address'] ?? {}) as Record<string, unknown>;
  return (
    <ProfileForm
      initial={{
        firstName: (profile['firstName'] as string) ?? '',
        lastName: (profile['lastName'] as string) ?? '',
        email: user.email,
        documentType: (profile['documentType'] as 'CI' | 'RUC') ?? 'CI',
        documentNumber: (profile['documentNumber'] as string) ?? '',
        phone: (profile['phone'] as string) ?? '',
        addressStreet: (address['street'] as string) ?? '',
        addressCity: (address['city'] as string) ?? '',
        addressPostalCode: (address['postalCode'] as string) ?? '',
      }}
    />
  );
}
