import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface CloseAsSoldArgs {
  auctionRef: FirebaseFirestore.DocumentReference;
  /** null cuando la subasta no tiene vehículo o fue borrado en duro. */
  vehicleRef: FirebaseFirestore.DocumentReference | null;
  winnerUid: string;
  finalPrice: number;
  depositPercent: number;
  deadlineHours: number;
  nowMs: number;
}

/**
 * Aplica los writes terminales de una venta de plataforma.
 *
 * Única definición de qué significa "vendida": el redondeo de la seña y el
 * cálculo del plazo viven acá y en ningún otro lado. Duplicarlos entre
 * tickAuctions y buyNow sería un bug de plata silencioso el día que uno
 * cambie y el otro no.
 *
 * El llamador debe haber hecho TODAS sus lecturas antes de invocar esto —
 * Firestore exige lecturas antes de escrituras dentro de una transacción.
 */
export function closeAuctionAsSold(
  tx: FirebaseFirestore.Transaction,
  {
    auctionRef,
    vehicleRef,
    winnerUid,
    finalPrice,
    depositPercent,
    deadlineHours,
    nowMs,
  }: CloseAsSoldArgs,
): void {
  tx.update(auctionRef, {
    status: 'ended',
    outcome: 'sold',
    winnerUid,
    finalPrice,
    paymentStatus: 'pending_payment',
    paymentDepositPercent: depositPercent,
    paymentDepositUsd: Math.round(finalPrice * depositPercent * 100) / 100,
    paymentDeadline: Timestamp.fromMillis(nowMs + deadlineHours * 3600_000),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (vehicleRef) {
    tx.update(vehicleRef, { status: 'sold', updatedAt: FieldValue.serverTimestamp() });
  }
}
