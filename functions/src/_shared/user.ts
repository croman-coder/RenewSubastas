import { z } from 'zod';

export const RoleSchema = z.enum(['admin', 'staff', 'finanzas', 'buyer']);
export type Role = z.infer<typeof RoleSchema>;

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
  lastName: z.string().min(1),
  documentType: DocumentTypeSchema.optional(),
  documentNumber: z.string().min(1).optional(),
  phone: z.string().optional(),
  address: AddressSchema.optional(),
  avatarUrl: z.string().url().optional(),
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
