/**
 * Questions answered on the landing, mirrored into FAQPage structured data.
 *
 * Written because Google's AI Overview was stating that Renew "no realiza
 * subastas públicas ni remates", synthesised from the sister dealership site
 * (renew.com.py) rather than from this one. This platform demonstrably runs
 * auctions, so the fix is to say so in indexable prose and in schema instead
 * of leaving crawlers to infer it from a page that is mostly a vehicle grid.
 *
 * Every answer is a plain statement of how the product actually works — the
 * mechanics here match the terms and conditions and the auction engine.
 */
export interface Faq {
  q: string;
  a: string;
}

export const LANDING_FAQS: Faq[] = [
  {
    q: '¿Renew Subastas realiza subastas de vehículos?',
    a: 'Sí. Renew Subastas es la plataforma de subastas de vehículos usados certificados de Santa Rosa en Paraguay. Publicamos lotes de unidades con una fecha y hora de cierre, y los usuarios registrados pujan en línea por cada vehículo hasta ese momento.',
  },
  {
    q: '¿Cómo funciona una subasta?',
    a: 'Cada lote se publica con un precio inicial y una fecha de cierre común. Podés seguir las pujas en tiempo real. Si recibimos una oferta en los últimos segundos, el cierre se extiende automáticamente por un lapso breve para que los demás postores puedan responder, hasta un tope máximo.',
  },
  {
    q: '¿Quién puede participar?',
    a: 'Cualquier persona mayor de edad con capacidad legal para contratar. Podés ver las unidades disponibles sin cuenta; para pujar necesitás registrarte, algo que se hace en un paso con Google.',
  },
  {
    q: '¿Qué pasa si gano una subasta?',
    a: 'Si tu puja es la más alta al cierre y alcanza el precio mínimo, el vehículo queda adjudicado a tu nombre. Recibís un correo con los datos para abonar la seña y el plazo para hacerlo; una vez acreditada, coordinamos la facturación y la entrega.',
  },
  {
    q: '¿Los vehículos están certificados?',
    a: 'Sí. Las unidades son seminuevos certificados revisados por Santa Rosa. Se ofrecen en el estado en que se encuentran, y recomendamos revisarlas antes de pujar.',
  },
];
