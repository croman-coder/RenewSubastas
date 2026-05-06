'use client';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';

/**
 * Initializes Firebase App Check using reCAPTCHA v3 if a site key is present.
 *
 * Defensive on purpose:
 *   - Skips entirely on the server (typeof window check).
 *   - Skips when no NEXT_PUBLIC_RECAPTCHA_SITE_KEY is configured (e.g. local
 *     dev against the emulator suite).
 *   - Catches sync and async failures so a misconfigured reCAPTCHA never
 *     blocks unrelated Firebase calls (Auth/Firestore/Functions). With
 *     enforcement OFF in the Firebase Console, requests without a token
 *     still go through; if reCAPTCHA fails to load, we just log and move on
 *     instead of leaving the SDK stuck attempting to attach a token to every
 *     outgoing request.
 *
 * Returns the AppCheck instance for callers that want to read tokens, or
 * null when initialization was skipped.
 */
export function initAppCheck(app: FirebaseApp): AppCheck | null {
  if (typeof window === 'undefined') return null;
  const siteKey = process.env['NEXT_PUBLIC_RECAPTCHA_SITE_KEY'];
  if (!siteKey) return null;

  try {
    const instance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return instance;
  } catch (e) {
    // Common reasons we end up here: duplicate init across HMR boundaries,
    // CSP blocking the reCAPTCHA script, or the site key being rejected for
    // this domain. None of these should break login.
    console.warn('[appcheck] init skipped', e);
    return null;
  }
}
