import { describe, it, expect } from 'vitest';
import { sendEmail } from './email.js';

describe('sendEmail', () => {
  it('returns skipped when RESEND_API_KEY is not configured', async () => {
    // In the emulator/test env the secret is unset, so the client is null.
    const res = await sendEmail({
      to: 'someone@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
    });
    expect(res.status).toBe('skipped');
  });
});
