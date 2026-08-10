/**
 * Shared display helpers for the /staff/insights report. Staff pages are
 * hardcoded Spanish by project convention (no useTranslations), so these
 * mirror the copy that already exists in messages/es.json rather than
 * introducing a second source of truth — while turning raw Firestore enum
 * values (in_auction, reserve_not_met, …) into the labels staff already see
 * elsewhere in the app instead of leaking the enum straight into the UI.
 */
import type { FunnelStage, Source } from './traffic-summary';

// Mirrors staff.vehicles.status.
export const VEHICLE_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  ready: 'Listo',
  in_auction: 'En subasta',
  sold: 'Vendido',
  archived: 'Archivado',
};

// Mirrors buyer.auctions.status.
export const AUCTION_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Programada',
  live: 'En curso',
  ended: 'Finalizada',
  cancelled: 'Cancelada',
};

// AuctionOutcomeSchema — no existing translated copy elsewhere to mirror.
export const AUCTION_OUTCOME_LABEL: Record<string, string> = {
  sold: 'vendida',
  reserve_not_met: 'reserva no alcanzada',
  no_bids: 'sin pujas',
  sold_offline: 'vendida en salón',
};

const usdFormatter = new Intl.NumberFormat('es-PY', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function fmtUsd(n: number): string {
  return usdFormatter.format(n);
}

// Traffic counter (docs/superpowers/specs/2026-08-08-trafico-web-design.md).
// FunnelStage/Source are the closed sets the server classifies into —
// labels below cover every member so a new stage/source can't silently
// render blank.
export const FUNNEL_STAGE_LABEL: Record<FunnelStage, string> = {
  home: 'Inicio',
  catalog: 'Catálogo',
  detail: 'Ficha',
  login: 'Login',
};

export const SOURCE_LABEL: Record<Source, string> = {
  ig: 'Instagram',
  fb: 'Facebook',
  google: 'Google',
  direct: 'Directo',
  other: 'Otro',
};
