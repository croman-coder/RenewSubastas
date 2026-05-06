'use client';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';

export function initAppCheck(app: FirebaseApp) {
  if (typeof window === 'undefined') return;
  const siteKey = process.env['NEXT_PUBLIC_RECAPTCHA_SITE_KEY'];
  if (!siteKey) return;
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.warn('[appcheck] init failed', e);
  }
}
