import { z } from 'zod';

export const RoleSchema = z.enum(['admin', 'staff', 'finanzas', 'buyer']);
export type Role = z.infer<typeof RoleSchema>;

/**
 * Buyers split into two non-overlapping audiences. Retail = public market,
 * wholesale = dealer-only catalog. Admin and staff bypass the segmentation.
 */
export const AudienceSchema = z.enum(['retail', 'wholesale']);
export type Audience = z.infer<typeof AudienceSchema>;
export const DEFAULT_AUDIENCE: Audience = 'retail';

export const UserStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const DocumentTypeSchema = z.enum(['CI', 'RUC']);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  country: z.literal('PY'),
  postalCode: z.string().optional(),
});

export const UserProfileSchema = z.object({
  firstName: z.string().min(1),
  // Not min(1): a single-word display/derived name (Google sign-in, or
  // password self-registration falling back to the email local-part when
  // no name is supplied) legitimately has no last name. The mirrored copy
  // in functions/src/_shared/user.ts carries the full rationale.
  lastName: z.string(),
  documentType: DocumentTypeSchema.optional(),
  documentNumber: z.string().min(1).optional(),
  phone: z.string().optional(),
  address: AddressSchema.optional(),
  avatarUrl: z.string().url().optional(),
  /** Only meaningful when role === 'buyer'. Defaults to 'retail' on legacy docs. */
  audience: AudienceSchema.optional(),
});

export const UserPreferencesSchema = z.object({
  locale: z.enum(['es', 'en']).default('es'),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  notifications: z.object({
    outbidEmail: z.boolean().default(true),
    auctionWonEmail: z.boolean().default(true),
    newAuctionEmail: z.boolean().default(false),
  }),
});

export const UserSchema = z.object({
  uid: z.string().min(1),
  role: RoleSchema,
  email: z.string().email(),
  status: UserStatusSchema,
  profile: UserProfileSchema,
  preferences: UserPreferencesSchema,
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date().optional(),
  deletedAt: z.date().optional(),
});
export type User = z.infer<typeof UserSchema>;
