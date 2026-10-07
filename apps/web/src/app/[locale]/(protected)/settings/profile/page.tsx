import { getCurrentUser } from '@/lib/auth/server';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { safeAuctionReturnPath } from '@/lib/settings/return-path';
import { ProfileForm } from './profile-form';

export default async function ProfilePage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams?: { completar?: string; from?: string };
}) {
  const user = await getCurrentUser(locale);
  const snap = await getFirestore(getAdminApp()).doc(`users/${user.uid}`).get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const profile = (data['profile'] ?? {}) as Record<string, unknown>;
  const address = (profile['address'] ?? {}) as Record<string, unknown>;
  return (
    <ProfileForm
      isBuyer={user.role === 'buyer'}
      // El aviso de "perfil incompleto" al pujar enlaza acá con ?completar=1.
      completar={searchParams?.completar === '1'}
      // `from` viene de la URL: solo se pasa si es la ruta de una subasta.
      returnTo={
        searchParams?.completar === '1' ? safeAuctionReturnPath(searchParams.from, locale) : null
      }
      initial={{
        firstName: (profile['firstName'] as string) ?? '',
        lastName: (profile['lastName'] as string) ?? '',
        email: user.email,
        documentType: (profile['documentType'] as 'CI' | 'RUC' | 'PASSPORT' | undefined) ?? 'CI',
        documentNumber: (profile['documentNumber'] as string) ?? '',
        phone: (profile['phone'] as string) ?? '',
        addressStreet: (address['street'] as string) ?? '',
        addressDepartment: (address['department'] as string) ?? '',
        addressCity: (address['city'] as string) ?? '',
        addressBarrio: (address['barrio'] as string) ?? '',
        addressPostalCode: (address['postalCode'] as string) ?? '',
      }}
    />
  );
}
