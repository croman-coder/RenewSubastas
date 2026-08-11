import { describe, it, expect } from 'vitest';
import { UserProfileSchema } from './user.js';

describe('UserProfileSchema', () => {
  it('accepts a profile without documentType/documentNumber (Google self-signup)', () => {
    const parsed = UserProfileSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Gomez',
      audience: 'retail',
    });
    expect(parsed.success).toBe(true);
  });

  it('still accepts a full profile with document', () => {
    const parsed = UserProfileSchema.safeParse({
      firstName: 'Juan',
      lastName: 'Perez',
      documentType: 'CI',
      documentNumber: '1234567',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts an empty lastName (single-word derived/display name)', () => {
    // registerGoogleBuyer / registerPasswordBuyer can both legitimately
    // write '' here (functions/src/lib/name.ts) for a one-word name.
    const parsed = UserProfileSchema.safeParse({
      firstName: 'Cher',
      lastName: '',
      audience: 'retail',
    });
    expect(parsed.success).toBe(true);
  });

  it('still requires a non-empty firstName', () => {
    const parsed = UserProfileSchema.safeParse({ firstName: '', lastName: 'Perez' });
    expect(parsed.success).toBe(false);
  });
});
