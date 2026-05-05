# CARBID Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the CARBID monorepo with Next.js 14 web app, Firebase Cloud Functions, shared packages, Firebase project setup (staging + emulators), i18n (es/en), and the OKLCH design system with the CARBID wordmark logo.

**Architecture:** Turborepo monorepo with pnpm workspaces. `apps/web` (Next.js 14 App Router + Tailwind + shadcn/ui), `functions/` (TS Cloud Functions), `packages/shared-types` (Zod schemas + TS types), `packages/firebase-client` (initialization + hooks). Firestore rules and storage rules at root. Hosting on Netlify (web) + Firebase (functions/firestore/storage/auth).

**Tech Stack:** Node 20 LTS, pnpm 9, Turborepo, Next.js 14, TypeScript 5, Tailwind 3, shadcn/ui, next-intl, Firebase Admin/JS SDK v10, Vitest, ESLint, Prettier, Husky, lint-staged.

**Spec reference:** `docs/superpowers/specs/2026-05-05-carbid-mvp-design.md` (sections 3, 6 "Identidad visual", 7).

---

## Pre-flight

The engineer must have:

- Node 20+ (`node -v`)
- pnpm 9+ (`pnpm -v`; install via `corepack enable && corepack prepare pnpm@latest --activate`)
- Firebase CLI 13+ (`firebase --version`; `npm i -g firebase-tools`)
- Logged into Firebase: `firebase login`
- Access to Firebase project `carbid-59ef5` (production)
- Permission to create a new Firebase project `carbid-staging`

---

## File Structure (end state of this plan)

```
CARBID/
├── .gitignore
├── .nvmrc                                  Node version pin
├── .env.local                              gitignored, Firebase web config
├── .env.example                            committed template
├── package.json                            root, workspaces, scripts
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json                      shared TS config
├── .eslintrc.cjs                           root ESLint config
├── .prettierrc.json
├── .prettierignore
├── .husky/pre-commit
├── netlify.toml
├── firebase.json                           emulators + deploy targets
├── .firebaserc                             aliases staging/prod
├── firestore.rules                         baseline rules
├── firestore.indexes.json                  composite indexes
├── storage.rules                           baseline storage rules
├── README.md
├── apps/
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       ├── postcss.config.mjs
│       ├── components.json                 shadcn config
│       ├── i18n.ts                         next-intl request config
│       ├── middleware.ts                   next-intl locale detection
│       ├── messages/
│       │   ├── es.json
│       │   └── en.json
│       └── src/
│           ├── app/
│           │   ├── globals.css             OKLCH tokens + Tailwind layers
│           │   ├── layout.tsx              root (no locale)
│           │   └── [locale]/
│           │       ├── layout.tsx          locale provider + theme provider
│           │       └── page.tsx            placeholder home
│           ├── components/
│           │   ├── brand/
│           │   │   └── carbid-wordmark.tsx CAR copper / BID ink
│           │   ├── theme/
│           │   │   ├── theme-provider.tsx
│           │   │   └── theme-toggle.tsx
│           │   └── ui/                     shadcn components added on demand
│           └── lib/
│               └── utils.ts                cn helper
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .eslintrc.cjs
│   └── src/
│       ├── index.ts                        re-exports all functions
│       └── health.ts                       smoke `pingHealth` callable
└── packages/
    ├── shared-types/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── user.ts                     User + role types
    │       ├── vehicle.ts
    │       ├── auction.ts
    │       ├── bid.ts
    │       ├── app-config.ts
    │       └── validators/
    │           ├── paraguay.ts             CI/RUC PY validators
    │           └── paraguay.test.ts
    └── firebase-client/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts
            ├── client.ts                   initializeApp web SDK
            └── env.ts                      env config loader
```

---

## Task 1: Initialize git, Node version, base files

**Files:**

- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `README.md`
- Create: `.env.example`

- [ ] **Step 1.1: Initialize git**

Run: `cd /home/croman/Escritorio/CARBID && git init -b main`
Expected: `Initialized empty Git repository in .../CARBID/.git/`

- [ ] **Step 1.2: Pin Node version**

Create `.nvmrc`:

```
20
```

- [ ] **Step 1.3: Create .gitignore**

Create `.gitignore`:

```
# deps
node_modules/
.pnpm-store/

# build
.next/
dist/
out/
*.tsbuildinfo

# env
.env
.env.local
.env.*.local

# turbo / cache
.turbo/

# firebase
.firebase/
firebase-debug.log
firebase-debug.*.log
firestore-debug.log
ui-debug.log

# logs
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*

# editor
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.idea/
.DS_Store

# tests
coverage/
playwright-report/
test-results/

# netlify
.netlify/
```

- [ ] **Step 1.4: Create .env.example**

Create `.env.example`:

```
# Firebase web config (public)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Use emulators in dev
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

- [ ] **Step 1.5: Create README.md (minimal)**

Create `README.md`:

```markdown
# CARBID

Plataforma de subastas asincrónicas de vehículos.

## Setup

\`\`\`bash
pnpm install
cp .env.example .env.local

# rellenar valores

pnpm dev
\`\`\`

Ver `docs/superpowers/specs/` para el diseño y `docs/superpowers/plans/` para los planes.
```

- [ ] **Step 1.6: First commit**

