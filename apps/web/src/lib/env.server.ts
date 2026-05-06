import 'server-only';
import { z } from 'zod';

const ServerEnvSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
});

export const serverEnv = ServerEnvSchema.parse({
  FIREBASE_PROJECT_ID:
    process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ?? process.env['FIREBASE_PROJECT_ID'],
  FIREBASE_CLIENT_EMAIL: process.env['FIREBASE_CLIENT_EMAIL'],
  FIREBASE_PRIVATE_KEY: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
  FIREBASE_SERVICE_ACCOUNT_KEY: process.env['FIREBASE_SERVICE_ACCOUNT_KEY'],
  FIREBASE_AUTH_EMULATOR_HOST: process.env['FIREBASE_AUTH_EMULATOR_HOST'],
  FIRESTORE_EMULATOR_HOST: process.env['FIRESTORE_EMULATOR_HOST'],
});
