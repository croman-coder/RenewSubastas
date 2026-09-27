# Celular del comprador estilo MotorHub — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el comprador con sesión use Renew Subastas cómodo desde el teléfono: tema según el sistema, barra de pestañas abajo, inicio como tablero con "la próxima que cierra", catálogo compacto con búsqueda y estado propio, ficha con botón fijo que abre la puja en una hoja desde abajo, y Mis pujas como lista.

**Architecture:** Toda la lógica nueva es pura y testeada (`lib/buyer/mobile-home.ts`, `lib/buyer/search.ts`, `lib/buyer/my-auction-states.ts`, `lib/auctions/dock-state.ts`, `lib/format/remaining.ts`). Dos piezas de UI nuevas y genéricas —`BottomSheet` sobre Radix Dialog y `BottomTabBar`— y una específica, `BidDock`, que monta el mismo `BidPanel` de siempre dentro de la hoja. El corte es `lg` (1024 px): por debajo cambia el comprador; por encima todo queda igual salvo el Inicio. No hay datos nuevos: se reusan `loadBuyerStats`, `listPublicAuctions`, `listMyBids` y `loadAppConfigSnapshot`, con dos o tres campos más que ya están en los documentos.

**Tech Stack:** Next.js 14 App Router, React 18, next-intl, next-themes 0.3, Radix Dialog/Tabs, Tailwind + `tailwindcss-animate`, Firebase (client SDK + Admin SDK), vitest (entorno `node`, sin jsdom), puppeteer-core para las capturas.

**Spec:** `docs/superpowers/specs/2026-09-27-celular-comprador-design.md`

## Global Constraints

- Comentarios nuevos en español, con el porqué. Identificadores en inglés como el código existente.
- Montos solo con `formatAmount`/`formatNumber`/`formatUsd` (`lib/format/money.ts`); fechas con `formatDateTimePy` (`lib/format/date.ts`); nunca `toLocaleString()` sin idioma.
- "Tinta y papel" (`DESIGN.md`): tokens de `globals.css` (`bg-bg-base`, `bg-bg-elev`, `bg-bg-deep`, `text-text-strong`, `text-text-muted`, `text-text-subtle`, `border-text-subtle/15`, `shadow-card`, `num-tab`, `.panel-ink`), variantes de `Badge` (`success`, `danger`, `info`, `neutral`), sin desenfoque/vidrio/brillos, sin texto con degradé, radios del DESIGN.md (tarjetas `rounded-2xl` = 18 px, tiles `rounded-xl` = 14 px, botones `rounded-lg` = 11 px, píldoras `rounded-full`; la hoja lleva 24 px arriba por spec §3).
- Celular = por debajo de `lg`; escritorio no cambia salvo el Inicio.
- No se toca lógica que mueve plata: `placeBid`/`buyNow` y sus diálogos quedan iguales.
- No hay colecciones, reglas ni índices nuevos.
- `apps/web` no tiene harness de render: se testean módulos puros; componentes se verifican con capturas en la Task 9. Los módulos `server-only` no se importan desde tests (solo `import type`).
- TypeScript con `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` (`tsconfig.base.json`): las props opcionales que reciben `undefined` se declaran `prop?: T | undefined`, y los objetos que cruzan de servidor a cliente son JSON (nada de `Map`).
- Local primero: commits locales en `main`, sin `git push` (cada push = deploy = 15 créditos de Netlify). Nunca `git add -A`/`git add .` en la raíz.
- Commits convencionales en español terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

> **Nota para quien edite este plan:** el cuerpo va entre `prettier-ignore-start/end` a propósito. El hook de lint-staged corre `prettier --write` sobre los `.md`, y prettier reformatea los fragmentos de código "reemplazar esto" (les saca la sangría y rompe los comentarios JSX sueltos), con lo que dejarían de coincidir con el archivo real.

<!-- prettier-ignore-start -->

## Antes de empezar: lo que la spec no podía saber del código

Hallazgos al leer el código contra la spec, con la resolución que toma este plan. Donde la spec pide algo imposible, gana el código que mueve plata.

1. **"Subir puja" no existe.** `functions/src/auctions/placeBid.ts:161-168` rechaza que el que va ganando vuelva a pujar ("Ya sos el mejor postor de esta subasta"). Un botón **Subir puja** (spec §5.4) abriría una hoja cuyas pujas fallan todas. Resolución: el estado se llama `winning` (no `raise`) y el dock muestra "Vas ganando · USD {puja actual}" **sin botón**. Por la misma razón, en ese estado X es la puja actual, no el mínimo siguiente.
2. **`PublicAuction` no trae `buyNowPrice`**, y la píldora "Compra ya USD X" del catálogo (spec §5.3) lo necesita. Se agrega en `toItem` (Task 6). Es un dato publicable: la ficha pública (`PublicAuctionDetail`) ya lo expone.
3. **Las pujas del seed (y las viejas) no tienen `status`.** `listMyBids` las devuelve como `'valid'`, así que "Vas ganando/Te superaron" calculado con `bid.status` saldría vacío en el emulador. Resolución: `MyBidEntry` gana `iAmLeading` (`auction.currentBidderUid === uid`, la misma fuente que usa `BidPanel` para "vas ganando") y todo sale de `bidOutcome()`. La página de Mis pujas pasa a filtrar sus pestañas con esa misma regla; en producción es equivalente porque `placeBid` mantiene `status` sincronizado con `currentBidderUid`.
4. **El panel del costado no se puede esconder siempre en celular.** Si la subasta terminó, el dock no se muestra (spec §5.4) y el único lugar con "¡Ganaste la subasta!" o la franja de vendida es `BidPanel`. Resolución: el `BidPanel` del aside lleva `hidden lg:block` **solo mientras el dock está visible**; sin dock queda a la vista como hoy.
5. **Staff y admin también abren la ficha con sesión.** La spec deja al staff igual, así que el dock y la hoja son solo para `role === 'buyer'` (prop `isBuyer` desde `page.tsx`); el staff sigue viendo el panel en el aside.
6. **El porcentaje de seña ya existe**: `AppConfigSnapshot.payment.depositPercent` (fracción, `0.1`) y `payment.deadlineHours` (`24`). No hace falta tocar `load-app-config.ts`; se muestra `Math.round(depositPercent * 100)` %.
7. **Contraste de las pestañas inactivas.** `text-text-subtle` (spec §3) da ~3,4:1 sobre `bg-elev` a 11 px, por debajo de AA (spec §7). Resolución: inactivas en `text-text-muted`; la activa se distingue por la barra de 3 px, `text-text-strong` y el trazo más grueso del ícono.
8. **"Todavía no pujaste" puede mentir.** "La próxima que cierra" en modo `closing` puede ser una subasta donde el comprador ya pujó y lo superaron. `loadBuyerStats` ya consulta los ids de las subastas pujadas para contar "Mis pujas"; se exponen como `myBidAuctionIds` (sin lecturas extra) y el subtítulo dice "Te superaron" o "Todavía no pujaste" según corresponda.
9. **Otros detalles resueltos en el plan:** "Cierra HH:MM" sale de `formatDateTimePy(...).slice(-5)` (formato fijo `dd/mm/yyyy HH:MM`); `myAuctionStates` devuelve `Map` (spec §6) pero la página lo pasa al cliente como `Object.fromEntries(...)`; en `AppShell` el `pb` del comprador se repite en `md:` porque `md:py-7` lo pisaría; "Volver a pujar · USD Y" necesita `startingPrice` y `bidIncrement` en `MyBidEntry` (Task 8); la puja real de la Task 9 necesita el emulador de **functions** (con `ENFORCE_APP_CHECK=false`) y un build con `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, que la lista original de emuladores (`auth,firestore`) no traía.

## Mapa de archivos

| Archivo | Responsabilidad | Task |
| --- | --- | --- |
| `apps/web/src/app/[locale]/layout.tsx` | `defaultTheme="system"` | 1 |
| `apps/web/src/lib/format/remaining.ts` (+test) | Reloj HH:MM:SS, cuenta de tarjeta y "3 h 20 min" | 2 |
| `apps/web/src/lib/buyer/mobile-home.ts` (+test) | `pickNextClosing`, `closeProgress`, `commitment` | 2 |
| `apps/web/src/lib/buyer/search.ts` (+test) | `matchesSearch` sin tildes ni mayúsculas | 2 |
| `apps/web/src/lib/buyer/my-auction-states.ts` (+test) | `bidOutcome`, `myAuctionStates`, `ownStatePill` | 2 |
| `apps/web/src/lib/auctions/dock-state.ts` (+test) | `dockState` para la barra fija de la ficha | 2 |
| `apps/web/src/components/ui/bottom-sheet.tsx` | Hoja desde abajo sobre Radix Dialog | 3 |
| `apps/web/src/components/shell/bottom-tab-bar.tsx` | Barra de pestañas del comprador | 4 |
| `apps/web/src/components/shell/sidebar-nav.tsx` | Exporta `ICON_MAP` e `isActive` para reusarlos | 4 |
| `apps/web/src/components/shell/app-shell.tsx` | Monta la barra y deja lugar abajo | 4 |
| `apps/web/src/components/shell/topbar.tsx` | Sin hamburguesa ni cajón para el comprador | 4 |
| `apps/web/src/lib/buyer/load-buyer-stats.ts` | Límites 20/6 y `myBidAuctionIds` | 5 |
| `apps/web/src/components/buyer/next-closing-card.tsx` | Tarjeta en tinta con el reloj que corre | 5 |
| `apps/web/src/app/[locale]/(protected)/[audience]/page.tsx` | Inicio como tablero | 5, 6 |
| `apps/web/src/lib/buyer/list-public-auctions.ts` | `buyNowPrice` en `PublicAuction` | 6 |
| `apps/web/src/lib/buyer/list-my-bids.ts` | `iAmLeading` (Task 6), `startingPrice` y `bidIncrement` (Task 8) | 6, 8 |
| `apps/web/src/app/[locale]/(protected)/auctions/use-favorite.ts` | Corazón de favoritos compartido | 6 |
| `apps/web/src/app/[locale]/(protected)/auctions/auction-row.tsx` | Fila del catálogo (< sm) | 6 |
| `apps/web/src/app/[locale]/(protected)/auctions/auction-card.tsx` | Usa `useFavorite` y muestra la píldora propia | 6 |
| `apps/web/src/app/[locale]/(protected)/auctions/auctions-grid.tsx` | Control segmentado, búsqueda, filas/tarjetas | 6 |
| `apps/web/src/app/[locale]/(protected)/auctions/page.tsx` | Carga `listMyBids` en paralelo | 6 |
| `apps/web/src/components/auctions/bid-dock.tsx` | Barra fija + hoja con `BidPanel` | 7 |
| `apps/web/src/app/[locale]/(abierto)/auctions/[id]/bid-panel.tsx` | `onBidPlaced` opcional (sin cambiar la puja) | 7 |
| `apps/web/src/app/[locale]/(abierto)/auctions/[id]/auction-detail-view.tsx` | Orden de celular, dock, panel oculto con dock | 7 |
| `apps/web/src/app/[locale]/(abierto)/auctions/[id]/page.tsx` | Pasa `isBuyer` | 7 |
| `apps/web/src/app/[locale]/(protected)/[audience]/bids/page.tsx` | Pestañas con `bidOutcome` y lista de superadas | 8 |
| `apps/web/src/app/[locale]/(protected)/[audience]/bids/my-bids-table.tsx` | Lista < sm (tarjetas + Historial), tabla desde sm | 8 |
| `functions/scripts/capturas-celular.mjs` | Capturas 390/1280 claro/oscuro, puja real desde la hoja | 9 |
| `DESIGN.md` | "Light is the default theme" pasa a "sigue al sistema" | 9 |

---

### Task 1: Tema según el teléfono

**Files:**

- Modify: `apps/web/src/app/[locale]/layout.tsx:88`

**Interfaces:**

- Consumes: nada.
- Produces: el tema inicial sale de `prefers-color-scheme` para quien nunca eligió uno. Quien eligió a mano lo conserva (next-themes lo guarda en `localStorage.theme`).

- [ ] **Step 1: Change the default theme**

En `apps/web/src/app/[locale]/layout.tsx`, reemplazar:

```tsx
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
```

por:

```tsx
            {/* El tema sigue al teléfono (spec 2026-09-27 §2): casi todos los
                compradores entran desde el celular y muchos lo tienen en
                oscuro. Quien eligió un tema a mano lo conserva: next-themes
                lo guarda y solo usa este valor cuando no hay elección. */}
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint`
Expected: sin errores. (El efecto visual —oscuro con el sistema en oscuro, también para staff y admin— se revisa con capturas en la Task 9.)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/[locale]/layout.tsx"
git commit -m "feat(tema): la app sigue el tema del teléfono

Quien eligió claro u oscuro a mano lo conserva; solo cambia el valor
inicial para quien nunca eligió.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lógica pura del celular (con tests)

Cinco módulos sin React ni Firebase, cada uno con su test. Los tipos de entrada son estructurales (no importan de módulos `server-only`), así este task no depende de los cambios de datos de las Tasks 5, 6 y 8.

**Files:**

- Create: `apps/web/src/lib/format/remaining.ts`
- Test: `apps/web/src/lib/format/remaining.test.ts`
- Create: `apps/web/src/lib/buyer/mobile-home.ts`
- Test: `apps/web/src/lib/buyer/mobile-home.test.ts`
- Create: `apps/web/src/lib/buyer/search.ts`
- Test: `apps/web/src/lib/buyer/search.test.ts`
- Create: `apps/web/src/lib/buyer/my-auction-states.ts`
- Test: `apps/web/src/lib/buyer/my-auction-states.test.ts`
- Create: `apps/web/src/lib/auctions/dock-state.ts`
- Test: `apps/web/src/lib/auctions/dock-state.test.ts`

**Interfaces:**

- Consumes: `formatAmount(amount: number): string` de `@/lib/format/money`.
- Produces:
  - `formatClock(ms: number): string` → `"HH:MM:SS"` (horas sin tope).
  - `formatCountdown(ms: number): string` → `"HH:MM:SS"` o `"1d 02:00"` (igual que la tarjeta del catálogo).
  - `remainingLabel(ms: number): string` → `"0 min" | "menos de 1 min" | "45 min" | "3 h" | "3 h 20 min" | "2 d" | "2 d 4 h"`.
  - `interface HomeWinningItem { auctionId: string; make: string; model: string; year: number; thumbnailUrl: string | null; currentBid: number; endsAtMs: number }`
  - `interface HomeClosingItem { id: string; make: string; model: string; year: number; thumbnailUrl: string | null; currentBid: number; startingPrice: number; endsAtMs: number }`
  - `interface HomeStats { myWinning: HomeWinningItem[]; closingSoon: HomeClosingItem[]; myBidAuctionIds: string[] }`
  - `interface NextClosingItem { auctionId: string; make: string; model: string; year: number; thumbnailUrl: string | null; amountUsd: number; hasBids: boolean; endsAtMs: number; iBid: boolean }`
  - `pickNextClosing(stats: HomeStats, nowMs: number): { kind: 'winning' | 'closing'; item: NextClosingItem } | null`
  - `closeProgress(endsAtMs: number, nowMs: number): number` (0..1)
  - `commitment(myWinning: ReadonlyArray<{ currentBid: number }>, depositPercent: number): { totalUsd: number; depositUsd: number; count: number }`
  - `interface Searchable { make: string; model: string; year: number }`, `matchesSearch(item: Searchable, query: string): boolean`
  - `type MyAuctionState = 'winning' | 'outbid'`, `type BidOutcome = 'winning' | 'outbid' | 'won' | 'lost'`
  - `interface BidOutcomeInput { auctionStatus: 'scheduled' | 'live' | 'ended' | 'cancelled'; iAmLeading: boolean; iAmWinner: boolean }`
  - `bidOutcome(entry: BidOutcomeInput): BidOutcome | null`
  - `myAuctionStates(entries: ReadonlyArray<BidOutcomeInput & { auctionId: string }>): Map<string, MyAuctionState>`
  - `interface OwnStatePill { variant: 'success' | 'danger' | 'info' | 'neutral'; label: string }`
  - `ownStatePill(state: MyAuctionState | undefined, auction: { status: 'scheduled' | 'live' | 'ended' | 'cancelled'; bidCount: number; buyNowPrice: number | null }): OwnStatePill | null`
  - `interface DockInput { status: 'scheduled' | 'live' | 'ended' | 'cancelled'; startsAtMs: number; endsAtMs: number; currentBid: number; currentBidderUid: string | null }`
  - `type DockState = { kind: 'bid'; amountUsd: number } | { kind: 'winning'; amountUsd: number } | { kind: 'scheduled'; opensInMs: number } | { kind: 'hidden' }`
  - `dockState(live: DockInput, myUid: string, nowMs: number, minBid: number): DockState`

- [ ] **Step 1: Write the failing test for `remaining`**

`apps/web/src/lib/format/remaining.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatClock, formatCountdown, remainingLabel } from './remaining';

const MIN = 60_000;
const H = 3_600_000;
const D = 86_400_000;

describe('formatClock', () => {
  it('pads hours, minutes and seconds', () => {
    expect(formatClock(H + MIN + 1000)).toBe('01:01:01');
  });
  it('keeps counting hours past a day, for the big home clock', () => {
    expect(formatClock(26 * H)).toBe('26:00:00');
  });
  it('floors partial seconds and never goes negative', () => {
    expect(formatClock(1999)).toBe('00:00:01');
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(-5000)).toBe('00:00:00');
  });
});

describe('formatCountdown', () => {
  it('matches the catalog card: HH:MM:SS under a day', () => {
    expect(formatCountdown(H + MIN + 1000)).toBe('01:01:01');
  });
  it('switches to days and drops seconds from a day on', () => {
    expect(formatCountdown(D + H + MIN + 1000)).toBe('1d 01:01');
  });
  it('shows zeros once closed', () => {
    expect(formatCountdown(-1)).toBe('00:00:00');
  });
});