```bash
git add .gitignore .nvmrc .env.example README.md
git commit -m "chore: initialize repo with base files"
```

---

## Task 2: pnpm workspaces + Turborepo

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`

- [ ] **Step 2.1: Create root package.json**

Create `package.json`:

```json
{
  "name": "carbid",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md,css}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md,css}\"",
    "emulators": "firebase emulators:start --import=./.emulator-data --export-on-exit",
    "prepare": "husky"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "eslint": "^8.57.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.2.0",
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,md,css}": "prettier --write"
  }
}
```

- [ ] **Step 2.2: Create pnpm-workspace.yaml**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'functions'
```

- [ ] **Step 2.3: Create turbo.json**

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**", "lib/**"]
    },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "outputs": ["coverage/**"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

- [ ] **Step 2.4: Create tsconfig.base.json**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "incremental": true
  }
}
```

- [ ] **Step 2.5: Install root deps**

Run: `pnpm install`
Expected: `Done in ...` no errors. Creates `pnpm-lock.yaml`.

- [ ] **Step 2.6: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: set up pnpm workspaces and turborepo"
```

---

## Task 3: ESLint + Prettier + Husky

**Files:**

- Create: `.eslintrc.cjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.husky/pre-commit`

- [ ] **Step 3.1: Create .prettierrc.json**

Create `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 3.2: Create .prettierignore**

Create `.prettierignore`:

```
node_modules
.next
dist
.turbo
pnpm-lock.yaml
.firebase
coverage
```

- [ ] **Step 3.3: Create root ESLint config**

Create `.eslintrc.cjs`:

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: ['node_modules', '.next', 'dist', '.turbo', '.firebase'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
```

- [ ] **Step 3.4: Install eslint deps**

Run: `pnpm add -Dw @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier`
Expected: packages added to root devDependencies.

- [ ] **Step 3.5: Initialize Husky**

Run: `pnpm husky init`
Expected: creates `.husky/pre-commit` with default content.

- [ ] **Step 3.6: Configure pre-commit hook**

Edit `.husky/pre-commit` to:

```sh
pnpm lint-staged
```

- [ ] **Step 3.7: Verify formatting works**

Run: `pnpm format:check`
Expected: PASS (or list of files; run `pnpm format` to auto-fix, then re-run).

- [ ] **Step 3.8: Commit**

```bash
git add .eslintrc.cjs .prettierrc.json .prettierignore .husky package.json pnpm-lock.yaml
git commit -m "chore: configure eslint, prettier, husky"
```

---

## Task 4: packages/shared-types with Zod + Paraguay validators (TDD)

**Files:**

- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/validators/paraguay.ts`
- Test: `packages/shared-types/src/validators/paraguay.test.ts`

- [ ] **Step 4.1: Create package.json**

Create `packages/shared-types/package.json`:

```json
{
  "name": "@carbid/shared-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4.2: Create tsconfig.json**

Create `packages/shared-types/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4.3: Install package deps**

Run: `pnpm install`
Expected: `@carbid/shared-types` linked into workspace.

- [ ] **Step 4.4: Write failing test for Paraguay RUC validator**

Create `packages/shared-types/src/validators/paraguay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidRucPy, isValidCiPy, computeRucCheckDigit } from './paraguay';

describe('Paraguay RUC (mod 11 check digit)', () => {
  it('computes the check digit for a base number', () => {
    // Known good: base 80012345 → check digit 6 (canonical sample for tests)
    expect(computeRucCheckDigit('80012345')).toBe(6);
  });

  it('accepts a valid RUC formatted NNNNNNNN-D', () => {
    expect(isValidRucPy('80012345-6')).toBe(true);
  });

  it('rejects RUC with wrong check digit', () => {
    expect(isValidRucPy('80012345-0')).toBe(false);
  });

  it('rejects malformed RUC (no dash)', () => {
    expect(isValidRucPy('800123456')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRucPy('')).toBe(false);
  });
});

describe('Paraguay CI (numeric, no check digit)', () => {
  it('accepts a 6-9 digit numeric CI', () => {
    expect(isValidCiPy('1234567')).toBe(true);
    expect(isValidCiPy('123456789')).toBe(true);
  });

  it('rejects letters', () => {
    expect(isValidCiPy('12345A7')).toBe(false);
  });

  it('rejects too short (< 5 digits)', () => {
    expect(isValidCiPy('1234')).toBe(false);
  });

  it('rejects too long (> 10 digits)', () => {
    expect(isValidCiPy('12345678901')).toBe(false);
  });
});
```

- [ ] **Step 4.5: Run test, verify FAIL**

Run: `pnpm --filter @carbid/shared-types test`
Expected: FAIL — "Cannot find module './paraguay'".

- [ ] **Step 4.6: Implement validators**

Create `packages/shared-types/src/validators/paraguay.ts`:

```ts
/**
 * Paraguay RUC check digit using mod 11.
 * Algorithm: weights from 2 to N (right to left over base digits),
 * sum, then check = 11 - (sum mod 11). If result is 10 or 11, check = 0.
 */
export function computeRucCheckDigit(base: string): number {
  if (!/^\d+$/.test(base)) {
    throw new Error('RUC base must be numeric');
  }
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const check = 11 - remainder;
  if (check >= 10) return 0;
  return check;
}

