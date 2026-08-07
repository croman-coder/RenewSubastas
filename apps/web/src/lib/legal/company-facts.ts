import type { Company } from './load-company';

/**
 * Shared framing for the three legal pages.
 *
 * Kept as plain data so the pages stay presentational and the wording is
 * reviewed in one place. Nothing here asserts a fact about the business that
 * isn't either configured (see `loadCompany`) or true of the codebase itself
 * — the data-collection lists below were written against what the app
 * actually stores and sends, not a generic template.
 */

/** Effective date shown on every legal page. Bump when the text changes. */
export const LEGAL_VERSION_DATE = '7 de agosto de 2026';

export interface LegalSection {
  heading: string;
  /** Paragraphs. */
  body: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
}

const contactLine = (c: Company): string => {
  const parts = [c.email && `correo ${c.email}`, c.phone && `teléfono ${c.phone}`].filter(Boolean);
  return parts.length > 0 ? parts.join(' o ') : 'los canales de contacto publicados en el sitio';
};

export function privacySections(c: Company): LegalSection[] {
  return [
    {
      heading: 'Quién trata tus datos',
      body: [
        `El responsable del tratamiento es ${c.legalName || 'la empresa operadora del sitio'}${
          c.ruc ? `, RUC ${c.ruc}` : ''
        }${c.address ? `, con domicilio en ${c.address}` : ''}. Podés contactarnos por ${contactLine(c)}.`,
      ],
    },
    {
      heading: 'Qué datos recopilamos',
      body: [
        'Recopilamos únicamente los datos necesarios para operar la plataforma de subastas y cumplir con las obligaciones que surgen de una compraventa de vehículos.',
      ],
      bullets: [
        'Datos de identificación: nombre y apellido, tipo y número de documento (CI, RUC o pasaporte).',
        'Datos de contacto: correo electrónico y número de teléfono.',
        'Datos de domicilio, cuando los cargás para la facturación o la entrega.',
        'Actividad en la plataforma: subastas que visitás, pujas que realizás, vehículos que marcás como favoritos y adjudicaciones obtenidas.',
        'Comprobantes de pago que subís voluntariamente para acreditar la seña.',
        'Datos técnicos: dirección IP, tipo de dispositivo y navegador, e información de errores cuando la aplicación falla.',
      ],
    },
    {
      heading: 'Para qué los usamos',
      body: ['Cada dato se usa para una finalidad concreta y determinada:'],
      bullets: [
        'Crear y administrar tu cuenta, y verificar tu identidad como postor.',
        'Registrar y validar tus pujas, y determinar la adjudicación de cada subasta.',
        'Comunicarte novedades operativas: que te superaron en una puja, que ganaste una subasta, o el estado de tu pago.',
        'Gestionar el cobro de la seña y la posterior facturación de la unidad.',
        'Prevenir el fraude y el uso indebido de la plataforma.',
        'Cumplir obligaciones legales, tributarias y de registro vehicular.',
      ],
    },
    {
      heading: 'Con quién los compartimos',
      body: [
        'No vendemos tus datos personales. Los compartimos únicamente con proveedores que nos prestan servicios necesarios para operar, y solo en la medida en que lo requieren:',
      ],
      bullets: [
        'Proveedores de infraestructura y alojamiento en la nube, que almacenan la base de datos y los archivos de la plataforma.',
        'Un proveedor de envío de correo electrónico transaccional, para las notificaciones de la plataforma.',
        'Un servicio de monitoreo de errores, que registra fallas técnicas de la aplicación.',
        'Meta Platforms, únicamente si aceptaste las cookies de medición publicitaria: recibe las páginas que visitás dentro del sitio para medir el resultado de nuestros anuncios. No le enviamos tu nombre, documento, teléfono ni tus pujas. Si rechazaste las cookies, no se le envía nada.',
        'Autoridades competentes, cuando exista una obligación legal o un requerimiento judicial.',
      ],
    },
    {
      heading: 'Cuánto tiempo los conservamos',
      body: [
        'Conservamos tus datos mientras tu cuenta esté activa. Cerrada la cuenta, mantenemos la información asociada a operaciones concretadas durante el plazo que exigen las normas comerciales y tributarias aplicables, y luego la eliminamos o la anonimizamos.',
      ],
    },
    {
      heading: 'Tus derechos',
      body: [
        'Podés solicitar el acceso a los datos personales que tenemos sobre vos, su rectificación cuando sean inexactos, su actualización y su supresión cuando ya no exista una obligación legal que nos exija conservarlos. También podés oponerte a determinados tratamientos.',
        `Para ejercer cualquiera de estos derechos escribinos a ${c.email || 'nuestro correo de contacto'}. Respondemos toda solicitud en un plazo razonable, y sin costo.`,
        'Desde la sección de configuración de tu cuenta podés además editar tu perfil y solicitar la baja directamente.',
      ],
    },
    {
      heading: 'Seguridad',
      body: [
        'Aplicamos medidas técnicas y organizativas para proteger tu información: cifrado en tránsito, control de acceso por rol, y reglas de autorización que limitan qué puede leer cada usuario. Ningún sistema es infalible, pero tratamos la seguridad como un requisito permanente y no como una función terminada.',
      ],
    },
    {
      heading: 'Menores de edad',
      body: [
        'La plataforma está dirigida a personas mayores de edad con capacidad legal para contratar. No recopilamos deliberadamente datos de menores de edad.',
      ],
    },
    {
      heading: 'Cambios en esta política',
      body: [
        `Podemos actualizar esta política. Cuando el cambio sea sustancial lo comunicaremos por los medios de contacto registrados. La versión vigente es la publicada en esta página, con fecha ${LEGAL_VERSION_DATE}.`,
      ],
    },
  ];
}

