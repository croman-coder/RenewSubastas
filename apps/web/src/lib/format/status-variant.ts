import type { BadgeProps } from '@/components/ui/badge';

type Variant = NonNullable<BadgeProps['variant']>;

/**
 * One tone per meaning (DESIGN.md), so a table reads at a glance. Before
 * 2026-09-26 every status was the same grey `secondary` pill and "En curso",
 * "Finalizada" and "Programada" looked identical.
 */
const AUCTION: Record<string, Variant> = {
  live: 'success',
  scheduled: 'warning',
  ended: 'neutral',
  cancelled: 'danger',
};

const VEHICLE: Record<string, Variant> = {
  draft: 'outline',
  ready: 'info',
  in_auction: 'success',
  sold: 'neutral',
  archived: 'secondary',
};

export function auctionStatusVariant(status: string): Variant {
  return AUCTION[status] ?? 'secondary';
}

export function vehicleStatusVariant(status: string): Variant {
  return VEHICLE[status] ?? 'secondary';
}
