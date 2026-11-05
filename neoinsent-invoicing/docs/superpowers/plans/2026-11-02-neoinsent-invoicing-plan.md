# NeoInsent Invoicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, password-gated web app for NeoInsent AI that creates NL/EU invoices, generates a branded PDF, sends it by email or offers print/download, and keeps a permanent record for Dutch BTW/ICP tax reporting.

**Architecture:** React + TypeScript + Vite frontend talks only to the app's own Vercel serverless functions under `/api` (never directly to Supabase). The API layer holds the Supabase service-role key, enforces a signed session cookie on every route but `/api/login`, and is the only thing that touches the database, Supabase Storage, and Gmail SMTP. PDF generation and email sending both happen server-side so a finalized invoice's PDF is deterministic and never regenerated.

**Tech Stack:** React 19, TypeScript, Vite 8, react-router-dom 7, `@supabase/supabase-js` (Postgres + Storage), `@react-pdf/renderer` (server-side PDF), `nodemailer` (Gmail SMTP), Vitest + Testing Library, oxlint. Matches the versions already used in this workspace's `FootTrack` project.

Spec: `docs/superpowers/specs/2026-11-02-neoinsent-invoicing-design.md`

---

## Before you start

All paths below are relative to `neoinsent-invoicing/` unless given as absolute. Every task's commands assume your shell is already `cd`'d into `/Users/sera/AI-Claude/neoinsent-invoicing`.

## REVISION (2026-11-03): Mac-only app with local storage — supersedes cloud parts below

The user doesn't use SQL and chose to run the app on their Mac only. **Approved design:**

- **Data folder:** `~/NeoInsent Invoicing/` (override with env `NEOINSENT_DATA_DIR`). Contains `neoinsent.db` (SQLite via Node 24's built-in `node:sqlite` — no native deps, no cloud) and `invoices/<year>/<invoice_number>.pdf`. Backup = Time Machine on that folder; warn against iCloud Drive (syncing an open DB can corrupt it).
- **Server:** a small local Express server (`server/index.ts`) bound to `127.0.0.1` only, serving the built frontend and mounting the existing route handlers under `/api`. `npm start` builds and runs it. A double-clickable `Start NeoInsent.command` launcher opens the browser.
- **No login:** localhost-only, so `api/login.ts`, `api/logout.ts`, `api/_lib/requireSession.ts`, `src/lib/session.ts`, `src/lib/cookies.ts` and the planned `RequireAuth`/`LoginPage`/`api/me` are removed. Routes no longer call a guard.
- **Removed:** Supabase (`src/lib/supabaseAdmin.ts`, `supabase/migrations/`, `@supabase/supabase-js`), Vercel (`vercel.json`, `@vercel/node` types → Express `Request`/`Response`), Supabase Storage (PDFs go to the data folder).
- **Transactions:** create-draft, replace-draft and finalize each run in a single SQLite transaction. Finalize assigns the next gap-free number, writes `client_snapshot`, sets `status='final'` in one transaction, then writes the PDF to disk; a final invoice with a missing PDF file is re-rendered from its snapshot on demand.
- **Kept as built:** `src/lib/vat.ts`, `invoiceMath.ts`, `dateRanges.ts`, `api/_lib/normalizeClientInput.ts`, `validateDraftInvoice.ts`, `uuid.ts`, `src/lib/apiClient.ts`, `ClientPicker`, and the route handlers' logic (signatures move to Express types).
- **Repo tests** now run against a real temporary SQLite database instead of mocked Supabase.

**Revised remaining task order (replaces Tasks 12–23 sequencing):**
- **L1 — Local database:** `api/_lib/db.ts` (open/create DB in the data folder, schema with all constraints incl. 2-letter country check, `client_snapshot`, final-requires-snapshot, counters), test against a temp dir.
- **L2 — Port repos to SQLite:** `clientsRepo` and `invoicesRepo` (`listClients`, `getClientById`, `createClient`, `updateClient`, `createDraftInvoice`, `listInvoices`, `getInvoice`, `replaceDraftInvoice` — transactional), real-DB tests; delete Supabase code/deps.
- **L3 — Local server, drop auth and Vercel:** Express server, `npm start`, remove login/session code and guards, Express types in handlers.
- **Task 12** (PATCH draft, via `replaceDraftInvoice` + `validateDraftInvoice`), **13–14** (line items UI, New Invoice page), **15** (PDF render), **16** (finalize: transaction + PDF to disk + VAT re-check), **17** (serve PDF from disk + paid toggle), **18** (Gmail send, recipient from snapshot), **19** (detail page), **20** (dashboard), **21** (tax records/ICP/CSV, from snapshots), app shell routing.
- **L-final — Launcher and handover:** `Start NeoInsent.command`, `.env` setup for Gmail, backup note, end-to-end smoke test, ask the user before deleting the unused Supabase project.

Where the original task text below mentions Supabase, Vercel, `requireSession`, or Storage, apply this revision instead.

**Repo rules after L2 (from L2's code review):**
- `withTransaction` callbacks must be synchronous, and every exported repo function is `async` — so never call an exported repo function inside a transaction. Transactional operations live in `invoicesRepo.ts` as one exported function built on the private synchronous helpers (`loadInvoice`, `selectInvoiceRow`).
- **Task 16 finalize** = `finalizeDraftInvoice(id, now)` in `invoicesRepo.ts` returning `'not_found' | 'locked' | 'vat_mismatch' | InvoiceWithDetails`: inside one transaction it loads the draft and live client, builds the snapshot, re-checks `determineVatTreatment` against the client as it is at that moment, calls `nextInvoiceNumber`, and sets `invoice_number`, `client_snapshot`, `finalized_at`, `status = 'final'`. The PDF is written only after commit. The Postgres `rpc`/`replace_draft_invoice` wording in the addendum is replaced by this.
- **Task 17 paid toggle:** bind `paid ? 1 : 0` explicitly, set `updated_at`, 404 when `changes === 0`; `pdf_path` writes are a separate function so finalize's "PDF missing → re-render" path can call it.
- **Tasks 20/21 totals:** aggregate in SQL over cents (`sum(subtotal_cents)` etc., grouped by `vat_treatment`, `status = 'final'`, date range) and convert once; ICP grouping uses `json_extract(client_snapshot, '$.vat_number')` and the snapshot name. Expose these as repo functions (e.g. `summaryForPeriod`, `icpBreakdown`) instead of the plan's JS sum over `InvoiceSummary[]`.
- Small cleanups for whoever next edits the repos: reuse the clients column list instead of `select * from clients` in `loadInvoice`; return plain objects (`{ ...row }`) from `clientsRepo`; add a `json_valid(client_snapshot)` check in a future migration.

## Addendum (2026-11-03): client editing and invoice client snapshots

Approved by the user during execution. Clients can now be edited (new Task 10b: `PATCH /api/clients/[id]` + an Edit button in `ClientPicker`). To keep issued invoices immutable, `invoices` has a new `client_snapshot jsonb` column (migration `0004_invoice_client_snapshot.sql`), with a check constraint requiring it whenever `status = 'final'`. This changes later tasks:

- **Task 16 (finalize):** build the snapshot once from the live client (`name, contact_person, email, address_line, postal_code, city, country, vat_number, kvk_number`), render the PDF from it, and write it in the same update that sets `status = 'final'` (the DB constraint rejects a final invoice without it — the original Task 16 code block below does NOT include it and must be extended). Before consuming an invoice number, recompute `determineVatTreatment(snapshot.country, snapshot.vat_number)`; if it no longer matches the draft's `vat_treatment` (the client was edited after the draft was created), refuse with 409 and a clear message rather than issue an invoice with the wrong VAT treatment. Tests must assert the update payload contains `client_snapshot`.
- **Task 16 — gap-free numbering (Dutch legal requirement):** the plan's code calls `next_invoice_number` (which commits the counter), then uploads the PDF, then updates the row — an upload/update failure would burn a number and leave a gap. Instead, add a Postgres function (e.g. `finalize_invoice(p_id uuid, p_snapshot jsonb)`) that, in one transaction, verifies `status = 'draft'`, increments the counter, and sets `invoice_number`, `status = 'final'`, `client_snapshot`, `finalized_at`. Call it via `rpc`. Render and upload the PDF afterwards from the stored snapshot; `pdf_path` null on a final invoice means "re-render", so a failed upload is retryable without touching the number.
- **Task 12 — atomic draft replace:** the plan's `updateDraftInvoice` repeats the snake_case→NaN bug (reuse `toLineInput`/`computeLine` from `invoicesRepo.ts`) and is non-atomic (update totals, delete items, insert items). Implement it as a Postgres function (e.g. `replace_draft_invoice(p_id uuid, p_invoice jsonb, p_items jsonb)`) that checks `status = 'draft'` and replaces everything in one transaction. PATCH must reuse `validateDraftInvoice`.
- **Shared helper:** add `clientForInvoice(invoice)` (snapshot when final, live client otherwise) and use it in Tasks 18, 19 and 21 instead of re-implementing the rule.
- **Task 18 (send):** email the address in `client_snapshot.email`, not the live client row.
- **Task 19 (detail page) / `getInvoice`:** for a final invoice, show client details from `client_snapshot`.
- **Task 21 (tax report):** take `client_name`/`client_vat_number` from `client_snapshot`, not the joined `clients` row, so the ICP report reflects what was actually invoiced.

Client input is normalized server-side by `api/_lib/normalizeClientInput.ts` (added after Task 9's review); the PATCH route must reuse it.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vercel.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `src/test/setup.ts`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "neoinsent-invoicing",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.110.1",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-router-dom": "^7.18.1"
  },
  "devDependencies": {
    "@react-pdf/renderer": "^4.2.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^24.13.2",
    "@types/nodemailer": "^6.4.17",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vercel/node": "^3.2.29",
    "@vitejs/plugin-react": "^6.0.3",
    "jsdom": "^29.1.1",
    "nodemailer": "^6.9.16",
    "oxlint": "^1.71.0",
    "typescript": "~6.0.2",
    "vite": "^8.1.1",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/sera/AI-Claude/neoinsent-invoicing && npm install`
Expected: installs without errors, creates `package-lock.json` and `node_modules/`.

- [ ] **Step 3: Write TypeScript config**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "api"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Write `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
})
```

- [ ] **Step 5: Write `vercel.json`**

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules
dist
.env
.env.local
*.local
.vercel
```

- [ ] **Step 7: Write `.env.example`**

```
# Supabase (server-only — never prefix with VITE_, must not reach the browser bundle)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
APP_PASSWORD_HASH=
SESSION_SECRET=

# Gmail SMTP (finance@neoinsentai.com)
GMAIL_USER=finance@neoinsentai.com
GMAIL_APP_PASSWORD=
```

- [ ] **Step 8: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NeoInsent Invoicing</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Write `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 10: Write the failing test for `src/App.tsx`**

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the app name', () => {
    render(<App />)
    expect(screen.getByText('NeoInsent Invoicing')).toBeInTheDocument()
  })
})
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — `Failed to resolve import "./App"` (file does not exist yet).

- [ ] **Step 12: Write minimal `src/App.tsx` and `src/main.tsx`**

`src/App.tsx`:
```tsx
export function App() {
  return <div>NeoInsent Invoicing</div>
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 13: Write minimal `src/index.css`**

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
}
```

- [ ] **Step 14: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — 1 test passed.

- [ ] **Step 15: Commit**

```bash
git add neoinsent-invoicing/package.json neoinsent-invoicing/package-lock.json neoinsent-invoicing/tsconfig*.json neoinsent-invoicing/vite.config.ts neoinsent-invoicing/vercel.json neoinsent-invoicing/.gitignore neoinsent-invoicing/.env.example neoinsent-invoicing/index.html neoinsent-invoicing/src
git commit -m "chore: scaffold neoinsent-invoicing project"
```

---

### Task 2: Design tokens and global styles

**Files:**
- Modify: `src/index.css`
- Create: `public/logo.png` (copy of `assets/neoinsent-logo.png`, served statically)

- [ ] **Step 1: Copy the logo into `public/`**

Run: `mkdir -p public && cp assets/neoinsent-logo.png public/logo.png`
Expected: `public/logo.png` exists.

- [ ] **Step 2: Replace `src/index.css` with the full token system and base styles**

```css
/* NeoInsent Invoicing — Minimal Modern theme (approved design, single light theme
   by choice: this is a business/back-office tool, not a consumer app, and every
   color below is hand-picked against a light ground). */

:root {
  --accent: #1565c0;
  --accent-deep: #0d47a1;
  --accent-soft: #e8f1fc;
  --ink: #111a2e;
  --ink-soft: #5b6b85;
  --ink-faint: #93a1bf;
  --bg: #f3f5f8;
  --surface: #ffffff;
  --border: #dde3ec;
  --danger: #b3261e;
  --success: #1b7a4a;

  color-scheme: light;
}

* {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}

#root {
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 16px 56px;
}

h1,
h2,
h3 {
  font-family: 'Libre Franklin', Georgia, serif;
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 8px;
}

h1 {
  font-size: 1.7rem;
}
h2 {
  font-size: 1.25rem;
}
h3 {
  font-size: 1.05rem;
}

p {
  margin: 0 0 12px;
  color: var(--ink-soft);
  line-height: 1.55;
}

a {
  color: var(--accent);
}

.num {
  font-variant-numeric: tabular-nums;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
}

button {
  font: inherit;
  cursor: pointer;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink);
  padding: 8px 14px;
  font-weight: 600;
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn-primary:hover {
  background: var(--accent-deep);
  border-color: var(--accent-deep);
}

.btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

input,
select,
textarea {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
}

label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink-soft);
  margin-bottom: 4px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 8px 6px;
}

th {
  color: var(--ink-soft);
  font-weight: 600;
  font-size: 0.82rem;
  border-bottom: 1px solid var(--border);
}

tr:not(:last-child) td {
  border-bottom: 1px solid var(--border);
}
```

- [ ] **Step 3: Load the Google Fonts used in the approved mockup**

Add to `index.html`, inside `<head>`, before the title:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@600;700;800&family=Public+Sans:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 4: Run the existing test suite to confirm nothing broke**

Run: `npm run test`
Expected: PASS — 1 test passed (App test from Task 1).

- [ ] **Step 5: Commit**

```bash
git add neoinsent-invoicing/src/index.css neoinsent-invoicing/index.html neoinsent-invoicing/public/logo.png
git commit -m "feat: add NeoInsent design tokens and base styles"
```

---

### Task 3: VAT logic module

**Files:**
- Create: `src/lib/vat.ts`
- Test: `src/lib/vat.test.ts`

This is pure logic (no I/O), so it gets full TDD coverage.

- [ ] **Step 1: Write the failing tests**

`src/lib/vat.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { EU_COUNTRY_CODES, determineVatTreatment, isPlausibleVatNumber } from './vat'

describe('EU_COUNTRY_CODES', () => {
  it('has 26 entries and does not include NL', () => {
    expect(EU_COUNTRY_CODES).toHaveLength(26)
    expect(EU_COUNTRY_CODES).not.toContain('NL')
  })

  it('includes known member states', () => {
    expect(EU_COUNTRY_CODES).toContain('DE')
    expect(EU_COUNTRY_CODES).toContain('FR')
    expect(EU_COUNTRY_CODES).toContain('IE')
  })
})

describe('isPlausibleVatNumber', () => {
  it('accepts a country-prefixed alphanumeric VAT number', () => {
    expect(isPlausibleVatNumber('DE123456789')).toBe(true)
    expect(isPlausibleVatNumber('IE1234567X')).toBe(true)
  })

  it('rejects numbers without a 2-letter country prefix', () => {
    expect(isPlausibleVatNumber('123456789')).toBe(false)
  })

  it('rejects empty or too-short values', () => {
    expect(isPlausibleVatNumber('')).toBe(false)
    expect(isPlausibleVatNumber('DE')).toBe(false)
  })
})

