/**
 * Decide con qué tipo de contenido subir un comprobante, sin confiar en lo
 * que diga el navegador.
 *
 * `File.type` viene vacío más seguido de lo que uno esperaría, y siempre en
 * celular: archivos elegidos desde el gestor de archivos de Android, cosas
 * guardadas por WhatsApp, descargas que llegaron sin cabecera. El navegador
 * entrega entonces `''` o `application/octet-stream`.
 *
 * Eso rompía el envío del comprobante dos veces seguidas. Primero al elegir:
 * la comprobación era `type.startsWith('image/')`, así que un archivo sin tipo
 * ni siquiera se podía adjuntar, y el mensaje decía "subí una imagen o un PDF"
 * — que es exactamente lo que la persona acababa de elegir. Y si lograba
 * pasar, la subida mandaba ese tipo vacío a Storage, y la regla del bucket
 * exige `image/.*` o `application/pdf`, con lo cual la rechazaba con un
 * `storage/unauthorized` incomprensible.
 *
 * Acá se cae a la extensión del nombre, que es lo que el sistema operativo sí
 * conserva. Se aceptan HEIC y HEIF además de los formatos obvios: son los que
 * produce la cámara de iPhone por defecto y son imágenes perfectamente
 * legibles para quien revisa el comprobante.
 *
 * Devuelve `null` sólo cuando ni el tipo ni la extensión dan algo aceptable.
 * Ahí el rechazo es correcto y el mensaje al usuario tiene sentido.
 */
const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

/** Lo que la regla de Storage acepta: cualquier imagen, o un PDF. */
function isAllowed(type: string): boolean {
  return type.startsWith('image/') || type === 'application/pdf';
}

function extensionOf(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? (parts.pop() ?? '') : '';
}

export function resolveProofContentType(file: { name: string; type: string }): string | null {
  // `application/octet-stream` es el "no sé" del navegador, no una afirmación:
  // tratarlo como válido es lo que hacía fallar la subida del lado del bucket.
  if (file.type && file.type !== 'application/octet-stream' && isAllowed(file.type)) {
    return file.type;
  }
  return BY_EXTENSION[extensionOf(file.name)] ?? null;
}

/**
 * Extensión con la que guardar el archivo en Storage.
 *
 * Se deriva del tipo ya resuelto y no del nombre original, para que la ruta no
 * herede nombres largos con espacios, acentos o varios puntos —típicos de
 * "IMG-20260817-WA0007 (1).jpeg"— ni quede sin extensión cuando el nombre no
 * tenía ninguna.
 */
export function proofExtension(contentType: string): string {
  if (contentType === 'application/pdf') return 'pdf';
  const subtype = contentType.slice('image/'.length);
  return subtype === 'jpeg' ? 'jpg' : (subtype ?? 'jpg');
}
