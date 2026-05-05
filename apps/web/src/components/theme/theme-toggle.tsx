'use client';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const t = useTranslations('common');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-text-subtle/30 p-1">
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={
          'px-2 py-1 text-sm rounded ' +
          (theme === 'light' ? 'bg-bg-elev text-text-strong' : 'text-text-muted')
        }
      >
        {t('themeLight')}
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={
          'px-2 py-1 text-sm rounded ' +
          (theme === 'dark' ? 'bg-bg-elev text-text-strong' : 'text-text-muted')
        }
      >
        {t('themeDark')}
      </button>
      <button
        type="button"
        onClick={() => setTheme('system')}
        className={
          'px-2 py-1 text-sm rounded ' +
          (theme === 'system' ? 'bg-bg-elev text-text-strong' : 'text-text-muted')
        }
      >
        {t('themeSystem')}
      </button>
    </div>
  );
}
