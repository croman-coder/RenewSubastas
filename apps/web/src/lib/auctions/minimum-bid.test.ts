import { describe, it, expect } from 'vitest';
import { minimumBid, MIN_FIRST_BID_OVER_BASE_USD } from './minimum-bid';

describe('minimumBid', () => {
  it('exige superar el precio base, no igualarlo', () => {
    // El bug original: con base 5000 el mínimo era 5000, así que la primera
    // puja podía no ofrecer nada por encima de lo pedido.
    expect(minimumBid({ currentBid: 0, startingPrice: 5000, bidIncrement: 500 })).toBe(5500);
  });

  it('aplica el piso de USD 500 cuando el incremento es más chico', () => {
    // Pedido de comercial: una unidad no se adjudica pegada al precio
    // publicado. Con incremento de 100, la primera puja igual arranca en +500.
    expect(minimumBid({ currentBid: 0, startingPrice: 5000, bidIncrement: 100 })).toBe(5500);
    expect(minimumBid({ currentBid: 0, startingPrice: 5000, bidIncrement: 0 })).toBe(5500);
  });

  it('deja mandar al incremento cuando es mayor que el piso', () => {
    // Una subasta con pasos de 1000 no debería aceptar un salto de 500.
    expect(minimumBid({ currentBid: 0, startingPrice: 26000, bidIncrement: 1000 })).toBe(27000);
    expect(minimumBid({ currentBid: 0, startingPrice: 5000, bidIncrement: 750 })).toBe(5750);
  });

  it('el piso de 500 NO se vuelve a aplicar una vez que hay pujas', () => {
    // La primera puja ya despegó el precio del base; de ahí en más manda el
    // incremento. Cobrar 500 en cada paso encarecería la mecánica entera.
    expect(minimumBid({ currentBid: 5500, startingPrice: 5000, bidIncrement: 100 })).toBe(5600);
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

  it('expone el piso como constante, para que servidor y panel no se separen', () => {
    expect(MIN_FIRST_BID_OVER_BASE_USD).toBe(500);
  });
});
