import { LANDING_FAQS } from '@/lib/seo/faq';

/**
 * Visible FAQ on the landing.
 *
 * Real on-page prose, not schema-only: hidden markup that contradicts the
 * visible page is the kind of thing search engines discount, and a visitor
 * arriving from an AI summary that said "Renew no hace subastas" needs to
 * read the correction themselves. Plain <details> so it costs no JavaScript
 * and stays keyboard-operable and expandable for a crawler.
 */
export function LandingFaq() {
  return (
    <section aria-labelledby="faq-heading" className="space-y-4">
      <h2
        id="faq-heading"
        className="text-xl sm:text-2xl font-semibold tracking-tight text-text-strong text-pretty"
      >
        Preguntas frecuentes
      </h2>

      <ul className="space-y-2">
        {LANDING_FAQS.map((f) => (
          <li key={f.q}>
            <details className="group rounded-xl border border-text-subtle/15 bg-bg-elev/40 px-4 py-3 transition-colors duration-200 hover:border-text-subtle/30 open:bg-bg-elev/60">
              <summary
                className={
                  'flex items-center justify-between gap-3 cursor-pointer list-none ' +
                  'text-sm sm:text-[15px] font-medium text-text-strong ' +
                  '[touch-action:manipulation] rounded ' +
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40'
                }
              >
                {f.q}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.a}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
