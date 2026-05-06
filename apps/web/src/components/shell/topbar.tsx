'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, LogOut, Settings as SettingsIcon, ChevronDown } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { fb } from '@/lib/firebase/client';
import { SidebarNav } from './sidebar-nav';
import { NotificationBell } from './notification-bell';
import type { NavItem, Role } from './nav-config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type AudienceLabel = 'retail' | 'wholesale' | undefined;

function roleLabel(role: Role, audience: AudienceLabel): string {
  if (role === 'admin') return 'Admin';
  if (role === 'staff') return 'Staff';
  if (audience === 'wholesale') return 'Wholesale';
  return 'Retail';
}

function roleTone(role: Role, audience: AudienceLabel): string {
  if (role === 'admin') return 'bg-copper/15 text-copper ring-copper/20';
  if (role === 'staff') return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/20';
  if (audience === 'wholesale') return 'bg-amber-500/15 text-amber-300 ring-amber-500/20';
  return 'bg-violet-500/15 text-violet-300 ring-violet-500/20';
}

interface Props {
  locale: string;
  email: string;
  firstName: string;
  uid: string;
  role: Role;
  audience?: 'retail' | 'wholesale';
  navItems: NavItem[];
  signOutLabel: string;
  settingsLabel: string;
}

export function Topbar({
  locale,
  email,
  firstName,
  uid,
  role,
  audience,
  navItems,
  signOutLabel,
  settingsLabel,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const initial = (firstName || email).slice(0, 1).toUpperCase();

  async function handleSignOut() {
    await fetch('/api/session', { method: 'DELETE' });
    await signOut(fb.auth);
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  return (
    <>
      <header
        className={
          'sticky top-0 z-30 h-14 border-b border-text-subtle/15 ' +
          'bg-bg-elev/80 backdrop-blur-md backdrop-saturate-150 ' +
          'flex items-center justify-between px-4 md:px-6 gap-3'
        }
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className={
              'lg:hidden -ml-1.5 w-9 h-9 grid place-items-center rounded-lg ' +
              'text-text-muted hover:text-text-strong hover:bg-bg-deep/60 transition-colors'
            }
          >
            <Menu className="w-5 h-5" strokeWidth={2.25} />
          </button>
          <Link
            href={`/${locale}` as `/${string}`}
            className="font-wordmark font-bold tracking-tight text-xl flex items-center"
          >
            <span className="text-copper">CAR</span>
            <span className="text-ink">BID</span>
          </Link>
          <span
            className={
              'hidden sm:inline-flex items-center gap-1 text-[10px] uppercase font-semibold ' +
              'tracking-[0.08em] rounded-md px-2 py-0.5 ring-1 ring-inset ' +
              roleTone(role, audience)
            }
          >
            {roleLabel(role, audience)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <NotificationBell locale={locale} role={role} uid={uid} />
          <DropdownMenu>
            <DropdownMenuTrigger
              className={
                'flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 ' +
                'text-sm text-text-muted hover:text-text-strong ' +
                'hover:bg-bg-deep/60 transition-colors max-w-[260px]'
              }
            >
              <span
                aria-hidden
                className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-copper/30 to-violet-500/20 grid place-items-center text-text-strong text-xs font-semibold"
              >
                {initial}
              </span>
              <span className="hidden sm:block truncate text-sm font-medium">{firstName}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-text-strong truncate font-semibold">
                    {firstName || 'Usuario'}
                  </span>
                  <span className="text-xs text-text-muted truncate">{email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  href={`/${locale}/settings/profile` as `/${string}`}
                  className="cursor-pointer"
                >
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  {settingsLabel}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-danger focus:text-danger"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {signOutLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        navItems={navItems}
        firstName={firstName}
        email={email}
        role={role}
        {...(audience ? { audience } : {})}
      />
    </>
  );
}

function MobileDrawer({
  open,
  onClose,
  navItems,
  firstName,
  email,
  role,
  audience,
}: {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
  firstName: string;
  email: string;
  role: Role;
  audience?: 'retail' | 'wholesale';
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={
          'lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ' +
          (open ? 'opacity-100' : 'opacity-0 pointer-events-none')
        }
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className={
          'lg:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[80%] ' +
          'bg-bg-elev border-r border-text-subtle/15 shadow-2xl ' +
          'flex flex-col transition-transform duration-300 ease-out ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-text-subtle/15">
          <span className="font-wordmark font-bold tracking-tight text-xl">
            <span className="text-copper">CAR</span>
            <span className="text-ink">BID</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="w-9 h-9 grid place-items-center rounded-lg text-text-muted hover:text-text-strong hover:bg-bg-deep/60 transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={2.25} />
          </button>
        </div>
        <div className="px-3 py-4 border-b border-text-subtle/15 space-y-2">
          <div className="flex items-center gap-2.5 px-2">
            <span
              aria-hidden
              className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-copper/30 to-violet-500/20 grid place-items-center text-text-strong text-sm font-semibold"
            >
              {(firstName || email).slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-text-strong truncate font-semibold">
                {firstName || 'Usuario'}
              </p>
              <p className="text-[11px] text-text-muted truncate">{email}</p>
              <span
                className={
                  'mt-1 inline-flex items-center text-[10px] uppercase font-semibold tracking-[0.08em] rounded-md px-1.5 py-0.5 ring-1 ring-inset ' +
                  roleTone(role, audience)
                }
              >
                {roleLabel(role, audience)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <SidebarNav items={navItems} onNavigate={onClose} />
        </div>
      </aside>
    </>
  );
}
