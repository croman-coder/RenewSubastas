import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';

export type Role = 'admin' | 'staff' | 'buyer';

export function requireSignedIn(req: CallableRequest): { uid: string; role: Role; status: string } {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }
  const role = req.auth.token['role'] as Role | undefined;
  const status = req.auth.token['status'] as string | undefined;
  if (!role || !status) {
    throw new HttpsError('failed-precondition', 'User claims not yet provisioned');
  }
  if (status !== 'active') {
    throw new HttpsError('permission-denied', 'Account is disabled');
  }
  return { uid: req.auth.uid, role, status };
}

export function requireAdmin(req: CallableRequest): { uid: string } {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'admin') throw new HttpsError('permission-denied', 'Admin role required');
  return { uid };
}

export function badRequest(message: string, details?: unknown): never {
  throw new HttpsError('invalid-argument', message, details);
}
