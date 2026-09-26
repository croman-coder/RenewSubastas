'use client';
import { signInWithCustomToken } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';
import { bridgeClientAuth } from './client-session-bridge';

let inflight: Promise<boolean> | null = null;

/**
 * `bridgeClientAuth` atado al SDK real. Una sola llamada en vuelo a la vez:
 * el shell protegido la dispara al montar y el botón de notificaciones puede
 * pedirla en el mismo instante; los dos esperan la misma promesa.
 */
export function ensureClientAuth(expectedUid?: string): Promise<boolean> {
  inflight ??= bridgeClientAuth(expectedUid, {
    auth: fb.auth,
    fetchImpl: (input, init) => fetch(input, init),
    signIn: (token) => signInWithCustomToken(fb.auth, token),
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}
