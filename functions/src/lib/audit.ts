import { adminDb } from './admin.js';
import { FieldValue } from 'firebase-admin/firestore';

interface AuditEntry {
  actorUid: string;
  action: string;
  resourceType: 'user' | 'auction' | 'vehicle' | 'app_config';
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await adminDb()
    .collection('audit_logs')
    .add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    });
}