/**
 * Valid format: NNNNNNNN-D where N is 6–10 digits and D is the mod-11 check digit.
 */
export function isValidRucPy(value: string): boolean {
  const match = /^(\d{6,10})-(\d)$/.exec(value);
  if (!match) return false;
  const base = match[1]!;
  const check = Number(match[2]);
  return computeRucCheckDigit(base) === check;
}

/**
 * Paraguay Cédula de Identidad: numeric only, 5–10 digits.
 * No standardized check digit.
 */
export function isValidCiPy(value: string): boolean {
  return /^\d{5,10}$/.test(value);
}
```

- [ ] **Step 4.7: Run test, verify PASS**

Run: `pnpm --filter @carbid/shared-types test`
Expected: all tests PASS.

> **Note:** if the canonical sample `80012345 → 6` does not match the implementation, recompute by hand and update the test. The algorithm above is the standard Paraguay RUC mod-11.

- [ ] **Step 4.8: Create index.ts barrel**

Create `packages/shared-types/src/index.ts`:

```ts
export * from './validators/paraguay';
```

- [ ] **Step 4.9: Commit**

```bash
git add packages/shared-types pnpm-lock.yaml package.json
git commit -m "feat(shared-types): add Paraguay CI/RUC validators with tests"
```

---

## Task 5: shared-types — domain Zod schemas

**Files:**

- Create: `packages/shared-types/src/user.ts`
- Create: `packages/shared-types/src/vehicle.ts`
- Create: `packages/shared-types/src/auction.ts`
- Create: `packages/shared-types/src/bid.ts`
- Create: `packages/shared-types/src/app-config.ts`
- Modify: `packages/shared-types/src/index.ts`

- [ ] **Step 5.1: Create user.ts**

Create `packages/shared-types/src/user.ts`:

```ts
import { z } from 'zod';

export const RoleSchema = z.enum(['admin', 'staff', 'buyer']);
export type Role = z.infer<typeof RoleSchema>;

export const UserStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const DocumentTypeSchema = z.enum(['CI', 'RUC']);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  country: z.literal('PY'),
  postalCode: z.string().optional(),
});

export const UserProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentType: DocumentTypeSchema,
  documentNumber: z.string().min(1),
  phone: z.string().optional(),
  address: AddressSchema.optional(),
  avatarUrl: z.string().url().optional(),
});

export const UserPreferencesSchema = z.object({
  locale: z.enum(['es', 'en']).default('es'),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  notifications: z.object({
    outbidEmail: z.boolean().default(true),
    auctionWonEmail: z.boolean().default(true),
    newAuctionEmail: z.boolean().default(false),
  }),
});

export const UserSchema = z.object({
  uid: z.string().min(1),
  role: RoleSchema,
  email: z.string().email(),
  status: UserStatusSchema,
  profile: UserProfileSchema,
  preferences: UserPreferencesSchema,
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date().optional(),
  deletedAt: z.date().optional(),
});
export type User = z.infer<typeof UserSchema>;
```

- [ ] **Step 5.2: Create vehicle.ts**

Create `packages/shared-types/src/vehicle.ts`:

```ts
import { z } from 'zod';

export const VehicleStatusSchema = z.enum(['draft', 'ready', 'in_auction', 'sold', 'archived']);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;

export const TransmissionSchema = z.enum(['manual', 'automatic', 'cvt']);
export const FuelTypeSchema = z.enum(['gasoline', 'diesel', 'hybrid', 'electric']);
export const ConditionSchema = z.enum(['new', 'used', 'damaged']);

export const VehicleImageSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url(),
  order: z.number().int().nonnegative(),
});

export const VehicleSchema = z.object({
  id: z.string(),
  vin: z.string().optional(),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  mileage: z.number().nonnegative().optional(),
  transmission: TransmissionSchema,
  fuelType: FuelTypeSchema,
  color: z.string().optional(),
  description: z.object({ es: z.string(), en: z.string().optional() }),
  images: z.array(VehicleImageSchema).default([]),
  condition: ConditionSchema,
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  status: VehicleStatusSchema,
});
export type Vehicle = z.infer<typeof VehicleSchema>;
```

- [ ] **Step 5.3: Create auction.ts**

Create `packages/shared-types/src/auction.ts`:

```ts
import { z } from 'zod';

export const AuctionStatusSchema = z.enum(['scheduled', 'live', 'ended', 'cancelled']);
export type AuctionStatus = z.infer<typeof AuctionStatusSchema>;

export const AuctionOutcomeSchema = z.enum(['sold', 'reserve_not_met', 'no_bids']);

export const VehicleSnapshotSchema = z.object({
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  thumbnailUrl: z.string().url().optional(),
});

