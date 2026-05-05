import { z } from 'zod';

export const AppConfigSchema = z.object({
  currency: z.object({
    primary: z.enum(['USD', 'PYG']).default('USD'),
    showSecondary: z.boolean().default(false),
    pygPerUsd: z.number().positive().optional(),
    pygPerUsdUpdatedAt: z.date().optional(),
  }),
  bid: z.object({
    fixedIncrementUsd: z.number().positive().default(500),
    allowManualIncrement: z.boolean().default(true),
    antiSnipingSeconds: z.number().int().positive().default(60),
  }),
  financing: z.object({
    enabled: z.boolean().default(false),
    allowedTerms: z.array(z.number().int().positive()).default([12, 24, 36, 48, 60]),
    annualInterestRate: z.number().nonnegative().default(0),
    downPaymentPercent: z.number().min(0).max(1).default(0.2),
    minFinanceableUsd: z.number().nonnegative().default(0),
    notes: z.object({ es: z.string(), en: z.string().optional() }).optional(),
  }),
  emails: z.object({
    adminStaffDomain: z.string().min(3).default('santarosa.com.py'),
    fromAddress: z.string().email(),
    fromName: z.string().min(1),
  }),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