export function termsSections(c: Company): LegalSection[] {
  return [
    {
      heading: 'Objeto',
      body: [
        `Estos términos regulan el acceso y uso de la plataforma de subastas de vehículos usados operada por ${
          c.legalName || 'la empresa operadora del sitio'
        }${c.ruc ? `, RUC ${c.ruc}` : ''}. Al crear una cuenta o utilizar el sitio aceptás estas condiciones en su totalidad.`,
      ],
    },
    {
      heading: 'Quién puede participar',
      body: [
        'Para pujar necesitás una cuenta habilitada. Las cuentas se otorgan a personas mayores de edad con capacidad legal para contratar, y pueden estar sujetas a verificación de identidad.',
        'Sos responsable de la veracidad de los datos que cargás y de la confidencialidad de tus credenciales. Toda actividad realizada desde tu cuenta se considera tuya.',
      ],
    },
    {
      heading: 'Las pujas son vinculantes',
      body: [
        'Cada puja que confirmás constituye una oferta de compra firme e irrevocable por el monto ofrecido. No podés retirarla.',
        'Si al cierre de la subasta tu puja resulta la más alta y alcanza el precio mínimo establecido, el vehículo te queda adjudicado y nace tu obligación de pago.',
      ],
    },
    {
      heading: 'Cierre y extensión automática',
      body: [
        'Cada subasta tiene una fecha y hora de cierre publicadas. Si se recibe una puja en los momentos finales, el cierre se extiende automáticamente por un lapso breve para que los demás postores puedan responder. Esta extensión tiene un tope máximo, alcanzado el cual la subasta cierra de forma definitiva.',
      ],
    },
    {
      heading: 'Pago de la seña y plazo',
      body: [
        'Adjudicada la unidad, debés abonar una seña dentro del plazo informado en la plataforma y en el correo de adjudicación, y subir el comprobante correspondiente.',
        'Vencido ese plazo sin acreditar el pago, la adjudicación se libera, el vehículo puede volver a publicarse y perdés el derecho sobre la unidad. Nos reservamos la facultad de suspender la cuenta de quien incumpla de forma reiterada.',
      ],
    },
    {
      heading: 'Estado de los vehículos',
      body: [
        'Los vehículos se ofrecen en el estado en que se encuentran. Publicamos la información y las fotografías de cada unidad de buena fe y procurando que sean exactas, pero el desgaste propio del uso es inherente a un vehículo usado.',
        'Recomendamos revisar la unidad antes de pujar. La adjudicación implica que aceptás el estado del vehículo tal como se encuentra al momento de la subasta.',
      ],
    },
    {
      heading: 'Gastos de transferencia',
      body: [
        'Salvo que se indique expresamente lo contrario en la publicación, los gastos de transferencia, gestoría, patentamiento e impuestos asociados corren por cuenta del comprador.',
      ],
    },
    {
      heading: 'Suspensión y cancelación',
      body: [
        'Podemos suspender o cancelar una subasta por errores de publicación, indisponibilidad sobreviniente de la unidad o razones operativas debidamente fundadas, comunicándolo a los postores involucrados.',
        'También podemos suspender cuentas ante indicios de fraude, manipulación de pujas o incumplimiento de estos términos.',
      ],
    },
    {
      heading: 'Disponibilidad del servicio',
      body: [
        'Procuramos que la plataforma esté disponible de forma continua, pero no podemos garantizar la ausencia de interrupciones por mantenimiento, fallas técnicas o causas ajenas a nuestro control.',
      ],
    },
    {
      heading: 'Ley aplicable',
      body: [
        'Estos términos se rigen por las leyes de la República del Paraguay. Cualquier controversia se someterá a los tribunales ordinarios competentes de la ciudad de Asunción.',
      ],
    },
    {
      heading: 'Contacto',
      body: [`Ante cualquier consulta sobre estos términos, escribinos a ${contactLine(c)}.`],
    },
  ];
}