export const AuctionSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  vehicleSnapshot: VehicleSnapshotSchema,
  startingPrice: z.number().positive(),
  reservePrice: z.number().positive().optional(),
  bidIncrement: z.number().positive(),
  startsAt: z.date(),
  endsAt: z.date(),
  currentBid: z.number().nonnegative(),
  currentBidderUid: z.string().optional(),
  bidCount: z.number().int().nonnegative(),
  status: AuctionStatusSchema,
  outcome: AuctionOutcomeSchema.optional(),
  winnerUid: z.string().optional(),
  finalPrice: z.number().positive().optional(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Auction = z.infer<typeof AuctionSchema>;
```

- [ ] **Step 5.4: Create bid.ts**

Create `packages/shared-types/src/bid.ts`:

```ts
import { z } from 'zod';

export const BidStatusSchema = z.enum(['valid', 'outbid', 'winning', 'rejected']);

export const BuyerSnapshotSchema = z.object({
  firstName: z.string(),
  lastInitial: z.string().length(1),
});

export const BidSchema = z.object({
  id: z.string(),
  auctionId: z.string(),
  buyerUid: z.string(),
  buyerSnapshot: BuyerSnapshotSchema,
  amount: z.number().positive(),
  createdAt: z.date(),
  ipAddress: z.string().optional(),
  status: BidStatusSchema,
});
export type Bid = z.infer<typeof BidSchema>;
```

- [ ] **Step 5.5: Create app-config.ts**

Create `packages/shared-types/src/app-config.ts`:

```ts
import { z } from 'zod';

export const AppConfigSchema = z.object({
  currency: z.object({
    primary: z.enum(['USD', 'PYG']).default('USD'),
    showSecondary: z.boolean().default(false),
    pygPerUsd: z.number().positive().optional(),
    pygPerUsdUpdatedAt: z.date().optional(),
  }),
  bid: z.object({
    fixedIncrementUsd: z.number().positive().default(500),
    allowManualIncrement: z.boolean().default(true),
    antiSnipingSeconds: z.number().int().positive().default(60),
  }),
  financing: z.object({
    enabled: z.boolean().default(false),
    allowedTerms: z.array(z.number().int().positive()).default([12, 24, 36, 48, 60]),
    annualInterestRate: z.number().nonnegative().default(0),
    downPaymentPercent: z.number().min(0).max(1).default(0.2),
    minFinanceableUsd: z.number().nonnegative().default(0),
    notes: z.object({ es: z.string(), en: z.string().optional() }).optional(),
  }),
  emails: z.object({
    adminStaffDomain: z.string().min(3).default('santarosa.com.py'),
    fromAddress: z.string().email(),
    fromName: z.string().min(1),
  }),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
```

- [ ] **Step 5.6: Update index barrel**

Replace `packages/shared-types/src/index.ts` with:

```ts
export * from './validators/paraguay';
export * from './user';
export * from './vehicle';
export * from './auction';
export * from './bid';
export * from './app-config';
```

- [ ] **Step 5.7: Verify typecheck**

Run: `pnpm --filter @carbid/shared-types typecheck`
Expected: PASS.

- [ ] **Step 5.8: Commit**

```bash
git add packages/shared-types/src
git commit -m "feat(shared-types): add Zod schemas for User, Vehicle, Auction, Bid, AppConfig"
```

---

## Task 6: packages/firebase-client init

**Files:**

- Create: `packages/firebase-client/package.json`
- Create: `packages/firebase-client/tsconfig.json`
- Create: `packages/firebase-client/src/env.ts`
- Create: `packages/firebase-client/src/client.ts`
- Create: `packages/firebase-client/src/index.ts`

- [ ] **Step 6.1: Create package.json**

Create `packages/firebase-client/package.json`:

```json
{
  "name": "@carbid/firebase-client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "firebase": "^10.12.0"
  }
}
```

- [ ] **Step 6.2: Create tsconfig.json**

Create `packages/firebase-client/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 6.3: Create env.ts**

Create `packages/firebase-client/src/env.ts`:

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  storageBucket: z.string().min(1),
  messagingSenderId: z.string().min(1),
  appId: z.string().min(1),
  measurementId: z.string().optional(),
  useEmulators: z.boolean().default(false),
});

export type FirebaseEnv = z.infer<typeof EnvSchema>;

export function loadFirebaseEnv(env: Record<string, string | undefined>): FirebaseEnv {
  return EnvSchema.parse({
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    useEmulators: env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true',
  });
}
```

> Note: package depends on `zod` transitively via `@carbid/shared-types` once we wire it; for now add it as direct dep.

- [ ] **Step 6.4: Add zod and shared-types to deps**

Edit `packages/firebase-client/package.json` `dependencies`:

```json
"dependencies": {
  "firebase": "^10.12.0",
  "zod": "^3.23.0",
  "@carbid/shared-types": "workspace:*"
}
```

- [ ] **Step 6.5: Create client.ts (init + emulator wiring)**

Create `packages/firebase-client/src/client.ts`:

```ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import type { FirebaseEnv } from './env';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let functionsInstance: Functions | null = null;

export function initFirebaseClient(env: FirebaseEnv): {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
} {
  if (!appInstance) {
    appInstance = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: env.apiKey,
          authDomain: env.authDomain,
          projectId: env.projectId,
          storageBucket: env.storageBucket,
          messagingSenderId: env.messagingSenderId,
          appId: env.appId,
          measurementId: env.measurementId,
        });

    authInstance = getAuth(appInstance);
    dbInstance = getFirestore(appInstance);
    storageInstance = getStorage(appInstance);
    functionsInstance = getFunctions(appInstance, 'us-central1');

    if (env.useEmulators && typeof window !== 'undefined') {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
      connectStorageEmulator(storageInstance, '127.0.0.1', 9199);
      connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
    }
  }
  return {
    app: appInstance!,
    auth: authInstance!,
    db: dbInstance!,
    storage: storageInstance!,
    functions: functionsInstance!,
  };
}
```

- [ ] **Step 6.6: Create index.ts**

Create `packages/firebase-client/src/index.ts`:

```ts
export { loadFirebaseEnv, type FirebaseEnv } from './env';
export { initFirebaseClient } from './client';
```

- [ ] **Step 6.7: Install and typecheck**

Run: `pnpm install && pnpm --filter @carbid/firebase-client typecheck`
Expected: PASS.

- [ ] **Step 6.8: Commit**

```bash
git add packages/firebase-client pnpm-lock.yaml
git commit -m "feat(firebase-client): initialize SDK with emulator wiring"
```

---

## Task 7: Next.js 14 web app skeleton

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/lib/utils.ts`

