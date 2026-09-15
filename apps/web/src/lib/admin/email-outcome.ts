/**
 * What a callable that also sends an email reports back about that email.
 * Mirrors the `emailed`/`emailStatus`/`emailReason`/`emailTo` fields returned
 * by `generatePasswordReset` and `createUser` (functions/src/auth/*). The
 * admin screens render it PERSISTENTLY next to the link, not only as a toast:
 * "¿le llegó el correo?" is the question the admin asks a minute later, when
 * the toast is long gone.
 */
export interface EmailOutcome {
  /** True only when Resend accepted the message. */
  emailed: boolean;
  emailStatus: 'sent' | 'failed' | 'skipped';
  /** Resend's message or `no_api_key` when not sent; null when sent. */
  emailReason: string | null;
  emailTo: string;
}

/** One line of plain Spanish for the persistent status row. */
export function describeEmailOutcome(o: EmailOutcome): { ok: boolean; text: string } {
  if (o.emailed) {
    return {
      ok: true,
      text: `Correo enviado a ${o.emailTo}. Si en unos minutos no le llegó, que revise spam — y si no, copiá el link y mandáselo por WhatsApp.`,
    };
  }
  const why =
    o.emailStatus === 'skipped'
      ? 'el servidor no tiene configurado el envío de correos'
      : (o.emailReason ?? 'error al enviar');
  return {
    ok: false,
    text: `No se pudo enviar el correo a ${o.emailTo} (${why}). Copiá el link y mandáselo por un canal seguro (WhatsApp, llamada).`,
  };
}