describe('determineVatTreatment', () => {
  it('returns nl_standard for an NL client regardless of VAT number', () => {
    expect(determineVatTreatment('NL', null)).toEqual({ treatment: 'nl_standard', defaultRate: 21 })
    expect(determineVatTreatment('NL', 'NL001234567B01')).toEqual({
      treatment: 'nl_standard',
      defaultRate: 21,
    })
  })

  it('returns eu_reverse_charge for an EU client with a plausible VAT number', () => {
    expect(determineVatTreatment('DE', 'DE123456789')).toEqual({
      treatment: 'eu_reverse_charge',
      defaultRate: 0,
    })
  })

  it('returns blocked for an EU client with no VAT number', () => {
    expect(determineVatTreatment('DE', null)).toEqual({
      treatment: 'blocked_missing_vat_number',
      defaultRate: null,
    })
  })

  it('returns blocked for an EU client with an implausible VAT number', () => {
    expect(determineVatTreatment('DE', '123')).toEqual({
      treatment: 'blocked_missing_vat_number',
      defaultRate: null,
    })
  })

  it('returns not_supported for a non-EU, non-NL country', () => {
    expect(determineVatTreatment('US', null)).toEqual({
      treatment: 'not_supported',
      defaultRate: null,
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/lib/vat.test.ts`
Expected: FAIL — `Failed to resolve import "./vat"`.

- [ ] **Step 3: Implement `src/lib/vat.ts`**

```ts
// The 26 other EU member states. The Netherlands is always the domestic case
// and is deliberately excluded here — see determineVatTreatment.
export const EU_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const

export type VatTreatment =
  | 'nl_standard'
  | 'eu_reverse_charge'
  | 'blocked_missing_vat_number'
  | 'not_supported'

export interface VatDetermination {
  treatment: VatTreatment
  defaultRate: 21 | 0 | null
}

// The subset of VatTreatment that is actually storable on an invoice row —
// 'blocked_missing_vat_number' and 'not_supported' are form-validation states
// that never reach the database. Used by api/_lib/invoicesRepo.ts (Task 11).
export type InvoiceVatTreatment = Extract<VatTreatment, 'nl_standard' | 'eu_reverse_charge'>

// Format check only (no VIES lookup, per spec): 2-letter country prefix
// followed by at least 2 more alphanumeric characters.
export function isPlausibleVatNumber(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{2,}$/.test(value.trim().toUpperCase())
}

export function determineVatTreatment(
  clientCountry: string,
  clientVatNumber: string | null,
): VatDetermination {
  const country = clientCountry.trim().toUpperCase()

  if (country === 'NL') {
    return { treatment: 'nl_standard', defaultRate: 21 }
  }

  if ((EU_COUNTRY_CODES as readonly string[]).includes(country)) {
    if (clientVatNumber && isPlausibleVatNumber(clientVatNumber)) {
      return { treatment: 'eu_reverse_charge', defaultRate: 0 }
    }
    return { treatment: 'blocked_missing_vat_number', defaultRate: null }
  }

  return { treatment: 'not_supported', defaultRate: null }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/lib/vat.test.ts`
Expected: PASS — 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add neoinsent-invoicing/src/lib/vat.ts neoinsent-invoicing/src/lib/vat.test.ts
git commit -m "feat: add VAT treatment determination logic"
```

---

### Task 4: Invoice math module

**Files:**
- Create: `src/lib/invoiceMath.ts`
- Test: `src/lib/invoiceMath.test.ts`

Pure logic — full TDD coverage, including a floating-point rounding edge case.

- [ ] **Step 1: Write the failing tests**

`src/lib/invoiceMath.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { computeInvoiceTotals, computeLine } from './invoiceMath'

describe('computeLine', () => {
  it('computes subtotal, vat, and total for a standard-rate line', () => {
    expect(computeLine({ quantity: 10, unitPrice: 100, vatRate: 21 })).toEqual({
      lineSubtotal: 1000,
      lineVat: 210,
      lineTotal: 1210,
    })
  })

  it('computes a zero-vat reverse-charge line', () => {
    expect(computeLine({ quantity: 5, unitPrice: 200, vatRate: 0 })).toEqual({
      lineSubtotal: 1000,
      lineVat: 0,
      lineTotal: 1000,
    })
  })

  it('rounds to 2 decimals without floating point drift', () => {
    expect(computeLine({ quantity: 3, unitPrice: 19.99, vatRate: 21 })).toEqual({
      lineSubtotal: 59.97,
      lineVat: 12.59,
      lineTotal: 72.56,
    })
  })
})

describe('computeInvoiceTotals', () => {
  it('sums multiple lines at the same rate', () => {
    expect(
      computeInvoiceTotals([
        { quantity: 10, unitPrice: 100, vatRate: 21 },
        { quantity: 2, unitPrice: 50, vatRate: 21 },
      ]),
    ).toEqual({ subtotal: 1100, vatAmount: 231, total: 1331 })
  })

  it('sums mixed-rate lines correctly', () => {
    expect(
      computeInvoiceTotals([
        { quantity: 1, unitPrice: 1000, vatRate: 21 },
        { quantity: 1, unitPrice: 500, vatRate: 0 },
      ]),
    ).toEqual({ subtotal: 1500, vatAmount: 210, total: 1710 })
  })

  it('returns zeros for an empty line list', () => {
    expect(computeInvoiceTotals([])).toEqual({ subtotal: 0, vatAmount: 0, total: 0 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/lib/invoiceMath.test.ts`
Expected: FAIL — `Failed to resolve import "./invoiceMath"`.

- [ ] **Step 3: Implement `src/lib/invoiceMath.ts`**

```ts
export interface InvoiceLineInput {
  quantity: number
  unitPrice: number
  vatRate: number // 21, 9, or 0
}

export interface LineComputed {
  lineSubtotal: number
  lineVat: number
  lineTotal: number
}

export interface InvoiceTotals {
  subtotal: number
  vatAmount: number
  total: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function computeLine(line: InvoiceLineInput): LineComputed {
  const lineSubtotal = round2(line.quantity * line.unitPrice)
  const lineVat = round2(lineSubtotal * (line.vatRate / 100))
  const lineTotal = round2(lineSubtotal + lineVat)
  return { lineSubtotal, lineVat, lineTotal }
}

export function computeInvoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  const computed = lines.map(computeLine)
  const subtotal = round2(computed.reduce((sum, l) => sum + l.lineSubtotal, 0))
  const vatAmount = round2(computed.reduce((sum, l) => sum + l.lineVat, 0))
  const total = round2(subtotal + vatAmount)
  return { subtotal, vatAmount, total }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/lib/invoiceMath.test.ts`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add neoinsent-invoicing/src/lib/invoiceMath.ts neoinsent-invoicing/src/lib/invoiceMath.test.ts
git commit -m "feat: add invoice line and total calculation"
```

---

### Task 5: Session/auth module

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`

Pure logic (HMAC signing via Node's built-in `crypto`, no bcrypt dependency needed since this guards a single shared password) — full TDD coverage, including expiry and tamper cases.

- [ ] **Step 1: Write the failing tests**

`src/lib/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from './session'

describe('hashPassword / verifyPassword', () => {
  it('verifies a matching password', () => {
    const hash = hashPassword('correct-horse-battery-staple')
    expect(verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
  })

  it('rejects a non-matching password', () => {
    const hash = hashPassword('correct-horse-battery-staple')
    expect(verifyPassword('wrong-password', hash)).toBe(false)
  })
})

describe('createSessionToken / verifySessionToken', () => {
  const secret = 'test-session-secret'

  it('verifies a freshly created token', () => {
    const now = Date.now()
    const token = createSessionToken(secret, now)
    expect(verifySessionToken(token, secret, now + 1000)).toBe(true)
  })

  it('rejects a token signed with a different secret', () => {
    const now = Date.now()
    const token = createSessionToken(secret, now)
    expect(verifySessionToken(token, 'other-secret', now + 1000)).toBe(false)
  })

  it('rejects an expired token', () => {
    const now = Date.now()
    const token = createSessionToken(secret, now)
    const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000
    expect(verifySessionToken(token, secret, now + THIRTY_ONE_DAYS_MS)).toBe(false)
  })

  it('rejects a malformed token', () => {
    expect(verifySessionToken('not-a-real-token', secret)).toBe(false)
    expect(verifySessionToken('', secret)).toBe(false)
  })

  it('rejects a token with a tampered expiry', () => {
    const now = Date.now()
    const token = createSessionToken(secret, now)
    const [, signature] = token.split('.')
    const tampered = `${now + 999999999}.${signature}`
    expect(verifySessionToken(tampered, secret, now + 1000)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/lib/session.test.ts`
Expected: FAIL — `Failed to resolve import "./session"`.

- [ ] **Step 3: Implement `src/lib/session.ts`**

```ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex')
}

export function verifyPassword(candidate: string, expectedHash: string): boolean {
  const candidateHash = hashPassword(candidate)
  return safeEqualHex(candidateHash, expectedHash)
}

export function createSessionToken(secret: string, now: number = Date.now()): string {
  const expiresAt = now + SESSION_TTL_MS
  const signature = sign(String(expiresAt), secret)
  return `${expiresAt}.${signature}`
}

export function verifySessionToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): boolean {
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [expiresAtRaw, signature] = parts
  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt)) return false
  if (expiresAt < now) return false
  const expectedSignature = sign(expiresAtRaw, secret)
  return safeEqualHex(signature, expectedSignature)
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/lib/session.test.ts`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add neoinsent-invoicing/src/lib/session.ts neoinsent-invoicing/src/lib/session.test.ts
git commit -m "feat: add password hashing and signed session tokens"
```

---

### Task 6: Supabase project, schema, and admin client

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `src/lib/supabaseAdmin.ts`
- Test: `src/lib/supabaseAdmin.test.ts`

This task provisions real infrastructure. If you have the Supabase MCP tools connected (`mcp__claude_ai_Supabase__*`), use them for steps 1-3; otherwise do the equivalent through the Supabase dashboard and CLI.

- [ ] **Step 1: Create the Supabase project**

Using the Supabase MCP tools: call `list_organizations` to get the target organization id, then `create_project` with a name like `neoinsent-invoicing` and a region close to the Netherlands (e.g. `eu-central-1`). Record the returned project id.

- [ ] **Step 2: Write the migration**

`supabase/migrations/0001_init.sql`:
```sql
create extension if not exists "pgcrypto";

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  email text not null,
  address_line text not null,
  postal_code text not null,
  city text not null,
  country text not null,
  vat_number text,
  kvk_number text,
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  client_id uuid not null references clients(id),
  status text not null default 'draft' check (status in ('draft', 'final')),
  language text not null check (language in ('nl', 'en')),
  vat_treatment text not null check (vat_treatment in ('nl_standard', 'eu_reverse_charge')),
  issue_date date not null,
  due_date date not null,
  notes text,
  subtotal numeric(12, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  pdf_path text,
  paid boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null,
  unit_price numeric(12, 2) not null,
  vat_rate numeric(4, 2) not null,
  line_total numeric(12, 2) not null,
  sort_order int not null default 0
);

create table invoice_counters (
  year int primary key,
  last_number int not null default 0
);

create index invoices_status_idx on invoices (status);
create index invoices_issue_date_idx on invoices (issue_date);
create index invoice_items_invoice_id_idx on invoice_items (invoice_id);

-- Atomically assigns the next gap-free invoice number for a given year.
-- Called once, at finalize time, inside Task 14's API route.
create or replace function next_invoice_number(p_year int)
returns int
language plpgsql
as $$
declare
  next_val int;
begin
  insert into invoice_counters (year, last_number)
  values (p_year, 1)
  on conflict (year) do update set last_number = invoice_counters.last_number + 1
  returning last_number into next_val;
  return next_val;
end;
$$;

-- Private bucket for the permanent, never-regenerated invoice PDFs.
insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;
```

- [ ] **Step 3: Apply the migration**

Using the Supabase MCP tools: call `apply_migration` with the project id from Step 1, a name of `init`, and the SQL from Step 2. Then call `list_tables` to confirm `clients`, `invoices`, `invoice_items`, and `invoice_counters` all exist.

- [ ] **Step 4: Record the project credentials**

Call `get_project_url` for `SUPABASE_URL`. The service role key is deliberately not exposed by any MCP tool — copy it from the Supabase dashboard under Project Settings → API → `service_role` secret. Add both to a local `.env` file (never commit this file — it's already in `.gitignore` from Task 1):
```
SUPABASE_URL=<value from get_project_url>
SUPABASE_SERVICE_ROLE_KEY=<value from the dashboard>
```

- [ ] **Step 5: Write the failing test for the admin client factory**

`src/lib/supabaseAdmin.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest'
import { getSupabaseAdmin } from './supabaseAdmin'

describe('getSupabaseAdmin', () => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  })

  it('throws when env vars are missing', () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => getSupabaseAdmin()).toThrow('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  })

  it('returns a client when env vars are set', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    expect(() => getSupabaseAdmin()).not.toThrow()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm run test -- src/lib/supabaseAdmin.test.ts`
Expected: FAIL — `Failed to resolve import "./supabaseAdmin"`.

- [ ] **Step 7: Implement `src/lib/supabaseAdmin.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test -- src/lib/supabaseAdmin.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 9: Commit**

```bash
git add neoinsent-invoicing/supabase neoinsent-invoicing/src/lib/supabaseAdmin.ts neoinsent-invoicing/src/lib/supabaseAdmin.test.ts
git commit -m "feat: add Supabase schema migration and admin client"
```

---

### Task 7: Cookie helpers and login/logout API routes

**Files:**
- Create: `src/lib/cookies.ts`
- Create: `api/login.ts`
- Create: `api/logout.ts`
- Test: `src/lib/cookies.test.ts`
- Test: `api/login.test.ts`
- Test: `api/logout.test.ts`

- [ ] **Step 1: Write the failing cookie tests**

`src/lib/cookies.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  COOKIE_NAME,
  readSessionCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from './cookies'

describe('serializeSessionCookie', () => {
  it('includes the token and security attributes', () => {
    const header = serializeSessionCookie('abc.def')
    expect(header).toContain(`${COOKIE_NAME}=abc.def`)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Secure')
    expect(header).toContain('SameSite=Strict')
  })
})

describe('serializeClearedSessionCookie', () => {
  it('expires the cookie immediately', () => {
    expect(serializeClearedSessionCookie()).toContain('Max-Age=0')
  })
})

describe('readSessionCookie', () => {
  it('reads the session token from a cookie header', () => {
    expect(readSessionCookie(`other=1; ${COOKIE_NAME}=abc.def; third=2`)).toBe('abc.def')
  })

  it('returns null when the cookie is absent', () => {
    expect(readSessionCookie('other=1')).toBeNull()
  })

  it('returns null for an empty or missing header', () => {
    expect(readSessionCookie(undefined)).toBeNull()
    expect(readSessionCookie('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/lib/cookies.test.ts`
Expected: FAIL — `Failed to resolve import "./cookies"`.

- [ ] **Step 3: Implement `src/lib/cookies.ts`**

```ts
export const COOKIE_NAME = 'ni_session'

export function serializeSessionCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${30 * 24 * 60 * 60}`,
  ].join('; ')
}

export function serializeClearedSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

export function readSessionCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName === COOKIE_NAME) {
      return rawValue.join('=') || null
    }
  }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/lib/cookies.test.ts`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Write the failing test for `api/login.ts`**

`api/login.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './login'
import { hashPassword } from '../src/lib/session'

function createMockRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  res.setHeader = vi.fn((name: string, value: string) => {
    res.headers[name] = value
  })
  return res
}

describe('POST /api/login', () => {
  beforeEach(() => {
    process.env.APP_PASSWORD_HASH = hashPassword('correct-horse-battery-staple')
    process.env.SESSION_SECRET = 'test-secret'
  })

  it('rejects non-POST methods', () => {
    const res = createMockRes()
    handler({ method: 'GET' } as any, res)
    expect(res.statusCode).toBe(405)
  })

  it('rejects a wrong password', () => {
    const res = createMockRes()
    handler({ method: 'POST', body: { password: 'wrong' } } as any, res)
    expect(res.statusCode).toBe(401)
  })

  it('sets a session cookie on the correct password', () => {
    const res = createMockRes()
    handler({ method: 'POST', body: { password: 'correct-horse-battery-staple' } } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Set-Cookie']).toContain('ni_session=')
    expect(res.headers['Set-Cookie']).toContain('HttpOnly')
  })

  it('returns 500 when server env vars are missing', () => {
    delete process.env.APP_PASSWORD_HASH
    const res = createMockRes()
    handler({ method: 'POST', body: { password: 'anything' } } as any, res)
    expect(res.statusCode).toBe(500)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm run test -- api/login.test.ts`
Expected: FAIL — `Failed to resolve import "./login"`.

- [ ] **Step 7: Implement `api/login.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { serializeSessionCookie } from '../src/lib/cookies'
import { createSessionToken, verifyPassword } from '../src/lib/session'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const expectedHash = process.env.APP_PASSWORD_HASH
  const secret = process.env.SESSION_SECRET
  if (!expectedHash || !secret) {
    res.status(500).json({ error: 'Server is not configured' })
    return
  }

  const { password } = (req.body ?? {}) as { password?: unknown }
  if (typeof password !== 'string' || !verifyPassword(password, expectedHash)) {
    res.status(401).json({ error: 'Incorrect password' })
    return
  }

  res.setHeader('Set-Cookie', serializeSessionCookie(createSessionToken(secret)))
  res.status(200).json({ ok: true })
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test -- api/login.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 9: Write the failing test for `api/logout.ts`**

`api/logout.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import handler from './logout'

function createMockRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  res.setHeader = vi.fn((name: string, value: string) => {
    res.headers[name] = value
  })
  return res
}

describe('POST /api/logout', () => {
  it('rejects non-POST methods', () => {
    const res = createMockRes()
    handler({ method: 'GET' } as any, res)
    expect(res.statusCode).toBe(405)
  })

  it('clears the session cookie', () => {
    const res = createMockRes()
    handler({ method: 'POST' } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Set-Cookie']).toContain('Max-Age=0')
  })
})
```

- [ ] **Step 10: Run the test, then implement `api/logout.ts`**

Run: `npm run test -- api/logout.test.ts` — Expected: FAIL (`./logout` not found).

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { serializeClearedSessionCookie } from '../src/lib/cookies'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  res.setHeader('Set-Cookie', serializeClearedSessionCookie())
  res.status(200).json({ ok: true })
}
```

Run: `npm run test -- api/logout.test.ts` — Expected: PASS — 2 tests passed.

- [ ] **Step 11: Commit**

```bash
git add neoinsent-invoicing/src/lib/cookies.ts neoinsent-invoicing/src/lib/cookies.test.ts neoinsent-invoicing/api/login.ts neoinsent-invoicing/api/login.test.ts neoinsent-invoicing/api/logout.ts neoinsent-invoicing/api/logout.test.ts
git commit -m "feat: add login/logout API routes with signed session cookies"
```

---

### Task 8: Auth guard for protected API routes

**Files:**
- Create: `api/_lib/requireSession.ts`
- Test: `api/_lib/requireSession.test.ts`

Files under `api/_lib/` are not treated as routes by Vercel (the leading underscore excludes them), so this is a plain shared helper. Every protected route in later tasks starts with `if (!requireSession(req, res)) return`.

- [ ] **Step 1: Write the failing tests**

`api/_lib/requireSession.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireSession } from './requireSession'
import { createSessionToken } from '../../src/lib/session'

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

describe('requireSession', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret'
  })

  it('returns true for a valid session cookie', () => {
    const token = createSessionToken('test-secret')
    const req: any = { headers: { cookie: `ni_session=${token}` } }
    const res = createMockRes()
    expect(requireSession(req, res)).toBe(true)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns false and responds 401 with no cookie', () => {
    const req: any = { headers: {} }
    const res = createMockRes()
    expect(requireSession(req, res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('returns false and responds 401 with an invalid token', () => {
    const req: any = { headers: { cookie: 'ni_session=garbage' } }
    const res = createMockRes()
    expect(requireSession(req, res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('returns false and responds 500 when SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET
    const req: any = { headers: {} }
    const res = createMockRes()
    expect(requireSession(req, res)).toBe(false)
    expect(res.statusCode).toBe(500)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- api/_lib/requireSession.test.ts`
Expected: FAIL — `Failed to resolve import "./requireSession"`.

- [ ] **Step 3: Implement `api/_lib/requireSession.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSessionCookie } from '../../src/lib/cookies'
import { verifySessionToken } from '../../src/lib/session'

export function requireSession(req: VercelRequest, res: VercelResponse): boolean {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    res.status(500).json({ error: 'Server is not configured' })
    return false
  }
  const token = readSessionCookie(req.headers.cookie)
  if (!token || !verifySessionToken(token, secret)) {
    res.status(401).json({ error: 'Not authenticated' })
    return false
  }
  return true
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- api/_lib/requireSession.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add neoinsent-invoicing/api/_lib/requireSession.ts neoinsent-invoicing/api/_lib/requireSession.test.ts
git commit -m "feat: add session guard for protected API routes"
```

---

### Task 9: Clients API (list + create)

**Files:**
- Create: `api/_lib/clientsRepo.ts`
- Create: `api/clients/index.ts`
- Test: `api/clients/index.test.ts`

The repo module is a thin Supabase pass-through (no branching logic), so it is not separately unit-tested — it's exercised through the route tests below (mocked) and manual verification against the live project from Task 6. The route handler, which does have real logic (method routing, validation, auth), gets full TDD.

- [ ] **Step 1: Implement `api/_lib/clientsRepo.ts`**

```ts
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

export interface Client {
  id: string
  name: string
  contact_person: string | null
  email: string
  address_line: string
  postal_code: string
  city: string
  country: string
  vat_number: string | null
  kvk_number: string | null
  created_at: string
}

export type NewClient = Omit<Client, 'id' | 'created_at'>

export async function listClients(): Promise<Client[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data as Client[]
}

export async function createClient(input: NewClient): Promise<Client> {
  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .insert(input)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Client
}
```

- [ ] **Step 2: Write the failing route tests**

`api/clients/index.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index'
import * as clientsRepo from '../_lib/clientsRepo'
import * as requireSessionModule from '../_lib/requireSession'

vi.mock('../_lib/requireSession')
vi.mock('../_lib/clientsRepo')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

describe('/api/clients', () => {
  beforeEach(() => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
  })

  it('short-circuits when not authenticated', async () => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(false)
    const res = createMockRes()
    await handler({ method: 'GET', headers: {} } as any, res)
    expect(clientsRepo.listClients).not.toHaveBeenCalled()
  })

  it('GET lists clients', async () => {
    vi.mocked(clientsRepo.listClients).mockResolvedValue([{ id: '1', name: 'Acme' } as any])
    const res = createMockRes()
    await handler({ method: 'GET', headers: {} } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ clients: [{ id: '1', name: 'Acme' }] })
  })

  it('POST rejects a body missing required fields', async () => {
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: { name: 'Acme' } } as any, res)
    expect(res.statusCode).toBe(400)
    expect(clientsRepo.createClient).not.toHaveBeenCalled()
  })

  it('POST creates a client with a complete body', async () => {
    const input = {
      name: 'Acme BV',
      email: 'ap@acme.test',
      address_line: 'Main St 1',
      postal_code: '1000AA',
      city: 'Amsterdam',
      country: 'NL',
    }
    vi.mocked(clientsRepo.createClient).mockResolvedValue({ id: '1', ...input } as any)
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body: input } as any, res)
    expect(res.statusCode).toBe(201)
    expect(clientsRepo.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme BV', vat_number: null }),
    )
  })

  it('rejects unsupported methods', async () => {
    const res = createMockRes()
    await handler({ method: 'DELETE', headers: {} } as any, res)
    expect(res.statusCode).toBe(405)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- api/clients/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 4: Implement `api/clients/index.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../_lib/requireSession'
import { createClient, listClients, type NewClient } from '../_lib/clientsRepo'

const REQUIRED_FIELDS: (keyof NewClient)[] = [
  'name',
  'email',
  'address_line',
  'postal_code',
  'city',
  'country',
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return

  if (req.method === 'GET') {
    const clients = await listClients()
    res.status(200).json({ clients })
    return
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Partial<NewClient>
    const missing = REQUIRED_FIELDS.filter((key) => !body[key])
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` })
      return
    }
    const client = await createClient({
      name: body.name!,
      contact_person: body.contact_person ?? null,
      email: body.email!,
      address_line: body.address_line!,
      postal_code: body.postal_code!,
      city: body.city!,
      country: body.country!,
      vat_number: body.vat_number ?? null,
      kvk_number: body.kvk_number ?? null,
    })
    res.status(201).json({ client })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- api/clients/index.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 6: Commit**

```bash
git add neoinsent-invoicing/api/_lib/clientsRepo.ts neoinsent-invoicing/api/clients
git commit -m "feat: add clients list/create API"
```

---

### Task 10: Frontend API client and ClientPicker component

**Files:**
- Create: `src/lib/apiClient.ts`
- Create: `src/components/ClientPicker.tsx`
- Test: `src/lib/apiClient.test.ts`
- Test: `src/components/ClientPicker.test.tsx`

- [ ] **Step 1: Write the failing test for the API client**

`src/lib/apiClient.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './apiClient'

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hello: 'world' }) }),
    )
    await expect(apiFetch('/api/thing')).resolves.toEqual({ hello: 'world' })
  })

  it('throws ApiError with the server message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Bad input' }) }),
    )
    await expect(apiFetch('/api/thing')).rejects.toThrow('Bad input')
  })

  it('sends credentials and JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/thing', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/thing',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })
})

describe('ApiError', () => {
  it('carries the HTTP status', () => {
    const err = new ApiError('Nope', 404)
    expect(err.status).toBe(404)
    expect(err.message).toBe('Nope')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/lib/apiClient.test.ts`
Expected: FAIL — `Failed to resolve import "./apiClient"`.

- [ ] **Step 3: Implement `src/lib/apiClient.ts`**

```ts
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(body.error ?? 'Request failed', res.status)
  }
  return body as T
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/lib/apiClient.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Write the failing test for `ClientPicker`**

`src/components/ClientPicker.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientPicker } from './ClientPicker'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const CLIENTS = [
  { id: '1', name: 'Acme BV', country: 'NL', vat_number: null },
  { id: '2', name: 'Globex GmbH', country: 'DE', vat_number: 'DE123456789' },
]

function stubFetchClients() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clients: CLIENTS }) }),
  )
}

describe('ClientPicker', () => {
  it('loads and lists existing clients', async () => {
    stubFetchClients()
    render(<ClientPicker value={null} onChange={() => {}} />)
    expect(await screen.findByText('Acme BV')).toBeInTheDocument()
    expect(screen.getByText('Globex GmbH')).toBeInTheDocument()
  })

  it('calls onChange with the selected client object', async () => {
    stubFetchClients()
    const onChange = vi.fn()
    render(<ClientPicker value={null} onChange={onChange} />)
    await screen.findByText('Acme BV')
    await userEvent.selectOptions(screen.getByLabelText('Client'), '2')
    expect(onChange).toHaveBeenCalledWith(CLIENTS[1])
  })

  it('reveals the inline new-client form and submits it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ clients: CLIENTS }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          client: { id: '3', name: 'New Co', country: 'FR', vat_number: 'FR12345678901' },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    render(<ClientPicker value={null} onChange={onChange} />)
    await screen.findByText('Acme BV')

    await userEvent.click(screen.getByText('+ New client'))
    await userEvent.type(screen.getByLabelText('Name'), 'New Co')
    await userEvent.type(screen.getByLabelText('Email'), 'ap@newco.test')
    await userEvent.type(screen.getByLabelText('Address'), 'Rue 1')
    await userEvent.type(screen.getByLabelText('Postal code'), '75001')
    await userEvent.type(screen.getByLabelText('City'), 'Paris')
    await userEvent.type(screen.getByLabelText('Country'), 'FR')
    await userEvent.click(screen.getByText('Save client'))

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        id: '3',
        name: 'New Co',
        country: 'FR',
        vat_number: 'FR12345678901',
      }),
    )
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm run test -- src/components/ClientPicker.test.tsx`
Expected: FAIL — `Failed to resolve import "./ClientPicker"`.

- [ ] **Step 7: Implement `src/components/ClientPicker.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiClient'

export interface ClientSummary {
  id: string
  name: string
  country: string
  vat_number: string | null
}

interface NewClientForm {
  name: string
  email: string
  address_line: string
  postal_code: string
  city: string
  country: string
  vat_number: string
  kvk_number: string
}

const EMPTY_FORM: NewClientForm = {
  name: '',
  email: '',
  address_line: '',
  postal_code: '',
  city: '',
  country: '',
  vat_number: '',
  kvk_number: '',
}

interface ClientPickerProps {
  value: ClientSummary | null
  onChange: (client: ClientSummary) => void
}

export function ClientPicker({ value, onChange }: ClientPickerProps) {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewClientForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch<{ clients: ClientSummary[] }>('/api/clients').then((res) => setClients(res.clients))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await apiFetch<{ client: ClientSummary }>('/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          vat_number: form.vat_number || null,
          kvk_number: form.kvk_number || null,
        }),
      })
      setClients((prev) => [...prev, res.client])
      setForm(EMPTY_FORM)
      setShowForm(false)
      onChange(res.client)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label htmlFor="client-select">Client</label>
      <select
        id="client-select"
        value={value?.id ?? ''}
        onChange={(e) => {
          const client = clients.find((c) => c.id === e.target.value)
          if (client) onChange(client)
        }}
      >
        <option value="" disabled>
          Select a client
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {!showForm && (
        <button type="button" className="btn" onClick={() => setShowForm(true)}>
          + New client
        </button>
      )}
      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <label htmlFor="new-client-name">Name</label>
          <input
            id="new-client-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <label htmlFor="new-client-email">Email</label>
          <input
            id="new-client-email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <label htmlFor="new-client-address">Address</label>
          <input
            id="new-client-address"
            value={form.address_line}
            onChange={(e) => setForm({ ...form, address_line: e.target.value })}
          />
          <label htmlFor="new-client-postal">Postal code</label>
          <input
            id="new-client-postal"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
          <label htmlFor="new-client-city">City</label>
          <input
            id="new-client-city"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <label htmlFor="new-client-country">Country</label>
          <input
            id="new-client-country"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
            placeholder="NL, DE, FR..."
          />
          <label htmlFor="new-client-vat">VAT number (EU clients)</label>
          <input
            id="new-client-vat"
            value={form.vat_number}
            onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
          />
          <label htmlFor="new-client-kvk">KVK number (NL clients)</label>
          <input
            id="new-client-kvk"
            value={form.kvk_number}
            onChange={(e) => setForm({ ...form, kvk_number: e.target.value })}
          />
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
            Save client
          </button>
        </div>
      )}
    </div>
  )
}
```

Labels use `htmlFor`/`id` pairs that match the test's `getByLabelText` queries. Note the test's `getByLabelText('Name')` matches the `new-client-name` field because it's the only input whose label text is exactly "Name" — same reasoning for the other fields.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test -- src/components/ClientPicker.test.tsx`
Expected: PASS — 3 tests passed.

