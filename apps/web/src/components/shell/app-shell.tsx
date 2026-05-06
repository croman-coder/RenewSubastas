import { getCurrentUser } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';
import { Topbar } from './topbar';
import { SidebarNav } from './sidebar-nav';
import { getNavItems, type Role } from './nav-config';

interface Props {
  locale: string;
  children: React.ReactNode;
}

export async function AppShell({ locale, children }: Props) {
  const user = await getCurrentUser(locale);
  const tCommon = await getTranslations('common');
  const tAdmin = await getTranslations('admin.nav');
  const tStaff = await getTranslations('staff.nav');
  const tBuyer = await getTranslations('buyer');
  const tBuyerAuctions = await getTranslations('buyer.auctions');

  const role = user.role as Role;

  const navItems = getNavItems(role, locale, {
    admin: {
      home: tAdmin('home'),
      users: tAdmin('users'),
      vehicles: tAdmin('vehicles'),
      auctions: tAdmin('auctions'),
      audit: tAdmin('audit'),
      config: tAdmin('config'),
    },
    staff: {
      home: tStaff('home'),
      vehicles: tStaff('vehicles'),
      auctions: tStaff('auctions'),
    },
    buyer: {
      catalog: tBuyerAuctions('title'),
      bids: tBuyer('navBids'),
      won: tBuyer('navWon'),
    },
    common: { settings: tCommon('settings') },
  });

  return (
    <div className="min-h-screen bg-bg-base">
      <Topbar
        locale={locale}
        email={user.email}
        role={role}
        navItems={navItems}
        signOutLabel={tCommon('signOut')}
        settingsLabel={tCommon('settings')}
      />
      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className={
            'hidden lg:flex shrink-0 w-60 sticky top-14 self-start h-[calc(100vh-3.5rem)] ' +
            'border-r border-text-subtle/15 bg-bg-elev/40 ' +
            'flex-col px-3 py-4'
          }
        >
          <SidebarNav items={navItems} />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 py-5 md:px-8 md:py-7">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
