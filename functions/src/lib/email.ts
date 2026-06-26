import { Resend } from 'resend';
import { defineSecret } from 'firebase-functions/params';
import { loadAppConfig } from './config.js';

export const RESEND_API_KEY: ReturnType<typeof defineSecret> = defineSecret('RESEND_API_KEY');

let client: Resend | null = null;

function getClient(): Resend | null {
  let key: string;
  try {
    key = RESEND_API_KEY.value();
  } catch {
    return null;
  }
  if (!key) return null; // graceful no-op when not configured
  if (!client) client = new Resend(key);
  return client;
}

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded file content (no data-URI prefix). */
  content: string;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /** Optional file attachments (e.g. payment receipt). */
  attachments?: EmailAttachment[];
  /**
   * Override the From header. Defaults to the santarosa.com.py sender.
   * Until that domain is verified in Resend, callers can pass the
   * onboarding sender so the email actually delivers.
   */
  from?: string;
}

export interface SendEmailResult {
  status: 'sent' | 'skipped' | 'failed';
  resendId?: string;
  reason?: string;
}

const DEFAULT_FROM = 'Renew Subastas <subastas@renewsubastas.com.py>';

/**
 * Resolve the From header. Precedence: explicit `from` arg > the
 * admin-configured `app_config.emails.{fromName,fromAddress}` > the
 * hardcoded DEFAULT_FROM fallback. This makes the "From address" field in
 * the admin config panel actually take effect (previously it was ignored
 * and every email used DEFAULT_FROM).
 */
async function resolveFrom(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  try {
    const { emails } = await loadAppConfig();
    if (emails.fromAddress) {
      return emails.fromName ? `${emails.fromName} <${emails.fromAddress}>` : emails.fromAddress;
    }
  } catch {
    // app_config unreadable (e.g. cold start race) — fall back to default.
  }
  return DEFAULT_FROM;
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
  from,
}: SendEmailArgs): Promise<SendEmailResult> {
  const c = getClient();
  if (!c) {
    console.warn('[email] RESEND_API_KEY not set — skipping send', { to, subject });
    return { status: 'skipped', reason: 'no_api_key' };
  }
  try {
    const result = await c.emails.send({
      from: await resolveFrom(from),
      to,
      subject,
      html,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    });
    if (result.error) {
      // Resend returns 4xx in `result.error` (e.g. unverified domain) instead
      // of throwing. Log it explicitly so it's findable in Cloud Logging.
      console.error('[email] resend rejected send', {
        to,
        subject,
        error: result.error,
      });
      return { status: 'failed', reason: String(result.error?.message ?? result.error) };
    }
    console.log('[email] sent', { to, subject, id: result.data?.id });
    return { status: 'sent', ...(result.data?.id ? { resendId: result.data.id } : {}) };
  } catch (err) {
    // Network errors and SDK exceptions land here. Surfacing instead of
    // rethrowing keeps caller flows (createUser, sendBidOutbid) succeeding
    // even if the email channel hiccups — losing one welcome email is
    // recoverable; failing user creation is not.
    console.error('[email] send threw', { to, subject, err });
    return { status: 'failed', reason: err instanceof Error ? err.message : 'unknown' };
  }
}