- [ ] **Step 9: Commit**

```bash
git add neoinsent-invoicing/src/lib/apiClient.ts neoinsent-invoicing/src/lib/apiClient.test.ts neoinsent-invoicing/src/components/ClientPicker.tsx neoinsent-invoicing/src/components/ClientPicker.test.tsx neoinsent-invoicing/package.json neoinsent-invoicing/package-lock.json
git commit -m "feat: add frontend API client and ClientPicker component"
```

---

### Task 11: Quarter date-range helper, invoices repo, and list/create API

**Files:**
- Create: `src/lib/dateRanges.ts`
- Create: `api/_lib/invoicesRepo.ts`
- Create: `api/invoices/index.ts`
- Test: `src/lib/dateRanges.test.ts`
- Test: `api/invoices/index.test.ts`

- [ ] **Step 1: Write the failing test for the date-range helper**

`src/lib/dateRanges.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { quarterDateRange } from './dateRanges'

describe('quarterDateRange', () => {
  it('returns the full year when no quarter is given', () => {
    expect(quarterDateRange(2026)).toEqual({ fromDate: '2026-01-01', toDate: '2026-12-31' })
  })

  it('returns Q1 (Jan-Mar)', () => {
    expect(quarterDateRange(2026, 1)).toEqual({ fromDate: '2026-01-01', toDate: '2026-03-31' })
  })

  it('returns Q2 (Apr-Jun)', () => {
    expect(quarterDateRange(2026, 2)).toEqual({ fromDate: '2026-04-01', toDate: '2026-06-30' })
  })

  it('returns Q4 (Oct-Dec)', () => {
    expect(quarterDateRange(2026, 4)).toEqual({ fromDate: '2026-10-01', toDate: '2026-12-31' })
  })
})
```

- [ ] **Step 2: Run the test, then implement `src/lib/dateRanges.ts`**

Run: `npm run test -- src/lib/dateRanges.test.ts` — Expected: FAIL (`./dateRanges` not found).

