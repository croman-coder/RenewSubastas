# Páginas públicas de subastas (Tanda 2A) — Diseño

- **Fecha:** 26 de septiembre de 2026
- **Estado:** aprobado por Croman el 26/9, por partes (decisiones en §2)
- **Antecedente:** auditoría del 26/9 (`project_auditoria-2026-09-26` en la memoria; resumen en §1)
- **Arquitectura actual:** `docs/ARQUITECTURA.md`

## 1. Objetivo

Que cada subasta minorista tenga una página que cualquiera pueda ver sin cuenta, con un solo link
para todos, que se pueda compartir por WhatsApp con vista previa del auto y que Google pueda
indexar mientras la subasta está abierta.

Por qué: en los últimos 30 días la portada tuvo ~4.400 sesiones y solo el 13% llegó al login.
Todas las tarjetas de la portada llevan al login (`/es/login?from=…`): un visitante no puede ver
fotos, ficha ni precio de un auto sin crear cuenta. De 155 compradores minoristas, 7 pujaron alguna
vez. Google trae el 3% del tráfico porque la única página indexable es la portada.

Fuera de alcance (proyectos aparte): avisos por WhatsApp y correo (Tanda 2B), la revisión de los
textos legales (sale en el mismo deploy, ver §9), la migración a Next 15.5, el rediseño móvil
estilo MotorHub y la traducción de `/en`.

## 2. Decisiones tomadas

| Tema                     | Decisión                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué ve el público        | Todo menos pujar: fotos, ficha técnica, descripción, precio, cantidad de pujas, cuenta regresiva y calculadora de financiación. **Sin chapa, VIN ni quién pujó** |
| Link                     | Uno solo para todos: `/{locale}/auctions/{id}` pasa a ser público. Sin sesión, versión pública; con sesión, la ficha de hoy                                      |
| Al terminar la subasta   | Según el resultado (§6)                                                                                                                                          |
| Mayoristas               | Nunca públicas (regla existente: el segmento mayorista es cerrado)                                                                                               |
| Frescura para el público | Datos en caché 30 s; la cuenta regresiva corre en el navegador. Con sesión, tiempo real como hoy                                                                 |

## 3. Rutas y acceso

La ficha sale del grupo `(protected)` (cuyo `AppShell` exige sesión) a un grupo nuevo
`[locale]/(abierto)/auctions/[id]/`. Su layout mira la sesión con `getOptionalUser()`:

- con sesión: `AppShell` y la ficha actual, sin cambios (incluye el MFA de staff, que vive en
  `getCurrentUser`);
- sin sesión, o con una cookie inválida: la barra pública de la portada (`PublicTopbar`) y la
  versión pública.

`(protected)/auctions/page.tsx` (el catálogo con sesión, `/es/auctions`) no se mueve.

| Quién               | Subasta minorista       | Subasta mayorista |
| ------------------- | ----------------------- | ----------------- |
| Sin cuenta          | Versión pública (nueva) | 404               |
| Comprador minorista | Ficha de hoy, con puja  | 404 (como hoy)    |
| Comprador mayorista | 404 (como hoy)          | Ficha de hoy      |
| Staff / admin       | Ficha de hoy            | Ficha de hoy      |

El middleware ya permite `auctions` como primer segmento, así que `/{locale}/auctions/{id}` y su
`opengraph-image` pasan (lección de la Tanda 1: la lista de segmentos conocidos bloqueó la imagen
de la portada).

## 4. Datos públicos

`lib/buyer/load-public-auction.ts` → `loadPublicAuction(id): PublicAuctionDetail | null`:

- Lee con el Admin SDK en el servidor. **Las reglas de Firestore no cambian**: un navegador sin
  sesión sigue sin poder leer `auctions` ni `vehicles`.
- Devuelve `null` para subastas mayoristas o inexistentes (→ 404).
- Campos: id, vehicleId, marca, modelo, año, km, transmisión, combustible, color, estado,
  descripción, fotos (url + miniatura), precio de salida, puja actual, cantidad de pujas,
  incremento, Compra ya, estado, resultado, fechas de inicio y cierre.
- **Nunca:** VIN, chapa, pujas (con o sin nombre), visitantes, reserva, pago, ganador.
- Envuelto en `unstable_cache` 30 s (clave por id). Resultado JSON plano, sin Timestamps.
- Test: la forma del objeto se compara contra una lista cerrada de claves; agregar un campo
  obliga a tocar el test (y a pensar si es publicable).

## 5. Pantalla pública

Mismo orden que la ficha de hoy, primero para celular:

1. Galería de fotos (miniaturas; la foto grande al abrirla).
2. Título, ficha técnica (sin chapa ni VIN), descripción.
3. Precio actual o de salida, cantidad de pujas, cuenta regresiva o fecha de apertura.
4. Calculadora de financiación (la misma, con la configuración de `app_config`).
5. En lugar del panel de puja: tarjeta **"Creá tu cuenta para pujar"** → `/{locale}/register?from=/{locale}/auctions/{id}`,
   y "Ya tengo cuenta" → login con el mismo `from` (el flujo actual ya devuelve a esa página).
6. **Compartir**: en el celular, el menú de compartir del teléfono (`navigator.share`); si no hay,
   `wa.me` con "Mirá este {marca modelo año} en subasta: {link}" y un botón de copiar link.
7. **Otras subastas en vivo**: hasta 4 tarjetas de la lista de la portada (ya en caché), sin la actual.

Las tarjetas de la portada (`PublicAuctionCard`) llevan directo a la ficha en lugar de al login.

## 6. Ciclo de vida

Regla pura en `lib/auctions/public-state.ts` (testeable sin Firestore):

| Estado                                                                 | Muestra                                                                        | Indexable / sitemap |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------- |
| Programada                                                             | Ficha con "Abre el …" y la tarjeta de cuenta                                   | Sí                  |
| En vivo                                                                | Ficha con cuenta regresiva                                                     | Sí                  |
| Vendida con el lote abierto (`isVisibleInCatalog`)                     | Ficha con franja VENDIDO                                                       | No                  |
| Sin vender y el vehículo tiene otra subasta minorista abierta          | Redirección **temporal** a esa subasta                                         | —                   |
| Cualquier otro final (vendida con lote cerrado, sin vender, cancelada) | "Subasta finalizada" con el resultado ("Se vendió" / "No se vendió") y en vivo | No                  |

La subasta nueva se busca con `where('vehicleId', '==', …)` (consulta que ya usa la app, sin
índices nuevos) y se filtra en memoria por estado abierto y segmento minorista.

## 7. SEO y vista previa

- `generateMetadata`: título "{Marca Modelo Año} en subasta · Renew Subastas"; descripción con km,
  combustible, transmisión, precio actual y fecha de cierre; canonical `/{locale}/auctions/{id}`;
  hreflang solo idiomas indexados (`INDEXED_LOCALES`); `robots: noindex` cuando §6 dice no
  indexable. `/en` sigue sin indexar por la regla del layout.
- Datos estructurados: `Car` con marca, modelo, año, km, combustible, transmisión, color y fotos,
  y `offers` (`Offer`: precio en USD, disponibilidad, `priceValidUntil` = cierre, vendedor
  Renew Subastas).
- `opengraph-image` por subasta: foto principal, modelo, precio y "cierra el …", en caché unos
  minutos (`revalidate`). A verificar al implementar: si `ImageResponse` no dibuja WebP, usar la
  foto original (JPEG) para la imagen de redes.
- Sitemap: suma las subastas minoristas programadas y en vivo (con `lastModified`), regenerado
  como mucho una vez por hora.

## 8. Medición

Sin infraestructura nueva: el `TrafficTracker` ya registra vistas por tipo de página (`detail`
incluido) y el embudo diario. Se mira cuántas visitas a fichas públicas terminan en `/register`
o `/login` con `from=/…/auctions/…`, contra el 13% portada→login de la auditoría.

## 9. Pruebas, despliegue y costo

- **Unitarias (TDD):** claves de `PublicAuctionDetail`; la regla de §6; metadata y datos
  estructurados; el sitemap solo con minoristas abiertas; las tarjetas de la portada apuntan a la
  ficha.
- **Seguridad:** mayorista → 404 sin sesión; con sesión, todo igual que hoy. En la prueba de punta
  a punta se busca en el HTML público que no aparezcan VIN ni chapa del seed.
- **Punta a punta en local** (build de producción + emuladores + seed de demo): cada estado del seed
  (por abrir, en vivo, Compra ya, disputada, ganada, reserva no alcanzada), la imagen para redes de
  cada subasta, el botón de compartir y Lighthouse de la ficha pública.
- **Despliegue:** un solo push a `main` (15 créditos), junto con los textos legales revisados.
- **Costo:** cada vista pública es una ejecución del servidor; con la caché de 30 s casi no lee
  Firestore. ≈ 3 créditos de cómputo cada 3.000 vistas. La imagen para redes se genera como mucho
  una vez cada pocos minutos por subasta.

## 10. Riesgos

| Riesgo                                         | Mitigación                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Exponer un dato de comprador o del vehículo    | Loader propio con lista cerrada de claves + test + revisión del HTML público |
| Precio viejo para el público (hasta 30 s)      | Aceptado: el público no puja; con sesión es tiempo real                      |
| Links viejos de correos y notificaciones       | Siguen andando: la URL es la misma                                           |
| Dos grupos de rutas con el segmento `auctions` | Verificar en el build que Next no lo marque como conflicto                   |
