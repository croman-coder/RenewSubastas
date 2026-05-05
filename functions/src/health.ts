import { onCall } from 'firebase-functions/v2/https';

export const pingHealth = onCall({ region: 'us-central1' }, async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});
