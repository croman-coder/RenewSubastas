# Contador de tráfico web — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Medir cuánta gente entra a renewsubastas, de dónde viene y dónde se cae, sin cookies y sin depender del consentimiento.

**Architecture:** Un callable escribe un evento crudo por vista con id automático (sin documento caliente). Un scheduler diario agrega a un doc por día y borra los crudos. `/staff/insights` lee los agregados.

**Tech Stack:** Firebase Cloud Functions v2, Firestore, Next.js 14 App Router.

## Global Constraints

- **Nunca guardar el query string ni la ruta cruda.** Sólo `pathKind` y, en fichas, `auctionId`. `/auth/action` y `/auth/set-password` se rechazan de entrada reutilizando `isCredentialBearingPath` de `apps/web/src/lib/analytics/meta-pixel.ts`.
- No guardar IP, user-agent ni ningún id persistente. El user-agent se usa en memoria para descartar bots y se descarta.
- El servidor clasifica `pathKind` y `source`; jamás se confía en una clasificación del cliente.
- `source` se normaliza a una lista cerrada: `ig` | `fb` | `google` | `direct` | `other`.
- Todo callable nuevo lleva `enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false'` y región `us-central1`.
- Ids del cliente usan `DocId` de `functions/src/lib/ids.ts`.
- Firestore exige todas las lecturas antes de todas las escrituras en una transacción.
- `apps/web` NO tiene harness de render de componentes (vitest `environment: 'node'`, sin jsdom). Sólo se testean módulos puros — extraerlos, como hacen `lib/auctions/win-state.ts` y `lib/buyer/catalog-visibility.ts`.
- Baselines a preservar: functions 214/214, web 60/60, shared-types 24/24.
- Emuladores: correr `npx -y firebase-tools emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test'`. **Antes de levantar cualquier emulador, crear `functions/.secret.local` con `RESEND_API_KEY=dummy-local-key`** — sin eso, `pnpm emulators` toma la clave de producción de Secret Manager y manda correos reales.

## File Structure

- Create `functions/src/insights/log-page-view-rules.ts` — clasificación pura (`pathKind`, `source`, bot) + test.
- Create `functions/src/insights/logPageView.ts` (+ test) — el callable.
- Create `functions/src/insights/aggregateTraffic.ts` (+ test) — el scheduler diario.
- Modify `functions/src/index.ts` — exports.
- Create `apps/web/src/lib/analytics/traffic-session.ts` (+ test) — id de sesión, puro.
- Create `apps/web/src/components/analytics/traffic-tracker.tsx` — cliente.
- Modify `apps/web/src/app/[locale]/layout.tsx` — montar el tracker.
- Create `apps/web/src/lib/insights/load-traffic.ts` — loader.
- Modify `apps/web/src/app/[locale]/(protected)/staff/insights/page.tsx` — el bloque.
- Modify `apps/web/src/lib/legal/company-facts.ts` — párrafo de privacidad.
- Modify `firestore.rules` — `page_views` y `insights_traffic_daily`.

---

### Task 1: Reglas puras de clasificación

**Files:** Create `functions/src/insights/log-page-view-rules.ts` y su test.

**Produces:** `classifyPath(pathname): PathKind`, `classifySource(utmSource, referrer): Source`, `isBotUserAgent(ua): boolean`, y los tipos `PathKind = 'home'|'catalog'|'detail'|'login'|'other'` y `Source = 'ig'|'fb'|'google'|'direct'|'other'`.

Todo puro, sin Firestore, sin red. Es la pieza que decide qué se guarda, así que es la que más test necesita.

- [ ] **Step 1: Escribir los tests que fallan**

Casos mínimos para `classifyPath` (tolera prefijo de locale y barra final):
`/es` y `/` → `home`; `/es/auctions` → `catalog`; `/es/auctions/abc123` → `detail`; `/es/login` e `/es/registro` → `login`; `/es/terminos` → `other`.
Y el crítico: `/es/auth/set-password` y `/es/auth/action` deben **lanzar** o devolver un valor que el callable rechace — decidilo y dejalo explícito en el test.

Para `classifySource`: `utm_source=ig` → `ig`; `utm_source=instagram` → `ig`; `utm_source=fb` → `fb`; referrer `https://www.google.com/` sin utm → `google`; sin utm y sin referrer → `direct`; `utm_source=<200 chars de basura>` → `other` (nunca se devuelve la entrada cruda).

Para `isBotUserAgent`: googlebot, bingbot, ahrefs, semrush, curl, headless chrome → `true`; un Chrome de escritorio normal y un Safari de iPhone → `false`.

- [ ] **Step 2: Correr y verificar que fallan**

- [ ] **Step 3: Implementar**

`classifySource` compara contra una lista cerrada y cae a `other`. Nunca devuelve la entrada del cliente.

- [ ] **Step 4: Correr los tests**

- [ ] **Step 5: Commit**

---

### Task 2: Callable `logPageView`

**Files:** Create `functions/src/insights/logPageView.ts` (+ test); Modify `functions/src/index.ts`.

**Consumes:** las reglas de Task 1, `DocId`.
**Produces:** `logPageViewHandler(req): Promise<{ok:true; logged:boolean}>` y el export `logPageView`.

Input: `{ path: string; sessionId: string; utmSource?: string; referrer?: string }`.

Escribe en `page_views/{autoId}`: `{ pathKind, source, sessionId, auctionId?, at: serverTimestamp() }`. **Nada más.** Sin ruta cruda, sin query, sin IP, sin user-agent.

- [ ] **Step 1: Escribir los tests que fallan**

Cubrir: guarda un evento con los campos correctos y ninguno de más; **rechaza `/es/auth/set-password` y `/es/auth/action` sin escribir nada**; descarta un bot sin escribir; no requiere autenticación (visitante anónimo escribe bien); rate limit por `sessionId`; `sessionId` inválido → `invalid-argument`.

