import { META_PIXEL_ID, isCredentialBearingPath, isMetaPixelLoaded } from './meta-pixel';
import { browserStore, createOnceGuard } from './once-guard';

/**
 * The four funnel events Meta measures on this site, plus advanced matching.
 *
 * The pixel's own file (meta-pixel.ts) owns installing fbevents.js and the
 * PageView that follows every navigation. This file owns everything that
 * describes what the visitor actually did: looked at a vehicle, created an
 * account, bid, bought.
 *
 * Three rules hold for every event here.
 *
 * 1. They fire on CONFIRMATION, never on intent. A bid reports after the
 *    callable resolves, not when the button is pressed — otherwise a bid the
 *    server rejected (too low, auction closed, rate-limited) would count as
 *    a conversion and the campaign would optimise towards people who fail to
 *    bid. Same for registration: the backend says whether an account was
 *    actually created, because a login and a sign-up land on the same URL.
 *
 * 2. Every event carries an `eventID`. Meta deduplicates browser and
 *    Conversions API events that share one, so instrumenting it now means the
 *    server-side phase is additive instead of a rewrite. For events that can
 *    legitimately repeat (a visitor views two vehicles, bids three times) the
 *    id is random. For events that can only ever happen once — this account
 *    was created, this auction was won — it is derived from the ids involved,
 *    so a second browser or a later reload produces the SAME id and Meta
 *    collapses them instead of counting two sales.
 *
 * 3. Nothing fires on a credential-bearing page. Redundant in practice (none
 *    of these actions exist there) but the rule that the pixel never runs
 *    where the URL is a secret has no exceptions — see meta-pixel.ts.
 */

/** What Meta calls a "product" here is one auction listing. */
const CONTENT_TYPE = 'product';
const CURRENCY = 'USD';

export interface VehicleEvent {
  auctionId: string;
  make: string;
  model: string;
  year: number;
  /** USD. Meaning depends on the event: list price, bid amount, sale price. */
  value: number;
}

interface VehiclePayload {
  content_ids: string[];
  content_type: string;
  content_name: string;
  value?: number;
  currency?: string;
}

/**
 * The label Meta shows when it groups events by content.
 *
 * The same string for all three vehicle events on purpose. The brief spelled
 * ViewContent with the year and the other two without, which would split one
 * vehicle across two rows in every Meta report; `content_ids` is the join key
 * either way, so the name may as well stay stable. A missing or zero year is
 * dropped rather than rendered as "Kwid 0".
 */