```ts
export function quarterDateRange(
  year: number,
  quarter?: 1 | 2 | 3 | 4,
): { fromDate: string; toDate: string } {
  if (!quarter) {
    return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` }
  }
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const lastDay = new Date(year, endMonth, 0).getDate()
  return {
    fromDate: `${year}-${pad(startMonth)}-01`,
    toDate: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
```

Run: `npm run test -- src/lib/dateRanges.test.ts` — Expected: PASS — 4 tests passed.

- [ ] **Step 3: Implement `api/_lib/invoicesRepo.ts`**

```ts
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'
import { computeInvoiceTotals } from '../../src/lib/invoiceMath'
import type { InvoiceVatTreatment } from '../../src/lib/vat'

export interface InvoiceItemInput {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
}

export interface DraftInvoiceInput {
  client_id: string
  language: 'nl' | 'en'
  vat_treatment: InvoiceVatTreatment
  issue_date: string
  due_date: string
  notes: string | null
  items: InvoiceItemInput[]
}

export interface InvoiceSummary {
  id: string
  invoice_number: string | null
  client_id: string
  status: 'draft' | 'final'
  vat_treatment: InvoiceVatTreatment
  issue_date: string
  subtotal: number
  vat_amount: number
  total: number
  paid: boolean
}

export async function createDraftInvoice(input: DraftInvoiceInput) {
  const totals = computeInvoiceTotals(input.items)
  const admin = getSupabaseAdmin()

  const { data: invoice, error: invoiceError } = await admin
    .from('invoices')
    .insert({
      client_id: input.client_id,
      status: 'draft',
      language: input.language,
      vat_treatment: input.vat_treatment,
      issue_date: input.issue_date,
      due_date: input.due_date,
      notes: input.notes,
      subtotal: totals.subtotal,
      vat_amount: totals.vatAmount,
      total: totals.total,
    })
    .select()
    .single()
  if (invoiceError) throw new Error(invoiceError.message)

  const itemRows = input.items.map((item, index) => ({
    invoice_id: invoice.id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    vat_rate: item.vat_rate,
    line_total: computeInvoiceTotals([item]).total,
    sort_order: index,
  }))
  const { error: itemsError } = await admin.from('invoice_items').insert(itemRows)
  if (itemsError) throw new Error(itemsError.message)

  return invoice
}

export interface ListInvoicesFilter {
  fromDate?: string
  toDate?: string
}

export async function listInvoices(filter: ListInvoicesFilter = {}): Promise<InvoiceSummary[]> {
  let query = getSupabaseAdmin()
    .from('invoices')
    .select(
      'id, invoice_number, client_id, status, vat_treatment, issue_date, subtotal, vat_amount, total, paid',
    )
    .order('issue_date', { ascending: false })

  if (filter.fromDate) query = query.gte('issue_date', filter.fromDate)
  if (filter.toDate) query = query.lte('issue_date', filter.toDate)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as InvoiceSummary[]
}
```

- [ ] **Step 4: Write the failing route tests**

`api/invoices/index.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index'
import * as invoicesRepo from '../_lib/invoicesRepo'
import * as requireSessionModule from '../_lib/requireSession'

vi.mock('../_lib/requireSession')
vi.mock('../_lib/invoicesRepo')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

describe('/api/invoices', () => {
  beforeEach(() => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
  })

  it('GET without filters lists all invoices', async () => {
    vi.mocked(invoicesRepo.listInvoices).mockResolvedValue([{ id: '1' } as any])
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: {} } as any, res)
    expect(invoicesRepo.listInvoices).toHaveBeenCalledWith({})
    expect(res.statusCode).toBe(200)
  })

  it('GET with year+quarter narrows the date range', async () => {
    vi.mocked(invoicesRepo.listInvoices).mockResolvedValue([])
    const res = createMockRes()
    await handler(
      { method: 'GET', headers: {}, query: { year: '2026', quarter: '2' } } as any,
      res,
    )
    expect(invoicesRepo.listInvoices).toHaveBeenCalledWith({
      fromDate: '2026-04-01',
      toDate: '2026-06-30',
    })
  })

  it('POST rejects an invoice with no line items', async () => {
    const res = createMockRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          client_id: '1',
          language: 'nl',
          vat_treatment: 'nl_standard',
          issue_date: '2026-11-02',
          due_date: '2026-11-16',
          items: [],
        },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(invoicesRepo.createDraftInvoice).not.toHaveBeenCalled()
  })

  it('POST creates a draft invoice with a valid body', async () => {
    const body = {
      client_id: '1',
      language: 'nl',
      vat_treatment: 'nl_standard',
      issue_date: '2026-11-02',
      due_date: '2026-11-16',
      items: [{ description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 21 }],
    }
    vi.mocked(invoicesRepo.createDraftInvoice).mockResolvedValue({ id: '1', ...body } as any)
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, body } as any, res)
    expect(res.statusCode).toBe(201)
    expect(invoicesRepo.createDraftInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: '1', notes: null }),
    )
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm run test -- api/invoices/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 6: Implement `api/invoices/index.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../_lib/requireSession'
import { createDraftInvoice, listInvoices, type DraftInvoiceInput } from '../_lib/invoicesRepo'
import { quarterDateRange } from '../../src/lib/dateRanges'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return

  if (req.method === 'GET') {
    const { year, quarter } = req.query
    const filter: { fromDate?: string; toDate?: string } = {}
    if (typeof year === 'string') {
      const q = typeof quarter === 'string' ? (Number(quarter) as 1 | 2 | 3 | 4) : undefined
      const range = quarterDateRange(Number(year), q)
      filter.fromDate = range.fromDate
      filter.toDate = range.toDate
    }
    const invoices = await listInvoices(filter)
    res.status(200).json({ invoices })
    return
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Partial<DraftInvoiceInput>
    if (
      !body.client_id ||
      !body.language ||
      !body.vat_treatment ||
      !body.issue_date ||
      !body.due_date ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      res.status(400).json({ error: 'Missing or invalid invoice fields' })
      return
    }
    const invoice = await createDraftInvoice({
      client_id: body.client_id,
      language: body.language,
      vat_treatment: body.vat_treatment,
      issue_date: body.issue_date,
      due_date: body.due_date,
      notes: body.notes ?? null,
      items: body.items,
    })
    res.status(201).json({ invoice })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test -- api/invoices/index.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 8: Commit**

```bash
git add neoinsent-invoicing/src/lib/dateRanges.ts neoinsent-invoicing/src/lib/dateRanges.test.ts neoinsent-invoicing/api/_lib/invoicesRepo.ts neoinsent-invoicing/api/invoices
git commit -m "feat: add invoices list/create API with quarter filtering"
```

---

### Task 12: Get single invoice and update a draft

**Files:**
- Modify: `api/_lib/invoicesRepo.ts` (add `getInvoice`, `updateDraftInvoice`, `DraftLockedError`)
- Create: `api/invoices/[id].ts`
- Test: `api/invoices/[id].test.ts`

- [ ] **Step 1: Add `getInvoice`, `DraftLockedError`, and `updateDraftInvoice` to `api/_lib/invoicesRepo.ts`**

Append to the file from Task 11:
```ts
export interface InvoiceWithDetails extends InvoiceSummary {
  due_date: string
  notes: string | null
  subtotal: number
  vat_amount: number
  language: 'nl' | 'en'
  pdf_path: string | null
  sent_at: string | null
  client: {
    id: string
    name: string
    email: string
    address_line: string
    postal_code: string
    city: string
    country: string
    vat_number: string | null
    kvk_number: string | null
  }
  items: {
    id: string
    description: string
    quantity: number
    unit_price: number
    vat_rate: number
    line_total: number
    sort_order: number
  }[]
}

export async function getInvoice(id: string): Promise<InvoiceWithDetails | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('invoices')
    .select('*, client:clients(*), items:invoice_items(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    ...data,
    items: (data.items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  } as InvoiceWithDetails
}

export class DraftLockedError extends Error {
  constructor() {
    super('Invoice is already finalized and cannot be edited')
  }
}

export async function updateDraftInvoice(
  id: string,
  input: DraftInvoiceInput,
): Promise<InvoiceWithDetails> {
  const admin = getSupabaseAdmin()

  const { data: existing, error: fetchError } = await admin
    .from('invoices')
    .select('status')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) throw new Error(fetchError.message)
  if (!existing) throw new Error('Invoice not found')
  if (existing.status !== 'draft') throw new DraftLockedError()

  const totals = computeInvoiceTotals(input.items)

  const { error: updateError } = await admin
    .from('invoices')
    .update({
      client_id: input.client_id,
      language: input.language,
      vat_treatment: input.vat_treatment,
      issue_date: input.issue_date,
      due_date: input.due_date,
      notes: input.notes,
      subtotal: totals.subtotal,
      vat_amount: totals.vatAmount,
      total: totals.total,
    })
    .eq('id', id)
  if (updateError) throw new Error(updateError.message)

  const { error: deleteError } = await admin.from('invoice_items').delete().eq('invoice_id', id)
  if (deleteError) throw new Error(deleteError.message)

  const itemRows = input.items.map((item, index) => ({
    invoice_id: id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    vat_rate: item.vat_rate,
    line_total: computeInvoiceTotals([item]).total,
    sort_order: index,
  }))
  const { error: insertError } = await admin.from('invoice_items').insert(itemRows)
  if (insertError) throw new Error(insertError.message)

  const refreshed = await getInvoice(id)
  if (!refreshed) throw new Error('Invoice not found after update')
  return refreshed
}
```

- [ ] **Step 2: Write the failing route tests**

`api/invoices/[id].test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './[id]'
import * as invoicesRepo from '../_lib/invoicesRepo'
import * as requireSessionModule from '../_lib/requireSession'

vi.mock('../_lib/requireSession')
vi.mock('../_lib/invoicesRepo', async () => {
  const actual =
    await vi.importActual<typeof import('../_lib/invoicesRepo')>('../_lib/invoicesRepo')
  return { ...actual, getInvoice: vi.fn(), updateDraftInvoice: vi.fn() }
})

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

const VALID_BODY = {
  client_id: '1',
  language: 'nl',
  vat_treatment: 'nl_standard',
  issue_date: '2026-11-02',
  due_date: '2026-11-16',
  items: [{ description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 21 }],
}

describe('/api/invoices/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
  })

  it('rejects a missing id', async () => {
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: {} } as any, res)
    expect(res.statusCode).toBe(400)
  })

  it('GET returns 404 when the invoice does not exist', async () => {
    vi.mocked(invoicesRepo.getInvoice).mockResolvedValue(null)
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: { id: 'missing' } } as any, res)
    expect(res.statusCode).toBe(404)
  })

  it('GET returns the invoice when found', async () => {
    vi.mocked(invoicesRepo.getInvoice).mockResolvedValue({ id: '1' } as any)
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: { id: '1' } } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ invoice: { id: '1' } })
  })

  it('PATCH rejects an incomplete body', async () => {
    const res = createMockRes()
    await handler(
      { method: 'PATCH', headers: {}, query: { id: '1' }, body: { client_id: '1' } } as any,
      res,
    )
    expect(res.statusCode).toBe(400)
  })

  it('PATCH updates a draft invoice', async () => {
    vi.mocked(invoicesRepo.updateDraftInvoice).mockResolvedValue({
      id: '1',
      ...VALID_BODY,
    } as any)
    const res = createMockRes()
    await handler(
      { method: 'PATCH', headers: {}, query: { id: '1' }, body: VALID_BODY } as any,
      res,
    )
    expect(res.statusCode).toBe(200)
  })

  it('PATCH returns 409 when the invoice is already finalized', async () => {
    vi.mocked(invoicesRepo.updateDraftInvoice).mockRejectedValue(
      new invoicesRepo.DraftLockedError(),
    )
    const res = createMockRes()
    await handler(
      { method: 'PATCH', headers: {}, query: { id: '1' }, body: VALID_BODY } as any,
      res,
    )
    expect(res.statusCode).toBe(409)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- api/invoices/\[id\].test.ts`
Expected: FAIL — `Failed to resolve import "./[id]"`.

- [ ] **Step 4: Implement `api/invoices/[id].ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../_lib/requireSession'
import {
  DraftLockedError,
  getInvoice,
  updateDraftInvoice,
  type DraftInvoiceInput,
} from '../_lib/invoicesRepo'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return

  const { id } = req.query
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid invoice id' })
    return
  }

  if (req.method === 'GET') {
    const invoice = await getInvoice(id)
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }
    res.status(200).json({ invoice })
    return
  }

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as Partial<DraftInvoiceInput>
    if (
      !body.client_id ||
      !body.language ||
      !body.vat_treatment ||
      !body.issue_date ||
      !body.due_date ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      res.status(400).json({ error: 'Missing or invalid invoice fields' })
      return
    }
    try {
      const invoice = await updateDraftInvoice(id, {
        client_id: body.client_id,
        language: body.language,
        vat_treatment: body.vat_treatment,
        issue_date: body.issue_date,
        due_date: body.due_date,
        notes: body.notes ?? null,
        items: body.items,
      })
      res.status(200).json({ invoice })
    } catch (err) {
      if (err instanceof DraftLockedError) {
        res.status(409).json({ error: err.message })
        return
      }
      throw err
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- api/invoices/\[id\].test.ts`
Expected: PASS — 6 tests passed.

- [ ] **Step 6: Commit**

```bash
git add neoinsent-invoicing/api/_lib/invoicesRepo.ts neoinsent-invoicing/api/invoices
git commit -m "feat: add get/update-draft API for a single invoice"
```

---

### Task 13: Currency formatting and the InvoiceLineItems component

**Files:**
- Create: `src/lib/format.ts`
- Create: `src/components/InvoiceLineItems.tsx`
- Test: `src/lib/format.test.ts`
- Test: `src/components/InvoiceLineItems.test.tsx`

- [ ] **Step 1: Write the failing test for currency formatting**

`src/lib/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatCurrency } from './format'

describe('formatCurrency', () => {
  it('formats whole euros with Dutch thousands/decimal separators', () => {
    const result = formatCurrency(1210)
    expect(result).toContain('€')
    expect(result).toMatch(/1\.210,00/)
  })

  it('formats cents correctly', () => {
    expect(formatCurrency(72.56)).toMatch(/72,56/)
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toMatch(/0,00/)
  })
})
```

(Values are matched with `toMatch` rather than an exact string because `Intl.NumberFormat` may use a narrow no-break space between the symbol and the number depending on the ICU data bundled with the Node version running the tests.)

- [ ] **Step 2: Run the test, then implement `src/lib/format.ts`**

Run: `npm run test -- src/lib/format.test.ts` — Expected: FAIL (`./format` not found).

```ts
const nlEuroFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })

export function formatCurrency(amount: number): string {
  return nlEuroFormatter.format(amount)
}
```

Run: `npm run test -- src/lib/format.test.ts` — Expected: PASS — 3 tests passed.

- [ ] **Step 3: Write the failing test for `InvoiceLineItems`**

`src/components/InvoiceLineItems.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InvoiceLineItems, type LineItemRow } from './InvoiceLineItems'

const ITEMS: LineItemRow[] = [
  { description: 'Consulting', quantity: 10, unitPrice: 100, vatRate: 21 },
]