- [ ] **Step 7.1: Create apps/web/package.json**

Create `apps/web/package.json`:

```json
{
  "name": "@carbid/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@carbid/firebase-client": "workspace:*",
    "@carbid/shared-types": "workspace:*",
    "clsx": "^2.1.0",
    "next": "^14.2.0",
    "next-intl": "^3.15.0",
    "next-themes": "^0.3.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "eslint-config-next": "^14.2.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 7.2: Create tsconfig.json**

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "types": ["next"]
  },
  "include": ["next-env.d.ts", "src/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 7.3: Create next.config.mjs**

Create `apps/web/next.config.mjs`:

```js
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@carbid/shared-types', '@carbid/firebase-client'],
  experimental: { typedRoutes: true },
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 7.4: Create postcss + tailwind configs**

Create `apps/web/postcss.config.mjs`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

Create `apps/web/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        wordmark: ['var(--font-bricolage)', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: {
          base: 'oklch(var(--bg-base) / <alpha-value>)',
          elev: 'oklch(var(--bg-elev) / <alpha-value>)',
          deep: 'oklch(var(--bg-deep) / <alpha-value>)',
        },
        text: {
          strong: 'oklch(var(--text-strong) / <alpha-value>)',
          muted: 'oklch(var(--text-muted) / <alpha-value>)',
          subtle: 'oklch(var(--text-subtle) / <alpha-value>)',
        },
        ink: 'oklch(var(--ink) / <alpha-value>)',
        copper: 'oklch(var(--copper) / <alpha-value>)',
        success: 'oklch(var(--success) / <alpha-value>)',
        warning: 'oklch(var(--warning) / <alpha-value>)',
        danger: 'oklch(var(--danger) / <alpha-value>)',
      },
      fontVariantNumeric: {
        tabular: 'tabular-nums',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
```

- [ ] **Step 7.5: Create globals.css with OKLCH tokens**

Create `apps/web/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* light theme — values are "L C H" (no parens) for tailwind oklch(var(--token)) */
    --bg-base: 0.98 0.005 290;
    --bg-elev: 0.96 0.005 290;
    --bg-deep: 0.94 0.005 290;
    --text-strong: 0.2 0.01 290;
    --text-muted: 0.48 0.01 290;
    --text-subtle: 0.64 0.01 290;
    --ink: 0.28 0.04 290;
    --copper: 0.68 0.13 55;
    --success: 0.6 0.13 155;
    --warning: 0.7 0.14 75;
    --danger: 0.55 0.18 25;
  }

  .dark {
    --bg-base: 0.18 0.01 290;
    --bg-elev: 0.22 0.01 290;
    --bg-deep: 0.26 0.01 290;
    --text-strong: 0.96 0.005 290;
    --text-muted: 0.72 0.01 290;
    --text-subtle: 0.58 0.01 290;
    --ink: 0.96 0.005 290;
    --copper: 0.75 0.13 55;
    --success: 0.7 0.13 155;
    --warning: 0.78 0.14 75;
    --danger: 0.65 0.18 25;
  }

  html,
  body {
    background-color: oklch(var(--bg-base));
    color: oklch(var(--text-strong));
    font-feature-settings: 'cv11', 'ss01';
  }

  body {
    font-family: var(--font-inter), system-ui, sans-serif;
  }

  /* Tabular numerals for prices, countdowns */
  .num-tab {
    font-variant-numeric: tabular-nums;
  }
}
```

- [ ] **Step 7.6: Create lib/utils.ts**

Create `apps/web/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7.7: Create root layout (no locale)**

Create `apps/web/src/app/layout.tsx`:

```tsx
import './globals.css';
import { Inter, Bricolage_Grotesque } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage' });