export function vehicleContentName(make: string, model: string, year: number): string {
  return [make, model, year > 0 ? String(year) : '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Shapes an auction into Meta's product payload.
 *
 * `value` is dropped — along with `currency`, which is meaningless without it
 * — when it isn't a positive finite number. A zero or NaN value sent as if it
 * were real would drag down every value-based report and any ROAS bidding
 * built on top of it. Prices are snapped to cents for the same reason the bid
 * panel does it: a stored 16002.55555555 must not reach Meta verbatim.
 */
export function buildVehiclePayload({
  auctionId,
  make,
  model,
  year,
  value,
}: VehicleEvent): VehiclePayload {
  const payload: VehiclePayload = {
    content_ids: [auctionId],
    content_type: CONTENT_TYPE,
    content_name: vehicleContentName(make, model, year),
  };
  if (Number.isFinite(value) && value > 0) {
    payload.value = Math.round(value * 100) / 100;
    payload.currency = CURRENCY;
  }
  return payload;
}

/**
 * Deterministic ids for the two events that can only happen once.
 *
 * Same inputs, same id, forever — which is what lets Meta collapse the
 * duplicate a second device or a much later reload would otherwise produce,
 * and what will let the Conversions API phase send the matching id from the
 * server without any coordination beyond these two functions.
 */
export function purchaseEventId(auctionId: string, uid: string): string {
  return `purchase-${auctionId}-${uid}`;
}

export function registrationEventId(uid: string): string {
  return `signup-${uid}`;
}

/** A one-off id for events that legitimately repeat. */
export function newEventId(): string {
  // randomUUID needs a secure context and Safari 15.4+. The fallback is not
  // cryptographic and doesn't need to be: this is a dedup key, and a
  // collision would merge two of one visitor's own events.
  try {
    return crypto.randomUUID();
  } catch {
    return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * True when it is safe and meaningful to report an event right now.
 *
 * `isMetaPixelLoaded()` is the important half: the pixel refuses to install
 * on credential-bearing pages, so a visitor who arrived through a reset link
 * has no `fbq` yet. Calling it anyway would queue events against a stub that
 * never drains.
 */
function canEmit(): boolean {
  if (typeof window === 'undefined' || !isMetaPixelLoaded()) return false;
  return !isCredentialBearingPath(window.location.pathname);
}

function emit(event: string, payload: object, eventId: string): void {
  if (!canEmit()) return;
  window.fbq?.('track', event, payload, { eventID: eventId });
}

/** Opened the detail page of one vehicle. */
export function trackViewContent(vehicle: VehicleEvent): void {
  emit('ViewContent', buildVehiclePayload(vehicle), newEventId());
}

/** Placed a bid the server accepted. `value` is the amount bid. */
export function trackAddToCart(vehicle: VehicleEvent): void {
  emit('AddToCart', buildVehiclePayload(vehicle), newEventId());
}

/**
 * Took the unit: won the auction, or bought it outright. `value` is the
 * price it closed at.
 *
 * Guarded twice over. The deterministic event id lets Meta drop a duplicate
 * from another device; the local once-guard stops this browser from sending
 * one at all, which also keeps a buyer who reloads the win banner ten times
 * from spending ten requests to say the same thing.
 */
export function trackPurchase(vehicle: VehicleEvent, uid: string): void {
  const eventId = purchaseEventId(vehicle.auctionId, uid);
  if (!claimOnce(eventId)) return;
  emit('Purchase', buildVehiclePayload(vehicle), eventId);
}

/**
 * The backend confirmed a NEW account — not a sign-in.
 *
 * This is the event the campaign optimises against, so a false positive is
 * the expensive kind of mistake here: sign-in and sign-up both end on the
 * same page, so only the callable's own "did I create this document" answer
 * may reach it. See registerGoogleBuyer / registerPasswordBuyer.
 */
export function trackCompleteRegistration(method: 'email' | 'google', uid: string): void {
  const eventId = registrationEventId(uid);
  if (!claimOnce(eventId)) return;
  emit('CompleteRegistration', { status: true, method }, eventId);
}

let guard: ((key: string) => boolean) | null = null;

/** Lazily built: `browserStore()` must not run during SSR module evaluation. */
function claimOnce(key: string): boolean {
  guard ??= createOnceGuard(browserStore());
  return guard(`fbq:${key}`);
}

let identifiedUid: string | null = null;

/**
 * Advanced matching: tells Meta who the signed-in visitor is.
 *
 * Re-running `init` with user data is Meta's documented way to attach
 * matching parameters to everything sent afterwards. fbevents.js hashes the
 * email with SHA-256 in the browser before it leaves the device, so Meta
 * receives a digest rather than the address — but it is still personal data
 * crossing to a third party, which is why the cookie and privacy copy in
 * lib/legal/company-facts.ts names it explicitly.
 *
 * Normalises the email the way Meta expects (trimmed, lower-cased) because
 * the hash of " Ana@Gmail.com " matches nothing.
 *
 * Runs once per uid. Repeating `init` on every navigation would be harmless
 * but pointless, and a sign-out followed by a different sign-in still
 * re-identifies because the uid changed.
 */
export function identifyMetaUser(uid: string, email: string | null): void {
  if (!canEmit() || uid === identifiedUid) return;
  identifiedUid = uid;

  const data: Record<string, string> = { external_id: uid };
  const normalised = email?.trim().toLowerCase();
  if (normalised) data['em'] = normalised;

  window.fbq?.('init', META_PIXEL_ID, data);
}

/**
 * Forgets the identified visitor, so the next sign-in re-runs matching even
 * if it happens in the same tab under the same uid.
 */
export function resetMetaIdentity(): void {
  identifiedUid = null;
}
