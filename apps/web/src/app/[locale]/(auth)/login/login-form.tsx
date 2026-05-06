'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';
import { ROLE_HOME, type Role } from '@/lib/auth/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ForgotPasswordDialog } from './forgot-password-dialog';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
type FormValues = z.infer<typeof Schema>;

export function LoginForm({ from, locale }: { from?: string; locale: string }) {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
  });

  async function onSubmit(data: FormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(fb.auth, data.email, data.password);
      const idToken = await cred.user.getIdToken(true);
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === 'account_disabled') setError(t('errors.accountDisabled'));
        else setError(t('errors.generic'));
        await fb.auth.signOut();
        return;
      }
      const { role } = (await res.json()) as { role: Role };
      const target = from && from.startsWith('/') ? from : ROLE_HOME[role];
      router.replace(`/${locale}${target}`);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setError(t('errors.invalidCredentials'));
      } else {
        setError(t('errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-sm text-danger">{t('errors.emailInvalid')}</p>}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t('password')}</Label>
          <ForgotPasswordDialog />
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p className="text-sm text-danger">{t('errors.passwordTooShort')}</p>}
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
