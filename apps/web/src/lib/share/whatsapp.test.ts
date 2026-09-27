import { describe, expect, it } from 'vitest';
import { shareText, whatsappShareUrl } from './whatsapp';

describe('share texts', () => {
  it('invites to look at the car', () => {
    expect(shareText('Toyota Hilux 2019')).toBe('Mirá este Toyota Hilux 2019 en subasta');
  });

  it('builds a wa.me link with the text and the link, encoded', () => {
    expect(
      whatsappShareUrl(
        'Mirá este Toyota Hilux 2019 en subasta',
        'https://renewsubastas.com.py/es/auctions/auc-1',
      ),
    ).toBe(
      'https://wa.me/?text=Mir%C3%A1%20este%20Toyota%20Hilux%202019%20en%20subasta%3A%20https%3A%2F%2Frenewsubastas.com.py%2Fes%2Fauctions%2Fauc-1',
    );
  });
});