describe('InvoiceLineItems', () => {
  it('shows computed totals for the given items', () => {
    render(<InvoiceLineItems items={ITEMS} onChange={() => {}} defaultVatRate={21} />)
    expect(screen.getByText(/1\.210,00/)).toBeInTheDocument()
  })

  it('adds a new blank line with the default VAT rate', async () => {
    const onChange = vi.fn()
    render(<InvoiceLineItems items={ITEMS} onChange={onChange} defaultVatRate={0} />)
    await userEvent.click(screen.getByText('+ Add line'))
    expect(onChange).toHaveBeenCalledWith([
      ...ITEMS,
      { description: '', quantity: 1, unitPrice: 0, vatRate: 0 },
    ])
  })

  it('removes a line', async () => {
    const onChange = vi.fn()
    render(<InvoiceLineItems items={ITEMS} onChange={onChange} defaultVatRate={21} />)
    await userEvent.click(screen.getByText('Remove'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('updates a field on an existing line', async () => {
    const onChange = vi.fn()
    render(<InvoiceLineItems items={ITEMS} onChange={onChange} defaultVatRate={21} />)
    await userEvent.clear(screen.getByLabelText('Quantity 1'))
    await userEvent.type(screen.getByLabelText('Quantity 1'), '5')
    expect(onChange).toHaveBeenLastCalledWith([{ ...ITEMS[0], quantity: 5 }])
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test -- src/components/InvoiceLineItems.test.tsx`
Expected: FAIL — `Failed to resolve import "./InvoiceLineItems"`.

- [ ] **Step 5: Implement `src/components/InvoiceLineItems.tsx`**

```tsx
import { computeInvoiceTotals, type InvoiceLineInput } from '../lib/invoiceMath'
import { formatCurrency } from '../lib/format'

export interface LineItemRow extends InvoiceLineInput {
  description: string
}

interface InvoiceLineItemsProps {
  items: LineItemRow[]
  onChange: (items: LineItemRow[]) => void
  defaultVatRate: number
}

export function InvoiceLineItems({ items, onChange, defaultVatRate }: InvoiceLineItemsProps) {
  const totals = computeInvoiceTotals(items)

  function updateItem(index: number, patch: Partial<LineItemRow>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function addItem() {
    onChange([...items, { description: '', quantity: 1, unitPrice: 0, vatRate: defaultVatRate }])
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>VAT %</th>
            <th>Line total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <td>
                <input
                  aria-label={`Description ${index + 1}`}
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Quantity ${index + 1}`}
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Unit price ${index + 1}`}
                  type="number"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`VAT rate ${index + 1}`}
                  type="number"
                  value={item.vatRate}
                  onChange={(e) => updateItem(index, { vatRate: Number(e.target.value) })}
                />
              </td>
              <td className="num">{formatCurrency(computeInvoiceTotals([item]).total)}</td>
              <td>
                <button type="button" className="btn" onClick={() => removeItem(index)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn" onClick={addItem}>
        + Add line
      </button>
      <div style={{ textAlign: 'right', marginTop: 12 }}>
        <div>
          Subtotal: <span className="num">{formatCurrency(totals.subtotal)}</span>
        </div>
        <div>
          VAT: <span className="num">{formatCurrency(totals.vatAmount)}</span>
        </div>
        <div>
          <b>
            Total: <span className="num">{formatCurrency(totals.total)}</span>
          </b>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- src/components/InvoiceLineItems.test.tsx`
Expected: PASS — 4 tests passed.

- [ ] **Step 7: Commit**

```bash
git add neoinsent-invoicing/src/lib/format.ts neoinsent-invoicing/src/lib/format.test.ts neoinsent-invoicing/src/components/InvoiceLineItems.tsx neoinsent-invoicing/src/components/InvoiceLineItems.test.tsx
git commit -m "feat: add currency formatting and line-items editor"
```

---

### Task 14: NewInvoicePage

**Files:**
- Create: `src/routes/NewInvoicePage.tsx`
- Test: `src/routes/NewInvoicePage.test.tsx`

Wires `ClientPicker`, `InvoiceLineItems`, and `determineVatTreatment` together, and posts the draft to `/api/invoices`.

- [ ] **Step 1: Write the failing tests**

`src/routes/NewInvoicePage.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewInvoicePage } from './NewInvoicePage'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  navigateMock.mockClear()
})

const CLIENTS = [
  { id: '1', name: 'Acme BV', country: 'NL', vat_number: null },
  { id: '2', name: 'Globex GmbH', country: 'DE', vat_number: null },
]

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<any>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

describe('NewInvoicePage', () => {
  it('warns when the selected EU client has no VAT number', async () => {
    stubFetch(async (url) => {
      if (url === '/api/clients') return { ok: true, json: async () => ({ clients: CLIENTS }) }
      throw new Error(`unexpected fetch ${url}`)
    })
    render(<NewInvoicePage />, { wrapper: MemoryRouter })
    await screen.findByText('Acme BV')
    await userEvent.selectOptions(screen.getByLabelText('Client'), '2')
    expect(screen.getByText(/EU but has no VAT number/)).toBeInTheDocument()
  })

  it('disables Save draft until a client is selected', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ clients: CLIENTS }) }))
    render(<NewInvoicePage />, { wrapper: MemoryRouter })
    await screen.findByText('Acme BV')
    expect(screen.getByText('Save draft')).toBeDisabled()
  })

  it('saves a draft for an NL client and navigates to its detail page', async () => {
    stubFetch(async (url, init) => {
      if (url === '/api/clients') return { ok: true, json: async () => ({ clients: CLIENTS }) }
      if (url === '/api/invoices' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ invoice: { id: 'inv-1' } }) }
      }
      throw new Error(`unexpected fetch ${url} ${init?.method}`)
    })
    render(<NewInvoicePage />, { wrapper: MemoryRouter })
    await screen.findByText('Acme BV')
    await userEvent.selectOptions(screen.getByLabelText('Client'), '1')
    await userEvent.click(screen.getByText('+ Add line'))
    await userEvent.type(screen.getByLabelText('Description 1'), 'Consulting')
    await userEvent.click(screen.getByText('Save draft'))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/invoices/inv-1'))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/routes/NewInvoicePage.test.tsx`
Expected: FAIL — `Failed to resolve import "./NewInvoicePage"`.

- [ ] **Step 3: Implement `src/routes/NewInvoicePage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClientPicker, type ClientSummary } from '../components/ClientPicker'
import { InvoiceLineItems, type LineItemRow } from '../components/InvoiceLineItems'
import { apiFetch } from '../lib/apiClient'
import { determineVatTreatment } from '../lib/vat'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function NewInvoicePage() {
  const navigate = useNavigate()
  const [client, setClient] = useState<ClientSummary | null>(null)
  const [issueDate, setIssueDate] = useState(todayIsoDate())
  const [dueDate, setDueDate] = useState(addDaysIso(todayIsoDate(), 14))
  const [language, setLanguage] = useState<'nl' | 'en' | null>(null)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItemRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const vat = useMemo(
    () => (client ? determineVatTreatment(client.country, client.vat_number) : null),
    [client],
  )

  const effectiveLanguage = language ?? (client?.country === 'NL' ? 'nl' : 'en')

  function handleClientChange(selected: ClientSummary) {
    setClient(selected)
    const nextVat = determineVatTreatment(selected.country, selected.vat_number)
    if (nextVat.defaultRate !== null) {
      setItems((prev) => prev.map((item) => ({ ...item, vatRate: nextVat.defaultRate! })))
    }
  }

  async function handleSaveDraft() {
    if (!client || !vat || vat.defaultRate === null) return
    setSaving(true)
    setError(null)
    try {
      const result = await apiFetch<{ invoice: { id: string } }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          client_id: client.id,
          language: effectiveLanguage,
          vat_treatment: vat.treatment,
          issue_date: issueDate,
          due_date: dueDate,
          notes: notes || null,
          items: items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            vat_rate: item.vatRate,
          })),
        }),
      })
      navigate(`/invoices/${result.invoice.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  const canSave = Boolean(client) && vat?.defaultRate !== null && items.length > 0 && !saving

  return (
    <div>
      <h1>New invoice</h1>
      <ClientPicker value={client} onChange={handleClientChange} />

      {vat?.treatment === 'blocked_missing_vat_number' && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          This client is in the EU but has no VAT number on file. Add one to issue a
          reverse-charge invoice, or treat them as a standard NL sale.
        </p>
      )}
      {vat?.treatment === 'not_supported' && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          This client&apos;s country isn&apos;t supported yet (NL and EU business clients only).
        </p>
      )}

      <div className="card">
        <label htmlFor="issue-date">Issue date</label>
        <input
          id="issue-date"
          type="date"
          value={issueDate}
          onChange={(e) => setIssueDate(e.target.value)}
        />

        <label htmlFor="due-date">Due date</label>
        <input id="due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

        <label htmlFor="invoice-language">Language</label>
        <select
          id="invoice-language"
          value={effectiveLanguage}
          onChange={(e) => setLanguage(e.target.value as 'nl' | 'en')}
        >
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
        </select>

        <label htmlFor="invoice-notes">Notes</label>
        <textarea id="invoice-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <InvoiceLineItems items={items} onChange={setItems} defaultVatRate={vat?.defaultRate ?? 21} />

      {error && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <button type="button" className="btn btn-primary" disabled={!canSave} onClick={handleSaveDraft}>
        Save draft
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/routes/NewInvoicePage.test.tsx`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add neoinsent-invoicing/src/routes/NewInvoicePage.tsx neoinsent-invoicing/src/routes/NewInvoicePage.test.tsx
git commit -m "feat: add New Invoice page"
```

---

### Task 15: PDF generation module

**Files:**
- Modify: `vercel.json` (bundle `assets/` into the serverless functions)
- Create: `api/_lib/invoicePdf.tsx`
- Test: `api/_lib/invoicePdf.test.tsx`

Renders the approved Minimal Modern layout with `@react-pdf/renderer`, server-side, in whichever single language the invoice was created in (not bilingual).

- [ ] **Step 1: Make sure the logo ships with the serverless functions**

Replace `vercel.json` from Task 1 with:
```json
{
  "functions": {
    "api/**/*.{ts,tsx}": {
      "includeFiles": "assets/**"
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

`api/_lib/invoicePdf.test.tsx`:
```tsx
// @vitest-environment node
//
// Forced to the plain Node environment (instead of the project-wide jsdom
// one) because @react-pdf/renderer resolves a different, browser-targeted
// build when a `window` global is present, which breaks server-side
// rendering in tests.
import { describe, expect, it } from 'vitest'
import { renderInvoicePdf, type InvoicePdfData } from './invoicePdf'

const BASE_DATA: InvoicePdfData = {
  invoiceNumber: 'NEO-2026-0001',
  language: 'nl',
  vatTreatment: 'nl_standard',
  issueDate: '2026-11-02',
  dueDate: '2026-11-16',
  notes: null,
  subtotal: 1000,
  vatAmount: 210,
  total: 1210,
  client: {
    name: 'Acme BV',
    addressLine: 'Hoofdstraat 1',
    postalCode: '1000AA',
    city: 'Amsterdam',
    country: 'NL',
    vatNumber: null,
  },
  items: [
    { description: 'Consulting', quantity: 10, unitPrice: 100, vatRate: 21, lineTotal: 1210 },
  ],
}

describe('renderInvoicePdf', () => {
  it('renders a valid PDF for an NL-standard, Dutch-language invoice', async () => {
    const buffer = await renderInvoicePdf(BASE_DATA)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 4).toString('utf8')).toBe('%PDF')
  })

  it('renders a valid PDF for an EU reverse-charge, English-language invoice', async () => {
    const buffer = await renderInvoicePdf({
      ...BASE_DATA,
      language: 'en',
      vatTreatment: 'eu_reverse_charge',
      vatAmount: 0,
      total: 1000,
      client: { ...BASE_DATA.client, country: 'DE', vatNumber: 'DE123456789' },
      items: [
        { description: 'Consulting', quantity: 10, unitPrice: 100, vatRate: 0, lineTotal: 1000 },
      ],
    })
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 4).toString('utf8')).toBe('%PDF')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- api/_lib/invoicePdf.test.tsx`
Expected: FAIL — `Failed to resolve import "./invoicePdf"`.

- [ ] **Step 4: Implement `api/_lib/invoicePdf.tsx`**

```tsx
import path from 'node:path'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { InvoiceVatTreatment } from '../../src/lib/vat'

const LOGO_PATH = path.join(process.cwd(), 'assets', 'neoinsent-logo.png')

const COMPANY = {
  name: 'NeoInsent AI',
  kvk: '96887176',
  vat: 'NL005235763B30',
  iban: 'NL62BUNQ2202589686',
  bic: 'BUNQNL2A',
  addressLine: 'Wagenlaan',
  postalCode: '6225KE',
  city: 'Maastricht',
  email: 'finance@neoinsentai.com',
}

const LABELS = {
  nl: {
    invoice: 'Factuur',
    billTo: 'Aan',
    issueDate: 'Factuurdatum',
    dueDate: 'Vervaldatum',
    description: 'Omschrijving',
    quantity: 'Aantal',
    unitPrice: 'Prijs',
    vat: 'BTW',
    lineTotal: 'Totaal',
    subtotal: 'Subtotaal',
    vatAmount: 'BTW bedrag',
    total: 'Totaal',
    reverseCharge: 'BTW verlegd naar de ontvanger.',
    vatNumber: 'BTW-nummer',
    kvkNumber: 'KVK-nummer',
    iban: 'IBAN',
    notes: 'Opmerkingen',
  },
  en: {
    invoice: 'Invoice',
    billTo: 'Bill to',
    issueDate: 'Issue date',
    dueDate: 'Due date',
    description: 'Description',
    quantity: 'Qty',
    unitPrice: 'Unit price',
    vat: 'VAT',
    lineTotal: 'Total',
    subtotal: 'Subtotal',
    vatAmount: 'VAT amount',
    total: 'Total',
    reverseCharge: 'VAT reverse-charged to the recipient.',
    vatNumber: 'VAT number',
    kvkNumber: 'KVK number',
    iban: 'IBAN',
    notes: 'Notes',
  },
} as const

export interface InvoicePdfData {
  invoiceNumber: string
  language: 'nl' | 'en'
  vatTreatment: InvoiceVatTreatment
  issueDate: string
  dueDate: string
  notes: string | null
  subtotal: number
  vatAmount: number
  total: number
  client: {
    name: string
    addressLine: string
    postalCode: string
    city: string
    country: string
    vatNumber: string | null
  }
  items: {
    description: string
    quantity: number
    unitPrice: number
    vatRate: number
    lineTotal: number
  }[]
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#111a2e' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 140 },
  docTitle: { fontSize: 16, fontWeight: 700, textAlign: 'right' },
  muted: { color: '#5b6b85' },
  hr: { borderBottomWidth: 1, borderBottomColor: '#dde3ec', marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  table: { marginTop: 10 },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#dde3ec',
    paddingBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f5',
    paddingVertical: 4,
  },
  colDescription: { flex: 3 },
  colNumber: { flex: 1, textAlign: 'right' },
  totalsBlock: { marginTop: 16, alignItems: 'flex-end' },
  totalLine: { fontSize: 12, fontWeight: 700, color: '#0d47a1' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#5b6b85' },
})

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const t = LABELS[data.language]
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <Image src={LOGO_PATH} style={styles.logo} />
          <View>
            <Text style={styles.docTitle}>{t.invoice.toUpperCase()}</Text>
            <Text style={styles.muted}>#{data.invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.hr} />

        <View style={styles.row}>
          <View>
            <Text style={styles.muted}>{t.billTo}</Text>
            <Text>{data.client.name}</Text>
            <Text>{data.client.addressLine}</Text>
            <Text>
              {data.client.postalCode} {data.client.city}
            </Text>
            <Text>{data.client.country}</Text>
            {data.client.vatNumber && (
              <Text>
                {t.vatNumber}: {data.client.vatNumber}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.muted}>
              {t.issueDate}: {data.issueDate}
            </Text>
            <Text style={styles.muted}>
              {t.dueDate}: {data.dueDate}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDescription, styles.muted]}>{t.description}</Text>
            <Text style={[styles.colNumber, styles.muted]}>{t.quantity}</Text>
            <Text style={[styles.colNumber, styles.muted]}>{t.unitPrice}</Text>
            <Text style={[styles.colNumber, styles.muted]}>{t.vat}</Text>
            <Text style={[styles.colNumber, styles.muted]}>{t.lineTotal}</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colNumber}>{item.quantity}</Text>
              <Text style={styles.colNumber}>€{item.unitPrice.toFixed(2)}</Text>
              <Text style={styles.colNumber}>{item.vatRate}%</Text>
              <Text style={styles.colNumber}>€{item.lineTotal.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <Text>
            {t.subtotal}: €{data.subtotal.toFixed(2)}
          </Text>
          <Text>
            {t.vatAmount}: €{data.vatAmount.toFixed(2)}
          </Text>
          <Text style={styles.totalLine}>
            {t.total}: €{data.total.toFixed(2)}
          </Text>
        </View>

        {data.vatTreatment === 'eu_reverse_charge' && (
          <Text style={{ marginTop: 10 }}>
            {t.reverseCharge} {t.vatNumber}: {COMPANY.vat}
          </Text>
        )}

        {data.notes && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.muted}>{t.notes}</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          {COMPANY.name} · {t.kvkNumber} {COMPANY.kvk} · {t.vatNumber} {COMPANY.vat} · {t.iban}{' '}
          {COMPANY.iban} · {COMPANY.bic} · {COMPANY.addressLine}, {COMPANY.postalCode}{' '}
          {COMPANY.city} · {COMPANY.email}
        </Text>
      </Page>
    </Document>
  )
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- api/_lib/invoicePdf.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add neoinsent-invoicing/vercel.json neoinsent-invoicing/api/_lib/invoicePdf.tsx neoinsent-invoicing/api/_lib/invoicePdf.test.tsx
git commit -m "feat: add server-side invoice PDF rendering"
```

---

### Task 16: Finalize invoice — numbering, PDF, and storage

**Files:**
- Modify: `api/_lib/invoicesRepo.ts` (add `finalizeInvoice`, `AlreadyFinalizedError`)
- Create: `api/invoices/[id]/finalize.ts`
- Test: `api/invoices/[id]/finalize.test.ts`

This is the legally load-bearing step from the spec: it assigns the gap-free sequential number via the `next_invoice_number` Postgres function from Task 6, renders and stores the permanent PDF, and locks the invoice. `finalizeInvoice` itself composes already-tested pieces (`getSupabaseAdmin`, `renderInvoicePdf`, the DB function) and is exercised through the mocked route test below plus one manual end-to-end check against the live Supabase project from Task 6 — mirroring how `clientsRepo`/`invoicesRepo`'s other Supabase pass-throughs are tested in this plan.

- [ ] **Step 1: Add `finalizeInvoice` to `api/_lib/invoicesRepo.ts`**

Append to the file, and add `import { renderInvoicePdf } from './invoicePdf'` to its imports:
```ts
export class AlreadyFinalizedError extends Error {
  constructor() {
    super('Invoice is already finalized')
  }
}

export async function finalizeInvoice(id: string): Promise<InvoiceWithDetails> {
  const invoice = await getInvoice(id)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'draft') throw new AlreadyFinalizedError()

  const admin = getSupabaseAdmin()
  const year = Number(invoice.issue_date.slice(0, 4))

  const { data: seq, error: seqError } = await admin.rpc('next_invoice_number', { p_year: year })
  if (seqError) throw new Error(seqError.message)
  const invoiceNumber = `NEO-${year}-${String(seq).padStart(4, '0')}`

  const pdfBuffer = await renderInvoicePdf({
    invoiceNumber,
    language: invoice.language,
    vatTreatment: invoice.vat_treatment,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    notes: invoice.notes,
    subtotal: invoice.subtotal,
    vatAmount: invoice.vat_amount,
    total: invoice.total,
    client: {
      name: invoice.client.name,
      addressLine: invoice.client.address_line,
      postalCode: invoice.client.postal_code,
      city: invoice.client.city,
      country: invoice.client.country,
      vatNumber: invoice.client.vat_number,
    },
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      vatRate: item.vat_rate,
      lineTotal: item.line_total,
    })),
  })

  const pdfPath = `${year}/${invoiceNumber}.pdf`
  const { error: uploadError } = await admin.storage
    .from('invoice-pdfs')
    .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  const { error: updateError } = await admin
    .from('invoices')
    .update({
      invoice_number: invoiceNumber,
      status: 'final',
      pdf_path: pdfPath,
      finalized_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (updateError) throw new Error(updateError.message)

  const refreshed = await getInvoice(id)
  if (!refreshed) throw new Error('Invoice not found after finalize')
  return refreshed
}
```

- [ ] **Step 2: Write the failing route tests**

`api/invoices/[id]/finalize.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './finalize'
import * as invoicesRepo from '../../_lib/invoicesRepo'
import * as requireSessionModule from '../../_lib/requireSession'

vi.mock('../../_lib/requireSession')
vi.mock('../../_lib/invoicesRepo')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

describe('POST /api/invoices/[id]/finalize', () => {
  beforeEach(() => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
  })

  it('rejects non-POST methods', async () => {
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: { id: '1' } } as any, res)
    expect(res.statusCode).toBe(405)
  })

  it('rejects a missing id', async () => {
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, query: {} } as any, res)
    expect(res.statusCode).toBe(400)
  })

  it('finalizes a draft invoice', async () => {
    vi.mocked(invoicesRepo.finalizeInvoice).mockResolvedValue({
      id: '1',
      invoice_number: 'NEO-2026-0001',
    } as any)
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, query: { id: '1' } } as any, res)
    expect(res.statusCode).toBe(200)
    expect((res.body as any).invoice.invoice_number).toBe('NEO-2026-0001')
  })

  it('returns 409 when the invoice is already finalized', async () => {
    vi.mocked(invoicesRepo.finalizeInvoice).mockRejectedValue(
      new invoicesRepo.AlreadyFinalizedError(),
    )
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, query: { id: '1' } } as any, res)
    expect(res.statusCode).toBe(409)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- api/invoices/\[id\]/finalize.test.ts`
Expected: FAIL — `Failed to resolve import "./finalize"`.

- [ ] **Step 4: Implement `api/invoices/[id]/finalize.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../_lib/requireSession'
import { AlreadyFinalizedError, finalizeInvoice } from '../../_lib/invoicesRepo'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { id } = req.query
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid invoice id' })
    return
  }
  try {
    const invoice = await finalizeInvoice(id)
    res.status(200).json({ invoice })
  } catch (err) {
    if (err instanceof AlreadyFinalizedError) {
      res.status(409).json({ error: err.message })
      return
    }
    throw err
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- api/invoices/\[id\]/finalize.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 6: Manually verify against the live Supabase project**

Using `vercel dev` (set up fully in Task 23) or a short ad-hoc script with `tsx`, call `finalizeInvoice` against a real draft invoice created via the Task 11 API. Confirm: a row appears in `invoice_counters` for the current year, the invoice's `invoice_number`/`status`/`pdf_path`/`finalized_at` are set, and the PDF is downloadable from the `invoice-pdfs` bucket in the Supabase dashboard. Finalize a second draft and confirm the number increments without gaps.

- [ ] **Step 7: Commit**

```bash
git add neoinsent-invoicing/api/_lib/invoicesRepo.ts neoinsent-invoicing/api/invoices
git commit -m "feat: add invoice finalize flow with sequential numbering"
```

---

### Task 17: PDF download link and paid toggle

**Files:**
- Modify: `api/_lib/invoicesRepo.ts` (add `getInvoicePdfSignedUrl`, `setInvoicePaid`)
- Create: `api/invoices/[id]/pdf.ts`
- Create: `api/invoices/[id]/paid.ts`
- Test: `api/invoices/[id]/pdf.test.ts`
- Test: `api/invoices/[id]/paid.test.ts`

- [ ] **Step 1: Add the two repo functions**

Append to `api/_lib/invoicesRepo.ts`:
```ts
export async function getInvoicePdfSignedUrl(id: string): Promise<string | null> {
  const invoice = await getInvoice(id)
  if (!invoice || !invoice.pdf_path) return null
  const { data, error } = await getSupabaseAdmin()
    .storage.from('invoice-pdfs')
    .createSignedUrl(invoice.pdf_path, 60)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function setInvoicePaid(id: string, paid: boolean): Promise<void> {
  const { error } = await getSupabaseAdmin().from('invoices').update({ paid }).eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Write the failing tests**

`api/invoices/[id]/pdf.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './pdf'
import * as invoicesRepo from '../../_lib/invoicesRepo'
import * as requireSessionModule from '../../_lib/requireSession'

vi.mock('../../_lib/requireSession')
vi.mock('../../_lib/invoicesRepo')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  res.redirect = vi.fn()
  return res
}

