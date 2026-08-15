'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(
      fb.auth,
      (u) => {
        setUser(u);
        setLoading(false);
      },
      // Third argument, and not optional in practice. Without it Firebase has
      // nowhere to hand a failure and it surfaces as an unhandled promise
      // rejection — which is how `auth/network-request-failed` kept reaching
      // Sentry as an uncaught error from ad landings on `/es`: visitors
      // arriving inside Facebook's in-app browser on flaky mobile networks,
      // where the token request simply does not complete.
      //
      // There is nothing to retry here. A visitor whose auth check failed is,
      // for our purposes, a visitor without a session: the public pages render
      // the same either way. What matters is that `loading` is released, so
      // anything that ever waits on it cannot hang on a dropped request.
      () => {
        setUser(null);
        setLoading(false);
      },
    );
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
