import { requireRole } from '@/lib/auth/server';
import { BidsActivity } from './bids-activity';

export default async function BidsPage({ params: { locale } }: { params: { locale: string } }) {
  // The /staff layout admits admin+staff+finanzas; this page is admin+staff
  // only — finanzas must not see bidder activity/contact.
  await requireRole(locale, ['admin', 'staff']);
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Pujas
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          Actividad de pujas
        </h1>
        <p className="text-sm text-text-muted">
          Quién está pujando, con qué montos y si recibieron el aviso por email. En vivo e
          histórico.
        </p>
      </header>
      <BidsActivity locale={locale} />
    </div>
  );
}
