import { Resend } from 'resend';
import { defineSecret } from 'firebase-functions/params';

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

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  const c = getClient();
  if (!c) {
    console.warn('[email] RESEND_API_KEY not set — skipping send', { to, subject });
    return;
  }
  try {
    const result = await c.emails.send({
      from: 'CARBID Subastas <no-reply@santarosa.com.py>',
      to,
      subject,
      html,
    });
    if (result.error) {
      // Resend returns 4xx in `result.error` (e.g. unverified domain) instead
      // of throwing. Log it explicitly so it's findable in Cloud Logging.
      console.error('[email] resend rejected send', {
        to,
        subject,
        error: result.error,
      });
      return;
    }
    console.log('[email] sent', { to, subject, id: result.data?.id });
  } catch (err) {
    // Network errors and SDK exceptions land here. Surfacing instead of
    // rethrowing keeps caller flows (createUser, sendBidOutbid) succeeding
    // even if the email channel hiccups — losing one welcome email is
    // recoverable; failing user creation is not.
    console.error('[email] send threw', { to, subject, err });
  }
}