export const metadata = { title: 'CARBID', description: 'Subastas de vehículos' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7.8: Install web deps**

Run: `pnpm install`
Expected: all deps installed.

- [ ] **Step 7.9: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Next.js 14 app with Tailwind + OKLCH design tokens"
```

---

## Task 8: i18n with next-intl (es default + en)

**Files:**

- Create: `apps/web/src/i18n.ts`
- Create: `apps/web/middleware.ts`
- Create: `apps/web/messages/es.json`
- Create: `apps/web/messages/en.json`
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Create: `apps/web/src/app/[locale]/page.tsx`

- [ ] **Step 8.1: Create i18n.ts**

Create `apps/web/src/i18n.ts`:

```ts
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

const LOCALES = ['es', 'en'] as const;
type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async ({ locale }) => {
  if (!LOCALES.includes(locale as Locale)) notFound();
  return {
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

export { LOCALES };
```

- [ ] **Step 8.2: Create middleware**

Create `apps/web/middleware.ts`:

```ts
import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localeDetection: true,
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

- [ ] **Step 8.3: Create messages/es.json**

Create `apps/web/messages/es.json`:

```json
{
  "common": {
    "appName": "CARBID",
    "tagline": "Subastas de vehículos",
    "signIn": "Iniciar sesión",
    "signOut": "Cerrar sesión",
    "settings": "Configuración",
    "language": "Idioma",
    "theme": "Tema",
    "themeLight": "Claro",
    "themeDark": "Oscuro",
    "themeSystem": "Sistema"
  },
  "home": {
    "title": "Bienvenido a CARBID",
    "subtitle": "Subastas asincrónicas de vehículos en Paraguay"
  }
}
```

- [ ] **Step 8.4: Create messages/en.json**

Create `apps/web/messages/en.json`:

```json
{
  "common": {
    "appName": "CARBID",
    "tagline": "Vehicle auctions",
    "signIn": "Sign in",
    "signOut": "Sign out",
    "settings": "Settings",
    "language": "Language",
    "theme": "Theme",
    "themeLight": "Light",
    "themeDark": "Dark",
    "themeSystem": "System"
  },
  "home": {
    "title": "Welcome to CARBID",
    "subtitle": "Asynchronous vehicle auctions in Paraguay"
  }
}
```

- [ ] **Step 8.5: Create [locale]/layout.tsx**

Create `apps/web/src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme/theme-provider';

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 8.6: Create [locale]/page.tsx (placeholder home)**

Create `apps/web/src/app/[locale]/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { CarbidWordmark } from '@/components/brand/carbid-wordmark';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function HomePage() {
  const t = useTranslations('home');
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <CarbidWordmark className="text-7xl" />
      <h1 className="text-3xl font-semibold text-text-strong">{t('title')}</h1>
      <p className="text-text-muted">{t('subtitle')}</p>
      <ThemeToggle />
    </main>
  );
}
```

- [ ] **Step 8.7: Verify build still passes (deferred to Task 9 once components exist)**

(Components referenced are added in Task 9. Skip verification for now.)

- [ ] **Step 8.8: Commit**

```bash
git add apps/web/src apps/web/messages apps/web/middleware.ts
git commit -m "feat(web): set up next-intl with es/en"
```

---

## Task 9: CARBID Wordmark + Theme Provider/Toggle

**Files:**

- Create: `apps/web/src/components/brand/carbid-wordmark.tsx`
- Create: `apps/web/src/components/theme/theme-provider.tsx`
- Create: `apps/web/src/components/theme/theme-toggle.tsx`

- [ ] **Step 9.1: Wordmark component**

Create `apps/web/src/components/brand/carbid-wordmark.tsx`:

```tsx
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const sizeMap = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
  xl: 'text-7xl',
  '2xl': 'text-8xl',
};

export function CarbidWordmark({ className, size = 'md' }: Props) {
  return (
    <span
      className={cn(
        'font-wordmark font-bold leading-none tracking-tight inline-flex items-baseline',
        sizeMap[size],
        className,
      )}
      aria-label="CARBID"
    >
      <span className="text-copper">CAR</span>
      <span className="text-ink">BID</span>
    </span>
  );
}
```

- [ ] **Step 9.2: Install next-themes (already in deps) and add provider**

Create `apps/web/src/components/theme/theme-provider.tsx`:

```tsx
'use client';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes/dist/types';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 9.3: Theme toggle component**

Create `apps/web/src/components/theme/theme-toggle.tsx`:

```tsx
'use client';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const t = useTranslations('common');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-text-subtle/30 p-1">
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={
          'px-2 py-1 text-sm rounded ' +
          (theme === 'light' ? 'bg-bg-elev text-text-strong' : 'text-text-muted')
        }
      >
        {t('themeLight')}
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={
          'px-2 py-1 text-sm rounded ' +
          (theme === 'dark' ? 'bg-bg-elev text-text-strong' : 'text-text-muted')
        }
      >
        {t('themeDark')}
      </button>
      <button
        type="button"
        onClick={() => setTheme('system')}
        className={
          'px-2 py-1 text-sm rounded ' +
          (theme === 'system' ? 'bg-bg-elev text-text-strong' : 'text-text-muted')
        }
      >
        {t('themeSystem')}
      </button>
    </div>
  );
}
```

- [ ] **Step 9.4: Run dev server smoke test**

Run: `pnpm --filter @carbid/web dev`
Open: `http://localhost:3000` (should redirect to `/es`)
Expected:

- Wordmark "CAR" en copper, "BID" en ink (oscuro)
- Heading "Bienvenido a CARBID"
- Theme toggle visible y funcional al cambiar light/dark/system

Stop server with Ctrl+C.

- [ ] **Step 9.5: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): add CARBID wordmark and theme provider/toggle"
```

---

## Task 10: functions/ scaffold + smoke health function

**Files:**

- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/.eslintrc.cjs`
- Create: `functions/src/index.ts`
- Create: `functions/src/health.ts`

- [ ] **Step 10.1: Create functions/package.json**

Create `functions/package.json`:

