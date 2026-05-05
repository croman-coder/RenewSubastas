'use client';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updatePreferencesAction } from '@/lib/settings/update-preferences';

interface Initial {
  locale: 'es' | 'en';
  theme: 'light' | 'dark' | 'system';
  notifications: { outbidEmail: boolean; auctionWonEmail: boolean; newAuctionEmail: boolean };
}

export function PreferencesForm({ initial }: { initial: Initial }) {
  const t = useTranslations('settings.preferences');
  const tErr = useTranslations('settings.profile.errors');
  const { setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit } = useForm<Initial>({ defaultValues: initial });

  async function onSubmit(values: Initial) {
    setSubmitting(true);
    setTheme(values.theme);
    const res = await updatePreferencesAction(values);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(tErr('generic'));
      return;
    }
    toast.success(t('saved'));
    if (values.locale !== initial.locale && pathname) {
      const newPath = pathname.replace(/^\/(es|en)/, `/${values.locale}`) as `/${string}`;
      router.replace(newPath);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-md">
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
      <div className="space-y-2">
        <Label>{t('language')}</Label>
        <Controller
          name="locale"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es">{t('languageEs')}</SelectItem>
                <SelectItem value="en">{t('languageEn')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('theme')}</Label>
        <Controller
          name="theme"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('themeLight')}</SelectItem>
                <SelectItem value="dark">{t('themeDark')}</SelectItem>
                <SelectItem value="system">{t('themeSystem')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-3">
        <Label>{t('notifications')}</Label>
        <Controller
          name="notifications.outbidEmail"
          control={control}
          render={({ field }) => (
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('notifOutbid')}</span>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
        <Controller
          name="notifications.auctionWonEmail"
          control={control}
          render={({ field }) => (
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('notifWon')}</span>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
        <Controller
          name="notifications.newAuctionEmail"
          control={control}
          render={({ field }) => (
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('notifNew')}</span>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {t('save')}
      </Button>
    </form>
  );
}
