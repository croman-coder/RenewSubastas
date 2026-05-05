'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  });
type FormValues = z.infer<typeof Schema>;

export function ChangePasswordForm() {
  const t = useTranslations('settings.security');
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(Schema) });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const user = fb.auth.currentUser;
      if (!user || !user.email) throw new Error('no_user');
      const cred = EmailAuthProvider.credential(user.email, values.currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, values.newPassword);
      toast.success(t('passwordChanged'));
      reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        toast.error(t('errors.wrongCurrent'));
      } else {
        toast.error(t('errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">{t('currentPassword')}</Label>
        <Input id="currentPassword" type="password" {...register('currentPassword')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">{t('newPassword')}</Label>
        <Input id="newPassword" type="password" {...register('newPassword')} />
        {errors.newPassword && <p className="text-sm text-danger">{t('errors.tooShort')}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
        <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
        {errors.confirmPassword && (
          <p className="text-sm text-danger">{t('errors.passwordsDontMatch')}</p>
        )}
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? t('changing') : t('changePassword')}
      </Button>
    </form>
  );
}