El test de la ruta con credencial debe afirmar que la colección quedó vacía, no sólo que devolvió `logged:false`.

- [ ] **Step 2: Correr y verificar que fallan**

- [ ] **Step 3: Implementar**

Sin `requireSignedIn` — el visitante anónimo es el punto. Rate limit siguiendo el patrón read-check-write dentro de una transacción de `placeBid.ts`, con bucket `pageview_${sessionId}`. `enforceAppCheck` y región como los demás.

Si `path` cae en `isCredentialBearingPath`, devolver `{ok:true, logged:false}` sin escribir — no lanzar, para no darle señal a un cliente hostil sobre qué rutas son especiales.

- [ ] **Step 4: Correr los tests**

- [ ] **Step 5: Export en `index.ts` y commit**

---

### Task 3: Scheduler de agregación

**Files:** Create `functions/src/insights/aggregateTraffic.ts` (+ test); Modify `functions/src/index.ts`.

Corre diario (después de `dailyUnsoldDigest`, mirá su horario y no lo pises). Agrega los `page_views` del día anterior a `insights_traffic_daily/{YYYY-MM-DD}` y borra los crudos agregados.

Documento agregado:

```ts
{
  date: 'YYYY-MM-DD',
  totalViews: number,
  uniqueSessions: number,
  byPathKind: { home, catalog, detail, login, other },
  bySource: { ig, fb, google, direct, other },
  funnel: { home, catalog, detail, login },   // sesiones que TOCARON cada etapa
  updatedAt,
}
```

`funnel` cuenta **sesiones distintas** que llegaron a cada etapa, no vistas. Una sesión que vio 8 fichas cuenta 1 en `detail`.

- [ ] **Step 1: Escribir los tests que fallan**

Sembrar eventos de varias sesiones y verificar: totales, `uniqueSessions`, el desglose, y que el embudo cuenta sesiones y no vistas. Verificar que los crudos del día agregado quedan borrados y que los de hoy NO se tocan. Y que correrlo dos veces sobre el mismo día no duplica (idempotente).

- [ ] **Step 2: Correr y verificar que fallan**

- [ ] **Step 3: Implementar**

Ojo con el volumen: paginar la lectura y borrar en lotes de 500 (límite de batch de Firestore). No cargar todo en memoria de una.

- [ ] **Step 4: Correr los tests**

- [ ] **Step 5: Export y commit**

---

### Task 4: Cliente — sesión y tracker

**Files:** Create `apps/web/src/lib/analytics/traffic-session.ts` (+ test) y `apps/web/src/components/analytics/traffic-tracker.tsx`; Modify `apps/web/src/app/[locale]/layout.tsx`.

`traffic-session.ts` es puro y testeable: `getSessionId()` lee o crea un id en `sessionStorage` con `crypto.randomUUID()`. Debe tolerar que `sessionStorage` lance (modo privado de Safari) devolviendo `null`, y el tracker entonces no reporta.

`traffic-tracker.tsx` es un cliente que se monta junto a `MetaPixelRouteTracker` — leelo primero, es el modelo exacto: `usePathname` + `useSearchParams`, dentro del `<Suspense>` que ya existe.

**No** reporta en rutas con credencial (defensa en profundidad; el servidor también las rechaza). Es best-effort: si el callable falla, se traga el error en silencio, nunca rompe la página.

- [ ] **Step 1: Test de `getSessionId`** — crea uno si no hay, reusa el existente, devuelve `null` si `sessionStorage` lanza.
- [ ] **Step 2: Correr y verificar que falla**
- [ ] **Step 3: Implementar ambos**
- [ ] **Step 4: Montar en el layout dentro del `<Suspense>` existente**
- [ ] **Step 5: Typecheck, lint, tests y commit**

---

### Task 5: Reglas, loader, panel y privacidad

**Files:** Modify `firestore.rules`, `apps/web/src/lib/legal/company-facts.ts`, `apps/web/src/app/[locale]/(protected)/staff/insights/page.tsx`; Create `apps/web/src/lib/insights/load-traffic.ts`.

**Reglas Firestore:** `page_views` — nadie lee ni escribe desde el cliente (`allow read, write: if false`); sólo el Admin SDK entra. `insights_traffic_daily` — lectura para admin/staff/finanzas, escritura `if false`. Seguí el patrón de los bloques que ya existen.

**Loader:** `loadTrafficInsights()` lee los últimos 30 días de `insights_traffic_daily` más el conteo de hoy desde `page_views`. Devuelve un tipo explícito.

**Panel:** un bloque arriba de la lista de vehículos en `/staff/insights`, con visitas y sesiones de hoy, la serie de 30 días, el desglose por origen, y el embudo. Español hardcodeado, como el resto de staff. Si no hay datos todavía, decilo con una frase, no muestres ceros que parezcan un bug.

**Privacidad:** agregar a `privacySections` en `company-facts.ts` que se registran de forma anónima las páginas visitadas para estadísticas de uso, sin cookies y sin guardar IP ni identificadores persistentes. Subir `LEGAL_VERSION_DATE`.

- [ ] **Step 1: Reglas + verificar que compilan** (`firebase deploy --only firestore:rules --dry-run`)
- [ ] **Step 2: Loader**
- [ ] **Step 3: Panel**
- [ ] **Step 4: Privacidad**
- [ ] **Step 5: Verificar en el navegador con emuladores** — navegá por home → catálogo → ficha y confirmá que aparecen los eventos y que el panel los muestra. Confirmá también que entrar a `/es/auth/set-password?token=X` NO genera evento.
- [ ] **Step 6: Typecheck, lint, suites completas y commit**
