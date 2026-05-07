export const SESSION_COOKIE_NAME = '__session';
export const SESSION_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export type Role = 'admin' | 'staff' | 'buyer';

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  staff: '/staff',
  // Buyers (retail and wholesale alike) land on /panel — an audience-neutral
  // path so the URL doesn't say "buyer" while the UI labels them
  // Retail / Wholesale.
  buyer: '/panel',
};
