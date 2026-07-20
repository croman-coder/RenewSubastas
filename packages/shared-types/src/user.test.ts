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
});
