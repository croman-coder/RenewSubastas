'use client';
import { useEffect } from 'react';
import { ensureClientAuth } from '@/lib/auth/ensure-client-auth';

/**
 * Al entrar a cualquier página protegida, alinea la sesión del SDK de
 * Firebase del navegador con la del servidor (ver lib/auth/client-token.ts).
 * Sin esto, quien abre la web desde el ícono del iPhone ve todo normal pero
 * cada puja, compra o alta de notificaciones vuelve con 401.
 */
export function SessionBridge({ uid }: { uid: string }) {
  useEffect(() => {
    void ensureClientAuth(uid);
  }, [uid]);
  return null;
}