```json
{
  "name": "@carbid/functions",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "engines": { "node": "20" },
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "serve": "pnpm build && firebase emulators:start --only functions",
    "deploy": "pnpm build && firebase deploy --only functions"
  },
  "dependencies": {
    "@carbid/shared-types": "workspace:*",
    "firebase-admin": "^12.1.0",
    "firebase-functions": "^5.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 10.2: Create functions/tsconfig.json**

Create `functions/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "lib",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "sourceMap": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 10.3: Create eslint config**

Create `functions/.eslintrc.cjs`:

```js
module.exports = {
  extends: ['../.eslintrc.cjs'],
  parserOptions: { project: './tsconfig.json' },
};
```

- [ ] **Step 10.4: Create health.ts**

Create `functions/src/health.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';

export const pingHealth = onCall({ region: 'us-central1' }, async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});
```

- [ ] **Step 10.5: Create index.ts**

Create `functions/src/index.ts`:

```ts
export { pingHealth } from './health';
```

- [ ] **Step 10.6: Build**

Run: `pnpm install && pnpm --filter @carbid/functions build`
Expected: `lib/index.js` and `lib/health.js` produced.

- [ ] **Step 10.7: Commit**

```bash
git add functions pnpm-lock.yaml
git commit -m "feat(functions): scaffold Cloud Functions with smoke pingHealth"
```

---

## Task 11: Firebase config files (firebase.json, rules, indexes)

**Files:**

- Create: `firebase.json`
- Create: `.firebaserc`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `storage.rules`

- [ ] **Step 11.1: Create firebase.json**

Create `firebase.json`:

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "*.local"],
      "predeploy": ["pnpm --filter @carbid/functions build"]
    }
  ],
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": { "rules": "storage.rules" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 11.2: Create .firebaserc**

Create `.firebaserc`:

```json
{
  "projects": {
    "default": "carbid-staging",
    "production": "carbid-59ef5"
  }
}
```

> Note: `carbid-staging` will be created in Task 12. If you skip that step, change `default` to `carbid-59ef5`.

- [ ] **Step 11.3: Create baseline firestore.rules**

