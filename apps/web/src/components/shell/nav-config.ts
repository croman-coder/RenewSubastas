import {
  Home,
  Users,
  Car,
  Gavel,
  ClipboardList,
  Settings,
  Heart,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
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
      { href: `/${locale}/admin`, label: t.admin.home, icon: Home, exact: true },
      { href: `/${locale}/admin/users`, label: t.admin.users, icon: Users },
      { href: `/${locale}/staff/vehicles`, label: t.admin.vehicles, icon: Car },
      { href: `/${locale}/staff/auctions`, label: t.admin.auctions, icon: Gavel },
      { href: `/${locale}/admin/audit`, label: t.admin.audit, icon: ClipboardList },
      { href: `/${locale}/admin/config`, label: t.admin.config, icon: Settings },
    ];
  }
  if (role === 'staff') {
    return [
      { href: `/${locale}/staff`, label: t.staff.home, icon: Home, exact: true },
      { href: `/${locale}/staff/vehicles`, label: t.staff.vehicles, icon: Car },
      { href: `/${locale}/staff/auctions`, label: t.staff.auctions, icon: Gavel },
    ];
  }
  // buyer
  return [
    { href: `/${locale}/auctions`, label: t.buyer.catalog, icon: Gavel, exact: true },
    { href: `/${locale}/buyer/bids`, label: t.buyer.bids, icon: Heart },
    { href: `/${locale}/buyer/won`, label: t.buyer.won, icon: Trophy },
  ];
}