describe('remainingLabel', () => {
  it('handles closed and under a minute', () => {
    expect(remainingLabel(0)).toBe('0 min');
    expect(remainingLabel(30_000)).toBe('menos de 1 min');
  });
  it('uses minutes under an hour', () => {
    expect(remainingLabel(45 * MIN)).toBe('45 min');
  });
  it('uses hours and minutes, dropping zero minutes', () => {
    expect(remainingLabel(3 * H)).toBe('3 h');
    expect(remainingLabel(3 * H + 20 * MIN + 59_000)).toBe('3 h 20 min');
  });
  it('uses days and hours from a day on, dropping zero hours', () => {
    expect(remainingLabel(2 * D)).toBe('2 d');
    expect(remainingLabel(2 * D + 4 * H + 30 * MIN)).toBe('2 d 4 h');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/web && npx vitest run src/lib/format/remaining.test.ts`
Expected: FAIL — `Failed to load url ./remaining`.

- [ ] **Step 3: Implement `remaining`**

`apps/web/src/lib/format/remaining.ts`:

```ts
/**
 * Tiempo restante en texto para el celular del comprador (spec 2026-09-27).
 *
 * Tres formas porque cada lugar pide una distinta: el reloj grande de "La
 * próxima que cierra" (HH:MM:SS aunque pase de 24 h, porque es una sola
 * subasta y los días en ese reloj confunden), la fila del catálogo (igual que
 * la tarjeta: días cuando hay días) y los textos cortos ("quedan 3 h 20 min").
 * Sin Intl a propósito, como money.ts: sale igual en el servidor y en el
 * navegador, y no rompe la hidratación.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function remainingLabel(ms: number): string {
  if (ms <= 0) return '0 min';
  if (ms < 60_000) return 'menos de 1 min';
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (days > 0) return h > 0 ? `${days} d ${h} h` : `${days} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd apps/web && npx vitest run src/lib/format/remaining.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the failing test for `mobile-home`**

`apps/web/src/lib/buyer/mobile-home.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  closeProgress,
  commitment,
  pickNextClosing,
  type HomeClosingItem,
  type HomeWinningItem,
} from './mobile-home';

const NOW = Date.parse('2026-09-27T15:00:00Z');
const H = 3_600_000;

const win = (auctionId: string, endsInH: number, currentBid: number): HomeWinningItem => ({
  auctionId,
  make: 'Tesla',
  model: 'Model 3',
  year: 2022,
  thumbnailUrl: null,
  currentBid,
  endsAtMs: NOW + endsInH * H,
});

const closing = (
  id: string,
  endsInH: number,
  currentBid: number,
  startingPrice = 9000,
): HomeClosingItem => ({
  id,
  make: 'Honda',
  model: 'Civic',
  year: 2020,
  thumbnailUrl: 'https://img.test/civic.webp',
  currentBid,
  startingPrice,
  endsAtMs: NOW + endsInH * H,
});

describe('pickNextClosing', () => {
  it('prefers the winning auction that closes first, even over a sooner closing one', () => {
    const next = pickNextClosing(
      {
        myWinning: [win('a', 5, 29000), win('b', 2, 12000)],
        closingSoon: [closing('c', 1, 0)],
        myBidAuctionIds: ['a', 'b'],
      },
      NOW,
    );
    expect(next?.kind).toBe('winning');
    expect(next?.item).toMatchObject({
      auctionId: 'b',
      amountUsd: 12000,
      hasBids: true,
      iBid: true,
      endsAtMs: NOW + 2 * H,
    });
  });

  it('ignores winning auctions whose clock already ran out', () => {
    const next = pickNextClosing(
      {
        myWinning: [win('a', -1, 29000)],
        closingSoon: [closing('c', 3, 0), closing('d', 1, 9500)],
        myBidAuctionIds: ['a'],
      },
      NOW,
    );
    expect(next?.kind).toBe('closing');
    expect(next?.item).toMatchObject({ auctionId: 'd', amountUsd: 9500, hasBids: true });
  });

  it('shows the starting price without bids and knows whether the buyer bid there', () => {
    const base = { myWinning: [], closingSoon: [closing('c', 3, 0, 14000)] };
    const bidBefore = pickNextClosing({ ...base, myBidAuctionIds: ['c'] }, NOW);
    expect(bidBefore?.item).toMatchObject({ amountUsd: 14000, hasBids: false, iBid: true });
    const never = pickNextClosing({ ...base, myBidAuctionIds: [] }, NOW);
    expect(never?.item.iBid).toBe(false);
  });

  it('returns null when nothing is open', () => {
    expect(pickNextClosing({ myWinning: [], closingSoon: [], myBidAuctionIds: [] }, NOW)).toBeNull();
    expect(
      pickNextClosing(
        { myWinning: [win('a', -2, 1)], closingSoon: [closing('c', 0, 0)], myBidAuctionIds: [] },
        NOW,
      ),
    ).toBeNull();
  });
});

describe('closeProgress', () => {
  it('is empty with 24 h or more left', () => {
    expect(closeProgress(NOW + 24 * H, NOW)).toBe(0);
    expect(closeProgress(NOW + 30 * H, NOW)).toBe(0);
  });
  it('fills linearly over the last 24 h', () => {
    expect(closeProgress(NOW + 6 * H, NOW)).toBe(0.75);
  });
  it('is full at or after the close', () => {
    expect(closeProgress(NOW, NOW)).toBe(1);
    expect(closeProgress(NOW - H, NOW)).toBe(1);
  });
});

describe('commitment', () => {
  it('adds up what the buyer is winning and the deposit on it', () => {
    expect(commitment([{ currentBid: 29000 }, { currentBid: 12750 }], 0.1)).toEqual({
      totalUsd: 41750,
      depositUsd: 4175,
      count: 2,
    });
  });
  it('rounds the deposit to the dollar', () => {
    expect(commitment([{ currentBid: 12346 }], 0.1).depositUsd).toBe(1235);
    expect(commitment([{ currentBid: 12344 }], 0.1).depositUsd).toBe(1234);
  });
  it('is all zeros when the buyer is winning nothing', () => {
    expect(commitment([], 0.1)).toEqual({ totalUsd: 0, depositUsd: 0, count: 0 });
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `cd apps/web && npx vitest run src/lib/buyer/mobile-home.test.ts`
Expected: FAIL — `Failed to load url ./mobile-home`.

- [ ] **Step 7: Implement `mobile-home`**

`apps/web/src/lib/buyer/mobile-home.ts`:

```ts
/**
 * Cuentas del Inicio del comprador (spec 2026-09-27 §5.2 y §6).
 *
 * Los tipos son estructurales a propósito: calzan con BuyerStats
 * (load-buyer-stats.ts) sin importarlo, porque ese módulo es server-only y
 * este lo usan la tarjeta del cliente y los tests.
 */
export interface HomeWinningItem {
  auctionId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  currentBid: number;
  endsAtMs: number;
}

export interface HomeClosingItem {
  id: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  currentBid: number;
  startingPrice: number;
  endsAtMs: number;
}

export interface HomeStats {
  myWinning: HomeWinningItem[];
  closingSoon: HomeClosingItem[];
  /** Subastas en las que el comprador pujó alguna vez. */
  myBidAuctionIds: string[];
}

export interface NextClosingItem {
  auctionId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  /** Lo que se muestra: la puja actual, o el precio inicial si no hay pujas. */
  amountUsd: number;
  hasBids: boolean;
  endsAtMs: number;
  /** Si el comprador ya pujó ahí: "Te superaron" en vez de "Todavía no pujaste". */
  iBid: boolean;
}

export interface NextClosing {
  kind: 'winning' | 'closing';
  item: NextClosingItem;
}

const DAY_MS = 86_400_000;

/**
 * "La próxima que cierra": primero la subasta que vas ganando con cierre más
 * cercano —es la que más te importa perder—; si no vas ganando ninguna, la
 * próxima de las que cierran pronto. Se descartan las que ya cerraron por
 * reloj aunque el documento todavía diga "live" (el tick corre cada minuto).
 */
export function pickNextClosing(stats: HomeStats, nowMs: number): NextClosing | null {
  const winning = stats.myWinning
    .filter((w) => w.endsAtMs > nowMs)
    .sort((a, b) => a.endsAtMs - b.endsAtMs)[0];
  if (winning) {
    return {
      kind: 'winning',
      item: {
        auctionId: winning.auctionId,
        make: winning.make,
        model: winning.model,
        year: winning.year,
        thumbnailUrl: winning.thumbnailUrl,
        amountUsd: winning.currentBid,
        hasBids: true,
        endsAtMs: winning.endsAtMs,
        iBid: true,
      },
    };
  }
  const next = stats.closingSoon
    .filter((c) => c.endsAtMs > nowMs)
    .sort((a, b) => a.endsAtMs - b.endsAtMs)[0];
  if (!next) return null;
  return {
    kind: 'closing',
    item: {
      auctionId: next.id,
      make: next.make,
      model: next.model,
      year: next.year,
      thumbnailUrl: next.thumbnailUrl,
      amountUsd: next.currentBid > 0 ? next.currentBid : next.startingPrice,
      hasBids: next.currentBid > 0,
      endsAtMs: next.endsAtMs,
      iBid: stats.myBidAuctionIds.includes(next.id),
    },
  };
}

/**
 * Barra de progreso de la tarjeta: cuánto pasó de las últimas 24 h antes del
 * cierre. Ventana fija de 24 h porque es la de "Cierran pronto": con más
 * tiempo la barra queda vacía, y llena al cerrar.
 */
export function closeProgress(endsAtMs: number, nowMs: number): number {
  const p = 1 - (endsAtMs - nowMs) / DAY_MS;
  return Math.min(1, Math.max(0, p));
}

/**
 * "Si ganás todo" y "Seña a pagar": suma de lo que vas ganando y la seña con
 * el porcentaje real de app_config/global.payment (fracción: 0.1 = 10 %).
 * La seña se redondea al dólar porque es una cifra orientativa; el monto
 * exacto lo calcula el servidor al adjudicar (close-auction.ts).
 */
export function commitment(
  myWinning: ReadonlyArray<{ currentBid: number }>,
  depositPercent: number,
): { totalUsd: number; depositUsd: number; count: number } {
  const totalUsd = myWinning.reduce((acc, w) => acc + w.currentBid, 0);
  return { totalUsd, depositUsd: Math.round(totalUsd * depositPercent), count: myWinning.length };
}
```

- [ ] **Step 8: Run it to see it pass**

Run: `cd apps/web && npx vitest run src/lib/buyer/mobile-home.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 9: Write the failing test for `search`**

`apps/web/src/lib/buyer/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchesSearch } from './search';

const hilux = { make: 'Toyota', model: 'Hilux', year: 2019 };
const c3 = { make: 'Citroën', model: 'C3 Aircross', year: 2021 };

describe('matchesSearch', () => {
  it('shows everything for an empty or blank query', () => {
    expect(matchesSearch(hilux, '')).toBe(true);
    expect(matchesSearch(hilux, '   ')).toBe(true);
  });
  it('matches make, model or year, ignoring case', () => {
    expect(matchesSearch(hilux, 'hilux')).toBe(true);
    expect(matchesSearch(hilux, 'TOYOTA')).toBe(true);
    expect(matchesSearch(hilux, '2019')).toBe(true);
  });
  it('ignores accents on both sides', () => {
    expect(matchesSearch(c3, 'citroen')).toBe(true);
    expect(matchesSearch({ ...c3, make: 'Citroen' }, 'citroën')).toBe(true);
  });
  it('needs every word, in any order', () => {
    expect(matchesSearch(hilux, '2019 hilux')).toBe(true);
    expect(matchesSearch(hilux, 'hilux 2020')).toBe(false);
  });
  it('matches partial words while typing', () => {
    expect(matchesSearch(hilux, 'hil')).toBe(true);
    expect(matchesSearch(hilux, '201')).toBe(true);
  });
  it('rejects what is not there', () => {
    expect(matchesSearch(hilux, 'ford')).toBe(false);
  });
});
```

- [ ] **Step 10: Run it to see it fail**

Run: `cd apps/web && npx vitest run src/lib/buyer/search.test.ts`
Expected: FAIL — `Failed to load url ./search`.

- [ ] **Step 11: Implement `search`**

`apps/web/src/lib/buyer/search.ts`:

```ts
/**
 * Búsqueda del catálogo en el celular (spec 2026-09-27 §5.3): filtra la lista
 * que ya llegó del servidor, sin consulta nueva. Sin tildes ni mayúsculas
 * porque en el teléfono nadie escribe "Citroën"; cada palabra tiene que
 * aparecer en marca, modelo o año, en cualquier orden.
 */
export interface Searchable {
  make: string;
  model: string;
  year: number;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function matchesSearch(item: Searchable, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(`${item.make} ${item.model} ${item.year}`);
  return words.every((w) => haystack.includes(w));
}
```

- [ ] **Step 12: Run it to see it pass**

Run: `cd apps/web && npx vitest run src/lib/buyer/search.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 13: Write the failing test for `my-auction-states`**

`apps/web/src/lib/buyer/my-auction-states.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  bidOutcome,
  myAuctionStates,
  ownStatePill,
  type BidOutcomeInput,
} from './my-auction-states';

const entry = (
  auctionId: string,
  over: Partial<BidOutcomeInput> = {},
): BidOutcomeInput & { auctionId: string } => ({
  auctionId,
  auctionStatus: 'live',
  iAmLeading: false,
  iAmWinner: false,
  ...over,
});

describe('bidOutcome', () => {
  it('uses who leads the auction while it is live', () => {
    expect(bidOutcome(entry('a', { iAmLeading: true }))).toBe('winning');
    expect(bidOutcome(entry('a', { iAmLeading: false }))).toBe('outbid');
  });
  it('uses the adjudicated winner once ended', () => {
    expect(bidOutcome(entry('a', { auctionStatus: 'ended', iAmWinner: true }))).toBe('won');
    expect(bidOutcome(entry('a', { auctionStatus: 'ended', iAmWinner: false }))).toBe('lost');
  });
  it('has no outcome for scheduled or cancelled auctions', () => {
    expect(bidOutcome(entry('a', { auctionStatus: 'scheduled' }))).toBeNull();
    expect(bidOutcome(entry('a', { auctionStatus: 'cancelled', iAmLeading: true }))).toBeNull();
  });
});

describe('myAuctionStates', () => {
  it('maps live auctions to winning or outbid', () => {
    const states = myAuctionStates([
      entry('a', { iAmLeading: true }),
      entry('b', { iAmLeading: false }),
    ]);
    expect(states.get('a')).toBe('winning');
    expect(states.get('b')).toBe('outbid');
  });
  it('leaves out ended, scheduled and cancelled auctions', () => {
    const states = myAuctionStates([
      entry('a', { auctionStatus: 'ended', iAmWinner: true }),
      entry('b', { auctionStatus: 'scheduled' }),
      entry('c', { auctionStatus: 'cancelled' }),
    ]);
    expect(states.size).toBe(0);
  });
  it('keeps one state per auction when the buyer bid several times', () => {
    const states = myAuctionStates([
      entry('a', { iAmLeading: true }),
      entry('a', { iAmLeading: true }),
    ]);
    expect([...states.entries()]).toEqual([['a', 'winning']]);
  });
});

describe('ownStatePill', () => {
  const live = { status: 'live' as const, bidCount: 0, buyNowPrice: null };

  it('says the buyer is winning or was outbid first', () => {
    expect(ownStatePill('winning', { ...live, bidCount: 3 })).toEqual({
      variant: 'success',
      label: 'Vas ganando',
    });
    expect(ownStatePill('outbid', { ...live, bidCount: 3 })).toEqual({
      variant: 'danger',
      label: 'Te superaron',
    });
  });
  it('offers Compra ya on a live auction without bids', () => {
    expect(ownStatePill(undefined, { ...live, buyNowPrice: 21000 })).toEqual({
      variant: 'info',
      label: 'Compra ya USD 21.000',
    });
  });
  it('says there are no bids on a live or scheduled auction without them', () => {
    expect(ownStatePill(undefined, live)).toEqual({ variant: 'neutral', label: 'Sin pujas' });
    expect(
      ownStatePill(undefined, { status: 'scheduled', bidCount: 0, buyNowPrice: 21000 }),
    ).toEqual({ variant: 'neutral', label: 'Sin pujas' });
  });
  it('shows nothing for a contested auction of someone else or a closed one', () => {
    expect(ownStatePill(undefined, { ...live, bidCount: 2 })).toBeNull();
    expect(ownStatePill(undefined, { status: 'ended', bidCount: 0, buyNowPrice: null })).toBeNull();
  });
});
```

- [ ] **Step 14: Run it to see it fail**

Run: `cd apps/web && npx vitest run src/lib/buyer/my-auction-states.test.ts`
Expected: FAIL — `Failed to load url ./my-auction-states`.

- [ ] **Step 15: Implement `my-auction-states`**

`apps/web/src/lib/buyer/my-auction-states.ts`:

```ts
import { formatAmount } from '@/lib/format/money';

/**
 * Estado propio del comprador en cada subasta (spec 2026-09-27 §5.3, §5.5, §6).
 *
 * Mira quién va primero en la subasta (`iAmLeading`, que listMyBids saca de
 * `auction.currentBidderUid`) y no el `status` guardado en la puja: las pujas
 * viejas y las del seed de demo no lo tienen y salían todas como 'valid'.
 * currentBidderUid es la misma fuente que usa BidPanel para "vas ganando".
 */
export type MyAuctionState = 'winning' | 'outbid';
export type BidOutcome = 'winning' | 'outbid' | 'won' | 'lost';

export interface BidOutcomeInput {
  auctionStatus: 'scheduled' | 'live' | 'ended' | 'cancelled';
  iAmLeading: boolean;
  iAmWinner: boolean;
}

export function bidOutcome(entry: BidOutcomeInput): BidOutcome | null {
  if (entry.auctionStatus === 'live') return entry.iAmLeading ? 'winning' : 'outbid';
  if (entry.auctionStatus === 'ended') return entry.iAmWinner ? 'won' : 'lost';
  return null;
}

/** Solo subastas en vivo: es lo que el catálogo marca con "Vas ganando"/"Te superaron". */
export function myAuctionStates(
  entries: ReadonlyArray<BidOutcomeInput & { auctionId: string }>,
): Map<string, MyAuctionState> {
  const states = new Map<string, MyAuctionState>();
  for (const e of entries) {
    if (states.has(e.auctionId)) continue;
    const outcome = bidOutcome(e);
    if (outcome === 'winning' || outcome === 'outbid') states.set(e.auctionId, outcome);
  }
  return states;
}

export interface OwnStatePill {
  variant: 'success' | 'danger' | 'info' | 'neutral';
  label: string;
}

/**
 * La píldora de la fila y la tarjeta del catálogo. "Compra ya" solo en vivo:
 * en una programada todavía no se puede comprar, y prometerlo sería mentir.
 * Con pujas de otros y sin estado propio no se muestra nada: el precio ya
 * dice "Puja actual".
 */
export function ownStatePill(
  state: MyAuctionState | undefined,
  auction: {
    status: 'scheduled' | 'live' | 'ended' | 'cancelled';
    bidCount: number;
    buyNowPrice: number | null;
  },
): OwnStatePill | null {
  if (state === 'winning') return { variant: 'success', label: 'Vas ganando' };
  if (state === 'outbid') return { variant: 'danger', label: 'Te superaron' };
  if (auction.status !== 'live' && auction.status !== 'scheduled') return null;
  if (auction.bidCount > 0) return null;
  if (auction.status === 'live' && auction.buyNowPrice !== null) {
    return { variant: 'info', label: `Compra ya USD ${formatAmount(auction.buyNowPrice)}` };
  }
  return { variant: 'neutral', label: 'Sin pujas' };
}
```

- [ ] **Step 16: Run it to see it pass**

Run: `cd apps/web && npx vitest run src/lib/buyer/my-auction-states.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 17: Write the failing test for `dock-state`**

`apps/web/src/lib/auctions/dock-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dockState, type DockInput } from './dock-state';

const NOW = Date.parse('2026-09-27T15:00:00Z');
const H = 3_600_000;
const ME = 'uid-me';

const live = (over: Partial<DockInput> = {}): DockInput => ({
  status: 'live',
  startsAtMs: NOW - H,
  endsAtMs: NOW + 6 * H,
  currentBid: 0,
  currentBidderUid: null,
  ...over,
});

describe('dockState', () => {
  it('offers the next minimum bid while live and not leading', () => {
    expect(dockState(live(), ME, NOW, 9500)).toEqual({ kind: 'bid', amountUsd: 9500 });
    expect(
      dockState(live({ currentBid: 29000, currentBidderUid: 'uid-other' }), ME, NOW, 30000),
    ).toEqual({ kind: 'bid', amountUsd: 30000 });
  });

  it('says the buyer is winning, at the current bid, with no bid action', () => {
    // placeBid rechaza que el que va ganando vuelva a pujar, así que no hay "Subir puja".
    expect(
      dockState(live({ currentBid: 29000, currentBidderUid: ME }), ME, NOW, 30000),
    ).toEqual({ kind: 'winning', amountUsd: 29000 });
  });

  it('does not treat a leader without a bid amount as winning', () => {
    expect(dockState(live({ currentBidderUid: ME }), ME, NOW, 9500)).toEqual({
      kind: 'bid',
      amountUsd: 9500,
    });
  });

  it('counts down to the opening while scheduled', () => {
    expect(
      dockState(live({ status: 'scheduled', startsAtMs: NOW + 2 * H }), ME, NOW, 14500),
    ).toEqual({ kind: 'scheduled', opensInMs: 2 * H });
  });

  it('never counts below zero when the opening tick is late', () => {
    expect(
      dockState(live({ status: 'scheduled', startsAtMs: NOW - 1000 }), ME, NOW, 14500),
    ).toEqual({ kind: 'scheduled', opensInMs: 0 });
  });

  it('hides once the clock ran out, even before the status flips', () => {
    expect(dockState(live({ endsAtMs: NOW }), ME, NOW, 9500)).toEqual({ kind: 'hidden' });
    expect(dockState(live({ endsAtMs: NOW - 1 }), ME, NOW, 9500)).toEqual({ kind: 'hidden' });
  });

  it('hides for ended and cancelled auctions', () => {
    expect(dockState(live({ status: 'ended' }), ME, NOW, 9500)).toEqual({ kind: 'hidden' });
    expect(dockState(live({ status: 'cancelled' }), ME, NOW, 9500)).toEqual({ kind: 'hidden' });
  });
});
```

- [ ] **Step 18: Run it to see it fail**

Run: `cd apps/web && npx vitest run src/lib/auctions/dock-state.test.ts`
Expected: FAIL — `Failed to load url ./dock-state`.

- [ ] **Step 19: Implement `dock-state`**

`apps/web/src/lib/auctions/dock-state.ts`:

```ts
/**
 * Qué muestra la barra fija de puja de la ficha en el celular (spec
 * 2026-09-27 §5.4).
 *
 * - bid: en vivo y no vas ganando → "Tu próxima puja USD X" + Pujar, con X =
 *   el mínimo que el servidor va a aceptar (minimumBid).
 * - winning: en vivo y vas ganando → "Vas ganando USD X" con X = la puja
 *   actual y SIN botón. La spec pedía "Subir puja", pero placeBid rechaza que
 *   el mejor postor vuelva a pujar (functions/src/auctions/placeBid.ts), así
 *   que ese botón solo llevaría a un error.
 * - scheduled: "Abre en HH:MM:SS", sin botón.
 * - hidden: terminada o cancelada; el resultado ya está en la página.
 *
 * El reloj manda sobre el estado guardado, igual que en BidPanel: el tick que
 * pasa la subasta a 'ended' corre cada minuto.
 */
export interface DockInput {
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  startsAtMs: number;
  endsAtMs: number;
  currentBid: number;
  currentBidderUid: string | null;
}

export type DockState =
  | { kind: 'bid'; amountUsd: number }
  | { kind: 'winning'; amountUsd: number }
  | { kind: 'scheduled'; opensInMs: number }
  | { kind: 'hidden' };

export function dockState(
  live: DockInput,
  myUid: string,
  nowMs: number,
  minBid: number,
): DockState {
  if (live.status === 'scheduled') {
    return { kind: 'scheduled', opensInMs: Math.max(0, live.startsAtMs - nowMs) };
  }
  if (live.status !== 'live' || nowMs >= live.endsAtMs) return { kind: 'hidden' };
  if (live.currentBidderUid === myUid && live.currentBid > 0) {
    return { kind: 'winning', amountUsd: live.currentBid };
  }
  return { kind: 'bid', amountUsd: minBid };
}
```

- [ ] **Step 20: Run the five suites and the checks**

Run: `cd apps/web && npx vitest run src/lib/format/remaining.test.ts src/lib/buyer/mobile-home.test.ts src/lib/buyer/search.test.ts src/lib/buyer/my-auction-states.test.ts src/lib/auctions/dock-state.test.ts && cd ../.. && pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint`
Expected: 5 archivos PASS, typecheck y lint sin errores.

- [ ] **Step 21: Commit**

```bash
git add apps/web/src/lib/format/remaining.ts apps/web/src/lib/format/remaining.test.ts \
  apps/web/src/lib/buyer/mobile-home.ts apps/web/src/lib/buyer/mobile-home.test.ts \
  apps/web/src/lib/buyer/search.ts apps/web/src/lib/buyer/search.test.ts \
  apps/web/src/lib/buyer/my-auction-states.ts apps/web/src/lib/buyer/my-auction-states.test.ts \
  apps/web/src/lib/auctions/dock-state.ts apps/web/src/lib/auctions/dock-state.test.ts
git commit -m "feat(celular): lógica pura del inicio, la búsqueda, el estado propio y el dock

Sin UI todavía. El dock no tiene 'Subir puja': placeBid rechaza que el
mejor postor vuelva a pujar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hoja desde abajo (`BottomSheet`)

**Files:**

- Create: `apps/web/src/components/ui/bottom-sheet.tsx`

**Interfaces:**

- Consumes: `@radix-ui/react-dialog` (ya instalado), `cn` de `@/lib/utils`.
- Produces: `BottomSheet` (= `Dialog.Root`: props `open`, `onOpenChange`), `BottomSheetTrigger`, `BottomSheetClose`, `BottomSheetContent` (props de `Dialog.Content` + `title: string` + `description?: string | undefined`; el cuerpo va como `children` con scroll propio).

- [ ] **Step 1: Create the component**

`apps/web/src/components/ui/bottom-sheet.tsx`:

```tsx
'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Hoja desde abajo para el celular (spec 2026-09-27 §3). Es un Dialog de
 * Radix con otra forma: foco atrapado, Escape, scroll de fondo bloqueado y
 * foco devuelto al botón que la abrió vienen gratis, y un Dialog anidado
 * (la confirmación de puja de BidPanel) se apila encima sin trabajo extra.
 *
 * Sólida (bg-elev), sin desenfoque: tinta y papel. Entra desde abajo con
 * ease-out y sin rebote (DESIGN.md: 200–400 ms). Se cierra con la X, tocando
 * afuera o con Escape; el gesto de deslizar quedó fuera de alcance (§8).
 */
const BottomSheet = DialogPrimitive.Root;

const BottomSheetTrigger = DialogPrimitive.Trigger;

const BottomSheetClose = DialogPrimitive.Close;

interface BottomSheetContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /** Obligatorio: Radix lo usa como nombre accesible del diálogo. */
  title: string;
  description?: string | undefined;
}

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  BottomSheetContentProps
>(({ className, children, title, description, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
    <DialogPrimitive.Content
      ref={ref}
      // Sin descripción, Radix avisa en consola salvo que se diga explícito.
      {...(description ? {} : { 'aria-describedby': undefined })}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col',
        'rounded-t-[24px] border-t border-text-subtle/15 bg-bg-elev shadow-card',
        'pb-[env(safe-area-inset-bottom)] focus:outline-none',
        'duration-300 ease-out data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
        'motion-reduce:animate-none',
        className,
      )}
      {...props}
    >
      <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-text-subtle/40" />
      <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
        <div className="min-w-0">
          <DialogPrimitive.Title className="text-base font-bold tracking-tight text-text-strong">
            {title}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="mt-0.5 text-sm text-text-muted">
              {description}
            </DialogPrimitive.Description>
          )}
        </div>
        <DialogPrimitive.Close
          aria-label="Cerrar"
          className="-mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-text-muted transition-colors hover:bg-bg-deep/60 hover:text-text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
        >
          <X className="h-5 w-5" strokeWidth={2.25} />
        </DialogPrimitive.Close>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
BottomSheetContent.displayName = 'BottomSheetContent';

export { BottomSheet, BottomSheetTrigger, BottomSheetClose, BottomSheetContent };
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint`
Expected: sin errores. (Se usa y se captura en las Tasks 7 y 9.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/bottom-sheet.tsx
git commit -m "feat(ui): hoja desde abajo sobre Radix Dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Barra de pestañas del comprador y shell

**Files:**

- Create: `apps/web/src/components/shell/bottom-tab-bar.tsx`
- Modify: `apps/web/src/components/shell/sidebar-nav.tsx:22` y `:116`
- Modify: `apps/web/src/components/shell/app-shell.tsx:8`, `:31`, `:95-100`
- Modify: `apps/web/src/components/shell/topbar.tsx:123-135`, `:211-221`

**Interfaces:**

- Consumes: `NavItem` de `./nav-config` (los cuatro ítems de `getNavItems('buyer')`: Inicio `exact`, Subastas, Mis pujas, Ganadas).
- Produces: `export const ICON_MAP: Record<IconKey, LucideIcon>` y `export function isActive(pathname: string | null, href: string, exact: boolean | undefined): boolean` en `sidebar-nav.tsx`; `BottomTabBar({ items }: { items: NavItem[] })`.

- [ ] **Step 1: Export the icon map and the active rule**

En `apps/web/src/components/shell/sidebar-nav.tsx`, reemplazar:

```tsx
const ICON_MAP: Record<IconKey, LucideIcon> = {
```

por:

```tsx
// Exportado: la barra de pestañas del celular usa los mismos íconos.
export const ICON_MAP: Record<IconKey, LucideIcon> = {
```

y reemplazar:

```tsx
function isActive(pathname: string | null, href: string, exact: boolean | undefined): boolean {
```

por:

```tsx
// Exportado: la barra de pestañas del celular marca la activa con la misma regla.
export function isActive(
  pathname: string | null,
  href: string,
  exact: boolean | undefined,
): boolean {
```

- [ ] **Step 2: Create the tab bar**

`apps/web/src/components/shell/bottom-tab-bar.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ICON_MAP, isActive } from './sidebar-nav';
import type { NavItem } from './nav-config';

// La ficha de una subasta (/es/auctions/abc): ahí manda la barra fija de
// puja (BidDock) y dos barras apiladas le quitarían media pantalla al auto.
const AUCTION_DETAIL = /^\/[^/]+\/auctions\/[^/]+$/;

/**
 * Pestañas del comprador en el celular (spec 2026-09-27 §3 y §5.1): los
 * cuatro destinos del menú lateral al alcance del pulgar, en lugar de la
 * hamburguesa. Sólida (bg-elev + hairline), sin vidrio.
 *
 * Inactivas en text-muted y no text-subtle como decía la spec: a 11 px,
 * subtle sobre bg-elev no llega a AA. La activa se distingue por la barra de
 * tinta de 3 px, text-strong y el trazo más grueso.
 */
export function BottomTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (pathname && AUCTION_DETAIL.test(pathname)) return null;

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-text-subtle/15 bg-bg-elev pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid h-16 grid-cols-4">
        {items.map((it) => {
          const active = isActive(pathname, it.href, it.exact);
          const Icon = ICON_MAP[it.icon];
          return (
            <li key={it.href} className="min-w-0">
              <Link
                href={it.href as `/${string}`}
                prefetch
                {...(active ? { 'aria-current': 'page' as const } : {})}
                className={
                  'relative flex h-16 flex-col items-center justify-center gap-1 ' +
                  'text-[11px] font-semibold [touch-action:manipulation] ' +
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-strong/40 ' +
                  (active ? 'text-text-strong' : 'text-text-muted hover:text-text-strong')
                }
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 rounded-b-full bg-text-strong"
                  />
                )}
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                <span className="max-w-full truncate px-1">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 3: Mount it in the shell and leave room at the bottom**

En `apps/web/src/components/shell/app-shell.tsx`, reemplazar:

```tsx
import { getNavItems, type Role } from './nav-config';
```

por:

```tsx
import { BottomTabBar } from './bottom-tab-bar';
import { getNavItems, type Role } from './nav-config';
```

reemplazar:

```tsx
  const role = user.role as Role;
```

por:

```tsx
  const role = user.role as Role;
  const isBuyer = role === 'buyer';
```

y reemplazar:

```tsx
        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 py-5 md:px-8 md:py-7">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
```

por:

```tsx
        {/* Main content. Con la barra de pestañas del comprador (< lg) el
            contenido deja abajo el alto de la barra más el área segura del
            iPhone, para que nada quede tapado (spec 2026-09-27 §4). La barra
            de puja de la ficha mide lo mismo, así que este lugar le sirve
            también. El md: repetido es a propósito: md:py-7 pisaría el pb. */}
        <main
          className={
            'flex-1 min-w-0 px-4 py-5 md:px-8 md:py-7' +
            (isBuyer
              ? ' pb-[calc(64px_+_env(safe-area-inset-bottom)_+_1rem)] md:pb-[calc(64px_+_env(safe-area-inset-bottom)_+_1rem)] lg:pb-7'
              : '')
          }
        >
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      {isBuyer && <BottomTabBar items={navItems} />}
    </div>
```

- [ ] **Step 4: No hamburger nor drawer for buyers**

En `apps/web/src/components/shell/topbar.tsx`, reemplazar:

```tsx
        <div className="flex items-center gap-3 min-w-0">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className={
              'lg:hidden -ml-1.5 w-9 h-9 grid place-items-center rounded-lg ' +
              'text-text-muted hover:text-text-strong hover:bg-bg-deep/60 transition-colors'
            }
          >
            <Menu className="w-5 h-5" strokeWidth={2.25} />
          </button>
```

por:

```tsx
        <div className="flex items-center gap-3 min-w-0">
          {/* El comprador navega con la barra de pestañas de abajo (spec
              2026-09-27 §4); staff, admin y finanzas siguen con el cajón. */}
          {role !== 'buyer' && (
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
              className={
                'lg:hidden -ml-1.5 w-9 h-9 grid place-items-center rounded-lg ' +
                'text-text-muted hover:text-text-strong hover:bg-bg-deep/60 transition-colors'
              }
            >
              <Menu className="w-5 h-5" strokeWidth={2.25} />
            </button>
          )}
```

y reemplazar:

```tsx
      {/* Mobile drawer */}
      <MobileDrawer
        open={mobileOpen}
        onClose={closeMobileMenu}
        triggerRef={menuButtonRef}
        navItems={navItems}
        firstName={firstName}
        email={email}
        role={role}
        {...(audience ? { audience } : {})}
      />
```

por:

```tsx
      {/* Mobile drawer: no se monta para el comprador (ver arriba). */}
      {role !== 'buyer' && (
        <MobileDrawer
          open={mobileOpen}
          onClose={closeMobileMenu}
          triggerRef={menuButtonRef}
          navItems={navItems}
          firstName={firstName}
          email={email}
          role={role}
          {...(audience ? { audience } : {})}
        />
      )}
```

La campana y el menú de usuario (Ajustes, Cerrar sesión) quedan en la barra de arriba sin cambios.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test`
Expected: sin errores; la suite sigue verde.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shell/bottom-tab-bar.tsx apps/web/src/components/shell/sidebar-nav.tsx \
  apps/web/src/components/shell/app-shell.tsx apps/web/src/components/shell/topbar.tsx
git commit -m "feat(shell): barra de pestañas abajo para el comprador en el celular

Reemplaza la hamburguesa del comprador; staff y admin siguen con el cajón.
Se oculta en la ficha, donde va la barra de puja.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Inicio como tablero

**Files:**

- Modify: `apps/web/src/lib/buyer/load-buyer-stats.ts:22-43`, `:126-142`, `:163-176`, `:197-200`, `:214-225`
- Create: `apps/web/src/components/buyer/next-closing-card.tsx`
- Modify (reescritura completa): `apps/web/src/app/[locale]/(protected)/[audience]/page.tsx`

**Interfaces:**

- Consumes: `pickNextClosing`, `closeProgress`, `commitment`, `type HomeStats` (Task 2); `formatClock`, `remainingLabel` (Task 2); `loadAppConfigSnapshot()` → `payment.depositPercent` (fracción) y `payment.deadlineHours`; `AuctionCard` tal como está hoy — **en este task todavía no se le pasa `myState`** (la prop nace en la Task 6 y se conecta en su Step 8).
- Produces: `BuyerStats.myBidAuctionIds: string[]`; `myWinning` hasta 20; `closingSoon` hasta 6; `NextClosingCard(props: HomeStats & { locale: string })`.

- [ ] **Step 1: Widen `loadBuyerStats` and expose the bid ids**

En `apps/web/src/lib/buyer/load-buyer-stats.ts`, reemplazar:

```ts
  /** Closing-soon auctions (live, ends within 24h), sorted asc, max 3. */
```

por:

```ts
  /** Closing-soon auctions (live, ends within 24h), sorted asc, max 6 (fila "Cierran pronto"). */
```

reemplazar:

```ts
  /** Auctions where the buyer is currently winning. */
  myWinning: Array<{
```

por:

```ts
  /**
   * Subastas distintas en las que el comprador pujó alguna vez. El Inicio la
   * usa para no decir "Todavía no pujaste" en una donde ya lo superaron.
   */
  myBidAuctionIds: string[];
  /** Auctions where the buyer is currently winning, max 20 ("Si ganás todo" las suma). */
  myWinning: Array<{
```

reemplazar:

```ts
  // Distinct auctions the buyer has placed any bid on.
  const myActiveBidsCount = await safe(
    db
      .collectionGroup('bids')
      .where('buyerUid', '==', uid)
      .select('auctionId')
      .get()
      .then((snap) => {
        const ids = new Set<string>();
        snap.docs.forEach((d) => {
          const aid = d.data()['auctionId'] as string | undefined;
          if (aid) ids.add(aid);
        });
        return ids.size;
      }),
    0,
  );
```

por:

```ts
  // Distinct auctions the buyer has placed any bid on. La lista (y no solo el
  // número) la usa "La próxima que cierra"; sale de la misma consulta, sin
  // lecturas extra.
  const myBidAuctionIds = await safe(
    db
      .collectionGroup('bids')
      .where('buyerUid', '==', uid)
      .select('auctionId')
      .get()
      .then((snap) => {
        const ids = new Set<string>();
        snap.docs.forEach((d) => {
          const aid = d.data()['auctionId'] as string | undefined;
          if (aid) ids.add(aid);
        });
        return Array.from(ids);
      }),
    [] as string[],
  );
  const myActiveBidsCount = myBidAuctionIds.length;
```

reemplazar:

```ts
  // Closing-soon: live auctions ending in next 24h, max 3 (lighter than admin).
```

por:

```ts
  // Closing-soon: live auctions ending in next 24h, max 6: la fila deslizable
  // "Cierran pronto" del Inicio (spec 2026-09-27 §5.2).
```

reemplazar:

```ts
      .orderBy('endsAt', 'asc')
      .limit(3)
      .get()
```

por:

```ts
      .orderBy('endsAt', 'asc')
      .limit(6)
      .get()
```

reemplazar:

```ts
  // Auctions the buyer is currently winning, scoped to their audience and
  // capped at 5 for the dashboard panel. Reuses myWinningDocs so the count
  // and the visible list stay in sync.
  const myWinning: BuyerStats['myWinning'] = myWinningDocs.slice(0, 5).map((d) => {
```

por:

```ts
  // Auctions the buyer is currently winning, scoped to their audience. Tope
  // 20 y no 5: "Si ganás todo" suma todas (spec 2026-09-27 §5.2). Reuses
  // myWinningDocs so the count and the visible list stay in sync.
  const myWinning: BuyerStats['myWinning'] = myWinningDocs.slice(0, 20).map((d) => {
```

y reemplazar:

```ts
    myFavoritesLiveCount,
    closingSoon,
    myWinning,
  };
}
```

por:

```ts
    myFavoritesLiveCount,
    closingSoon,
    myBidAuctionIds,
    myWinning,
  };
}
```

- [ ] **Step 2: Create the ticking "next closing" card**

`apps/web/src/components/buyer/next-closing-card.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Gavel } from 'lucide-react';
import { closeProgress, pickNextClosing, type HomeStats } from '@/lib/buyer/mobile-home';
import { formatAmount } from '@/lib/format/money';
import { formatDateTimePy } from '@/lib/format/date';
import { formatClock, remainingLabel } from '@/lib/format/remaining';

interface Props extends HomeStats {
  locale: string;
}

/**
 * "La próxima que cierra" (spec 2026-09-27 §5.2): la única superficie en
 * tinta del Inicio (.panel-ink, como el panel de puja). Cliente porque el
 * reloj corre cada segundo; la elección de la subasta se rehace con cada tic
 * para que una que cierra salga sola y entre la siguiente. Sin ninguna
 * subasta abierta no se muestra.
 */
export function NextClosingCard({ locale, myWinning, closingSoon, myBidAuctionIds }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const next = pickNextClosing({ myWinning, closingSoon, myBidAuctionIds }, now);
  if (!next) return null;

  const { item } = next;
  const remaining = item.endsAtMs - now;
  const progress = closeProgress(item.endsAtMs, now);
  // formatDateTimePy da siempre "dd/mm/yyyy HH:MM" en hora de Paraguay; la
  // tarjeta solo necesita la hora.
  const closesAt = formatDateTimePy(locale, item.endsAtMs).slice(-5);

  return (
    <section
      aria-labelledby="next-closing-heading"
      className="panel-ink space-y-4 rounded-2xl border p-5 shadow-card"
    >
      <h2
        id="next-closing-heading"
        className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted"
      >
        La próxima que cierra
      </h2>

      <div className="flex items-center gap-3">
        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-bg-deep">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Gavel className="h-6 w-6 text-text-subtle" strokeWidth={1.5} aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold tracking-tight text-text-strong">
            {item.make} {item.model} <span className="num-tab font-normal">{item.year}</span>
          </p>
          {next.kind === 'winning' ? (
            // Dentro del panel en tinta el verde es el de fondo oscuro en los
            // dos temas, igual que el aviso "Vas ganando" de BidPanel.
            <p className="num-tab text-sm font-semibold text-[#bbf7d0]">
              Vas ganando · USD {formatAmount(item.amountUsd)}
            </p>
          ) : (
            <>
              <p className="num-tab text-sm text-text-muted">
                {item.hasBids ? 'Puja actual' : 'Precio inicial'} USD{' '}
                {formatAmount(item.amountUsd)}
              </p>
              <p className="text-xs text-text-muted">
                {item.iBid ? 'Te superaron' : 'Todavía no pujaste'}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <p
          suppressHydrationWarning
          className="num-tab text-4xl font-extrabold tracking-tight text-text-strong"
        >
          {formatClock(remaining)}
        </p>
        <p suppressHydrationWarning className="num-tab pb-1 text-xs text-text-muted">
          quedan {remainingLabel(remaining)}
        </p>
      </div>

      {/* scaleX y no width: DESIGN.md no anima propiedades de layout. */}
      <div
        suppressHydrationWarning
        role="progressbar"
        aria-label="Tiempo transcurrido de las últimas 24 horas"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="h-1.5 overflow-hidden rounded-full bg-text-strong/15"
      >
        <div
          suppressHydrationWarning
          className="h-full origin-left rounded-full bg-text-strong"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span suppressHydrationWarning className="num-tab text-xs text-text-muted">
          Cierra {closesAt}
        </span>
        <Link
          href={`/${locale}/auctions/${item.auctionId}` as `/${string}`}
          className="inline-flex items-center gap-0.5 rounded-md text-sm font-semibold text-text-strong underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
        >
          Ir a la subasta
          <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Rewrite the buyer home**

Reemplazar el archivo completo `apps/web/src/app/[locale]/(protected)/[audience]/page.tsx` por:

```tsx
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/server';
import { loadBuyerStats, type BuyerStats } from '@/lib/buyer/load-buyer-stats';
import { loadFavorites } from '@/lib/buyer/load-favorites';
import { listPublicAuctions } from '@/lib/buyer/list-public-auctions';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { commitment } from '@/lib/buyer/mobile-home';
import { formatAmount, formatNumber } from '@/lib/format/money';
import { remainingLabel } from '@/lib/format/remaining';
import { BatchCountdown } from '@/components/auctions/batch-countdown';
import { NextClosingCard } from '@/components/buyer/next-closing-card';
import { batchClock } from '@/lib/auctions/batch';
import { AuctionCard } from '../auctions/auction-card';

interface PageProps {
  params: { locale: string; audience: 'retail' | 'wholesale' };
}

/** How many cars the home shows before sending the buyer to the full catalog. */
const HOME_GRID_LIMIT = 12;

/**
 * Buyer home.
 *
 * Desde el 2026-09-27 (spec celular-comprador §5.2) es un tablero, primero
 * pensado para el teléfono: tus números, la próxima subasta que cierra con su
 * reloj, lo que te comprometés si ganás todo, y lo que cierra pronto. La
 * grilla de vehículos sigue abajo sin cambios. En escritorio los bloques se
 * acomodan en dos columnas; es la única pantalla del comprador que cambia en
 * escritorio.
 *
 * The audience comes from the URL segment, validated by the layout, and is
 * passed to every query so the page can only ever show what the URL claims.
 */
export default async function BuyerHome({ params: { locale, audience } }: PageProps) {
  const user = await getCurrentUser(locale);
  const [stats, favorites, items, config] = await Promise.all([
    loadBuyerStats(user.uid, audience),
    loadFavorites(user.uid),
    listPublicAuctions({ tab: 'all', audience }),
    loadAppConfigSnapshot(),
  ]);

  const favSet = new Set(favorites);
  const shown = items.slice(0, HOME_GRID_LIMIT);
  const hasMore = items.length > shown.length;
  const clock = batchClock(items);
  const owed = commitment(stats.myWinning, config.payment.depositPercent);
  const depositPct = Math.round(config.payment.depositPercent * 100);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
          Hola, {user.firstName || 'comprador'}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-text-strong text-pretty sm:text-3xl">
          Tu actividad de hoy
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          {/* Cada número lleva a la vista que resume: un número con el que no
              se puede hacer nada es decoración. "Activas" pasó a la pestaña
              Subastas. */}
          <nav aria-label="Tu actividad">
            <ul className="grid grid-cols-3 divide-x divide-text-subtle/15 overflow-hidden rounded-2xl border border-text-subtle/15 bg-bg-elev shadow-card">
              <StatLink
                href={`/${locale}/${audience}/bids`}
                label="Vas ganando"
                value={stats.myWinningCount}
                emphasis={stats.myWinningCount > 0}
              />
              <StatLink
                href={`/${locale}/${audience}/bids`}
                label="Mis pujas"
                value={stats.myActiveBidsCount}
              />
              <StatLink
                href={`/${locale}/${audience}/won`}
                label="Ganadas"
                value={stats.myWonCount}
              />
            </ul>
          </nav>

          {owed.count > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <MoneyTile
                label="Si ganás todo"
                amountUsd={owed.totalUsd}
                note={`${owed.count} ${owed.count === 1 ? 'subasta que vas ganando' : 'subastas que vas ganando'}`}
              />
              <MoneyTile
                label="Seña a pagar"
                amountUsd={owed.depositUsd}
                note={`${depositPct} % en ${config.payment.deadlineHours} h al ganar`}
              />
            </div>
          )}
        </div>

        <NextClosingCard
          locale={locale}
          myWinning={stats.myWinning}
          closingSoon={stats.closingSoon}
          myBidAuctionIds={stats.myBidAuctionIds}
        />
      </div>

      {stats.closingSoon.length > 0 && (
        <ClosingSoonStrip locale={locale} items={stats.closingSoon} />
      )}

      <section aria-labelledby="grid-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="grid-heading" className="text-lg font-bold tracking-tight text-text-strong">
              Vehículos disponibles
            </h2>
            <p className="text-sm text-text-muted num-tab">
              {items.length} {items.length === 1 ? 'unidad' : 'unidades'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {clock !== null && (
              <BatchCountdown endsAtMs={clock.at} mode={clock.mode} variant="compact" />
            )}
            <Link
              href={`/${locale}/auctions` as `/${string}`}
              className={
                'shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-text-strong ' +
                'underline-offset-4 hover:underline [touch-action:manipulation] ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 rounded-md'
              }
            >
              Ver catálogo
              <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-text-subtle/25 bg-bg-elev px-6 py-14 text-center">
            <Clock
              className="w-8 h-8 mx-auto text-text-subtle opacity-50"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-text-strong">
              No hay subastas activas en este momento
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Te avisamos apenas se publique una nueva.
            </p>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {shown.map((a, i) => (
                <li key={a.id} className="min-w-0">
                  <AuctionCard
                    locale={locale}
                    auction={a}
                    isFavorite={favSet.has(a.id)}
                    buyerUid={user.uid}
                    index={i}
                  />
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="pt-1 text-center">
                <Link
                  href={`/${locale}/auctions` as `/${string}`}
                  className={
                    'inline-flex items-center gap-1.5 h-11 px-5 rounded-lg text-sm font-semibold ' +
                    'bg-text-strong text-bg-base [touch-action:manipulation] ' +
                    'transition-opacity duration-200 hover:opacity-90 ' +
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
                  }
                >
                  Ver las {items.length} unidades
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
                </Link>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function StatLink({
  href,
  label,
  value,
  emphasis = false,
}: {
  href: string;
  label: string;
  value: number;
  /** Tono de éxito: "Vas ganando" mientras el comprador va primero en algo. */
  emphasis?: boolean;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={href as `/${string}`}
        className={
          'flex flex-col items-center justify-center gap-0.5 px-2 py-4 text-center ' +
          '[touch-action:manipulation] transition-colors duration-200 hover:bg-bg-deep/50 ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-strong/40'
        }
      >
        <span
          className={
            'num-tab text-2xl font-extrabold tracking-tight ' +
            (emphasis ? 'text-success' : 'text-text-strong')
          }
        >
          {formatNumber(value)}
        </span>
        <span className="text-xs font-medium text-text-muted">{label}</span>
      </Link>
    </li>
  );
}

function MoneyTile({ label, amountUsd, note }: { label: string; amountUsd: number; note: string }) {
  return (
    <div className="rounded-xl border border-text-subtle/15 bg-bg-elev p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="mt-1 whitespace-nowrap num-tab text-xl font-extrabold tracking-tight text-text-strong">
        USD {formatAmount(amountUsd)}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">{note}</p>
    </div>
  );
}

/**
 * Fila deslizable "Cierran pronto". Server component: el tiempo se escribe al
 * renderizar y no corre (es orientativo; el reloj que corre está en la
 * tarjeta en tinta y en la ficha).
 */
function ClosingSoonStrip({
  locale,
  items,
}: {
  locale: string;
  items: BuyerStats['closingSoon'];
}) {
  const now = Date.now();
  return (
    <section aria-labelledby="closing-heading" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id="closing-heading" className="text-lg font-bold tracking-tight text-text-strong">
          Cierran pronto
        </h2>
        <Link
          href={`/${locale}/auctions?tab=closing` as `/${string}`}
          className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-text-strong underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
        >
          Ver todas
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </Link>
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
        {items.map((a) => (
          <li key={a.id} className="w-40 shrink-0 snap-start">
            <Link
              href={`/${locale}/auctions/${a.id}` as `/${string}`}
              className="block overflow-hidden rounded-xl border border-text-subtle/15 bg-bg-elev focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
            >
              <div className="aspect-[4/3] bg-bg-deep">
                {a.thumbnailUrl && (
                  <img
                    src={a.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="space-y-0.5 p-2.5">
                <p className="truncate text-sm font-bold text-text-strong">
                  {a.make} {a.model}
                </p>
                <p className="num-tab text-sm font-semibold text-text-strong">
                  USD {formatAmount(a.currentBid > 0 ? a.currentBid : a.startingPrice)}
                </p>
                <p className="num-tab text-xs text-text-muted">
                  Cierra en {remainingLabel(a.endsAtMs - now)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test`
Expected: sin errores. `BuyerStats` calza con `HomeStats` por estructura (si el typecheck marca `NextClosingCard`, es que falta `myBidAuctionIds` en el `return` del Step 1).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/buyer/load-buyer-stats.ts apps/web/src/components/buyer/next-closing-card.tsx \
  "apps/web/src/app/[locale]/(protected)/[audience]/page.tsx"
git commit -m "feat(inicio): tablero del comprador con la próxima que cierra y la seña

Números propios, la subasta que vas ganando con cierre más cercano y su
reloj, lo que comprometés si ganás todo con el porcentaje real de seña,
y la fila de las que cierran pronto. La grilla sigue abajo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Catálogo en el celular

**Files:**

- Modify: `apps/web/src/lib/buyer/list-public-auctions.ts:15`, `:123`
- Modify: `apps/web/src/lib/buyer/list-my-bids.ts:17`, `:62`
- Create: `apps/web/src/app/[locale]/(protected)/auctions/use-favorite.ts`
- Create: `apps/web/src/app/[locale]/(protected)/auctions/auction-row.tsx`
- Modify: `apps/web/src/app/[locale]/(protected)/auctions/auction-card.tsx`
- Modify (reescritura completa): `apps/web/src/app/[locale]/(protected)/auctions/auctions-grid.tsx`
- Modify (reescritura completa): `apps/web/src/app/[locale]/(protected)/auctions/page.tsx`
- Modify: `apps/web/src/app/[locale]/(protected)/[audience]/page.tsx` (el de la Task 5: pasa `myState` a las tarjetas del Inicio)

**Interfaces:**

- Consumes: `matchesSearch`, `myAuctionStates`, `ownStatePill`, `type MyAuctionState`, `type OwnStatePill`, `formatCountdown`, `remainingLabel` (Task 2).
- Produces: `PublicAuction.buyNowPrice: number | null`; `MyBidEntry.iAmLeading: boolean`; `useFavorite(auctionId: string, buyerUid: string, initial: boolean): { fav: boolean; toggle: (e: MouseEvent) => Promise<void> }`; `AuctionCard` con `myState?: MyAuctionState | undefined`; `AuctionRow`; `AuctionsGrid` con `myStates: Record<string, MyAuctionState>`.

- [ ] **Step 1: `buyNowPrice` in the catalog items**

En `apps/web/src/lib/buyer/list-public-auctions.ts`, reemplazar:

```ts
  bidCount: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
```

por:

```ts
  bidCount: number;
  /**
   * Precio de Compra ya, null si no tiene. Lo muestra la píldora del catálogo
   * (spec 2026-09-27 §5.3); es publicable: la ficha pública ya lo expone.
   */
  buyNowPrice: number | null;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
```

y reemplazar:

```ts
    bidCount: (data['bidCount'] as number) ?? 0,
    status: (data['status'] as PublicAuction['status']) ?? 'scheduled',
```

por:

```ts
    bidCount: (data['bidCount'] as number) ?? 0,
    // Staff lo borra con FieldValue.delete(): ausente y "nunca tuvo" dan null.
    buyNowPrice: (data['buyNowPrice'] as number | undefined) ?? null,
    status: (data['status'] as PublicAuction['status']) ?? 'scheduled',
```

- [ ] **Step 2: `iAmLeading` in the buyer's bids**

En `apps/web/src/lib/buyer/list-my-bids.ts`, reemplazar:

```ts
  iAmWinner: boolean;
  currentBid: number;
```

por:

```ts
  iAmWinner: boolean;
  /**
   * El comprador es hoy el mejor postor (auction.currentBidderUid). Es la
   * fuente de "Vas ganando"/"Te superaron": el `status` de la puja falta en
   * las pujas viejas y en las del seed (ver my-auction-states.ts).
   */
  iAmLeading: boolean;
  currentBid: number;
```

y reemplazar:

```ts
      iAmWinner: (a['winnerUid'] as string | undefined) === uid,
```

por:

```ts
      iAmWinner: (a['winnerUid'] as string | undefined) === uid,
      iAmLeading: (a['currentBidderUid'] as string | undefined) === uid,
```

- [ ] **Step 3: Extract the favorite toggle**

`apps/web/src/app/[locale]/(protected)/auctions/use-favorite.ts`:

```ts
'use client';
import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';

/**
 * El corazón de favoritos, compartido por la tarjeta y la fila del catálogo
 * (spec 2026-09-27 §5.3: "el corazón se mantiene"). Movido tal cual desde
 * AuctionCard: misma escritura en users/{uid}.favorites y el mismo
 * router.refresh() para que la pestaña Favoritas se entere.
 */
export function useFavorite(auctionId: string, buyerUid: string, initial: boolean) {
  const router = useRouter();
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const ref = doc(fb.db, 'users', buyerUid);
    try {
      if (fav) {
        await updateDoc(ref, { favorites: arrayRemove(auctionId) });
        setFav(false);
      } else {
        await updateDoc(ref, { favorites: arrayUnion(auctionId) });
        setFav(true);
      }
      router.refresh();
    } catch {
      // silent fail; user will see no change
    } finally {
      setBusy(false);
    }
  }

  return { fav, toggle };
}
```

- [ ] **Step 4: Card uses the hook and shows the own-state pill**

En `apps/web/src/app/[locale]/(protected)/auctions/auction-card.tsx`:

(a) Reemplazar:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Heart, Clock, Gavel } from 'lucide-react';
import { doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';
```

por:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Heart, Clock, Gavel } from 'lucide-react';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';
import { Badge } from '@/components/ui/badge';
import { ownStatePill, type MyAuctionState } from '@/lib/buyer/my-auction-states';
import { useFavorite } from './use-favorite';
```

(b) Reemplazar:

```tsx
  buyerUid: string;
  index?: number;
}

export function AuctionCard({ locale, auction, isFavorite, buyerUid, index = 0 }: Props) {
  const t = useTranslations('buyer.auctions');
  const tStatus = useTranslations('buyer.auctions.status');
  const router = useRouter();
  const [fav, setFav] = useState(isFavorite);
  const [favBusy, setFavBusy] = useState(false);
```

por:

```tsx
  buyerUid: string;
  index?: number;
  /** "Vas ganando"/"Te superaron" en esta subasta, si el comprador pujó (spec 2026-09-27 §5.3). */
  myState?: MyAuctionState | undefined;
}

export function AuctionCard({
  locale,
  auction,
  isFavorite,
  buyerUid,
  index = 0,
  myState,
}: Props) {
  const t = useTranslations('buyer.auctions');
  const tStatus = useTranslations('buyer.auctions.status');
  const { fav, toggle: toggleFav } = useFavorite(auction.id, buyerUid, isFavorite);
```

(c) Borrar el bloque completo (ahora vive en `useFavorite`):

```tsx
  async function toggleFav(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (favBusy) return;
    setFavBusy(true);
    const ref = doc(fb.db, 'users', buyerUid);
    try {
      if (fav) {
        await updateDoc(ref, { favorites: arrayRemove(auction.id) });
        setFav(false);
      } else {
        await updateDoc(ref, { favorites: arrayUnion(auction.id) });
        setFav(true);
      }
      router.refresh();
    } catch {
      // silent fail; user will see no change
    } finally {
      setFavBusy(false);
    }
  }

```

(d) Reemplazar:

```tsx
  const cardLabel = `${auction.make} ${auction.model} ${auction.year}${isSold ? ' — vendido' : ''}`;
```

por:

```tsx
  const cardLabel = `${auction.make} ${auction.model} ${auction.year}${isSold ? ' — vendido' : ''}`;
  const pill = ownStatePill(myState, auction);
```

(e) Reemplazar el final del cuerpo:

```tsx
          {auction.bidCount > 0 && (
            <span className="text-[11px] text-text-muted shrink-0 num-tab">
              {t('bidCount', { count: auction.bidCount })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

por:

```tsx
          {auction.bidCount > 0 && (
            <span className="text-[11px] text-text-muted shrink-0 num-tab">
              {t('bidCount', { count: auction.bidCount })}
            </span>
          )}
        </div>
        {pill && (
          <Badge variant={pill.variant} className="px-2 py-0.5 text-[10px] uppercase tracking-[0.06em]">
            {pill.label}
          </Badge>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: The compact row (< sm)**

`apps/web/src/app/[locale]/(protected)/auctions/auction-row.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock, Gavel, Heart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';
import type { OwnStatePill } from '@/lib/buyer/my-auction-states';
import { isSoldOutcome } from '@/lib/auctions/sold-outcome';
import { formatAmount } from '@/lib/format/money';
import { formatCountdown, remainingLabel } from '@/lib/format/remaining';
import { useFavorite } from './use-favorite';

interface Props {
  locale: string;
  auction: PublicAuction;
  /** Reloj compartido de la lista: un solo intervalo para todas las filas. */
  nowMs: number;
  pill: OwnStatePill | null;
  isFavorite: boolean;
  buyerUid: string;
}

/**
 * Una subasta como fila, por debajo de sm (spec 2026-09-27 §5.3): miniatura
 * 104×84, modelo y año, precio, estado propio y tiempo. Mismo patrón que la
 * tarjeta: un link que cubre la fila y el corazón como botón hermano encima,
 * para no anidar un botón dentro de un <a>.
 */
export function AuctionRow({ locale, auction, nowMs, pill, isFavorite, buyerUid }: Props) {
  const t = useTranslations('buyer.auctions');
  const { fav, toggle } = useFavorite(auction.id, buyerUid, isFavorite);
  const isSold = isSoldOutcome(auction.outcome);
  const price = auction.currentBid > 0 ? auction.currentBid : auction.startingPrice;
  const remainingMs = auction.endsAtMs - nowMs;
  const urgent = auction.status === 'live' && remainingMs > 0 && remainingMs < 3_600_000;
  const label = `${auction.make} ${auction.model} ${auction.year}${isSold ? ' — vendido' : ''}`;
  const shownPill: OwnStatePill | null = isSold ? { variant: 'neutral', label: 'Vendido' } : pill;

  return (
    <div className="relative flex gap-3 rounded-2xl border border-text-subtle/20 bg-bg-elev p-2.5 shadow-card">
      <Link
        href={`/${locale}/auctions/${auction.id}` as `/${string}`}
        aria-label={label}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      />
      <div className="pointer-events-none relative z-[1] h-[84px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-bg-deep">
        {auction.thumbnailUrl ? (
          <img
            src={auction.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Gavel className="h-6 w-6 text-text-subtle opacity-60" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="pointer-events-none relative z-[1] min-w-0 flex-1">
        <p className="truncate pr-9 font-bold tracking-tight text-text-strong">
          {auction.make} {auction.model}{' '}
          <span className="num-tab font-normal text-text-muted">{auction.year}</span>
        </p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-text-muted">
          {auction.currentBid > 0 ? 'Puja actual' : 'Precio inicial'}
        </p>
        <p className="num-tab text-lg font-extrabold leading-tight tracking-tight text-text-strong">
          USD {formatAmount(price)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {shownPill && (
            <Badge
              variant={shownPill.variant}
              className="px-2 py-0 text-[10px] uppercase tracking-[0.06em]"
            >
              {shownPill.label}
            </Badge>
          )}
          <span
            // El reloj del servidor y el del navegador difieren por un instante.
            suppressHydrationWarning
            className={
              'inline-flex items-center gap-1 text-xs num-tab ' +
              (urgent ? 'font-semibold text-danger' : 'text-text-muted')
            }
          >
            <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
            {auction.status === 'scheduled'
              ? `Abre en ${remainingLabel(auction.startsAtMs - nowMs)}`
              : formatCountdown(remainingMs)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={fav ? t('removeFavorite') : t('addFavorite')}
        aria-pressed={fav}
        className={
          'absolute right-1 top-1 z-[2] grid h-11 w-11 place-items-center rounded-full transition-colors ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
          (fav ? 'text-rose-500' : 'text-text-muted hover:text-rose-500')
        }
      >
        <Heart className="h-4 w-4" fill={fav ? 'currentColor' : 'transparent'} strokeWidth={2} />
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Segmented tabs, search, rows and cards**

Reemplazar el archivo completo `apps/web/src/app/[locale]/(protected)/auctions/auctions-grid.tsx` por:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Gavel, Heart, Search } from 'lucide-react';
import { AuctionCard } from './auction-card';
import { AuctionRow } from './auction-row';
import { BatchCountdown } from '@/components/auctions/batch-countdown';
import { batchClock } from '@/lib/auctions/batch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { matchesSearch } from '@/lib/buyer/search';
import { ownStatePill, type MyAuctionState } from '@/lib/buyer/my-auction-states';
import type { PublicAuction, CatalogTab } from '@/lib/buyer/list-public-auctions';

interface Props {
  locale: string;
  items: PublicAuction[];
  currentTab: CatalogTab;
  favorites: string[];
  buyerUid: string;
  /**
   * Estado propio por subasta en vivo (myAuctionStates). Objeto y no Map:
   * cruza del servidor al cliente y tiene que ser JSON.
   */
  myStates: Record<string, MyAuctionState>;
}

export function AuctionsGrid({ locale, items, currentTab, favorites, buyerUid, myStates }: Props) {
  const t = useTranslations('buyer.auctions');
  const router = useRouter();
  const favSet = new Set(favorites);
  // Búsqueda sobre la lista ya cargada, sin consulta nueva (spec 2026-09-27 §5.3).
  const [query, setQuery] = useState('');

  function setTab(value: string) {
    const next = value === 'all' ? '' : `?tab=${value}`;
    router.replace(`/${locale}/auctions${next}` as `/${string}`);
  }

  const empty = items.length === 0;
  const clock = batchClock(items);
  const visible = items.filter((a) => matchesSearch(a, query));

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-gradient-to-br from-bg-elev/60 via-bg-elev/30 to-transparent px-5 py-5 sm:px-6 sm:py-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-4 lg:gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
              Renew · Subastas
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
              {t('title')}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Encontrá tu próximo vehículo y pujá en tiempo real.
            </p>
          </div>

          {/* Batch clock. Lotes share one closing time, so it belongs here
              once rather than being read off each card. */}
          {clock !== null && (
            <BatchCountdown
              endsAtMs={clock.at}
              mode={clock.mode}
              className="w-full lg:w-auto lg:min-w-[22rem]"
            />
          )}

          <div className="text-xs text-text-muted lg:text-right">
            <span className="num-tab text-text-strong font-semibold text-base">{items.length}</span>{' '}
            {items.length === 1 ? 'subasta' : 'subastas'}
          </div>
        </div>
      </header>

      <div className="space-y-3">
        {/* Por debajo de lg las pestañas son un control segmentado de tres
            que ocupa el ancho; desde lg, las mismas pestañas de siempre. Los
            íconos se esconden en el teléfono para que "Cierran pronto" entre. */}
        <Tabs value={currentTab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 scrollbar-none lg:inline-flex lg:w-auto lg:justify-start lg:overflow-x-auto">
            <TabsTrigger value="all" className="gap-1.5 px-1.5 text-[13px] lg:px-3 lg:text-sm">
              <Gavel className="hidden w-3.5 h-3.5 sm:inline-block" /> {t('tabs.all')}
            </TabsTrigger>
            <TabsTrigger value="closing" className="gap-1.5 px-1.5 text-[13px] lg:px-3 lg:text-sm">
              <Search className="hidden w-3.5 h-3.5 sm:inline-block" /> {t('tabs.closing')}
            </TabsTrigger>
            <TabsTrigger value="favorites" className="gap-1.5 px-1.5 text-[13px] lg:px-3 lg:text-sm">
              <Heart className="hidden w-3.5 h-3.5 sm:inline-block" /> {t('tabs.favorites')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative lg:hidden">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Marca, modelo o año"
            aria-label="Buscar por marca, modelo o año"
            className="h-11 pl-9"
          />
        </div>
      </div>

      {empty ? (
        <EmptyState tab={currentTab} />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev px-6 py-12 text-center text-sm text-text-muted">
          Ninguna subasta coincide con “{query.trim()}”.
        </div>
      ) : (
        <>
          <AuctionRowList
            locale={locale}
            items={visible}
            favSet={favSet}
            buyerUid={buyerUid}
            myStates={myStates}
          />
          {/* Desde sm, la grilla de tarjetas de siempre. */}
          <div className="hidden gap-4 sm:grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((a, i) => (
              <AuctionCard
                key={a.id}
                locale={locale}
                auction={a}
                isFavorite={favSet.has(a.id)}
                buyerUid={buyerUid}
                index={i}
                myState={myStates[a.id]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Filas del teléfono (< sm). Tiene su propio reloj para que el tic de cada
 * segundo re-renderice solo las filas y no toda la grilla.
 */
function AuctionRowList({
  locale,
  items,
  favSet,
  buyerUid,
  myStates,
}: {
  locale: string;
  items: PublicAuction[];
  favSet: Set<string>;
  buyerUid: string;
  myStates: Record<string, MyAuctionState>;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <ul className="space-y-3 sm:hidden">
      {items.map((a) => (
        <li key={a.id}>
          <AuctionRow
            locale={locale}
            auction={a}
            nowMs={now}
            pill={ownStatePill(myStates[a.id], a)}
            isFavorite={favSet.has(a.id)}
            buyerUid={buyerUid}
          />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ tab }: { tab: CatalogTab }) {
  const t = useTranslations('buyer.auctions');
  const Icon = tab === 'favorites' ? Heart : Gavel;
  const msg = tab === 'favorites' ? t('emptyFavorites') : t('empty');
  return (
    <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev px-6 py-16 text-center animate-in fade-in duration-500">
      <Icon className="w-10 h-10 mx-auto text-text-muted/50 mb-3" strokeWidth={1.5} />
      <p className="text-sm text-text-muted">{msg}</p>
    </div>
  );
}
```

- [ ] **Step 7: The catalog page loads the buyer's bids in parallel**

Reemplazar el archivo completo `apps/web/src/app/[locale]/(protected)/auctions/page.tsx` por:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { listPublicAuctions, type CatalogTab } from '@/lib/buyer/list-public-auctions';
import { loadFavorites } from '@/lib/buyer/load-favorites';
import { listMyBids } from '@/lib/buyer/list-my-bids';
import { myAuctionStates } from '@/lib/buyer/my-auction-states';
import { AuctionsGrid } from './auctions-grid';

interface PageProps {
  params: { locale: string };
  searchParams?: { tab?: string };
}

export default async function BuyerAuctionsCatalog({
  params: { locale },
  searchParams,
}: PageProps) {
  const user = await getCurrentUser(locale);
  const tab: CatalogTab =
    searchParams?.tab === 'closing' || searchParams?.tab === 'favorites' ? searchParams.tab : 'all';
  // Admin/staff can browse the catalog too — let them see retail by default
  // (the staff/admin views in /staff/auctions already cover the unfiltered
  // operator perspective). Buyers always see only their own audience.
  const audience = user.audience ?? 'retail';

  // "Vas ganando"/"Te superaron" en cada auto sale de las pujas del comprador
  // (spec 2026-09-27 §5.3): una consulta por vista, en paralelo con el resto.
  // Si falla, el catálogo sale igual sin esas etiquetas: son contexto, no el
  // catálogo.
  const myBidsLoad = listMyBids(user.uid).catch(() => []);

  // Favorites and the catalog query are independent on the 'all' / 'closing'
  // tabs; run them in parallel. Only the 'favorites' tab needs to know
  // favorites first to filter.
  let favorites: string[];
  let items;
  if (tab === 'favorites') {
    favorites = await loadFavorites(user.uid);
    items = await listPublicAuctions({ tab, audience, favorites });
  } else {
    [favorites, items] = await Promise.all([
      loadFavorites(user.uid),
      listPublicAuctions({ tab, audience }),
    ]);
  }
  // Map → objeto: lo que cruza al componente de cliente tiene que ser JSON.
  const myStates = Object.fromEntries(myAuctionStates(await myBidsLoad));

  return (
    <AuctionsGrid
      locale={locale}
      items={items}
      currentTab={tab}
      favorites={favorites}
      buyerUid={user.uid}
      myStates={myStates}
    />
  );
}
```

- [ ] **Step 8: Home cards show "Vas ganando" too**

En `apps/web/src/app/[locale]/(protected)/[audience]/page.tsx` (el que dejó la Task 5), reemplazar:

```tsx
  const favSet = new Set(favorites);
  const shown = items.slice(0, HOME_GRID_LIMIT);
```

por:

```tsx
  const favSet = new Set(favorites);
  // El Inicio no carga listMyBids: solo sabe dónde vas ganando (myWinning).
  // "Te superaron" queda para el catálogo, que sí tiene todas tus pujas.
  const winningIds = new Set(stats.myWinning.map((w) => w.auctionId));
  const shown = items.slice(0, HOME_GRID_LIMIT);
```

y reemplazar:

```tsx
                    buyerUid={user.uid}
                    index={i}
                  />
```

por:

```tsx
                    buyerUid={user.uid}
                    index={i}
                    myState={winningIds.has(a.id) ? 'winning' : undefined}
                  />
```

- [ ] **Step 9: Verify**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test`
Expected: sin errores. Si el typecheck marca `React`, `fb` o `favBusy` en `auction-card.tsx`, es que quedó parte del viejo `toggleFav`: el bloque (c) del Step 4 tiene que desaparecer entero.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/buyer/list-public-auctions.ts apps/web/src/lib/buyer/list-my-bids.ts \
  "apps/web/src/app/[locale]/(protected)/auctions/use-favorite.ts" \
  "apps/web/src/app/[locale]/(protected)/auctions/auction-row.tsx" \
  "apps/web/src/app/[locale]/(protected)/auctions/auction-card.tsx" \
  "apps/web/src/app/[locale]/(protected)/auctions/auctions-grid.tsx" \
  "apps/web/src/app/[locale]/(protected)/auctions/page.tsx" \
  "apps/web/src/app/[locale]/(protected)/[audience]/page.tsx"
git commit -m "feat(catalogo): filas, búsqueda y estado propio en el celular

Pestañas como control segmentado, búsqueda por marca, modelo o año sobre
la lista cargada, filas compactas por debajo de sm y 'Vas ganando', 'Te
superaron', 'Compra ya' o 'Sin pujas' en cada auto. Escritorio igual.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ficha con sesión — orden de celular, barra fija y hoja

**Files:**

- Create: `apps/web/src/components/auctions/bid-dock.tsx`
- Modify: `apps/web/src/app/[locale]/(abierto)/auctions/[id]/bid-panel.tsx` (props, `doBuyNow`, `submitBid`, `confirmPendingBid`)
- Modify: `apps/web/src/app/[locale]/(abierto)/auctions/[id]/auction-detail-view.tsx`
- Modify: `apps/web/src/app/[locale]/(abierto)/auctions/[id]/page.tsx:124-134`

**Interfaces:**

- Consumes: `dockState`, `type DockState` (Task 2); `formatClock` (Task 2); `BottomSheet`, `BottomSheetContent` (Task 3); `minimumBid({ currentBid, startingPrice, bidIncrement })` de `@/lib/auctions/minimum-bid`; `vehicleAlt(make, model, year)` de `@/lib/format/vehicle-alt` (ya importado en la vista).
- Produces: `BidPanel` con `onBidPlaced?: (() => void) | undefined` (se llama después de que `placeBid` o `buyNow` respondieron bien); `BidDock({ state, sheetTitle, renderPanel }: { state: DockState; sheetTitle: string; renderPanel: (close: () => void) => ReactNode })`; `AuctionDetailView` con `isBuyer: boolean`.

- [ ] **Step 1: `BidPanel` tells when a bid or purchase went through**

En `apps/web/src/app/[locale]/(abierto)/auctions/[id]/bid-panel.tsx`:

(a) Reemplazar:

```tsx
  myUid: string;
  allowManualIncrement: boolean;
}

export function BidPanel({
```

por:

```tsx
  myUid: string;
  allowManualIncrement: boolean;
  /**
   * Avisa que la puja o la compra quedó confirmada por el servidor. La usa la
   * hoja del celular (BidDock) para cerrarse sola (spec 2026-09-27 §5.4). No
   * cambia nada de la puja: se llama recién cuando el callable respondió bien.
   */
  onBidPlaced?: (() => void) | undefined;
}

export function BidPanel({
```

(b) Reemplazar:

```tsx
  myUid,
  allowManualIncrement,
}: Props) {
```

por:

```tsx
  myUid,
  allowManualIncrement,
  onBidPlaced,
}: Props) {
```

(c) Reemplazar:

```tsx
    if (buyNowPrice === null) return;
    setBusy(true);
```

por:

```tsx
    if (buyNowPrice === null) return;
    let bought = false;
    setBusy(true);
```

(d) Reemplazar:

```tsx
      toast.success('¡Compra confirmada! Revisá tu correo para abonar la seña.');
      router.refresh();
```

por:

```tsx
      toast.success('¡Compra confirmada! Revisá tu correo para abonar la seña.');
      router.refresh();
      bought = true;
```

(e) Reemplazar:

```tsx
      setBusy(false);
      setConfirmBuyNow(false);
    }
  }
```

por:

```tsx
      setBusy(false);
      setConfirmBuyNow(false);
    }
    if (bought) onBidPlaced?.();
  }
```

(f) Reemplazar:

```tsx
  async function submitBid(amount: number) {
```

por:

```tsx
  // Devuelve si la puja entró, para que la hoja del celular sepa cuándo
  // cerrarse. Los errores se siguen mostrando acá mismo, como antes.
  async function submitBid(amount: number): Promise<boolean> {
```

(g) Reemplazar:

```tsx
      // bid had already landed.
    } catch (e) {
```

por:

```tsx
      // bid had already landed.
      return true;
    } catch (e) {
```

(h) Reemplazar:

```tsx
        toast.error(t('errors.generic'));
      }
    } finally {
      setBusy(false);
    }
  }
```

por:

```tsx
        toast.error(t('errors.generic'));
      }
      return false;
    } finally {
      setBusy(false);
    }
  }
```

(i) Reemplazar:

```tsx
  async function confirmPendingBid() {
    if (pendingBid === null) return;
    await submitBid(pendingBid);
    setPendingBid(null);
  }
```

por:

```tsx
  async function confirmPendingBid() {
    if (pendingBid === null) return;
    const placed = await submitBid(pendingBid);
    setPendingBid(null);
    if (placed) onBidPlaced?.();
  }
```

Nada más cambia en `BidPanel`: mismos montos, mismos diálogos, mismos callables, mismos mensajes.

- [ ] **Step 2: The dock**

`apps/web/src/components/auctions/bid-dock.tsx`:

```tsx
'use client';
import { useState, type ReactNode } from 'react';
import { Gavel, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomSheet, BottomSheetContent } from '@/components/ui/bottom-sheet';
import type { DockState } from '@/lib/auctions/dock-state';
import { formatAmount } from '@/lib/format/money';
import { formatClock } from '@/lib/format/remaining';

interface Props {
  state: DockState;
  /** Título de la hoja, p. ej. "Pujar · Toyota Hilux 2019". */
  sheetTitle: string;
  /**
   * El BidPanel de siempre, montado dentro de la hoja. Recibe `close` para
   * pasárselo como onBidPlaced: la hoja se cierra sola cuando la puja entra.
   */
  renderPanel: (close: () => void) => ReactNode;
}

/**
 * Barra fija de puja de la ficha en el celular (spec 2026-09-27 §5.4). Mide
 * lo mismo que la barra de pestañas (64 px + área segura), así el lugar que
 * AppShell deja abajo le sirve igual. Solo por debajo de lg: en escritorio el
 * panel sigue en la columna derecha.
 *
 * El panel de la hoja solo existe con la hoja abierta (Radix desmonta el
 * contenido al cerrar), así que nunca hay dos confirmaciones vivas a la vez;
 * los datos en vivo vienen del onSnapshot del padre, no del panel.
 */
export function BidDock({ state, sheetTitle, renderPanel }: Props) {
  const [open, setOpen] = useState(false);
  if (state.kind === 'hidden') return null;

  return (
    <>
      <section
        aria-label="Barra de puja"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-text-subtle/15 bg-bg-elev pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            {state.kind === 'bid' && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Tu próxima puja
                </p>
                <p className="num-tab truncate text-lg font-extrabold tracking-tight text-text-strong">
                  USD {formatAmount(state.amountUsd)}
                </p>
              </>
            )}
            {state.kind === 'winning' && (
              <>
                <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-success">
                  <Trophy className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  Vas ganando
                </p>
                <p className="num-tab truncate text-lg font-extrabold tracking-tight text-text-strong">
                  USD {formatAmount(state.amountUsd)}
                </p>
              </>
            )}
            {state.kind === 'scheduled' && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Abre en
                </p>
                <p
                  suppressHydrationWarning
                  className="num-tab text-lg font-extrabold tracking-tight text-text-strong"
                >
                  {formatClock(state.opensInMs)}
                </p>
              </>
            )}
          </div>
          {state.kind === 'bid' && (
            <Button
              type="button"
              size="lg"
              className="h-12 shrink-0 px-6 text-base"
              onClick={() => setOpen(true)}
            >
              <Gavel strokeWidth={2.5} aria-hidden="true" /> Pujar
            </Button>
          )}
        </div>
      </section>

      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent title={sheetTitle}>{renderPanel(() => setOpen(false))}</BottomSheetContent>
      </BottomSheet>
    </>
  );
}
```

- [ ] **Step 3: The detail view — mobile order, dock, aside panel hidden only with the dock**

En `apps/web/src/app/[locale]/(abierto)/auctions/[id]/auction-detail-view.tsx`:

(a) Reemplazar:

```tsx
import { FinancingCalculator } from '@/components/auctions/financing-calculator';
import { BidPanel } from './bid-panel';
```

por:

```tsx
import { FinancingCalculator } from '@/components/auctions/financing-calculator';
import { BidDock } from '@/components/auctions/bid-dock';
import { dockState, type DockState } from '@/lib/auctions/dock-state';
import { minimumBid } from '@/lib/auctions/minimum-bid';
import { BidPanel } from './bid-panel';
```

(b) Reemplazar:

```tsx
  financingConfig,
  currencyConfig,
}: {
  locale: string;
  initial: AuctionDetail;
  myUid: string;
  allowManualIncrement: boolean;
  financingConfig: AppConfigSnapshot['financing'];
  currencyConfig: AppConfigSnapshot['currency'];
}) {
```

por:

```tsx
  financingConfig,
  currencyConfig,
  isBuyer,
}: {
  locale: string;
  initial: AuctionDetail;
  myUid: string;
  allowManualIncrement: boolean;
  financingConfig: AppConfigSnapshot['financing'];
  currencyConfig: AppConfigSnapshot['currency'];
  /** Solo el comprador tiene barra fija y hoja; staff y admin ven la ficha como hoy. */
  isBuyer: boolean;
}) {
```

(c) Reemplazar:

```tsx
  const isCritical = isLive && remainingMs > 0 && remainingMs < 60 * 1000;
```

por:

```tsx
  const isCritical = isLive && remainingMs > 0 && remainingMs < 60 * 1000;

  // Barra fija de puja del celular (spec 2026-09-27 §5.4).
  const dock: DockState = isBuyer
    ? dockState(
        { ...live, startsAtMs: initial.startsAtMs },
        myUid,
        now,
        minimumBid({
          currentBid: live.currentBid,
          startingPrice: initial.startingPrice,
          bidIncrement: initial.bidIncrement,
        }),
      )
    : { kind: 'hidden' };
  // Con la barra a la vista, el panel del costado se esconde por debajo de lg
  // y la puja se hace desde la hoja. Sin barra (terminada, o staff) el panel
  // queda visible: es el que muestra "¡Ganaste la subasta!" o la franja de
  // vendida, y en el celular no hay otro lugar donde verlo.
  const asidePanelClass = dock.kind === 'hidden' ? undefined : 'hidden lg:block';
  // Las mismas props para el panel del costado y el de la hoja: que no puedan
  // desalinearse.
  const bidPanelProps = {
    auctionId: initial.id,
    status: live.status,
    endsAtMs: live.endsAtMs,
    startingPrice: initial.startingPrice,
    currentBid: live.currentBid,
    bidCount: live.bidCount,
    bidIncrement: initial.bidIncrement,
    currentBidderUid: live.currentBidderUid,
    outcome: live.outcome,
    winnerUid: live.winnerUid,
    buyNowPrice: live.buyNowPrice,
    make: initial.make,
    model: initial.model,
    year: initial.year,
    myUid,
    allowManualIncrement,
  };
```

(d) Reemplazar el bloque completo que va desde `      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:gap-8">` hasta su `</div>` de cierre, justo antes del comentario `{/* Hidden entirely until the first bid.` (líneas 180–284 del archivo original), por:

```tsx
      {/* En celular el orden es fotos → estado y título → cuenta regresiva →
          precio → datos, igual que la ficha pública (tanda 2A), y la puja pasa
          a la barra fija de abajo (spec 2026-09-27 §5.4). En escritorio la
          columna derecha sigue fija al lado de fotos y datos; la segunda fila
          es 1fr para que, si esa columna es más alta, el espacio sobrante
          quede debajo de los datos y no entre el título y las especificaciones. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] lg:grid-rows-[auto_1fr] gap-6 lg:gap-x-8">
        <div className="space-y-6 min-w-0 lg:col-start-1 lg:row-start-1">
          <AuctionGallery
            images={initial.images}
            alt={vehicleAlt(initial.make, initial.model, initial.year)}
          />

          <header className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusChip status={effectiveStatus} label={tStatus(effectiveStatus)} />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-text-strong leading-[1.05]">
              {initial.make} {initial.model}{' '}
              <span className="num-tab text-text-muted font-light">{initial.year}</span>
            </h1>
          </header>
        </div>

        {/* Sticky bid panel */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-20 self-start space-y-4">
          {/* Countdown — flashy neon-style card */}
          <CountdownCard
            label={t('timeLeft')}
            remainingMs={remainingMs}
            urgent={isUrgent}
            critical={isCritical}
            isLive={isLive}
          />

          {/* Price card */}
          <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 space-y-2 shadow-card">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
              {live.currentBid > 0 ? 'Puja actual' : t('startingPrice')}
            </p>
            {/* "USD" as a smaller prefix on the same line: at text-5xl the
                full "USD 29.000,00" used to break into two lines. */}
            <p className="flex items-baseline gap-2 whitespace-nowrap text-4xl sm:text-5xl font-extrabold tracking-tight num-tab text-text-strong">
              <span className="text-xl sm:text-2xl font-bold text-text-muted">USD</span>
              <BlurNumber value={displayPrice} format={fmtUsd} />
            </p>
            <p className="text-xs text-text-muted num-tab">
              {live.currentBid > 0 && <span>Inicial: USD {fmtUsd(initial.startingPrice)} · </span>}
              {live.bidCount} {live.bidCount === 1 ? 'puja' : 'pujas'} · incremento USD{' '}
              {fmtUsd(initial.bidIncrement)}
            </p>
          </div>

          <div className={asidePanelClass}>
            <BidPanel {...bidPanelProps} />
          </div>
          <FinancingCalculator
            priceUsd={displayPrice}
            config={financingConfig}
            currency={currencyConfig}
            locale={locale}
          />
        </aside>

        <div className="space-y-6 min-w-0 lg:col-start-1 lg:row-start-2">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-3">
              {t('specs')}
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <SpecTile
                label={t('transmission')}
                value={vehicleLabel('transmission', initial.transmission)}
              />
              <SpecTile label={t('fuelType')} value={vehicleLabel('fuelType', initial.fuelType)} />
              {initial.mileage !== null && (
                <SpecTile label={t('mileage')} value={`${formatNumber(initial.mileage)} km`} />
              )}
              <SpecTile
                label={t('condition')}
                value={vehicleLabel('condition', initial.condition)}
              />
              {initial.color && <SpecTile label={t('color')} value={initial.color} />}
              {initial.licensePlate && <SpecTile label="Chapa" value={initial.licensePlate} />}
              {initial.vin && <SpecTile label={t('vin')} value={initial.vin} />}
            </dl>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-2">
              {t('description')}
            </h2>
            <p className="whitespace-pre-line text-text-strong text-base leading-relaxed">
              {description}
            </p>
          </section>
        </div>
      </div>
```

(e) Al final del componente, reemplazar:

```tsx
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
```

por:

```tsx
            </ul>
          </section>
        </>
      )}

      <BidDock
        state={dock}
        sheetTitle={`Pujar · ${vehicleAlt(initial.make, initial.model, initial.year)}`}
        renderPanel={(close) => <BidPanel {...bidPanelProps} onBidPlaced={close} />}
      />
    </div>
  );
}
```

- [ ] **Step 4: The page says whether the viewer is a buyer**

En `apps/web/src/app/[locale]/(abierto)/auctions/[id]/page.tsx`, reemplazar:

```tsx
        financingConfig={config.financing}
        currencyConfig={config.currency}
      />
    </>
  );
}
```

por:

```tsx
        financingConfig={config.financing}
        currencyConfig={config.currency}
        isBuyer={user.role === 'buyer'}
      />
    </>
  );
}
```

La rama pública (sin sesión) no cambia.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test`
Expected: sin errores; la suite sigue verde (incluye `minimum-bid.test.ts` y `win-state.test.ts`, que no se tocaron).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/auctions/bid-dock.tsx \
  "apps/web/src/app/[locale]/(abierto)/auctions/[id]/bid-panel.tsx" \
  "apps/web/src/app/[locale]/(abierto)/auctions/[id]/auction-detail-view.tsx" \
  "apps/web/src/app/[locale]/(abierto)/auctions/[id]/page.tsx"
git commit -m "feat(ficha): en el celular la puja va en una barra fija y se hace en una hoja

Fotos, título, reloj y precio primero; abajo 'Tu próxima puja' con Pujar,
que abre el mismo BidPanel en una hoja y se cierra sola cuando la puja
entra. Vas ganando sin botón: placeBid no deja pujar al mejor postor.
Staff y escritorio sin cambios.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Mis pujas como lista en el celular

**Files:**

- Modify: `apps/web/src/lib/buyer/list-my-bids.ts` (interfaz y mapeo, sobre lo que dejó la Task 6)
- Modify (reescritura completa): `apps/web/src/app/[locale]/(protected)/[audience]/bids/page.tsx`
- Modify (reescritura completa): `apps/web/src/app/[locale]/(protected)/[audience]/bids/my-bids-table.tsx`

**Interfaces:**

- Consumes: `bidOutcome`, `type BidOutcome` (Task 2); `remainingLabel` (Task 2); `minimumBid` de `@/lib/auctions/minimum-bid`; `MyBidEntry.iAmLeading` (Task 6).
- Produces: `MyBidEntry.startingPrice: number`, `MyBidEntry.bidIncrement: number`; `MyBidsTable` con `outbid: MyBidEntry[]`.

- [ ] **Step 1: What "Volver a pujar · USD Y" needs**

En `apps/web/src/lib/buyer/list-my-bids.ts`, reemplazar:

```ts
  iAmLeading: boolean;
  currentBid: number;
  endsAtMs: number;
```

por:

```ts
  iAmLeading: boolean;
  currentBid: number;
  /** Con currentBid, para calcular la próxima puja válida (minimumBid). */
  startingPrice: number;
  bidIncrement: number;
  endsAtMs: number;
```

y reemplazar:

```ts
      currentBid: (a['currentBid'] as number) ?? 0,
      endsAtMs: ms('endsAt'),
```

por:

```ts
      currentBid: (a['currentBid'] as number) ?? 0,
      startingPrice: (a['startingPrice'] as number) ?? 0,
      bidIncrement: (a['bidIncrement'] as number) ?? 0,
      endsAtMs: ms('endsAt'),
```

- [ ] **Step 2: The page filters with `bidOutcome` and collects the outbid ones**

Reemplazar el archivo completo `apps/web/src/app/[locale]/(protected)/[audience]/bids/page.tsx` por:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { listMyBids } from '@/lib/buyer/list-my-bids';
import { bidOutcome } from '@/lib/buyer/my-auction-states';
import { MyBidsTable } from './my-bids-table';

interface Props {
  params: { locale: string; audience: 'retail' | 'wholesale' };
  searchParams?: { tab?: string };
}

export default async function MyBidsPage({ params: { locale, audience }, searchParams }: Props) {
  const user = await getCurrentUser(locale);
  const all = await listMyBids(user.uid);
  const tab = (
    searchParams?.tab === 'outbid' || searchParams?.tab === 'won' || searchParams?.tab === 'lost'
      ? searchParams.tab
      : 'winning'
  ) as 'winning' | 'outbid' | 'won' | 'lost';

  // Deduplicate to one row per auction (keep buyer's latest bid)
  const byAuction = new Map<string, (typeof all)[number]>();
  for (const b of all) {
    if (!byAuction.has(b.auctionId)) byAuction.set(b.auctionId, b);
  }
  const dedup = Array.from(byAuction.values());

  // Pestañas y tarjetas de "Te superaron" con la misma regla (bidOutcome),
  // que mira quién va primero en la subasta y no el `status` de la puja: las
  // pujas viejas y las del seed no lo tienen. En producción es lo mismo que
  // antes, porque placeBid mantiene los dos sincronizados.
  const filtered = dedup.filter((b) => bidOutcome(b) === tab);
  const outbid = dedup
    .filter((b) => bidOutcome(b) === 'outbid')
    .sort((a, b) => a.endsAtMs - b.endsAtMs);

  return (
    <MyBidsTable
      locale={locale}
      audience={audience}
      items={filtered}
      outbid={outbid}
      currentTab={tab}
    />
  );
}
```

- [ ] **Step 3: List on the phone, table from `sm`**

Reemplazar el archivo completo `apps/web/src/app/[locale]/(protected)/[audience]/bids/my-bids-table.tsx` por:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Gavel } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { MyBidEntry } from '@/lib/buyer/list-my-bids';
import { bidOutcome, type BidOutcome } from '@/lib/buyer/my-auction-states';
import { minimumBid } from '@/lib/auctions/minimum-bid';
import { formatAmount } from '@/lib/format/money';
import { formatDateTimePy } from '@/lib/format/date';
import { remainingLabel } from '@/lib/format/remaining';
import { auctionStatusVariant } from '@/lib/format/status-variant';

interface Props {
  locale: string;
  audience: 'retail' | 'wholesale';
  items: MyBidEntry[];
  /** Subastas en vivo donde te superaron, las que cierran antes primero. */
  outbid: MyBidEntry[];
  currentTab: 'winning' | 'outbid' | 'won' | 'lost';
}

const OUTCOME_BADGE: Record<
  BidOutcome,
  { variant: 'success' | 'danger' | 'neutral'; label: string }
> = {
  winning: { variant: 'success', label: 'Ganando' },
  outbid: { variant: 'danger', label: 'Superada' },
  won: { variant: 'success', label: 'Ganada' },
  lost: { variant: 'neutral', label: 'Perdida' },
};

export function MyBidsTable({ locale, audience, items, outbid, currentTab }: Props) {
  const t = useTranslations('buyer.bids');
  const tStatus = useTranslations('buyer.auctions.status');
  const router = useRouter();
  // "cierra en …" cambia de a minutos: con un tic cada 30 s alcanza.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  function setTab(value: string) {
    router.replace(
      `/${locale}/${audience}/bids${value === 'winning' ? '' : `?tab=${value}`}` as `/${string}`,
    );
  }

  // En el teléfono las superadas van arriba como tarjetas y el historial no
  // las repite (spec 2026-09-27 §5.5).
  const outbidIds = new Set(outbid.map((b) => b.auctionId));
  const history = items.filter((b) => !outbidIds.has(b.auctionId));

  return (
    <div className="space-y-5">
      <header className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          {t('title')}
        </h1>
      </header>
      <Tabs value={currentTab} onValueChange={setTab}>
        <TabsList className="overflow-x-auto scrollbar-none">
          <TabsTrigger value="winning">{t('tabs.winning')}</TabsTrigger>
          <TabsTrigger value="outbid">{t('tabs.outbid')}</TabsTrigger>
          <TabsTrigger value="won">{t('tabs.won')}</TabsTrigger>
          <TabsTrigger value="lost">{t('tabs.lost')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Teléfono (< sm): tarjetas de "Te superaron" y el historial. */}
      <div className="space-y-5 sm:hidden">
        {outbid.length > 0 && (
          <ul className="space-y-3">
            {outbid.map((b) => (
              <li key={b.auctionId}>
                <OutbidCard locale={locale} entry={b} nowMs={now} />
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 ? (
          <section aria-labelledby="history-heading" className="space-y-2">
            <h2
              id="history-heading"
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted"
            >
              Historial
            </h2>
            <ul className="divide-y divide-text-subtle/15 overflow-hidden rounded-xl border border-text-subtle/15 bg-bg-elev">
              {history.map((b) => (
                <li key={b.bidId}>
                  <HistoryRow
                    locale={locale}
                    entry={b}
                    statusLabel={tStatus(b.auctionStatus)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          outbid.length === 0 && (
            <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev px-6 py-16 text-center text-sm text-text-muted">
              {t('empty')}
            </div>
          )
        )}
      </div>

      {/* Desde sm, la tabla de siempre. */}
      <div className="hidden sm:block">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev px-6 py-16 text-center text-sm text-text-muted">
            {t('empty')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-text-subtle/15 bg-bg-elev">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.vehicle')}</TableHead>
                  <TableHead>{t('columns.myBid')}</TableHead>
                  <TableHead>{t('columns.currentBid')}</TableHead>
                  <TableHead>{t('columns.status')}</TableHead>
                  <TableHead>{t('columns.endsAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((b) => (
                  <TableRow key={b.bidId}>
                    <TableCell>
                      <Link
                        href={`/${locale}/auctions/${b.auctionId}` as `/${string}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        {b.thumbnailUrl ? (
                          <img
                            src={b.thumbnailUrl}
                            alt=""
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-bg-deep rounded" />
                        )}
                        <span>
                          {b.make} {b.model} {b.year}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="num-tab">USD {formatAmount(b.myBid)}</TableCell>
                    <TableCell className="num-tab">USD {formatAmount(b.currentBid)}</TableCell>
                    <TableCell>
                      <Badge variant={auctionStatusVariant(b.auctionStatus)}>
                        {tStatus(b.auctionStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-text-muted text-sm num-tab">
                      {formatDateTimePy(locale, b.endsAtMs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Una subasta en vivo donde te superaron, con el atajo para volver a pujar. */
function OutbidCard({
  locale,
  entry,
  nowMs,
}: {
  locale: string;
  entry: MyBidEntry;
  nowMs: number;
}) {
  // El mismo mínimo que va a pedir la ficha (y que acepta placeBid).
  const next = minimumBid({
    currentBid: entry.currentBid,
    startingPrice: entry.startingPrice,
    bidIncrement: entry.bidIncrement,
  });
  return (
    <article className="space-y-3 rounded-2xl border border-text-subtle/15 bg-bg-elev p-4 shadow-card">
      <div className="flex items-center gap-3">
        {entry.thumbnailUrl ? (
          <img src={entry.thumbnailUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-xl bg-bg-deep" />
        )}
        <div className="min-w-0">
          <Badge variant="danger" className="px-2 py-0 text-[10px] uppercase tracking-[0.06em]">
            Te superaron
          </Badge>
          <p className="mt-1 truncate font-bold tracking-tight text-text-strong">
            {entry.make} {entry.model} <span className="num-tab font-normal">{entry.year}</span>
          </p>
          <p suppressHydrationWarning className="num-tab text-xs text-text-muted">
            Ahora USD {formatAmount(entry.currentBid)} · cierra en{' '}
            {remainingLabel(entry.endsAtMs - nowMs)}
          </p>
        </div>
      </div>
      <Link
        href={`/${locale}/auctions/${entry.auctionId}` as `/${string}`}
        className={
          'flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-text-strong text-sm font-semibold text-bg-base ' +
          '[touch-action:manipulation] transition-opacity duration-200 hover:opacity-90 ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
          'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
        }
      >
        <Gavel className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        Volver a pujar · USD {formatAmount(next)}
      </Link>
    </article>
  );
}

function HistoryRow({
  locale,
  entry,
  statusLabel,
}: {
  locale: string;
  entry: MyBidEntry;
  statusLabel: string;
}) {
  const outcome = bidOutcome(entry);
  const badge = outcome ? OUTCOME_BADGE[outcome] : null;
  return (
    <Link
      href={`/${locale}/auctions/${entry.auctionId}` as `/${string}`}
      className="flex items-center gap-3 p-3 transition-colors hover:bg-bg-deep/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-strong/40"
    >
      {entry.thumbnailUrl ? (
        <img src={entry.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-bg-deep" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-strong">
          {entry.make} {entry.model} {entry.year}
        </p>
        <p className="num-tab text-xs text-text-muted">
          Tu puja USD {formatAmount(entry.myBid)} · {formatDateTimePy(locale, entry.bidCreatedAtMs)}
        </p>
      </div>
      {badge ? (
        <Badge variant={badge.variant} className="shrink-0">
          {badge.label}
        </Badge>
      ) : (
        // Programada o cancelada: sin resultado propio, se muestra el estado.
        <Badge variant={auctionStatusVariant(entry.auctionStatus)} className="shrink-0">
          {statusLabel}
        </Badge>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/buyer/list-my-bids.ts \
  "apps/web/src/app/[locale]/(protected)/[audience]/bids/page.tsx" \
  "apps/web/src/app/[locale]/(protected)/[audience]/bids/my-bids-table.tsx"
git commit -m "feat(mis-pujas): en el celular, las superadas arriba y el historial en lista

Cada subasta donde te superaron trae 'Volver a pujar' con el mínimo que
acepta el servidor. Las pestañas usan quién va primero en la subasta y no
el estado de la puja, que falta en las viejas. Tabla igual desde sm.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación visual y de punta a punta

Todo contra emuladores; nada toca producción ni Netlify.

**Files:**

- Create: `functions/scripts/capturas-celular.mjs`
- Modify: `DESIGN.md` (una oración)

**Interfaces:**

- Consumes: las cuentas y subastas de `functions/scripts/seed-demo-video.ts` (datos de emulador): `demo.comprador@renew.test` (Carla, minorista), `demo.rival@renew.test` (Rodrigo, minorista), `demo.staff@renew.test`, `demo.admin@renew.test`, contraseña `Demo123456`; `demo-auction-0` programada (abre en 2 h), `demo-auction-1` en vivo sin pujas (inicial 9.000, incremento 250 → mínimo 9.500), `demo-auction-2` en vivo con Compra ya 21.000, `demo-auction-3` en vivo con pujas (Carla gana con 29.000; Rodrigo superado), `demo-auction-4` adjudicada a Carla, `demo-auction-5` cerrada sin reserva.
- Produces: capturas PNG en `OUT_DIR` (por defecto `/tmp/capturas-celular`) y un informe ✓/✗ por consola.

- [ ] **Step 1: Create the screenshot script**

`functions/scripts/capturas-celular.mjs`:

```js
// Capturas del celular del comprador (spec 2026-09-27 §7), SOLO contra emuladores.
//
//   cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   GCLOUD_PROJECT=carbid-staging node scripts/capturas-celular.mjs
//
// Necesita: emuladores auth, firestore y functions (con ENFORCE_APP_CHECK=false)
// con seed-demo-video cargado, y `next start -p 3016` de apps/web armado con
// NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true. Deja los PNG en OUT_DIR.
//
// La última parte hace una puja REAL en el emulador (demo-auction-1): para
// volver a correrlo, reiniciar los emuladores y volver a cargar el seed.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('REFUSING TO RUN: faltan FIRESTORE_EMULATOR_HOST y FIREBASE_AUTH_EMULATOR_HOST.');
  process.exit(1);
}

// puppeteer-core no es dependencia del repo: se toma del lighthouse que ya
// bajó npx, para no sumar un navegador a pnpm-lock solo por las capturas.
const require = createRequire(
  '/home/croman/.npm/_npx/5390d7d89c0de19d/node_modules/lighthouse/package.json',
);
const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:3016';
const OUT = process.env.OUT_DIR ?? '/tmp/capturas-celular';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
// Pixel y analytics fuera: no hay nada que medir en una captura y demoran networkidle.
const BLOCKED = ['facebook.net', 'facebook.com/tr', 'googletagmanager', 'google-analytics'];
const PASSWORD = 'Demo123456';

mkdirSync(OUT, { recursive: true });
initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'carbid-staging' });

let failures = 0;
function check(ok, label, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function sessionFor(email) {
  const r = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const { idToken } = await r.json();
  return getAuth().createSessionCookie(idToken, { expiresIn: 3_600_000 });
}

async function openPage(browser, { width, scheme, session }) {
  const context = await browser.createBrowserContext();
  const mobile = width < 768;
  const page = await context.newPage();
  await page.setViewport({
    width,
    height: mobile ? 844 : 900,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  // Sin localStorage.theme en un contexto nuevo: next-themes usa el del sistema.
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.setRequestInterception(true);
  page.on('request', (req) =>
    BLOCKED.some((b) => req.url().includes(b)) ? req.abort() : req.continue(),
  );
  const cookies = [{ name: 'renew_cookie_consent', value: 'accepted', domain: 'localhost', path: '/' }];
  if (session) {
    cookies.push({ name: '__session', value: session, domain: 'localhost', path: '/', httpOnly: true });
  }
  await context.setCookie(...cookies);
  return { page, context };
}

async function go(page, path) {
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle0' });
  return res?.status() ?? 0;
}

async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
  console.log(`  → ${name}.png`);
}

// Visible de verdad: sin rectángulos si el elemento o un ancestro tiene
// display:none (lg:hidden, sm:hidden). Sirve también para los fixed.
const visible = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !!el && el.getClientRects().length > 0;
  }, selector);

// innerText respeta text-transform: las píldoras y los rótulos en mayúsculas
// se comparan sin distinguir mayúsculas. innerText y no textContent: el
// segundo trae también el payload RSC de los <script> y encontraría todo.

const DOCK = 'section[aria-label="Barra de puja"]';
const TABS = 'nav[aria-label="Principal"].fixed';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox'],
  });
  const buyer = await sessionFor('demo.comprador@renew.test');
  const rival = await sessionFor('demo.rival@renew.test');
  const staff = await sessionFor('demo.staff@renew.test');
  const admin = await sessionFor('demo.admin@renew.test');
  // Para el Lighthouse con sesión del Step 5 (cookie del emulador, sin valor afuera).
  writeFileSync(join(OUT, 'buyer-session.txt'), buyer);

  try {
    // 1) Comprador a 390 px, claro y oscuro.
    for (const scheme of ['light', 'dark']) {
      const { page, context } = await openPage(browser, { width: 390, scheme, session: buyer });

      check((await go(page, '/es/retail')) === 200, `[${scheme}] inicio abre`);
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      check(dark === (scheme === 'dark'), `[${scheme}] el tema sigue al teléfono`);
      check(await visible(page, TABS), `[${scheme}] barra de pestañas visible`);
      check(
        (await page.$(`${TABS} a[aria-current="page"]`)) !== null,
        `[${scheme}] pestaña activa con aria-current`,
      );
      check((await page.$('button[aria-label="Abrir menú"]')) === null, `[${scheme}] sin hamburguesa`);
      const pb = await page.evaluate(
        () => parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom),
      );
      check(pb >= 64, `[${scheme}] el contenido deja lugar a la barra`, `${pb}px`);
      const home = await page.evaluate(() => document.body.innerText);
      check(/la próxima que cierra/i.test(home), `[${scheme}] tarjeta de la próxima que cierra`);
      check(home.includes('Vas ganando · USD 29.000'), `[${scheme}] va ganando la Tesla`);
      check(home.includes('USD 2.900'), `[${scheme}] seña del 10 % de 29.000`);
      await shot(page, `inicio-390-${scheme}`);

      check((await go(page, '/es/auctions')) === 200, `[${scheme}] catálogo abre`);
      const catalog = await page.evaluate(() => document.body.innerText);
      check(/compra ya usd 21\.000/i.test(catalog), `[${scheme}] píldora Compra ya`);
      check(/sin pujas/i.test(catalog), `[${scheme}] píldora Sin pujas`);
      check(/vas ganando/i.test(catalog), `[${scheme}] píldora Vas ganando`);
      await shot(page, `catalogo-390-${scheme}`);
      await page.type('input[type="search"]', 'amarok');
      const filtered = await page.evaluate(() => document.body.innerText);
      check(
        filtered.includes('Amarok') && !filtered.includes('Civic'),
        `[${scheme}] la búsqueda filtra sin tildes ni mayúsculas`,
      );
      await shot(page, `catalogo-busqueda-390-${scheme}`, false);

      check((await go(page, '/es/auctions/demo-auction-1')) === 200, `[${scheme}] ficha abre`);
      check(!(await visible(page, TABS)), `[${scheme}] sin barra de pestañas en la ficha`);
      const dockText = await page.$eval(DOCK, (el) => el.textContent ?? '');
      check(dockText.includes('USD 9.500'), `[${scheme}] dock con la próxima puja`, dockText);
      await shot(page, `ficha-dock-390-${scheme}`);

      await page.click(`${DOCK} button`);
      await page.waitForSelector('[role="dialog"]', { visible: true });
      await new Promise((r) => setTimeout(r, 400)); // termina la animación de entrada
      const focusInside = await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      );
      check(focusInside, `[${scheme}] el foco entra a la hoja`);
      for (let i = 0; i < 20; i++) await page.keyboard.press('Tab');
      const stillInside = await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      );
      check(stillInside, `[${scheme}] el foco queda atrapado en la hoja`);
      await shot(page, `hoja-390-${scheme}`, false);
      await page.keyboard.press('Escape');

      await go(page, '/es/auctions/demo-auction-3');
      const winText = await page.$eval(DOCK, (el) => el.textContent ?? '');
      check(
        winText.includes('Vas ganando') && winText.includes('29.000'),
        `[${scheme}] dock "Vas ganando" sin botón`,
      );
      check((await page.$(`${DOCK} button`)) === null, `[${scheme}] sin "Subir puja"`);
      await shot(page, `ficha-ganando-390-${scheme}`);

      await go(page, '/es/auctions/demo-auction-0');
      check(
        (await page.$eval(DOCK, (el) => el.textContent ?? '')).includes('Abre en'),
        `[${scheme}] dock de programada`,
      );

      await go(page, '/es/auctions/demo-auction-4');
      check((await page.$(DOCK)) === null, `[${scheme}] sin dock en la terminada`);
      check(
        (await page.evaluate(() => document.body.innerText)).includes('¡Ganaste la subasta!'),
        `[${scheme}] el resultado se ve en el celular`,
      );
      await shot(page, `ficha-ganada-390-${scheme}`);

      check((await go(page, '/es/retail/bids')) === 200, `[${scheme}] Mis pujas abre`);
      await shot(page, `mis-pujas-390-${scheme}`);
      await context.close();

      // Rodrigo: superado en la Tesla, para ver la tarjeta "Te superaron".
      const r = await openPage(browser, { width: 390, scheme, session: rival });
      await go(r.page, '/es/retail/bids?tab=lost');
      const bids = await r.page.evaluate(() => document.body.innerText);
      check(/te superaron/i.test(bids), `[${scheme}] tarjeta de superada`);
      check(bids.includes('Volver a pujar · USD 30.000'), `[${scheme}] con el mínimo siguiente`);
      await shot(r.page, `mis-pujas-superada-390-${scheme}`);
      await r.context.close();
    }

    // 2) Escritorio a 1280 px: catálogo, ficha y Mis pujas como antes.
    {
      const { page, context } = await openPage(browser, { width: 1280, scheme: 'light', session: buyer });
      await go(page, '/es/auctions');
      check(!(await visible(page, TABS)), '[1280] sin barra de pestañas');
      check(!(await visible(page, 'input[type="search"]')), '[1280] sin buscador del celular');
      await shot(page, 'catalogo-1280');
      await go(page, '/es/auctions/demo-auction-1');
      check(!(await visible(page, DOCK)), '[1280] sin dock');
      check(
        /mínimo/i.test(await page.evaluate(() => document.body.innerText)),
        '[1280] el panel de puja sigue en la columna derecha',
      );
      await shot(page, 'ficha-1280');
      await go(page, '/es/retail/bids');
      check((await page.$('table')) !== null, '[1280] Mis pujas sigue en tabla');
      await shot(page, 'mis-pujas-1280');
      await go(page, '/es/retail');
      await shot(page, 'inicio-1280');
      await context.close();
    }

    // 3) Staff y admin en oscuro (riesgo de la spec §9): siguen con su cajón.
    for (const [who, session, paths] of [
      ['staff', staff, ['/es/staff', '/es/staff/auctions']],
      ['admin', admin, ['/es/admin', '/es/admin/users']],
    ]) {
      for (const width of [390, 1280]) {
        const { page, context } = await openPage(browser, { width, scheme: 'dark', session });
        for (const path of paths) {
          check((await go(page, path)) === 200, `[${who} ${width}] ${path} abre`);
          await shot(page, `${who}${path.replaceAll('/', '-')}-${width}-dark`);
        }
        if (width === 390) {
          check(
            (await page.$('button[aria-label="Abrir menú"]')) !== null,
            `[${who}] conserva la hamburguesa`,
          );
          check((await page.$(TABS)) === null, `[${who}] sin barra de pestañas`);
        }
        await context.close();
      }
    }

    // 4) Una puja real desde la hoja (functions en el emulador).
    {
      const { page, context } = await openPage(browser, { width: 390, scheme: 'light', session: buyer });
      await go(page, '/es/auctions/demo-auction-1');
      await page.click(`${DOCK} button`);
      await page.waitForSelector('[role="dialog"]', { visible: true });
      await page.locator('[role="dialog"] button::-p-text(Mínimo)').click();
      await page.locator('button::-p-text(Confirmar puja)').click();
      await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0, {
        timeout: 20_000,
      });
      check(true, 'la hoja se cierra sola al confirmar la puja');
      await page.waitForFunction(
        (sel) => document.querySelector(sel)?.textContent?.includes('Vas ganando'),
        { timeout: 20_000 },
        DOCK,
      );
      check(true, 'el dock pasa a "Vas ganando"');
      const price = await page.evaluate(() => document.body.innerText);
      check(price.includes('9.500'), 'el precio subió a 9.500');
      const unlocked = await page.evaluate(
        () =>
          document.body.style.pointerEvents !== 'none' &&
          !document.body.hasAttribute('data-scroll-locked'),
      );
      check(unlocked, 'la página queda usable (sin bloqueo de clics ni scroll)');
      await shot(page, 'ficha-despues-de-pujar-390');
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${failures === 0 ? 'Todo bien' : `${failures} fallas`} · capturas en ${OUT}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Bring everything up locally**

Terminal 1 (raíz del repo):

```bash
pnpm --filter @carbid/functions build
ENFORCE_APP_CHECK=false npx -y firebase-tools@latest emulators:start --only auth,firestore,functions --project carbid-staging
```

Terminal 2:

```bash
cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/seed-demo-video.ts
```

Terminal 3:

```bash
cd apps/web && NEXT_PUBLIC_SENTRY_DSN= NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true NEXT_PUBLIC_FIREBASE_PROJECT_ID=carbid-staging npx next build && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging GOOGLE_CLOUD_PROJECT=carbid-staging NEXT_PUBLIC_FIREBASE_PROJECT_ID=carbid-staging npx next start -p 3016
```

Expected: build sin errores; `next start` escuchando en 3016.

- [ ] **Step 3: Run the screenshots and checks**

Terminal 4:

```bash
cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging node scripts/capturas-celular.mjs
```

Expected: todas las líneas con ✓ y "Todo bien". Si falla solo la parte 4 (puja real), mirar la terminal 1: sin el emulador de functions o sin `ENFORCE_APP_CHECK=false`, `placeBid` no responde.

- [ ] **Step 4: Look at every screenshot**

Abrir cada PNG de `/tmp/capturas-celular` (con la herramienta de lectura de imágenes) y confirmar:

- `inicio-390-*`: saludo "Hola, Carla" + "Tu actividad de hoy"; tarjeta de tres números con "Vas ganando" en verde; "Si ganás todo USD 29.000" y "Seña a pagar USD 2.900 · 10 % en 24 h al ganar"; tarjeta en tinta con la Tesla, reloj HH:MM:SS, barra de progreso y "Cierra HH:MM"; fila "Cierran pronto" deslizable; nada tapado por la barra de pestañas; en oscuro, superficies oscuras y texto legible.
- `catalogo-390-*`: control segmentado de tres que entra entero (sin cortar "Cierran pronto"), buscador debajo, filas con miniatura 104×84 y píldoras con los tonos de `Badge`.
- `ficha-dock-390-*`: fotos → estado y título → reloj → precio → datos; barra fija abajo con "Tu próxima puja USD 9.500" y **Pujar**; sin barra de pestañas.
- `hoja-390-*`: hoja con esquinas de 24 px arriba, agarradera, título "Pujar · Honda Civic 2020", el panel de puja entero con scroll propio y sin desenfoque detrás (solo el velo negro).
- `ficha-ganando-390-*`, `ficha-ganada-390-*`: dock "Vas ganando USD 29.000" sin botón; en la ganada, sin dock y con "¡Ganaste la subasta!" visible.
- `mis-pujas-*`: tarjeta "Te superaron" con el botón ancho "Volver a pujar · USD 30.000" (Rodrigo) y el "Historial" con Ganando/Superada/Ganada/Perdida.
- `*-1280`: catálogo, ficha y Mis pujas iguales a antes de este plan; el Inicio en dos columnas.
- `staff-*`, `admin-*` en oscuro: legibles, con cajón y hamburguesa a 390 px, sin barra de pestañas.

Si algo se ve mal, corregir en la Task que corresponde, volver a correr su verificación y este Step.

- [ ] **Step 5: Public page unchanged, accessibility with session**

```bash
cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/verify-public-auctions.ts
```

Expected: todas ✓ y "Todo bien" (la ficha pública no cambió). Este script mira `demo-auction-3` con sesión y sin la tarjeta pública; la puja de la parte 4 fue en `demo-auction-1`, no lo afecta.

```bash
S=$(cat /tmp/capturas-celular/buyer-session.txt)
for p in retail auctions retail/bids; do
  CHROME_PATH=/usr/bin/google-chrome npx -y lighthouse@12 "http://localhost:3016/es/$p" --quiet \
    --chrome-flags="--headless=new --no-sandbox" --only-categories=accessibility --form-factor=mobile \
    --extra-headers="{\"Cookie\":\"__session=$S; renew_cookie_consent=accepted\"}" \
    --output=json --output-path="/tmp/lh-celular-${p//\//-}.json"
  node -e "const r=require('/tmp/lh-celular-${p//\//-}.json'); console.log('$p', Math.round(r.categories.accessibility.score*100), r.audits['color-contrast'].score)"
done
```

Expected: accesibilidad ≥ 95 y `color-contrast` en `1` en las tres.

- [ ] **Step 6: Final checks, DESIGN.md and commit**

En `DESIGN.md`, reemplazar:

```md
instead of restyling each child. Light is the default theme. The old `glass-*`, `ink-mesh` and
```

por:

```md
instead of restyling each child. The theme follows the phone/OS (`defaultTheme="system"` since
2026-09-27); a theme picked by hand is kept. The old `glass-*`, `ink-mesh` and
```

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test && pnpm exec prettier --check "apps/web/src/**/*.{ts,tsx}" functions/scripts/capturas-celular.mjs DESIGN.md`
Expected: todo limpio (si prettier marca algo, `pnpm exec prettier --write` sobre esos archivos y volver a correr).

```bash
git add functions/scripts/capturas-celular.mjs DESIGN.md
git commit -m "test(celular): capturas a 390 y 1280 en claro y oscuro, y una puja real desde la hoja

Todo contra emuladores. DESIGN.md: el tema ahora sigue al sistema.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Si los Steps anteriores obligaron a retocar archivos de otras Tasks, esos arreglos van en commits propios (`fix(celular): …`) con sus rutas explícitas, nunca con `git add -A`.

**No hacer `git push`:** el deploy (un push a `main`, 15 créditos de Netlify) lo decide Croman. Antes de publicar conviene mostrarle las capturas de staff y admin en oscuro (riesgo §9 de la spec).

---

## Autorrevisión

**Cobertura de la spec:**

| Spec | Task |
| --- | --- |
| §2 Tema del sistema | 1 (y capturas de staff/admin en oscuro en 9) |
| §2 y §3 Barra de pestañas: solo comprador, < lg, oculta en la ficha | 4 |
| §3 `BottomSheet` (Radix, 24 px, agarradera, 88dvh, área segura, slide-in ease-out) | 3 |
| §3 `BidDock` | 7 |
| §4 AppShell (monta la barra, `pb`) y Topbar (sin hamburguesa ni cajón para el comprador) | 4 |
| §5.2 Inicio (saludo, números, próxima que cierra, compromiso, cierran pronto, límites 20/6) | 5 (+ `myState` en las tarjetas en 6) |
| §5.3 Catálogo (segmentado, búsqueda, filas < sm, estado propio, corazón) | 6 |
| §5.4 Ficha (orden, dock, hoja con el mismo `BidPanel`, se cierra sola, sin barra de pestañas) | 7 (con la resolución del punto 1 de "Antes de empezar") |
| §5.5 Mis pujas (superadas arriba, Historial, tabla desde sm) | 8 |
| §5.6 Ganadas (solo la barra) | 4 |
| §6 Lógica pura con tests | 2 |
| §7 Verificación (tests, typecheck, lint, capturas, puja real, verify-public, accesibilidad) | 2 a 8 (tests y checks) y 9 |
| §8 Fuera de alcance | Respetado: visitante y staff sin cambios de layout, sin gesto de deslizar |
| §9 Riesgos | 9 (staff/admin en oscuro), 7 (panel de la hoja solo montado abierto), 6 (lecturas) |

**Consistencia de tipos:** `HomeStats`/`HomeWinningItem`/`HomeClosingItem` (Task 2) calzan por estructura con `BuyerStats` una vez que la Task 5 agrega `myBidAuctionIds`. `BidOutcomeInput` (Task 2) calza con `MyBidEntry` desde la Task 6 (`iAmLeading`). `DockState` usa `kind: 'winning'` en las Tasks 2 y 7 (no `raise`). `ownStatePill` recibe `PublicAuction` con `buyNowPrice` (Task 6, Step 1) antes de que la usen `AuctionCard` y `AuctionRow`. `onBidPlaced?: (() => void) | undefined` (Task 7) y `myState?: MyAuctionState | undefined` (Task 6) respetan `exactOptionalPropertyTypes`.

<!-- prettier-ignore-end -->
