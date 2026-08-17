import { describe, it, expect } from 'vitest';
import { proofExtension, resolveProofContentType } from './proof-file';

const file = (name: string, type: string) => ({ name, type });

describe('resolveProofContentType', () => {
  it('respeta el tipo cuando el navegador lo informa bien', () => {
    expect(resolveProofContentType(file('recibo.jpg', 'image/jpeg'))).toBe('image/jpeg');
    expect(resolveProofContentType(file('recibo.pdf', 'application/pdf'))).toBe('application/pdf');
  });

  it('cae a la extensión cuando el navegador no informa tipo', () => {
    // El caso reportado: en Android, un archivo elegido desde el gestor de
    // archivos o guardado por WhatsApp llega con `type` vacío, y la
    // comprobación anterior ni siquiera lo dejaba adjuntar.
    expect(resolveProofContentType(file('IMG-20260817-WA0007.jpeg', ''))).toBe('image/jpeg');
    expect(resolveProofContentType(file('comprobante.pdf', ''))).toBe('application/pdf');
    expect(resolveProofContentType(file('captura.PNG', ''))).toBe('image/png');
  });

  it('no cree en application/octet-stream', () => {
    // Es el "no sé" del navegador. Mandárselo a Storage tal cual hacía que la
    // regla del bucket rechazara la subida con storage/unauthorized.
    expect(resolveProofContentType(file('recibo.jpg', 'application/octet-stream'))).toBe(
      'image/jpeg',
    );
    expect(resolveProofContentType(file('recibo', 'application/octet-stream'))).toBeNull();
  });

  it('acepta las fotos de iPhone', () => {
    expect(resolveProofContentType(file('IMG_0042.HEIC', ''))).toBe('image/heic');
    expect(resolveProofContentType(file('IMG_0042.heif', ''))).toBe('image/heif');
  });

  it('tolera nombres con varios puntos y espacios', () => {
    expect(resolveProofContentType(file('transferencia 17.08 (1).jpg', ''))).toBe('image/jpeg');
  });

  it('rechaza lo que no sirve como comprobante', () => {
    expect(resolveProofContentType(file('planilla.xlsx', ''))).toBeNull();
    expect(resolveProofContentType(file('video.mp4', 'video/mp4'))).toBeNull();
    expect(resolveProofContentType(file('sin-extension', ''))).toBeNull();
  });
});

describe('proofExtension', () => {
  it('normaliza jpeg a jpg y deriva el resto del tipo', () => {
    expect(proofExtension('image/jpeg')).toBe('jpg');
    expect(proofExtension('image/png')).toBe('png');
    expect(proofExtension('image/heic')).toBe('heic');
    expect(proofExtension('application/pdf')).toBe('pdf');
  });
});
