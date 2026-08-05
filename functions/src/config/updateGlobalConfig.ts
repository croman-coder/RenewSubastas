import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({
  currency: z
    .object({
      primary: z.enum(['USD', 'PYG']).optional(),
      showSecondary: z.boolean().optional(),
      pygPerUsd: z.number().positive().optional(),
    })
    .optional(),
  bid: z
    .object({
      fixedIncrementUsd: z.number().positive().optional(),
      allowManualIncrement: z.boolean().optional(),
      antiSnipingSeconds: z.number().int().positive().optional(),
    })
    .optional(),
  financing: z
    .object({
      enabled: z.boolean().optional(),
      allowedTerms: z.array(z.number().int().positive()).optional(),
      annualInterestRate: z.number().nonnegative().optional(),
      downPaymentPercent: z.number().min(0).max(1).optional(),
      minFinanceableUsd: z.number().nonnegative().optional(),
      notes: z.object({ es: z.string(), en: z.string().optional() }).optional(),
    })
    .optional(),
  emails: z
    .object({
      adminStaffDomain: z.string().min(3).optional(),
      fromAddress: z.string().email().optional(),
      fromName: z.string().min(1).optional(),
    })
    .optional(),
  // Legal identity of the operating company, shown on the public privacy /
  // terms / cookies pages and in the site footer. Editable here rather than
  // hardcoded so a change of address or RUC doesn't need a deploy — and so
  // the legal pages can never display an identity nobody reviewed.
  company: z
    .object({
      legalName: z.string().max(160).optional(),
      ruc: z.string().max(20).optional(),
      address: z.string().max(240).optional(),
      email: z.string().email().max(160).optional(),
      phone: z.string().max(40).optional(),
    })
    .optional(),
  // Payment instructions surfaced to a buyer who just won an auction.
  // Stored as plain text so admin can drop the full Santa Rosa banking
  // block (account holder, bank, account number, CBU/CCI, etc.) without
  // forcing a rigid schema. `deadlineHours` controls how long the
  // winner has to formalize the deposit; defaults applied at read time.
  payment: z
    .object({
      bankAccountHolder: z.string().max(120).optional(),
      bankName: z.string().max(120).optional(),
      bankAccountNumber: z.string().max(60).optional(),
      bankAccountType: z.string().max(40).optional(),
      bankRuc: z.string().max(40).optional(),
      bankNamePyg: z.string().max(120).optional(),
      bankAccountNumberPyg: z.string().max(60).optional(),
      bankAccountTypePyg: z.string().max(40).optional(),
      depositPercent: z.number().min(0).max(1).optional(),
      deadlineHours: z.number().int().positive().max(168).optional(),
      instructionsEs: z.string().max(2000).optional(),
      instructionsEn: z.string().max(2000).optional(),
      contactEmail: z.string().email().max(254).optional(),
      contactPhone: z.string().max(40).optional(),
    })
    .optional(),
});

export interface UpdateGlobalConfigResult {
  ok: true;
}

export async function updateGlobalConfigHandler(
  req: CallableRequest,
): Promise<UpdateGlobalConfigResult> {
  const { uid: actorUid } = requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const v = parsed.data;

  const ref = adminDb().doc('app_config/global');
  const before = (await ref.get()).data() ?? {};

  const update: Record<string, unknown> = {
    updatedBy: actorUid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (v.currency) {
    if (v.currency.primary !== undefined) update['currency.primary'] = v.currency.primary;
    if (v.currency.showSecondary !== undefined)
      update['currency.showSecondary'] = v.currency.showSecondary;
    if (v.currency.pygPerUsd !== undefined) {
      update['currency.pygPerUsd'] = v.currency.pygPerUsd;
      update['currency.pygPerUsdUpdatedAt'] = FieldValue.serverTimestamp();
    }
  }
  if (v.bid) {
    if (v.bid.fixedIncrementUsd !== undefined)
      update['bid.fixedIncrementUsd'] = v.bid.fixedIncrementUsd;
    if (v.bid.allowManualIncrement !== undefined)
      update['bid.allowManualIncrement'] = v.bid.allowManualIncrement;
    if (v.bid.antiSnipingSeconds !== undefined)
      update['bid.antiSnipingSeconds'] = v.bid.antiSnipingSeconds;
  }
  if (v.financing) {
    if (v.financing.enabled !== undefined) update['financing.enabled'] = v.financing.enabled;
    if (v.financing.allowedTerms !== undefined)
      update['financing.allowedTerms'] = v.financing.allowedTerms;
    if (v.financing.annualInterestRate !== undefined)
      update['financing.annualInterestRate'] = v.financing.annualInterestRate;
    if (v.financing.downPaymentPercent !== undefined)
      update['financing.downPaymentPercent'] = v.financing.downPaymentPercent;
    if (v.financing.minFinanceableUsd !== undefined)
      update['financing.minFinanceableUsd'] = v.financing.minFinanceableUsd;
    if (v.financing.notes !== undefined) update['financing.notes'] = v.financing.notes;
  }
  if (v.emails) {
    if (v.emails.adminStaffDomain !== undefined)
      update['emails.adminStaffDomain'] = v.emails.adminStaffDomain;
    if (v.emails.fromAddress !== undefined) update['emails.fromAddress'] = v.emails.fromAddress;
    if (v.emails.fromName !== undefined) update['emails.fromName'] = v.emails.fromName;
  }
  if (v.company) {
    for (const [k, val] of Object.entries(v.company)) {
      if (val !== undefined) update[`company.${k}`] = val;
    }
  }
  if (v.payment) {
    for (const [k, val] of Object.entries(v.payment)) {
      if (val !== undefined) update[`payment.${k}`] = val;
    }
  }

  // Ensure document exists (update() fails on non-existent docs)
  await ref.set({}, { merge: true });
  await ref.update(update);

  await writeAuditLog({
    actorUid,
    action: 'app_config.update',
    resourceType: 'app_config',
    resourceId: 'global',
    before,
    after: v as Record<string, unknown>,
  });

  return { ok: true };
}

export const updateGlobalConfig = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  updateGlobalConfigHandler,
);
