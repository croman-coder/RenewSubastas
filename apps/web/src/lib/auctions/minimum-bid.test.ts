import { describe, it, expect } from 'vitest';
import { minimumBid } from './minimum-bid';

describe('minimumBid', () => {
  it('exige superar el precio base, no igualarlo', () => {
    // El bug reportado: con base 5000 el mínimo era 5000, así que la primera
    // puja podía no ofrecer nada por encima de lo pedido.
    expect(minimumBid({ currentBid: 0, startingPrice: 5000, bidIncrement: 500 })).toBe(5500);
  });

  it('sigue sumando un incremento sobre la puja vigente', () => {
    expect(minimumBid({ currentBid: 6000, startingPrice: 5000, bidIncrement: 500 })).toBe(6500);
  });

  it('ignora el precio base en cuanto hay una puja, aunque sea menor', () => {
    // Puede pasar con datos viejos o una edición de staff: manda lo que está
    // arriba en la subasta, no lo que decía el aviso.
    expect(minimumBid({ currentBid: 3000, startingPrice: 5000, bidIncrement: 250 })).toBe(3250);
  });

  it('redondea a centavos para no arrastrar basura de datos viejos', () => {
    expect(minimumBid({ currentBid: 16002.55555555, startingPrice: 0, bidIncrement: 500 })).toBe(
      16502.56,
    );
  });

  it('con incremento cero al menos no baja del piso', () => {
    // No debería existir una subasta así, pero si existe el mínimo tiene que
    // seguir siendo un número usable y no NaN ni algo por debajo del piso.
    expect(minimumBid({ currentBid: 0, startingPrice: 5000, bidIncrement: 0 })).toBe(5000);
  });
});
