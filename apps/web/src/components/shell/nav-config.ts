// String icon keys keep this module serializable across the Server -> Client
// component boundary (the AppShell is a Server Component but the Topbar/
// SidebarNav that consume the nav are Client Components, so passing actual
// LucideIcon component references in props would break Next's RSC payload).
export type IconKey =
  | 'home'
  | 'users'
  | 'car'
  | 'gavel'
  | 'audit'
  | 'settings'
  | 'heart'
  | 'trophy'
  | 'key'
  | 'activity'
  | 'chart';

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  /** Mark as exact match for active detection. If false, uses startsWith. */
  exact?: boolean;
}

export type Role = 'admin' | 'staff' | 'finanzas' | 'buyer';
export type Audience = 'retail' | 'wholesale';

interface T {
  admin: {
    home: string;
    users: string;
    vehicles: string;
    auctions: string;
    sales: string;
    audit: string;
    config: string;
  };
  staff: { home: string; vehicles: string; auctions: string; buyers: string };
  buyer: { catalog: string; bids: string; won: string };
  common: { settings: string };
}

export function getNavItems(
  role: Role,
  locale: string,
  t: T,
  audience: Audience = 'retail',
): NavItem[] {
  if (role === 'admin') {
    return [
      { href: `/${locale}/admin`, label: t.admin.home, icon: 'home', exact: true },
      { href: `/${locale}/admin/users`, label: t.admin.users, icon: 'users' },
      { href: `/${locale}/staff/vehicles`, label: t.admin.vehicles, icon: 'car' },
      { href: `/${locale}/staff/auctions`, label: t.admin.auctions, icon: 'gavel' },
      { href: `/${locale}/sales`, label: t.admin.sales, icon: 'trophy' },
      { href: `/${locale}/staff/bids`, label: 'Pujas', icon: 'activity' },
      { href: `/${locale}/staff/insights`, label: 'Reporte', icon: 'chart' },
      { href: `/${locale}/admin/password-resets`, label: 'Contraseñas', icon: 'key' },
      { href: `/${locale}/admin/audit`, label: t.admin.audit, icon: 'audit' },
      { href: `/${locale}/admin/config`, label: t.admin.config, icon: 'settings' },
    ];
  }
  if (role === 'staff') {
    return [
      { href: `/${locale}/staff`, label: t.staff.home, icon: 'home', exact: true },
      { href: `/${locale}/staff/vehicles`, label: t.staff.vehicles, icon: 'car' },
      { href: `/${locale}/staff/auctions`, label: t.staff.auctions, icon: 'gavel' },
      { href: `/${locale}/staff/bids`, label: 'Pujas', icon: 'activity' },
      { href: `/${locale}/staff/insights`, label: 'Reporte', icon: 'chart' },
      // Staff can onboard buyers (retail / wholesale). Route reuses the
      // admin create-user form in restricted mode; staff cannot reach
      // /admin/users (admin layout blocks them).
      { href: `/${locale}/staff/buyers/new`, label: t.staff.buyers, icon: 'users' },
    ];
  }
  if (role === 'finanzas') {
    // Finance role: just the sales ledger, where it confirms/releases
    // seña. Auction detail (confirm button) is reached by clicking a
    // sale row.
    return [{ href: `/${locale}/sales`, label: t.admin.sales, icon: 'trophy' }];
  }
  // buyer — paths follow the buyer's audience so the URL bar matches the
  // role chip ('Retail' / 'Wholesale').
  return [
    { href: `/${locale}/${audience}`, label: 'Inicio', icon: 'home', exact: true },
    { href: `/${locale}/auctions`, label: t.buyer.catalog, icon: 'gavel' },
    { href: `/${locale}/${audience}/bids`, label: t.buyer.bids, icon: 'heart' },
    { href: `/${locale}/${audience}/won`, label: t.buyer.won, icon: 'trophy' },
  ];
}
