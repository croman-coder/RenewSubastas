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
  | 'trophy';

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  /** Mark as exact match for active detection. If false, uses startsWith. */
  exact?: boolean;
}

export type Role = 'admin' | 'staff' | 'buyer';

interface T {
  admin: {
    home: string;
    users: string;
    vehicles: string;
    auctions: string;
    audit: string;
    config: string;
  };
  staff: { home: string; vehicles: string; auctions: string };
  buyer: { catalog: string; bids: string; won: string };
  common: { settings: string };
}

export function getNavItems(role: Role, locale: string, t: T): NavItem[] {
  if (role === 'admin') {
    return [
      { href: `/${locale}/admin`, label: t.admin.home, icon: 'home', exact: true },
      { href: `/${locale}/admin/users`, label: t.admin.users, icon: 'users' },
      { href: `/${locale}/staff/vehicles`, label: t.admin.vehicles, icon: 'car' },
      { href: `/${locale}/staff/auctions`, label: t.admin.auctions, icon: 'gavel' },
      { href: `/${locale}/admin/audit`, label: t.admin.audit, icon: 'audit' },
      { href: `/${locale}/admin/config`, label: t.admin.config, icon: 'settings' },
    ];
  }
  if (role === 'staff') {
    return [
      { href: `/${locale}/staff`, label: t.staff.home, icon: 'home', exact: true },
      { href: `/${locale}/staff/vehicles`, label: t.staff.vehicles, icon: 'car' },
      { href: `/${locale}/staff/auctions`, label: t.staff.auctions, icon: 'gavel' },
    ];
  }
  // buyer
  return [
    { href: `/${locale}/auctions`, label: t.buyer.catalog, icon: 'gavel', exact: true },
    { href: `/${locale}/buyer/bids`, label: t.buyer.bids, icon: 'heart' },
    { href: `/${locale}/buyer/won`, label: t.buyer.won, icon: 'trophy' },
  ];
}