describe('GET /api/invoices/[id]/pdf', () => {
  beforeEach(() => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
  })

  it('rejects non-GET methods', async () => {
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, query: { id: '1' } } as any, res)
    expect(res.statusCode).toBe(405)
  })

  it('returns 404 when the invoice has no PDF yet', async () => {
    vi.mocked(invoicesRepo.getInvoicePdfSignedUrl).mockResolvedValue(null)
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: { id: '1' } } as any, res)
    expect(res.statusCode).toBe(404)
  })

  it('redirects to the signed URL', async () => {
    vi.mocked(invoicesRepo.getInvoicePdfSignedUrl).mockResolvedValue('https://signed.example/pdf')
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: { id: '1' } } as any, res)
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://signed.example/pdf')
  })
})
```

`api/invoices/[id]/paid.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './paid'
import * as invoicesRepo from '../../_lib/invoicesRepo'
import * as requireSessionModule from '../../_lib/requireSession'

vi.mock('../../_lib/requireSession')
vi.mock('../../_lib/invoicesRepo')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

describe('POST /api/invoices/[id]/paid', () => {
  beforeEach(() => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
  })

  it('rejects a non-boolean paid value', async () => {
    const res = createMockRes()
    await handler(
      { method: 'POST', headers: {}, query: { id: '1' }, body: { paid: 'yes' } } as any,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(invoicesRepo.setInvoicePaid).not.toHaveBeenCalled()
  })

  it('sets paid to true', async () => {
    const res = createMockRes()
    await handler(
      { method: 'POST', headers: {}, query: { id: '1' }, body: { paid: true } } as any,
      res,
    )
    expect(invoicesRepo.setInvoicePaid).toHaveBeenCalledWith('1', true)
    expect(res.statusCode).toBe(200)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- api/invoices/\[id\]/pdf.test.ts api/invoices/\[id\]/paid.test.ts`
Expected: FAIL — `./pdf` and `./paid` not found.

- [ ] **Step 4: Implement `api/invoices/[id]/pdf.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../_lib/requireSession'
import { getInvoicePdfSignedUrl } from '../../_lib/invoicesRepo'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { id } = req.query
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid invoice id' })
    return
  }
  const url = await getInvoicePdfSignedUrl(id)
  if (!url) {
    res.status(404).json({ error: 'PDF not available (invoice not finalized yet?)' })
    return
  }
  res.redirect(302, url)
}
```

- [ ] **Step 5: Implement `api/invoices/[id]/paid.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../_lib/requireSession'
import { setInvoicePaid } from '../../_lib/invoicesRepo'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { id } = req.query
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid invoice id' })
    return
  }
  const { paid } = (req.body ?? {}) as { paid?: unknown }
  if (typeof paid !== 'boolean') {
    res.status(400).json({ error: 'paid must be a boolean' })
    return
  }
  await setInvoicePaid(id, paid)
  res.status(200).json({ ok: true })
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- api/invoices/\[id\]/pdf.test.ts api/invoices/\[id\]/paid.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 7: Commit**

```bash
git add neoinsent-invoicing/api/_lib/invoicesRepo.ts neoinsent-invoicing/api/invoices
git commit -m "feat: add PDF signed-URL and paid-toggle endpoints"
```

---

### Task 18: Email sending (Gmail SMTP) and the send endpoint

**Files:**
- Create: `api/_lib/mailer.ts`
- Modify: `api/_lib/invoicesRepo.ts` (add `getInvoicePdfBuffer`, `markInvoiceSent`)
- Create: `api/invoices/[id]/send.ts`
- Test: `api/_lib/mailer.test.ts`
- Test: `api/invoices/[id]/send.test.ts`

- [ ] **Step 1: Write the failing test for the mailer**

`api/_lib/mailer.test.ts`:
```ts
import nodemailer from 'nodemailer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendInvoiceEmail } from './mailer'

vi.mock('nodemailer')

describe('sendInvoiceEmail', () => {
  const sendMailMock = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    process.env.GMAIL_USER = 'finance@neoinsentai.com'
    process.env.GMAIL_APP_PASSWORD = 'app-password'
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: sendMailMock } as any)
  })

  afterEach(() => {
    sendMailMock.mockClear()
  })

  it('throws when Gmail credentials are missing', async () => {
    delete process.env.GMAIL_APP_PASSWORD
    await expect(
      sendInvoiceEmail({
        to: 'client@test.com',
        subject: 'Invoice',
        text: 'See attached',
        attachmentFilename: 'NEO-2026-0001.pdf',
        attachmentBuffer: Buffer.from('pdf'),
      }),
    ).rejects.toThrow('GMAIL_USER and GMAIL_APP_PASSWORD must be set')
  })

  it('sends via Gmail SMTP with the PDF attached', async () => {
    await sendInvoiceEmail({
      to: 'client@test.com',
      subject: 'Invoice NEO-2026-0001',
      text: 'See attached',
      attachmentFilename: 'NEO-2026-0001.pdf',
      attachmentBuffer: Buffer.from('pdf'),
    })
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.gmail.com', port: 465, secure: true }),
    )
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'client@test.com',
        subject: 'Invoice NEO-2026-0001',
        attachments: [{ filename: 'NEO-2026-0001.pdf', content: Buffer.from('pdf') }],
      }),
    )
  })
})
```

- [ ] **Step 2: Run the test, then implement `api/_lib/mailer.ts`**

Run: `npm run test -- api/_lib/mailer.test.ts` — Expected: FAIL (`./mailer` not found).

```ts
import nodemailer from 'nodemailer'

export interface SendInvoiceEmailInput {
  to: string
  subject: string
  text: string
  attachmentFilename: string
  attachmentBuffer: Buffer
}

export async function sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<void> {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set')
  }
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  })
  await transport.sendMail({
    from: `NeoInsent AI <${user}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    attachments: [{ filename: input.attachmentFilename, content: input.attachmentBuffer }],
  })
}
```

Run: `npm run test -- api/_lib/mailer.test.ts` — Expected: PASS — 2 tests passed.

- [ ] **Step 3: Add `getInvoicePdfBuffer` and `markInvoiceSent` to `api/_lib/invoicesRepo.ts`**

```ts
export async function getInvoicePdfBuffer(
  id: string,
): Promise<{ buffer: Buffer; invoice: InvoiceWithDetails } | null> {
  const invoice = await getInvoice(id)
  if (!invoice || !invoice.pdf_path) return null
  const { data, error } = await getSupabaseAdmin()
    .storage.from('invoice-pdfs')
    .download(invoice.pdf_path)
  if (error) throw new Error(error.message)
  const arrayBuffer = await data.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), invoice }
}

export async function markInvoiceSent(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('invoices')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Write the failing test for the send route**

`api/invoices/[id]/send.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './send'
import * as invoicesRepo from '../../_lib/invoicesRepo'
import * as mailerModule from '../../_lib/mailer'
import * as requireSessionModule from '../../_lib/requireSession'

vi.mock('../../_lib/requireSession')
vi.mock('../../_lib/invoicesRepo')
vi.mock('../../_lib/mailer')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

const INVOICE = {
  id: '1',
  invoice_number: 'NEO-2026-0001',
  language: 'nl' as const,
  client: { email: 'client@test.com' },
}

describe('POST /api/invoices/[id]/send', () => {
  beforeEach(() => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
  })

  it('returns 404 when the invoice has no stored PDF', async () => {
    vi.mocked(invoicesRepo.getInvoicePdfBuffer).mockResolvedValue(null)
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, query: { id: '1' }, body: {} } as any, res)
    expect(res.statusCode).toBe(404)
  })

  it('sends the Dutch default template and marks the invoice sent', async () => {
    vi.mocked(invoicesRepo.getInvoicePdfBuffer).mockResolvedValue({
      buffer: Buffer.from('pdf'),
      invoice: INVOICE as any,
    })
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, query: { id: '1' }, body: {} } as any, res)
    expect(mailerModule.sendInvoiceEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'client@test.com',
        subject: expect.stringContaining('Factuur NEO-2026-0001'),
        attachmentFilename: 'NEO-2026-0001.pdf',
      }),
    )
    expect(invoicesRepo.markInvoiceSent).toHaveBeenCalledWith('1')
    expect(res.statusCode).toBe(200)
  })

  it('uses a custom subject/body when provided', async () => {
    vi.mocked(invoicesRepo.getInvoicePdfBuffer).mockResolvedValue({
      buffer: Buffer.from('pdf'),
      invoice: INVOICE as any,
    })
    const res = createMockRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        query: { id: '1' },
        body: { subject: 'Custom subject', text: 'Custom body' },
      } as any,
      res,
    )
    expect(mailerModule.sendInvoiceEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Custom subject', text: 'Custom body' }),
    )
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test -- api/invoices/\[id\]/send.test.ts`
Expected: FAIL — `Failed to resolve import "./send"`.

- [ ] **Step 6: Implement `api/invoices/[id]/send.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../_lib/requireSession'
import { getInvoicePdfBuffer, markInvoiceSent } from '../../_lib/invoicesRepo'
import { sendInvoiceEmail } from '../../_lib/mailer'

const EMAIL_TEMPLATES = {
  nl: (invoiceNumber: string) => ({
    subject: `Factuur ${invoiceNumber} — NeoInsent AI`,
    text: `Beste,\n\nHierbij ontvangt u factuur ${invoiceNumber} van NeoInsent AI.\n\nMet vriendelijke groet,\nEsteban Seravalli`,
  }),
  en: (invoiceNumber: string) => ({
    subject: `Invoice ${invoiceNumber} — NeoInsent AI`,
    text: `Hello,\n\nPlease find attached invoice ${invoiceNumber} from NeoInsent AI.\n\nKind regards,\nEsteban Seravalli`,
  }),
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { id } = req.query
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid invoice id' })
    return
  }

  const result = await getInvoicePdfBuffer(id)
  if (!result) {
    res.status(404).json({ error: 'PDF not available (invoice not finalized yet?)' })
    return
  }
  const { buffer, invoice } = result

  const body = (req.body ?? {}) as { subject?: string; text?: string }
  const defaults = EMAIL_TEMPLATES[invoice.language](invoice.invoice_number!)

  await sendInvoiceEmail({
    to: invoice.client.email,
    subject: body.subject ?? defaults.subject,
    text: body.text ?? defaults.text,
    attachmentFilename: `${invoice.invoice_number}.pdf`,
    attachmentBuffer: buffer,
  })

  await markInvoiceSent(id)
  res.status(200).json({ ok: true })
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test -- api/invoices/\[id\]/send.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 8: Commit**

```bash
git add neoinsent-invoicing/api/_lib/mailer.ts neoinsent-invoicing/api/_lib/mailer.test.ts neoinsent-invoicing/api/_lib/invoicesRepo.ts neoinsent-invoicing/api/invoices
git commit -m "feat: add Gmail SMTP email sending for finalized invoices"
```

---

### Task 19: InvoiceDetailPage

**Files:**
- Create: `src/routes/InvoiceDetailPage.tsx`
- Test: `src/routes/InvoiceDetailPage.test.tsx`

Shows a draft with a **Finalize** button, or a finalized invoice with **Print**/**Download**/**Email**/**Mark as paid**. Editing a draft's line items through the UI (the API already supports it via Task 12's `PATCH`) is out of scope for v1 — noted here deliberately, not an oversight, since the common path is to fill and finalize an invoice in one sitting.

- [ ] **Step 1: Write the failing tests**

`src/routes/InvoiceDetailPage.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InvoiceDetailPage } from './InvoiceDetailPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const DRAFT_INVOICE = {
  id: '1',
  invoice_number: null,
  status: 'draft',
  language: 'nl',
  vat_treatment: 'nl_standard',
  issue_date: '2026-11-02',
  due_date: '2026-11-16',
  subtotal: 1000,
  vat_amount: 210,
  total: 1210,
  paid: false,
  sent_at: null,
  client: { name: 'Acme BV', email: 'ap@acme.test' },
  items: [
    { description: 'Consulting', quantity: 10, unit_price: 100, vat_rate: 21, line_total: 1210 },
  ],
}

const FINAL_INVOICE = { ...DRAFT_INVOICE, status: 'final', invoice_number: 'NEO-2026-0001' }

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/invoices/${id}`]}>
      <Routes>
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('InvoiceDetailPage', () => {
  it('shows a Finalize button for a draft invoice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invoice: DRAFT_INVOICE }) }),
    )
    renderAt('1')
    expect(await screen.findByText('Finalize')).toBeInTheDocument()
    expect(screen.queryByText('Print')).not.toBeInTheDocument()
  })

  it('shows Print/Download/Email/Paid actions for a finalized invoice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invoice: FINAL_INVOICE }) }),
    )
    renderAt('1')
    expect(await screen.findByText('Print')).toBeInTheDocument()
    expect(screen.getByText('Download')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Mark as paid')).toBeInTheDocument()
  })

  it('sends an email and shows a confirmation', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url === '/api/invoices/1/send') {
        return { ok: true, json: async () => ({ ok: true }) }
      }
      return { ok: true, json: async () => ({ invoice: FINAL_INVOICE }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('1')
    await userEvent.click(await screen.findByText('Email'))
    await userEvent.click(screen.getByText('Send'))
    await waitFor(() => expect(screen.getByText('Email sent.')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/routes/InvoiceDetailPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./InvoiceDetailPage"`.

- [ ] **Step 3: Implement `src/routes/InvoiceDetailPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../lib/apiClient'
import { formatCurrency } from '../lib/format'

interface InvoiceDetail {
  id: string
  invoice_number: string | null
  status: 'draft' | 'final'
  language: 'nl' | 'en'
  vat_treatment: 'nl_standard' | 'eu_reverse_charge'
  issue_date: string
  due_date: string
  subtotal: number
  vat_amount: number
  total: number
  paid: boolean
  sent_at: string | null
  client: { name: string; email: string }
  items: {
    description: string
    quantity: number
    unit_price: number
    vat_rate: number
    line_total: number
  }[]
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    if (!id) return
    const res = await apiFetch<{ invoice: InvoiceDetail }>(`/api/invoices/${id}`)
    setInvoice(res.invoice)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleFinalize() {
    if (!id) return
    await apiFetch(`/api/invoices/${id}/finalize`, { method: 'POST' })
    await load()
  }

  async function handleTogglePaid() {
    if (!id || !invoice) return
    await apiFetch(`/api/invoices/${id}/paid`, {
      method: 'POST',
      body: JSON.stringify({ paid: !invoice.paid }),
    })
    await load()
  }

  async function handleSendEmail() {
    if (!id) return
    setSending(true)
    setMessage(null)
    try {
      await apiFetch(`/api/invoices/${id}/send`, {
        method: 'POST',
        body: JSON.stringify({ subject: subject || undefined, text: body || undefined }),
      })
      setMessage('Email sent.')
      setEmailOpen(false)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  if (!invoice) return <p>Loading...</p>

  return (
    <div>
      <h1>{invoice.invoice_number ?? 'Draft invoice'}</h1>
      <p>
        {invoice.client.name} · {invoice.status === 'final' ? 'Finalized' : 'Draft'} ·{' '}
        {invoice.paid ? 'Paid' : 'Unpaid'}
      </p>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>VAT</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={i}>
              <td>{item.description}</td>
              <td>{item.quantity}</td>
              <td className="num">{formatCurrency(item.unit_price)}</td>
              <td className="num">{item.vat_rate}%</td>
              <td className="num">{formatCurrency(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="num">
        <b>Total: {formatCurrency(invoice.total)}</b>
      </p>

      {invoice.status === 'draft' && (
        <button type="button" className="btn btn-primary" onClick={handleFinalize}>
          Finalize
        </button>
      )}

      {invoice.status === 'final' && (
        <div>
          <a className="btn" href={`/api/invoices/${id}/pdf`} target="_blank" rel="noreferrer">
            Print
          </a>
          <a
            className="btn"
            href={`/api/invoices/${id}/pdf`}
            target="_blank"
            rel="noreferrer"
            download
          >
            Download
          </a>
          <button type="button" className="btn" onClick={() => setEmailOpen((v) => !v)}>
            Email
          </button>
          <button type="button" className="btn" onClick={handleTogglePaid}>
            Mark as {invoice.paid ? 'unpaid' : 'paid'}
          </button>

          {emailOpen && (
            <div className="card" style={{ marginTop: 12 }}>
              <label htmlFor="email-subject">Subject (optional)</label>
              <input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Leave blank to use the standard NL/EN template"
              />
              <label htmlFor="email-body">Message (optional)</label>
              <textarea id="email-body" value={body} onChange={(e) => setBody(e.target.value)} />
              <button
                type="button"
                className="btn btn-primary"
                disabled={sending}
                onClick={handleSendEmail}
              >
                Send
              </button>
            </div>
          )}
          {message && <p role="status">{message}</p>}
          {invoice.sent_at && (
            <p className="muted">Sent {new Date(invoice.sent_at).toLocaleString()}</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/routes/InvoiceDetailPage.test.tsx`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add neoinsent-invoicing/src/routes/InvoiceDetailPage.tsx neoinsent-invoicing/src/routes/InvoiceDetailPage.test.tsx
