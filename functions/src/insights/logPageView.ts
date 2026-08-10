import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { DocId } from '../lib/ids.js';
import {
  classifyPath,
  classifySource,
  isBotUserAgent,
  extractAuctionId,
  CredentialBearingPathError,
} from './log-page-view-rules.js';

// Generous bounds on free-text client input. classifySource already handles
// arbitrary garbage safely (proven in log-page-view-rules.test.ts with a
// 200-char junk string), so these exist only to stop a pathological payload,
// not to gate on shape — rejecting a page view outright over an oversized
// utm_source would undercount real traffic for no security benefit.
const InputSchema = z.object({
  path: z.string().min(1).max(2048),
  // Interpolated into a Firestore doc path below (`pageview_${sessionId}`),
  // so this can't be a bare z.string().min(1): an unvalidated value here is
  // both a path-injection vector into rate_limits/ AND becomes a stored
  // Firestore field on every page_views doc. DocId is exactly the guard
  // ids.ts documents this scenario for. It also happens to fit what the
  // client actually sends — crypto.randomUUID() output ("a1b2c3d4-e5f6-...",
  // 36 chars of hex and hyphens) — with no widening needed.
  sessionId: DocId,
  utmSource: z.string().max(2000).optional(),
  referrer: z.string().max(2048).optional(),
});

// A single browser tab's worth of real navigation — home, catalog, a handful
// of detail pages, maybe login — tops out well under 15 events/min even for
// someone speed-browsing the catalog. 30/min gives that ~2x headroom before
// this ever fires on a genuine session, while still capping a stuck
// client-side loop (e.g. an effect re-firing on every render) to a bounded,
// cheap number of wasted writes instead of an unbounded flood. It does NOT
// stop a hostile client that simply mints a fresh sessionId per request —
// that's an accepted, cheap-enough risk per the design doc (writes cost
// fractions of a cent at this volume); this limit's job is bounding a single
// session's write rate, not defeating a determined attacker.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

export interface LogPageViewResult {
  ok: true;
  logged: boolean;
}

/** Reads the User-Agent header for the bot check. Never stored, never returned. */
function getUserAgent(req: CallableRequest): string | undefined {
  const raw = req.rawRequest?.headers?.['user-agent'];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Records one anonymous page view for the web-traffic counter.
 *
 * Deliberately has NO `requireSignedIn` call, unlike every other callable in
 * this codebase. That is not an oversight: anonymous visitors are the entire
 * point of this counter (docs/superpowers/specs/2026-08-08-trafico-web-design.md)
 * — Santa Rosa pays for Instagram ads pointing at this site and most of that
 * traffic never signs in. Requiring auth here would make the counter blind
 * to exactly the visitors it exists to count.
 *
 * Stores exactly `{ pathKind, source, sessionId, auctionId?, at }` on
 * `page_views/{autoId}` (auto ids so writes distribute — no hot document
 * when a lot closes and everyone arrives at once). Never the raw path, never
 * the query string, never an IP, never the user-agent: the user-agent is
 * read once in memory purely to decide whether to record the visit at all,
 * then discarded.
 */
export async function logPageViewHandler(req: CallableRequest): Promise<LogPageViewResult> {
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const { path, sessionId, utmSource, referrer } = parsed.data;

  let pathKind;
  try {
    pathKind = classifyPath(path);
  } catch (err) {
    // ONLY this specific error is a silent success. classifyPath's own doc
    // comment warns against a catch-all that maps any error to 'other' and
    // logs anyway — that would defeat the entire point of the throw (see
    // CredentialBearingPathError in log-page-view-rules.ts). Anything else
    // thrown here is a real bug and must fail loudly, not be swallowed into
    // a fake successful response.
    if (err instanceof CredentialBearingPathError) {
      return { ok: true, logged: false };
    }
    throw err;
  }

  // User-agent is read here, in memory, only to decide whether to record
  // this visit — never written anywhere, never returned to the caller. A
  // bot gets the exact same { ok: true, logged: false } response as a
  // credential-bearing path, so neither check tells a hostile client
  // anything about which rule it tripped.
  if (isBotUserAgent(getUserAgent(req))) {
    return { ok: true, logged: false };
  }

  const source = classifySource(utmSource, referrer);

  // Only meaningful for a detail page, and only when it looks like a real
  // id — an unparseable segment (someone hand-typing a garbage URL) still
  // logs as a 'detail' pathKind, it just doesn't get an auctionId attached.
  let auctionId: string | undefined;
  if (pathKind === 'detail') {
    const candidate = extractAuctionId(path);
    if (candidate !== undefined && DocId.safeParse(candidate).success) {
      auctionId = candidate;
    }
  }

  const db = adminDb();
  const rlRef = db.doc(`rate_limits/pageview_${sessionId}`);
  const pageViewRef = db.collection('page_views').doc();

  await db.runTransaction(async (tx) => {
    const now = Date.now();

    // Read-check-write, atomic — same pattern as placeBid.ts. Doing the
    // check outside the transaction would let a burst of concurrent
    // requests from the same session all read the same array, all pass,
    // and all write: effectively no limit under a burst.
    const rlSnap = await tx.get(rlRef);
    const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpsError('resource-exhausted', 'Page view rate limit exceeded');
    }

    // All reads above this line, all writes below it.
    tx.set(rlRef, { timestamps: [...recent, now] });
    tx.set(pageViewRef, {
      pathKind,
      source,
      sessionId,
      ...(auctionId !== undefined ? { auctionId } : {}),
      at: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, logged: true };
}

export const logPageView = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  logPageViewHandler,
);
