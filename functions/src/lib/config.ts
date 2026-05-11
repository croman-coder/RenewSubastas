import { adminDb } from './admin.js';

export interface RuntimeConfig {
  emails: {
    adminStaffDomain: string;
    fromAddress: string;
    fromName: string;
  };
}

const DEFAULT_CONFIG: RuntimeConfig = {
  emails: {
    adminStaffDomain: 'santarosa.com.py',
    fromAddress: 'no-reply@santarosa.com.py',
    fromName: 'Renew Subastas',
  },
};

export async function loadAppConfig(): Promise<RuntimeConfig> {
  const snap = await adminDb().doc('app_config/global').get();
  if (!snap.exists) return DEFAULT_CONFIG;
  const data = snap.data() ?? {};
  const emails = (data['emails'] ?? {}) as Partial<RuntimeConfig['emails']>;
  return {
    emails: {
      adminStaffDomain: emails.adminStaffDomain ?? DEFAULT_CONFIG.emails.adminStaffDomain,
      fromAddress: emails.fromAddress ?? DEFAULT_CONFIG.emails.fromAddress,
      fromName: emails.fromName ?? DEFAULT_CONFIG.emails.fromName,
    },
  };
}
