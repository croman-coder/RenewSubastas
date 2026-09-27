/** "Mirá este Toyota Hilux 2019 en subasta" — el mensaje que lleva un link compartido. */
export function shareText(title: string): string {
  return `Mirá este ${title} en subasta`;
}

/**
 * wa.me con el texto y el link juntos: WhatsApp despliega la vista previa
 * con la imagen propia de la subasta (opengraph-image de la página).
 */
export function whatsappShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`;
}
