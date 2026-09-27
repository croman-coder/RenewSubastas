import { getCurrentUser, type CurrentUser } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';
import { Topbar } from './topbar';
import { SidebarNav } from './sidebar-nav';
import { RouteProgress } from './route-progress';
import { PushPermissionPrompt } from './push-permission-prompt';
import { SessionBridge } from './session-bridge';
import { BottomTabBar } from './bottom-tab-bar';
import { getNavItems, type Role } from './nav-config';

interface Props {
  locale: string;
  children: React.ReactNode;
  /**
   * Cuando quien llama ya verificó la sesión con getOptionalUser (como el
   * layout de (abierto)), se pasa acá para que el request verifique la
   * sesión una sola vez en vez de dos. Sin este prop, AppShell verifica con
   * getCurrentUser y aplica sus redirects, igual que hoy en (protected).
   */
  user?: CurrentUser;
}

export async function AppShell(props: Props) {
  const { locale, children } = props;
  const user = props.user ?? (await getCurrentUser(locale));
  const tCommon = await getTranslations('common');
  const tAdmin = await getTranslations('admin.nav');
  const tStaff = await getTranslations('staff.nav');
  const tBuyer = await getTranslations('buyer');
  const tBuyerAuctions = await getTranslations('buyer.auctions');

  const role = user.role as Role;
  const isBuyer = role === 'buyer';

  const navItems = getNavItems(
    role,
    locale,
    {
      admin: {
        home: tAdmin('home'),
        users: tAdmin('users'),
        vehicles: tAdmin('vehicles'),
        auctions: tAdmin('auctions'),
        sales: tAdmin('sales'),
        audit: tAdmin('audit'),
        config: tAdmin('config'),
      },
      staff: {
        home: tStaff('home'),
        vehicles: tStaff('vehicles'),
        auctions: tStaff('auctions'),
        buyers: tStaff('buyers'),
      },
      buyer: {
        catalog: tBuyerAuctions('title'),
        bids: tBuyer('navBids'),
        won: tBuyer('navWon'),
      },
      common: { settings: tCommon('settings') },
    },
    user.audience ?? 'retail',
  );

  return (
    <div className="min-h-screen bg-bg-base">
      <SessionBridge uid={user.uid} />
      <RouteProgress />
      <Topbar
        locale={locale}
        email={user.email}
        firstName={user.firstName}
        uid={user.uid}
        role={role}
        {...(user.audience ? { audience: user.audience } : {})}
        navItems={navItems}
        signOutLabel={tCommon('signOut')}
        signOutFailedLabel={tCommon('signOutFailed')}
        settingsLabel={tCommon('settings')}
      />
      {/* Push opt-in lives only on the buyer surface. Admin/staff
          notifications are operational (bids landing, password resets)
          and already covered by the in-app bell; pestering them for OS
          permission adds no value. */}
      {role === 'buyer' && <PushPermissionPrompt locale={locale} />}
      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className={
            'hidden lg:flex shrink-0 w-60 sticky top-14 self-start h-[calc(100vh-3.5rem)] ' +
            'border-r border-text-subtle/15 bg-bg-elev ' +
            'flex-col px-3 py-4'
          }
        >
          <SidebarNav items={navItems} />
        </aside>

        {/* Main content. Con la barra de pestañas del comprador (< lg) el
            contenido deja abajo el alto de la barra más el área segura del
            iPhone, para que nada quede tapado (spec 2026-09-27 §4). La barra
            de puja de la ficha mide lo mismo, así que este lugar le sirve
            también. El md: repetido es a propósito: md:py-7 pisaría el pb. */}
        <main
          className={
            'flex-1 min-w-0 px-4 py-5 md:px-8 md:py-7' +
            (isBuyer
              ? ' pb-[calc(64px_+_env(safe-area-inset-bottom)_+_1rem)] md:pb-[calc(64px_+_env(safe-area-inset-bottom)_+_1rem)] lg:pb-7'
              : '')
          }
        >
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      {isBuyer && <BottomTabBar items={navItems} />}
    </div>
  );
}
