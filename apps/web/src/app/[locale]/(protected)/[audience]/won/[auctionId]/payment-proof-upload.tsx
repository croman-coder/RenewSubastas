'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { CheckCircle2, FileUp, Loader2, Paperclip } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { proofExtension, resolveProofContentType } from '@/lib/buyer/proof-file';
import { describeProofUploadError } from '@/lib/buyer/proof-upload-error';
import { Button } from '@/components/ui/button';

interface Props {
  auctionId: string;
  /** Already-submitted proof URL, if the buyer uploaded before. */
  existingProofUrl?: string | null;
}

const MAX_BYTES = 10 * 1024 * 1024;
// `image/*` en vez de una lista cerrada de tipos. Los selectores de archivos
// de Android filtran por este atributo, y con la lista cerrada las fotos que
// el sistema no clasifica —las que guarda WhatsApp, las descargas sin
// cabecera— aparecían en gris, imposibles de elegir. Se agregan también las
// extensiones sueltas porque algunos selectores miran el nombre y no el tipo.
const ACCEPT = 'image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif';

/**
 * Lets the winning buyer attach their transfer receipt (image or PDF)
 * on the won-detail page. Uploads to Storage under
 * payment-proofs/{auctionId}/{uid}/{ts}.{ext} — uid is a real path segment
 * (storage.rules binds it with a wildcard and checks it against the
 * auction's winnerUid at write time), not just a filename prefix — then
 * calls submitPaymentProof which emails the admin the full dossier with
 * the file attached. Shows a confirmed state once submitted.
 */
export function PaymentProofUpload({ auctionId, existingProofUrl }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  // Se guarda junto al archivo porque es el tipo YA resuelto, no el que
  // informó el navegador: es el que la regla del bucket va a mirar.
  const [contentType, setContentType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(!!existingProofUrl);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error('El archivo supera los 10 MB.');
      return;
    }
    // Antes esto miraba sólo `f.type`, que en celular llega vacío a cada rato:
    // el archivo quedaba rechazado con un "subí una imagen o un PDF" delante
    // de alguien que acababa de elegir justamente eso. Ahora se resuelve
    // también por la extensión — ver proof-file.ts.
    const type = resolveProofContentType(f);
    if (!type) {
      toast.error('Subí una foto (JPG, PNG, HEIC) o un PDF.');
      return;
    }
    setFile(f);
    setContentType(type);
  }

  async function submit() {
    if (!file) return;
    const uid = fb.auth.currentUser?.uid;
    if (!uid) {
      toast.error('Sesión expirada. Volvé a entrar.');
      return;
    }
    // Se recalcula por si acaso: `contentType` sale del mismo archivo, pero
    // dejar que `submit` dependa de dos piezas de estado que podrían
    // desincronizarse es pedirlo.
    const type = contentType ?? resolveProofContentType(file);
    if (!type) {
      toast.error('Subí una foto (JPG, PNG, HEIC) o un PDF.');
      return;
    }
    setBusy(true);
    try {
      const path = `payment-proofs/${auctionId}/${uid}/${Date.now()}.${proofExtension(type)}`;
      // El tipo va explícito. Si se manda el del navegador y viene vacío,
      // Storage guarda application/octet-stream y la regla del bucket —que
      // exige image/* o application/pdf— rechaza con storage/unauthorized.
      await uploadBytes(storageRef(fb.storage, path), file, { contentType: type });
      await httpsCallable(fb.functions, 'submitPaymentProof')({ auctionId, storagePath: path });
      setDone(true);
      toast.success('Comprobante enviado. Santa Rosa lo va a revisar.');
      router.refresh();
    } catch (e) {
      // El mensaje crudo de Firebase es inglés técnico con el código pegado
      // al final; acá se traduce a algo que diga qué hacer. Ver
      // proof-upload-error.ts.
      console.error('[payment-proof] subida fallida', e);
      toast.error(describeProofUploadError(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5 flex items-start gap-3">
        <CheckCircle2
          className="w-5 h-5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300"
          strokeWidth={2.25}
        />
        <div>
          <h3 className="text-sm font-semibold text-text-strong">Comprobante enviado</h3>
          <p className="text-sm text-text-muted mt-0.5">
            Recibimos tu comprobante de seña. Un asesor de Santa Rosa lo va a verificar y te
            confirma a la brevedad.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev/40 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-9 h-9 rounded-lg bg-text-strong/[0.08] ring-1 ring-text-subtle/25 grid place-items-center text-text-strong">
          <FileUp className="w-4 h-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-text-strong">
            Adjuntar comprobante de seña
          </h3>
          <p className="text-sm text-text-muted mt-0.5">
            Subí la foto o el PDF de la transferencia. Lo enviamos directo a Santa Rosa para que
            confirme tu pago.
          </p>
        </div>
      </div>

      <label
        htmlFor="proof-input"
        className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-text-subtle/30 bg-bg-deep/40 px-4 py-3.5 cursor-pointer hover:border-text-subtle/50 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-text-strong/40 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg-base"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Paperclip className="w-4 h-4 shrink-0 text-text-muted" />
          <span className="text-sm truncate text-text-strong">
            {file ? file.name : 'Elegir archivo (JPG, PNG o PDF · máx 10 MB)'}
          </span>
        </span>
        <span className="text-xs font-medium text-text-muted shrink-0">Examinar</span>
        {/* `sr-only` (not `hidden`/display:none) keeps the input focusable and
            in the tab order — it's the ONLY way to open the file picker via
            keyboard, since the wrapping <label> itself isn't a tab stop. */}
        <input
          id="proof-input"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={pick}
          disabled={busy}
        />
      </label>

      <Button type="button" disabled={!file || busy} onClick={submit} className="w-full sm:w-auto">
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Enviando…
          </>
        ) : (
          <>
            <FileUp className="w-4 h-4 mr-1.5" /> Enviar comprobante
          </>
        )}
      </Button>
    </div>
  );
}
