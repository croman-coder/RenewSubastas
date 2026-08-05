'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CompanyInitial {
  legalName: string;
  ruc: string;
  address: string;
  email: string;
  phone: string;
}

const FIELDS: Array<{
  key: keyof CompanyInitial;
  label: string;
  hint: string;
  type?: string;
  autoComplete?: string;
}> = [
  {
    key: 'legalName',
    label: 'Razón social',
    hint: 'Nombre legal exacto de la empresa que opera el sitio.',
    autoComplete: 'organization',
  },
  { key: 'ruc', label: 'RUC', hint: 'Con dígito verificador, tal como figura en la constancia.' },
  {
    key: 'address',
    label: 'Domicilio legal',
    hint: 'Calle, número, ciudad y país.',
    autoComplete: 'street-address',
  },
  {
    key: 'email',
    label: 'Correo de contacto legal',
    hint: 'A esta dirección llegan los pedidos de acceso o borrado de datos.',
    type: 'email',
    autoComplete: 'email',
  },
  { key: 'phone', label: 'Teléfono', hint: 'Opcional.', type: 'tel', autoComplete: 'tel' },
];

/**
 * Legal identity used by the public privacy / terms / cookies pages and the
 * site footer.
 *
 * Lives in config rather than in code so the documents can never show an
 * identity nobody at the company reviewed, and so a change of address doesn't
 * require a deploy. Until these are filled the legal pages render a visible
 * "incomplete" notice instead of inventing values.
 */
export function CompanyForm({ initial }: { initial: CompanyInitial }) {
  const router = useRouter();
  const [values, setValues] = useState<CompanyInitial>(initial);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof CompanyInitial, v: string) => setValues((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'updateGlobalConfig')({ company: values });
      toast.success('Datos de la empresa guardados');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-text-strong">Datos de la empresa</h2>
        <p className="mt-1 text-sm text-text-muted max-w-prose">
          Se muestran en la política de privacidad, los términos y condiciones, la política de
          cookies y el pie de página del sitio público.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-2 min-w-0">
            <Label htmlFor={`company-${f.key}`}>{f.label}</Label>
            <Input
              id={`company-${f.key}`}
              type={f.type ?? 'text'}
              {...(f.autoComplete ? { autoComplete: f.autoComplete } : {})}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
            <p className="text-xs text-text-muted">{f.hint}</p>
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar'}
      </Button>
    </section>
  );
}