git commit -m "feat: add Invoice Detail page with finalize/print/download/email/paid actions"
```

---

### Task 20: Dashboard summary API and DashboardPage

**Files:**
- Create: `api/_lib/summary.ts`
- Create: `api/dashboard.ts`
- Create: `src/routes/DashboardPage.tsx`
- Test: `api/_lib/summary.test.ts`
- Test: `api/dashboard.test.ts`
- Test: `src/routes/DashboardPage.test.tsx`

- [ ] **Step 1: Write the failing tests for the pure summary function**

`api/_lib/summary.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { InvoiceSummary } from './invoicesRepo'
import { summarizeInvoices } from './summary'

function inv(overrides: Partial<InvoiceSummary>): InvoiceSummary {
  return {
    id: '1',
    invoice_number: 'NEO-2026-0001',
    client_id: 'c1',
    status: 'final',
    vat_treatment: 'nl_standard',
    issue_date: '2026-11-02',
    subtotal: 1000,
    vat_amount: 210,
    total: 1210,
    paid: false,
    ...overrides,
  }
}

describe('summarizeInvoices', () => {
  it('ignores draft invoices', () => {
    expect(summarizeInvoices([inv({ status: 'draft' })])).toEqual({
      invoiceCount: 0,
      totalRevenue: 0,
      vatCollected: 0,
      reverseChargedRevenue: 0,
    })
  })

  it('sums NL-standard VAT collected across multiple invoices', () => {
    const result = summarizeInvoices([inv({}), inv({ subtotal: 500, vat_amount: 105, total: 605 })])
    expect(result).toEqual({
      invoiceCount: 2,
      totalRevenue: 1815,
      vatCollected: 315,
      reverseChargedRevenue: 0,
    })
  })

  it('sums EU reverse-charge revenue separately from VAT collected', () => {
    const result = summarizeInvoices([
      inv({ vat_treatment: 'eu_reverse_charge', subtotal: 800, vat_amount: 0, total: 800 }),
    ])
    expect(result).toEqual({
      invoiceCount: 1,
      totalRevenue: 800,
      vatCollected: 0,
      reverseChargedRevenue: 800,
    })
  })
})
```

- [ ] **Step 2: Run the test, then implement `api/_lib/summary.ts`**

Run: `npm run test -- api/_lib/summary.test.ts` — Expected: FAIL (`./summary` not found).

```ts
import type { InvoiceSummary } from './invoicesRepo'

export interface PeriodSummary {
  invoiceCount: number
  totalRevenue: number
  vatCollected: number
  reverseChargedRevenue: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function summarizeInvoices(invoices: InvoiceSummary[]): PeriodSummary {
  const final = invoices.filter((inv) => inv.status === 'final')
  return {
    invoiceCount: final.length,
    totalRevenue: round2(final.reduce((sum, inv) => sum + inv.total, 0)),
    vatCollected: round2(
      final
        .filter((inv) => inv.vat_treatment === 'nl_standard')
        .reduce((sum, inv) => sum + inv.vat_amount, 0),
    ),
    reverseChargedRevenue: round2(
      final
        .filter((inv) => inv.vat_treatment === 'eu_reverse_charge')
        .reduce((sum, inv) => sum + inv.subtotal, 0),
    ),
  }
}
```

Run: `npm run test -- api/_lib/summary.test.ts` — Expected: PASS — 3 tests passed.

- [ ] **Step 3: Write the failing test for the dashboard route**

`api/dashboard.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './dashboard'
import * as invoicesRepo from './_lib/invoicesRepo'
import * as requireSessionModule from './_lib/requireSession'

vi.mock('./_lib/requireSession')
vi.mock('./_lib/invoicesRepo')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
  })

  it('rejects non-GET methods', async () => {
    const res = createMockRes()
    await handler({ method: 'POST', headers: {}, query: {} } as any, res)
    expect(res.statusCode).toBe(405)
  })

  it('returns invoices and a computed summary, filtered by year/quarter', async () => {
    vi.mocked(invoicesRepo.listInvoices).mockResolvedValue([
      {
        id: '1',
        invoice_number: 'NEO-2026-0001',
        client_id: 'c1',
        status: 'final',
        vat_treatment: 'nl_standard',
        issue_date: '2026-04-15',
        subtotal: 1000,
        vat_amount: 210,
        total: 1210,
        paid: false,
      },
    ])
    const res = createMockRes()
    await handler(
      { method: 'GET', headers: {}, query: { year: '2026', quarter: '2' } } as any,
      res,
    )
    expect(invoicesRepo.listInvoices).toHaveBeenCalledWith({
      fromDate: '2026-04-01',
      toDate: '2026-06-30',
    })
    expect(res.statusCode).toBe(200)
    expect((res.body as any).summary).toEqual({
      invoiceCount: 1,
      totalRevenue: 1210,
      vatCollected: 210,
      reverseChargedRevenue: 0,
    })
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test -- api/dashboard.test.ts`
Expected: FAIL — `Failed to resolve import "./dashboard"`.

- [ ] **Step 5: Implement `api/dashboard.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { quarterDateRange } from '../src/lib/dateRanges'
import { listInvoices } from './_lib/invoicesRepo'
import { requireSession } from './_lib/requireSession'
import { summarizeInvoices } from './_lib/summary'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { year, quarter } = req.query
  const filter: { fromDate?: string; toDate?: string } = {}
  if (typeof year === 'string') {
    const q = typeof quarter === 'string' ? (Number(quarter) as 1 | 2 | 3 | 4) : undefined
    const range = quarterDateRange(Number(year), q)
    filter.fromDate = range.fromDate
    filter.toDate = range.toDate
  }
  const invoices = await listInvoices(filter)
  const summary = summarizeInvoices(invoices)
  res.status(200).json({ invoices, summary })
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- api/dashboard.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 7: Write the failing test for `DashboardPage`**

`src/routes/DashboardPage.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const RESPONSE = {
  invoices: [
    {
      id: '1',
      invoice_number: 'NEO-2026-0001',
      status: 'final',
      vat_treatment: 'nl_standard',
      issue_date: '2026-11-02',
      total: 1210,
      paid: false,
    },
  ],
  summary: { invoiceCount: 1, totalRevenue: 1210, vatCollected: 210, reverseChargedRevenue: 0 },
}

describe('DashboardPage', () => {
  it('shows the period summary and invoice list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => RESPONSE })
    vi.stubGlobal('fetch', fetchMock)
    render(<DashboardPage />, { wrapper: MemoryRouter })
    expect(await screen.findByText('NEO-2026-0001')).toBeInTheDocument()
    expect(screen.getByText(/1\.210,00/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/dashboard?year=${new Date().getFullYear()}`),
      expect.anything(),
    )
  })

  it('refetches when the quarter filter changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => RESPONSE })
    vi.stubGlobal('fetch', fetchMock)
    render(<DashboardPage />, { wrapper: MemoryRouter })
    await screen.findByText('NEO-2026-0001')
    await userEvent.selectOptions(screen.getByLabelText('Quarter'), '4')
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('quarter=4'),
        expect.anything(),
      ),
    )
  })
})
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm run test -- src/routes/DashboardPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./DashboardPage"`.

- [ ] **Step 9: Implement `src/routes/DashboardPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/apiClient'
import { formatCurrency } from '../lib/format'

interface DashboardInvoice {
  id: string
  invoice_number: string | null
  status: 'draft' | 'final'
  vat_treatment: 'nl_standard' | 'eu_reverse_charge'
  issue_date: string
  total: number
  paid: boolean
}

interface DashboardResponse {
  invoices: DashboardInvoice[]
  summary: {
    invoiceCount: number
    totalRevenue: number
    vatCollected: number
    reverseChargedRevenue: number
  }
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [quarter, setQuarter] = useState<number | ''>('')

  useEffect(() => {
    const params = new URLSearchParams({ year: String(year) })
    if (quarter) params.set('quarter', String(quarter))
    apiFetch<DashboardResponse>(`/api/dashboard?${params.toString()}`).then(setData)
  }, [year, quarter])

  return (
    <div>
      <h1>Dashboard</h1>
      <Link className="btn btn-primary" to="/invoices/new">
        + New invoice
      </Link>

      <div className="card" style={{ marginTop: 16 }}>
        <label htmlFor="dashboard-year">Year</label>
        <input
          id="dashboard-year"
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />
        <label htmlFor="dashboard-quarter">Quarter</label>
        <select
          id="dashboard-quarter"
          value={quarter}
          onChange={(e) => setQuarter(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Full year</option>
          <option value="1">Q1</option>
          <option value="2">Q2</option>
          <option value="3">Q3</option>
          <option value="4">Q4</option>
        </select>
      </div>

      {data && (
        <div className="card" style={{ marginTop: 16 }}>
          <p>Invoices: {data.summary.invoiceCount}</p>
          <p className="num">Total revenue: {formatCurrency(data.summary.totalRevenue)}</p>
          <p className="num">VAT collected (21%): {formatCurrency(data.summary.vatCollected)}</p>
          <p className="num">
            Reverse-charged revenue (0%): {formatCurrency(data.summary.reverseChargedRevenue)}
          </p>
        </div>
      )}

      <table style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Number</th>
            <th>Date</th>
            <th>Status</th>
            <th>VAT</th>
            <th>Total</th>
            <th>Paid</th>
          </tr>
        </thead>
        <tbody>
          {data?.invoices.map((inv) => (
            <tr key={inv.id}>
              <td>
                <Link to={`/invoices/${inv.id}`}>{inv.invoice_number ?? 'Draft'}</Link>
              </td>
              <td>{inv.issue_date}</td>
              <td>{inv.status}</td>
              <td>{inv.vat_treatment === 'nl_standard' ? '21%' : 'Reverse charge'}</td>
              <td className="num">{formatCurrency(inv.total)}</td>
              <td>{inv.paid ? 'Paid' : 'Unpaid'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm run test -- src/routes/DashboardPage.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 11: Commit**

```bash
git add neoinsent-invoicing/api/_lib/invoicesRepo.ts neoinsent-invoicing/api/_lib/summary.ts neoinsent-invoicing/api/_lib/summary.test.ts neoinsent-invoicing/api/dashboard.ts neoinsent-invoicing/api/dashboard.test.ts neoinsent-invoicing/src/routes/DashboardPage.tsx neoinsent-invoicing/src/routes/DashboardPage.test.tsx
git commit -m "feat: add dashboard summary API and page"
```

---

### Task 21: Tax records — ICP breakdown, CSV export, and TaxRecordsPage

**Files:**
- Modify: `api/_lib/invoicesRepo.ts` (add `TaxInvoiceRow`, `listFinalInvoicesForTax`)
- Create: `api/_lib/taxReport.ts`
- Create: `api/tax.ts`
- Create: `src/routes/TaxRecordsPage.tsx`
- Test: `api/_lib/taxReport.test.ts`
- Test: `api/tax.test.ts`
- Test: `src/routes/TaxRecordsPage.test.tsx`

The quarterly BTW aangifte needs total revenue and VAT collected (already covered by `summarizeInvoices`); the quarterly ICP opgave additionally needs EU reverse-charge sales broken down **per client VAT number** — that grouping is `buildIcpBreakdown` below.

- [ ] **Step 1: Add `TaxInvoiceRow` and `listFinalInvoicesForTax` to `api/_lib/invoicesRepo.ts`**

```ts
export interface TaxInvoiceRow {
  id: string
  invoice_number: string | null
  issue_date: string
  vat_treatment: InvoiceVatTreatment
  subtotal: number
  vat_amount: number
  total: number
  client_name: string
  client_vat_number: string | null
}

export async function listFinalInvoicesForTax(filter: {
  fromDate: string
  toDate: string
}): Promise<TaxInvoiceRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('invoices')
    .select(
      'id, invoice_number, issue_date, vat_treatment, subtotal, vat_amount, total, client:clients(name, vat_number)',
    )
    .eq('status', 'final')
    .gte('issue_date', filter.fromDate)
    .lte('issue_date', filter.toDate)
    .order('issue_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as any[]).map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    issue_date: row.issue_date,
    vat_treatment: row.vat_treatment,
    subtotal: row.subtotal,
    vat_amount: row.vat_amount,
    total: row.total,
    client_name: row.client.name,
    client_vat_number: row.client.vat_number,
  }))
}
```

- [ ] **Step 2: Write the failing tests for the pure report functions**

`api/_lib/taxReport.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { TaxInvoiceRow } from './invoicesRepo'
import { buildIcpBreakdown, toCsv } from './taxReport'

function row(overrides: Partial<TaxInvoiceRow>): TaxInvoiceRow {
  return {
    id: '1',
    invoice_number: 'NEO-2026-0001',
    issue_date: '2026-11-02',
    vat_treatment: 'nl_standard',
    subtotal: 1000,
    vat_amount: 210,
    total: 1210,
    client_name: 'Acme BV',
    client_vat_number: null,
    ...overrides,
  }
}

describe('buildIcpBreakdown', () => {
  it('excludes NL-standard rows', () => {
    expect(buildIcpBreakdown([row({})])).toEqual([])
  })

  it('excludes reverse-charge rows with no VAT number recorded', () => {
    expect(
      buildIcpBreakdown([row({ vat_treatment: 'eu_reverse_charge', client_vat_number: null })]),
    ).toEqual([])
  })

  it('groups and sums by client VAT number', () => {
    const result = buildIcpBreakdown([
      row({
        vat_treatment: 'eu_reverse_charge',
        client_vat_number: 'DE123456789',
        client_name: 'Globex GmbH',
        subtotal: 1000,
        vat_amount: 0,
        total: 1000,
      }),
      row({
        vat_treatment: 'eu_reverse_charge',
        client_vat_number: 'DE123456789',
        client_name: 'Globex GmbH',
        subtotal: 500,
        vat_amount: 0,
        total: 500,
      }),
    ])
    expect(result).toEqual([{ clientName: 'Globex GmbH', vatNumber: 'DE123456789', total: 1500 }])
  })
})

describe('toCsv', () => {
  it('renders a header row and one row per invoice', () => {
    const lines = toCsv([row({})]).split('\n')
    expect(lines[0]).toBe('Invoice number,Date,Client,VAT treatment,Subtotal,VAT,Total')
    expect(lines[1]).toBe('NEO-2026-0001,2026-11-02,Acme BV,nl_standard,1000.00,210.00,1210.00')
  })

  it('quotes fields containing a comma', () => {
    const csv = toCsv([row({ client_name: 'Acme, Inc.' })])
    expect(csv.split('\n')[1]).toContain('"Acme, Inc."')
  })
})
```

- [ ] **Step 3: Run the test, then implement `api/_lib/taxReport.ts`**

Run: `npm run test -- api/_lib/taxReport.test.ts` — Expected: FAIL (`./taxReport` not found).

```ts
import type { TaxInvoiceRow } from './invoicesRepo'

export interface IcpRow {
  clientName: string
  vatNumber: string
  total: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function buildIcpBreakdown(rows: TaxInvoiceRow[]): IcpRow[] {
  const byVatNumber = new Map<string, IcpRow>()
  for (const row of rows) {
    if (row.vat_treatment !== 'eu_reverse_charge' || !row.client_vat_number) continue
    const existing = byVatNumber.get(row.client_vat_number)
    if (existing) {
      existing.total = round2(existing.total + row.subtotal)
    } else {
      byVatNumber.set(row.client_vat_number, {
        clientName: row.client_name,
        vatNumber: row.client_vat_number,
        total: row.subtotal,
      })
    }
  }
  return Array.from(byVatNumber.values()).sort((a, b) => a.vatNumber.localeCompare(b.vatNumber))
}

const CSV_HEADER = ['Invoice number', 'Date', 'Client', 'VAT treatment', 'Subtotal', 'VAT', 'Total']

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(rows: TaxInvoiceRow[]): string {
  const lines = [CSV_HEADER.join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.invoice_number ?? '',
        row.issue_date,
        row.client_name,
        row.vat_treatment,
        row.subtotal.toFixed(2),
        row.vat_amount.toFixed(2),
        row.total.toFixed(2),
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  return lines.join('\n')
}
```

Run: `npm run test -- api/_lib/taxReport.test.ts` — Expected: PASS — 5 tests passed.

- [ ] **Step 4: Write the failing test for the tax route**

`api/tax.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './tax'
import * as invoicesRepo from './_lib/invoicesRepo'
import * as requireSessionModule from './_lib/requireSession'

vi.mock('./_lib/requireSession')
vi.mock('./_lib/invoicesRepo')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} as Record<string, string> }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  res.send = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  res.setHeader = vi.fn((name: string, value: string) => {
    res.headers[name] = value
  })
  return res
}

