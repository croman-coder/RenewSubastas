# Contador de tráfico web — diseño

**Fecha:** 8 de agosto de 2026
**Estado:** aprobado

## El problema

`/staff/insights` muestra "N únicos · N vistas" por vehículo. Ese número sale de
`functions/src/insights/logAuctionView.ts`, que llama a `requireSignedIn` y
además devuelve un no-op para cualquier rol que no sea `buyer`. O sea: cuenta
compradores logueados que abrieron una ficha concreta. Nada más.

No hay ninguna analítica de sitio en el repo. Ni GA, ni Plausible, ni Umami. El
visitante anónimo, la home y el catálogo son invisibles.

Eso importa porque Santa Rosa paga anuncios de Instagram hacia este sitio
(`utm_source=ig` aparece en los eventos de Sentry) y hoy no puede ver ese
tráfico aterrizar. El píxel de Meta reporta a Meta, no da un número propio.

## Qué se construye

Un contador propio, anónimo, que responde tres preguntas:

1. **¿Cuánta gente entra?** — visitas y sesiones por día.
2. **¿De dónde viene?** — Instagram, Facebook, Google, directo.
3. **¿Dónde se cae?** — embudo home → catálogo → ficha → login → puja.

La tercera es la que convierte el número en decisión. Saber que entraron 400
personas no sirve; saber que 400 vieron el catálogo, 90 abrieron una ficha y 4
se loguearon, sí.

## Decisiones

### Sin cookies, identidad por sesión de navegador

Un id aleatorio en `sessionStorage`, que muere al cerrar la pestaña. No es
cookie ni identificador persistente, así que **no entra al banner de
consentimiento** y por lo tanto cuenta a todos — incluidos los que rechazan.

Ese es el punto entero. Acabamos de ver con el píxel de Meta lo que pasa cuando
la medición depende del consentimiento: subcuenta, y encima es invisible para
las herramientas. Un contador que solo mide a quien acepta no sirve para
decidir cuánto invertir en anuncios.

Costo aceptado: alguien que vuelve mañana cuenta como sesión nueva. Medimos
visitas y sesiones con precisión; "personas únicas entre días" es aproximado.
Preferimos un número honesto y completo antes que uno preciso y sesgado.

### Eventos crudos con id automático, agregados por un scheduler

`page_views/{autoId}` recibe un documento por vista. Ids automáticos, así que
las escrituras se distribuyen y no hay documento caliente — que es lo que
rompería un contador incremental sobre un solo doc diario cuando cierra un
lote y entra todo el mundo a la vez.

Un `onSchedule` diario agrega el día anterior a
`insights_traffic_daily/{YYYY-MM-DD}` y borra los crudos. El panel lee los
agregados (barato) más el conteo del día en curso.

### El servidor clasifica, el cliente no

El callable recibe la ruta y deriva él mismo `pathKind` (`home` | `catalog` |
`detail` | `login` | `other`) y la fuente. Nunca se confía en una
clasificación que venga del cliente, porque eso permite inflar cualquier
categoría.

### Nunca se guarda el query string

Esta es la regla dura. `/auth/set-password?token=…` y `/auth/action?oobCode=…`
llevan credenciales vivas en la URL. El píxel de Meta ya nos enseñó esta
lección: guardar la URL completa es filtrar el token.

Dos capas:

1. El callable **rechaza** cualquier ruta bajo `/auth/action` o
   `/auth/set-password` — reutiliza `isCredentialBearingPath`, que ya existe en
   `apps/web/src/lib/analytics/meta-pixel.ts` y ya está testeada.
2. De todo lo demás guarda **sólo** `pathKind` y, cuando es una ficha, el
   `auctionId`. Nunca la ruta cruda, nunca el query string.

La fuente se deriva de `utm_source` / `document.referrer` y se normaliza a una
lista cerrada (`ig`, `fb`, `google`, `direct`, `other`). Un `utm_source`
arbitrario del cliente jamás se guarda tal cual.

### Qué NO se guarda

Ni IP, ni user-agent, ni id persistente, ni nada que identifique a una persona.
El user-agent se mira en memoria para descartar bots y se descarta. Como no
queda ningún dato personal, esto es estadística agregada — pero igual se
menciona en la política de privacidad, porque decir lo que se hace es más
barato que explicar después por qué no se dijo.

## Riesgos

| Riesgo                               | Mitigación                                                  |
| ------------------------------------ | ----------------------------------------------------------- |
| Filtrar un token por la URL          | Doble capa: ruta rechazada + sólo se guarda `pathKind`      |
| Documento caliente al cerrar un lote | Ids automáticos, sin contador incremental                   |
| Bots inflando el número              | Filtro por user-agent en el servidor, descartado después    |
| Cliente hostil inflando categorías   | El servidor clasifica; rate limit por sesión                |
| Costo de escrituras                  | ~1 escritura por vista; a volumen actual es centavos al mes |

## Alcance

Dentro: el callable, el componente cliente, el scheduler de agregación, el
loader y el bloque en `/staff/insights`, y el párrafo de privacidad.

Fuera: retención larga de crudos, exportación, comparación entre períodos,
segmentación por audiencia retail/mayorista. Si el número resulta útil, eso
viene después.
