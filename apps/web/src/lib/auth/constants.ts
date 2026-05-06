export const SESSION_COOKIE_NAME = '__session';
export const SESSION_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export type Role = 'admin' | 'staff' | 'buyer';

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  staff: '/staff',
  buyer: '/buyer',
};