export function cookieSections(c: Company): LegalSection[] {
  return [
    {
      heading: 'Qué es una cookie',
      body: [
        'Una cookie es un archivo pequeño que un sitio guarda en tu dispositivo. Sirve para recordar información entre una visita y la siguiente, por ejemplo que ya iniciaste sesión.',
      ],
    },
    {
      heading: 'Cookies que usamos',
      body: [
        'Usamos la menor cantidad posible. Las que no son imprescindibles sólo se activan si las aceptás, y podés rechazarlas sin perder ninguna función de la plataforma.',
      ],
      bullets: [
        'Cookie de sesión: mantiene tu sesión iniciada mientras usás la plataforma. Es imprescindible para que el sitio funcione y no requiere consentimiento; sin ella no podrías permanecer autenticado.',
        'Preferencia de cookies: guarda la decisión que tomás en el aviso de cookies, para no volver a preguntarte en cada visita.',
        'Monitoreo de errores: cuando lo aceptás, un servicio de terceros registra información técnica ante una falla de la aplicación para poder diagnosticarla. Si lo rechazás, no se activa.',
        'Medición publicitaria (Meta Pixel): cuando lo aceptás, se cargan cookies de Meta Platforms que registran las páginas que visitás dentro del sitio. Nos sirve para medir el resultado de nuestros anuncios y para mostrarte publicidad más relevante en Facebook e Instagram. Si lo rechazás, no se carga y no se envía ningún dato a Meta.',
      ],
    },
    {
      heading: 'Cómo cambiar tu decisión',
      body: [
        'Podés cambiar tu elección en cualquier momento desde el enlace de configuración de cookies en el pie de página. También podés bloquear o eliminar cookies desde la configuración de tu navegador, teniendo en cuenta que bloquear la cookie de sesión impedirá iniciar sesión.',
      ],
    },
    {
      heading: 'Consultas',
      body: [`Si tenés dudas sobre el uso de cookies, escribinos a ${contactLine(c)}.`],
    },
  ];
}