const ROWS = [
  {
    id: '1',
    invoice_number: 'NEO-2026-0001',
    issue_date: '2026-11-02',
    vat_treatment: 'nl_standard' as const,
    subtotal: 1000,
    vat_amount: 210,
    total: 1210,
    client_name: 'Acme BV',
    client_vat_number: null,
  },
]

describe('GET /api/tax', () => {
  beforeEach(() => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
    vi.mocked(invoicesRepo.listFinalInvoicesForTax).mockResolvedValue(ROWS)
  })

  it('requires a year', async () => {
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: {} } as any, res)
    expect(res.statusCode).toBe(400)
  })

  it('returns JSON with rows, summary, and ICP breakdown by default', async () => {
    const res = createMockRes()
    await handler({ method: 'GET', headers: {}, query: { year: '2026' } } as any, res)
    expect(res.statusCode).toBe(200)
    expect((res.body as any).summary.totalRevenue).toBe(1210)
    expect((res.body as any).icp).toEqual([])
  })

  it('returns CSV when format=csv is passed', async () => {
    const res = createMockRes()
    await handler(
      { method: 'GET', headers: {}, query: { year: '2026', format: 'csv' } } as any,
      res,
    )
    expect(res.headers['Content-Type']).toContain('text/csv')
    expect(res.body as string).toContain('NEO-2026-0001')
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test -- api/tax.test.ts`
Expected: FAIL — `Failed to resolve import "./tax"`.

- [ ] **Step 6: Implement `api/tax.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { quarterDateRange } from '../src/lib/dateRanges'
import { listFinalInvoicesForTax } from './_lib/invoicesRepo'
import { requireSession } from './_lib/requireSession'
import { summarizeInvoices } from './_lib/summary'
import { buildIcpBreakdown, toCsv } from './_lib/taxReport'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { year, quarter, format } = req.query
  if (typeof year !== 'string') {
    res.status(400).json({ error: 'year is required' })
    return
  }
  const q = typeof quarter === 'string' ? (Number(quarter) as 1 | 2 | 3 | 4) : undefined
  const range = quarterDateRange(Number(year), q)
  const rows = await listFinalInvoicesForTax(range)

  if (format === 'csv') {
    const suffix = q ? `-Q${q}` : ''
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="neoinsent-invoices-${year}${suffix}.csv"`,
    )
    res.status(200).send(toCsv(rows))
    return
  }

  const summary = summarizeInvoices(
    rows.map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      client_id: '',
      status: 'final' as const,
      vat_treatment: r.vat_treatment,
      issue_date: r.issue_date,
      subtotal: r.subtotal,
      vat_amount: r.vat_amount,
      total: r.total,
      paid: false,
    })),
  )
  const icp = buildIcpBreakdown(rows)
  res.status(200).json({ rows, summary, icp })
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test -- api/tax.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 8: Write the failing test for `TaxRecordsPage`**

`src/routes/TaxRecordsPage.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaxRecordsPage } from './TaxRecordsPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const RESPONSE = {
  rows: [],
  summary: { invoiceCount: 2, totalRevenue: 1500, vatCollected: 210, reverseChargedRevenue: 500 },
  icp: [{ clientName: 'Globex GmbH', vatNumber: 'DE123456789', total: 500 }],
}

describe('TaxRecordsPage', () => {
  it('shows the BTW summary and ICP breakdown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => RESPONSE }))
    render(<TaxRecordsPage />)
    expect(await screen.findByText('Globex GmbH')).toBeInTheDocument()
    expect(screen.getByText('DE123456789')).toBeInTheDocument()
  })

  it('opens a CSV export in a new tab for the current period', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => RESPONSE }))
    const openMock = vi.fn()
    vi.stubGlobal('open', openMock)
    render(<TaxRecordsPage />)
    await screen.findByText('Globex GmbH')
    await userEvent.click(screen.getByText('Export CSV'))
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/tax?year=${new Date().getFullYear()}&format=csv`),
      '_blank',
    )
  })
})
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npm run test -- src/routes/TaxRecordsPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./TaxRecordsPage"`.

- [ ] **Step 10: Implement `src/routes/TaxRecordsPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiClient'
import { formatCurrency } from '../lib/format'

interface IcpRow {
  clientName: string
  vatNumber: string
  total: number
}

interface TaxResponse {
  rows: unknown[]
  summary: {
    invoiceCount: number
    totalRevenue: number
    vatCollected: number
    reverseChargedRevenue: number
  }
  icp: IcpRow[]
}

export function TaxRecordsPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [quarter, setQuarter] = useState<number | ''>('')
  const [data, setData] = useState<TaxResponse | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ year: String(year) })
    if (quarter) params.set('quarter', String(quarter))
    apiFetch<TaxResponse>(`/api/tax?${params.toString()}`).then(setData)
  }, [year, quarter])

  function exportCsv() {
    const params = new URLSearchParams({ year: String(year), format: 'csv' })
    if (quarter) params.set('quarter', String(quarter))
    window.open(`/api/tax?${params.toString()}`, '_blank')
  }

  return (
    <div>
      <h1>Tax records</h1>
      <div className="card">
        <label htmlFor="tax-year">Year</label>
        <input
          id="tax-year"
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />
        <label htmlFor="tax-quarter">Quarter</label>
        <select
          id="tax-quarter"
          value={quarter}
          onChange={(e) => setQuarter(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Full year</option>
          <option value="1">Q1</option>
          <option value="2">Q2</option>
          <option value="3">Q3</option>
          <option value="4">Q4</option>
        </select>
        <button type="button" className="btn" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      {data && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <p>Invoices: {data.summary.invoiceCount}</p>
            <p className="num">Total revenue: {formatCurrency(data.summary.totalRevenue)}</p>
            <p className="num">
              BTW aangifte — VAT collected (21%): {formatCurrency(data.summary.vatCollected)}
            </p>
            <p className="num">
              Reverse-charged revenue (0%): {formatCurrency(data.summary.reverseChargedRevenue)}
            </p>
          </div>

          <h2>ICP opgave — EU reverse-charge sales by client</h2>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>VAT number</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.icp.map((row) => (
                <tr key={row.vatNumber}>
                  <td>{row.clientName}</td>
                  <td>{row.vatNumber}</td>
                  <td className="num">{formatCurrency(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npm run test -- src/routes/TaxRecordsPage.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 12: Commit**

```bash
git add neoinsent-invoicing/api/_lib/invoicesRepo.ts neoinsent-invoicing/api/_lib/taxReport.ts neoinsent-invoicing/api/_lib/taxReport.test.ts neoinsent-invoicing/api/tax.ts neoinsent-invoicing/api/tax.test.ts neoinsent-invoicing/src/routes/TaxRecordsPage.tsx neoinsent-invoicing/src/routes/TaxRecordsPage.test.tsx
git commit -m "feat: add tax records page with BTW summary, ICP breakdown, and CSV export"
```

---

### Task 22: Login, route guard, and the app shell

**Files:**
- Create: `api/me.ts`
- Create: `src/routes/LoginPage.tsx`
- Create: `src/components/RequireAuth.tsx`
- Modify: `src/App.tsx`
- Test: `api/me.test.ts`
- Test: `src/routes/LoginPage.test.tsx`
- Test: `src/components/RequireAuth.test.tsx`

- [ ] **Step 1: Write the failing test for `api/me.ts`**

`api/me.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import handler from './me'
import * as requireSessionModule from './_lib/requireSession'

vi.mock('./_lib/requireSession')

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return res
}

describe('GET /api/me', () => {
  it('returns ok when authenticated', () => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(true)
    const res = createMockRes()
    handler({ method: 'GET', headers: {} } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('does nothing extra when unauthenticated (requireSession already responded)', () => {
    vi.mocked(requireSessionModule.requireSession).mockReturnValue(false)
    const res = createMockRes()
    handler({ method: 'GET', headers: {} } as any, res)
    expect(res.json).not.toHaveBeenCalledWith({ ok: true })
  })
})
```

- [ ] **Step 2: Run the test, then implement `api/me.ts`**

Run: `npm run test -- api/me.test.ts` — Expected: FAIL (`./me` not found).

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from './_lib/requireSession'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireSession(req, res)) return
  res.status(200).json({ ok: true })
}
```

Run: `npm run test -- api/me.test.ts` — Expected: PASS — 2 tests passed.

- [ ] **Step 3: Write the failing test for `RequireAuth`**

`src/components/RequireAuth.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth } from './RequireAuth'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <p>Protected</p>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  it('renders children when authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
    )
    renderGuarded()
    expect(await screen.findByText('Protected')).toBeInTheDocument()
  })

  it('redirects to /login when not authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Not authenticated' }),
      }),
    )
    renderGuarded()
    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the test, then implement `src/components/RequireAuth.tsx`**

Run: `npm run test -- src/components/RequireAuth.test.tsx` — Expected: FAIL (`./RequireAuth` not found).

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { apiFetch } from '../lib/apiClient'

export function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'authed' | 'unauthed'>('checking')

  useEffect(() => {
    apiFetch('/api/me')
      .then(() => setStatus('authed'))
      .catch(() => setStatus('unauthed'))
  }, [])

  if (status === 'checking') return <p>Loading...</p>
  if (status === 'unauthed') return <Navigate to="/login" replace />
  return <>{children}</>
}
```

Run: `npm run test -- src/components/RequireAuth.test.tsx` — Expected: PASS — 2 tests passed.

- [ ] **Step 5: Write the failing test for `LoginPage`**

`src/routes/LoginPage.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  navigateMock.mockClear()
})

describe('LoginPage', () => {
  it('navigates home on a correct password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
    )
    render(<LoginPage />, { wrapper: MemoryRouter })
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple')
    await userEvent.click(screen.getByText('Log in'))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'))
  })

  it('shows an error on a wrong password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Incorrect password' }),
      }),
    )
    render(<LoginPage />, { wrapper: MemoryRouter })
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByText('Log in'))
    expect(await screen.findByText('Incorrect password')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test, then implement `src/routes/LoginPage.tsx`**

Run: `npm run test -- src/routes/LoginPage.test.tsx` — Expected: FAIL (`./LoginPage` not found).

```tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/apiClient'

export function LoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ password }) })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto' }}>
      <h1>NeoInsent Invoicing</h1>
      <form onSubmit={handleSubmit} className="card">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          Log in
        </button>
      </form>
    </div>
  )
}
```

Run: `npm run test -- src/routes/LoginPage.test.tsx` — Expected: PASS — 2 tests passed.

- [ ] **Step 7: Replace `src/App.tsx` with the full routing shell**

```tsx
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { DashboardPage } from './routes/DashboardPage'
import { InvoiceDetailPage } from './routes/InvoiceDetailPage'
import { LoginPage } from './routes/LoginPage'
import { NewInvoicePage } from './routes/NewInvoicePage'
import { TaxRecordsPage } from './routes/TaxRecordsPage'

export function App() {
  return (
    <BrowserRouter>
      <nav
        style={{
          display: 'flex',
          gap: 16,
          padding: '16px 0',
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
        }}
      >
        <Link to="/">NeoInsent Invoicing</Link>
        <Link to="/tax">Tax records</Link>
      </nav>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/invoices/new"
          element={
            <RequireAuth>
              <NewInvoicePage />
            </RequireAuth>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <RequireAuth>
              <InvoiceDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tax"
          element={
            <RequireAuth>
              <TaxRecordsPage />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
```

The Task 1 smoke test (`src/App.test.tsx`) still passes unchanged: it asserts the "NeoInsent Invoicing" text is present, which now comes from the nav bar link rather than a placeholder `<div>` — that text renders regardless of auth state, since the nav sits outside `RequireAuth`.

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: PASS — every test file from Tasks 1 through 22 passes.

- [ ] **Step 9: Commit**

```bash
git add neoinsent-invoicing/api/me.ts neoinsent-invoicing/api/me.test.ts neoinsent-invoicing/src/components/RequireAuth.tsx neoinsent-invoicing/src/components/RequireAuth.test.tsx neoinsent-invoicing/src/routes/LoginPage.tsx neoinsent-invoicing/src/routes/LoginPage.test.tsx neoinsent-invoicing/src/App.tsx
git commit -m "feat: add login page, auth guard, and app routing shell"
```

---

### Task 23: Deployment — Vercel project, secrets, Gmail app password, and go-live check

**Files:** none (operational setup only).

- [ ] **Step 1: Generate the app password hash**

Pick a strong password for logging into the app (this is separate from the Gmail app password in Step 3). Use at least 4 random words or 16+ random characters: the stored hash is unsalted SHA-256, so password strength is the real defence if the hash ever leaks. Hash it without writing the plaintext to a file or to shell history (the command reads it from stdin):

Run: `node -e "process.stdin.once('data',d=>console.log(require('crypto').createHash('sha256').update(d.toString().trim(),'utf8').digest('hex')))"`, type the password, press Enter, then Ctrl-D.

Save the printed hex string as `APP_PASSWORD_HASH`. Keep the plaintext password somewhere safe (e.g. a password manager) — it's what you'll type into the login screen.

- [ ] **Step 2: Generate the session secret**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Save the printed hex string as `SESSION_SECRET`.

- [ ] **Step 3: Create a Gmail app password for `finance@neoinsentai.com`**

1. Sign in to `finance@neoinsentai.com` and enable 2-Step Verification at `myaccount.google.com/security`, if it isn't already on.
2. Go to `myaccount.google.com/apppasswords`, create a new app password (name it "NeoInsent Invoicing"), and copy the 16-character password it generates.
3. Save it as `GMAIL_APP_PASSWORD`. `GMAIL_USER` is `finance@neoinsentai.com`.

- [ ] **Step 4: Create the Vercel project**

Using the Vercel MCP tools: `create_project` (or `create_git_project` if connecting the existing GitHub remote for this workspace) with the project root set to `neoinsent-invoicing`, framework preset `vite`. Confirm the build command resolves to `npm run build` and the output directory to `dist` (Vite's defaults — no override needed).

- [ ] **Step 5: Set environment variables**

Using the Vercel MCP tools: `create_project_env` for each of the following, scoped to Production (and Preview, if you want to test from preview deployments too):

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
APP_PASSWORD_HASH
SESSION_SECRET
GMAIL_USER
GMAIL_APP_PASSWORD
```

Use the values collected in Steps 1-3 and Task 6. Never print `SUPABASE_SERVICE_ROLE_KEY` or `GMAIL_APP_PASSWORD` back into chat or logs once set.

- [ ] **Step 5b: Add a login rate limit and record the security runbook notes**

Add a Vercel Firewall rate-limit rule on `/api/login` (for example 10 requests per minute per IP). Note for later reference: logging out only clears the browser cookie, so to invalidate every session everywhere, rotate `SESSION_SECRET` and redeploy. For local testing under `vercel dev`, use Chrome or Firefox — Safari may refuse the `Secure` session cookie over plain-HTTP localhost.

- [ ] **Step 6: Deploy**

Push the `neoinsent-invoicing` folder's commits to the connected Git remote (or use `create_deployment` via the Vercel MCP tools for a one-off deploy). Wait for the build to finish and note the production URL.

- [ ] **Step 7: Go-live smoke test**

Visit the production URL:
1. Log in with the password from Step 1.
2. Add two test clients: one NL client (no VAT number) and one EU client with a plausible VAT number (e.g. `DE123456789`).
3. Create a draft invoice for the NL client, add a line item, and finalize it. Confirm the PDF opens with the NeoInsent logo, Dutch labels (since `language` defaults to `nl` for an NL client), 21% VAT, and the correct totals.
4. Create a second draft for the EU client, finalize it, and confirm the PDF shows the reverse-charge note and both VAT numbers, in English.
5. Download both PDFs, then send one to your own inbox via the Email action and confirm it arrives from `finance@neoinsentai.com` with the PDF attached.
6. Open the Dashboard and Tax records pages and confirm both invoices, their totals, and the EU client's VAT number appear in the ICP breakdown. Export the CSV and confirm it opens correctly.

- [ ] **Step 8: Clean up test data so real invoice numbering starts at 0001**

This smoke test (Step 7) and the manual check in Task 16 Step 6 both finalize invoices against the live project, which consumes real sequential numbers. Before using the app for an actual client, clean that up: using the Supabase MCP tools' `execute_sql` (or the SQL editor in the dashboard),

```sql
delete from invoice_items where invoice_id in (select id from invoices where status = 'final');
delete from invoices where status = 'final';
update invoice_counters set last_number = 0 where year = extract(year from current_date);
```

and delete the corresponding test PDFs from the `invoice-pdfs` bucket in the Supabase dashboard's Storage view. Confirm with `list_tables`/a quick `select` that `invoices` and `invoice_counters` are both clean, so the next finalized invoice is genuinely `NEO-<year>-0001`.

- [ ] **Step 9: Commit the deployment notes**

No code changes in this task, so there's nothing to commit beyond what Tasks 1-22 already committed. If you want a record of the Vercel project id/URL for future reference, add it to this plan file's header and commit that:

```bash
git add neoinsent-invoicing/docs/superpowers/plans/2026-11-02-neoinsent-invoicing-plan.md
git commit -m "docs: record production deployment details"
```

---

## Done

All 23 tasks implement the full spec: bilingual NL/EU invoicing with correct VAT/reverse-charge handling, server-rendered branded PDFs, Gmail-based sending, print/download actions, a password-gated private deployment, and a dashboard plus tax-records export covering both the BTW aangifte and ICP opgave figures needed for Dutch quarterly filing.
