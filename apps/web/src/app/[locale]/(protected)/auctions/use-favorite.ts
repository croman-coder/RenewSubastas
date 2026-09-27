'use client';
import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';

/**
 * El corazón de favoritos, compartido por la tarjeta y la fila del catálogo
 * (spec 2026-09-27 §5.3: "el corazón se mantiene"). Movido tal cual desde
 * AuctionCard: misma escritura en users/{uid}.favorites y el mismo
 * router.refresh() para que la pestaña Favoritas se entere.
 */
export function useFavorite(auctionId: string, buyerUid: string, initial: boolean) {
  const router = useRouter();
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const ref = doc(fb.db, 'users', buyerUid);
    try {
      if (fav) {
        await updateDoc(ref, { favorites: arrayRemove(auctionId) });
        setFav(false);
      } else {
        await updateDoc(ref, { favorites: arrayUnion(auctionId) });
        setFav(true);
      }
      router.refresh();
    } catch {
      // silent fail; user will see no change
    } finally {
      setBusy(false);
    }
  }

  return { fav, toggle };
}