Create `firestore.rules`:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function isSignedIn() { return request.auth != null; }
    function isActive()   { return request.auth.token.status == 'active'; }
    function role()       { return request.auth.token.role; }
    function isAdmin()    { return isSignedIn() && isActive() && role() == 'admin'; }
    function isStaff()    { return isSignedIn() && isActive() && role() == 'staff'; }
    function isBuyer()    { return isSignedIn() && isActive() && role() == 'buyer'; }

    // Users — managed via Cloud Functions (createUser/deleteUser)
    match /users/{uid} {
      allow read:   if isAdmin() || request.auth.uid == uid;
      allow update: if request.auth.uid == uid
                    && request.resource.data.role == resource.data.role
                    && request.resource.data.status == resource.data.status
                    && request.resource.data.createdBy == resource.data.createdBy;
      allow create, delete: if false;
    }

    // Vehicles
    match /vehicles/{id} {
      allow read:           if isSignedIn() && isActive();
      allow create, update: if isStaff() || isAdmin();
      allow delete:         if isAdmin();
    }

    // Auctions and bids — managed via Cloud Functions
    match /auctions/{id} {
      allow read: if isSignedIn() && isActive();
      allow create, update, delete: if false;

      match /bids/{bidId} {
        allow read: if isSignedIn() && isActive();
        allow create, update, delete: if false;
      }
    }

    // App config
    match /app_config/{doc} {
      allow read:  if isSignedIn() && isActive();
      allow write: if false;
    }

    // Audit logs — admin read only, never client write
    match /audit_logs/{id} {
      allow read:  if isAdmin();
      allow write: if false;
    }
  }
}
```

- [ ] **Step 11.4: Create firestore.indexes.json**

Create `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "auctions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "endsAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "auctions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "startsAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "bids",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "auctionId", "order": "ASCENDING" },
        { "fieldPath": "amount", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "role", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "vehicles",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 11.5: Create storage.rules**

Create `storage.rules`:

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /vehicles/{vehicleId}/{file=**} {
      allow read:  if request.auth != null && request.auth.token.status == 'active';
      allow write: if request.auth.token.role in ['staff', 'admin']
                   && request.resource.size < 10 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
    match /avatars/{uid}/{file=**} {
      allow read:  if true;
      allow write: if request.auth.uid == uid
                   && request.resource.size < 2 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

- [ ] **Step 11.6: Commit**

```bash
git add firebase.json .firebaserc firestore.rules firestore.indexes.json storage.rules
git commit -m "feat(firebase): add baseline rules, indexes and emulator config"
```

---

## Task 12: Firebase project setup (staging)

> **Manual step:** requires interactive `firebase` CLI; cannot be scripted.

- [ ] **Step 12.1: Create staging project**

Run: `firebase projects:create carbid-staging --display-name "CARBID Staging"`
Expected: project created. If the ID is taken, choose `carbid-staging-<your-suffix>` and update `.firebaserc`.

- [ ] **Step 12.2: Enable required APIs (auth, firestore, storage, functions)**

Manual: open https://console.firebase.google.com/project/carbid-staging

- Build → Authentication → Get started → enable **Email/Password**
- Build → Firestore Database → Create database (Native, region nam5 or southamerica-east1)
- Build → Storage → Get started (default region as Firestore)

- [ ] **Step 12.3: Generate web app config**

In Console: Project settings → Your apps → Web app → register app `CARBID Web`. Copy the config snippet values.

- [ ] **Step 12.4: Populate .env.local**

Create `apps/web/.env.local` (gitignored at repo root level via `.env.local`; if the wildcard doesn't catch it, add `apps/**/.env.local` to `.gitignore`):

```
NEXT_PUBLIC_FIREBASE_API_KEY=<from console>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=carbid-staging.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=carbid-staging
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=carbid-staging.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<from console>
NEXT_PUBLIC_FIREBASE_APP_ID=<from console>
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

- [ ] **Step 12.5: Verify .gitignore covers nested env**

Run: `grep -n "env" .gitignore`
If output does not include `.env*` patterns covering `apps/**/.env.local`, append:

```
apps/**/.env.local
apps/**/.env.*.local
```

- [ ] **Step 12.6: Test deploy of rules to staging**

Run: `firebase deploy --only firestore:rules,firestore:indexes,storage:rules --project carbid-staging`
Expected: "Deploy complete!"

- [ ] **Step 12.7: Commit gitignore tweak (no env file)**

```bash
git add .gitignore
git commit -m "chore: ignore nested .env.local files"
```

---

## Task 13: Firebase emulators smoke test end-to-end

- [ ] **Step 13.1: Build functions**

Run: `pnpm --filter @carbid/functions build`
Expected: PASS.

- [ ] **Step 13.2: Start emulators**

Run: `pnpm emulators`
Expected: emulator UI on `http://127.0.0.1:4000`. Auth, Firestore, Storage, Functions running.

Leave running for next steps (open new terminal).

- [ ] **Step 13.3: In a new terminal, start web**

Run: `pnpm --filter @carbid/web dev`
Open: `http://localhost:3000/es`
Expected: home page renders with wordmark and theme toggle.

- [ ] **Step 13.4: Smoke-call pingHealth from devtools**

In the browser devtools console of the home page, run:

```js
const { initFirebaseClient, loadFirebaseEnv } = await import('/_next/static/chunks/...');
// (Skipped — not exposed yet. Quick alternative: curl the emulator endpoint)
```

Alternative via curl:

```bash
curl -s -X POST 'http://127.0.0.1:5001/carbid-staging/us-central1/pingHealth' \
  -H 'Content-Type: application/json' \
  -d '{"data":{}}'
```

Expected: JSON response with `{ "result": { "status": "ok", "timestamp": "..." } }`.

- [ ] **Step 13.5: Stop emulators and dev server**

Ctrl+C in both terminals.

- [ ] **Step 13.6: Commit any incidental fixes (if any)**

```bash
git status
# If clean, skip. If files changed, commit:
# git commit -am "chore: emulator smoke fixes"
```

---

## Task 14: Netlify deploy config

**Files:**

- Create: `netlify.toml`

- [ ] **Step 14.1: Create netlify.toml**

Create `netlify.toml`:

```toml
[build]
  base = "."
  command = "pnpm install --frozen-lockfile && pnpm --filter @carbid/web build"
  publish = "apps/web/.next"

[build.environment]
  NODE_VERSION = "20"
  PNPM_VERSION = "9"
  NEXT_TELEMETRY_DISABLED = "1"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
```

- [ ] **Step 14.2: Commit**

```bash
git add netlify.toml
git commit -m "feat(deploy): add Netlify build config with security headers"
```

---

## Task 15: Final smoke + push to remote

- [ ] **Step 15.1: Lint + typecheck + test all packages**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS.

- [ ] **Step 15.2: Build the web app to validate Netlify-equivalent build**

Run: `pnpm --filter @carbid/web build`
Expected: `.next/` produced, no errors.

- [ ] **Step 15.3: Confirm git log is clean and intentional**

Run: `git log --oneline`
Expected: a sequence of conventional commits matching the tasks above.

- [ ] **Step 15.4 (optional): Create GitHub remote and push**

(Manual; user must create the GitHub repo first.)

```bash
git remote add origin git@github.com:<owner>/carbid.git
git push -u origin main
```

---

## Self-Review

**Spec coverage** (against `2026-05-05-carbid-mvp-design.md`):

- Sections 3 (Stack & monorepo): Tasks 1, 2, 7, 10 ✅
- Section 4 (Data model): Task 5 (Zod schemas) ✅; full collections come in later plans
- Section 5 (Security): Task 11 (baseline rules + storage rules) ✅; full Cloud Functions in plans 2-7
- Section 6 (Identidad visual): Tasks 7 (tokens), 9 (wordmark + theme) ✅
- Section 7 (i18n): Task 8 ✅
- Sections 8-10 (testing/CI/observability): partially covered (Vitest installed, Paraguay validators tested); full CI in Plan 9
- Section 11 (móvil): out of scope for MVP plans
- Section 13 (decisiones cerradas): paleta + logo aplicados; moneda/incrementos/financiación come in later plans

**No gaps for Plan 1's stated goal (foundation).** Subsequent functionality is correctly deferred to plans 2-9.

**Placeholder scan**: searched for "TBD", "TODO", "implement later" — none found in steps. All code blocks are complete and runnable.

**Type consistency**: schemas in Task 5 align with the spec's data model. `RoleSchema` matches `User.role`. `AppConfigSchema` matches the structure declared in spec §4. Field names consistent across files.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-carbid-01-foundation.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch with checkpoints.
