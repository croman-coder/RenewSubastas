import { z } from 'zod';

/**
 * Firestore auto-ids are [A-Za-z0-9_-]. Anything else in a client-supplied
 * id that gets interpolated into a doc path (`db.doc(\`col/${id}\`)`) is a
 * path-injection vector: a value like "realId/sub/otherId" resolves to a
 * DEEPER document, bypassing whatever validation applies to the top-level
 * collection. Use this for every id-shaped field instead of a bare
 * `z.string().min(1)`.
 */
export const DocId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid id');
