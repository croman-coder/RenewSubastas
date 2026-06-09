import { CreateUserForm } from '../../../admin/users/new/create-user-form';

// Staff-facing customer onboarding. Reuses the admin CreateUserForm in
// "restrictToBuyers" mode so the role picker only exposes retail and
// wholesale — staff can onboard customers day-to-day without being able
// to manufacture more admin/staff accounts. The server-side createUser
// callable enforces the same restriction, so a curl-armed staff member
// can't bypass the UI either.
export default function StaffCreateBuyerPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  return <CreateUserForm locale={locale} creatorRole="staff" />;
}
