# NeoInsent Invoicing — Design

> **Revised 2026-11-03:** the app now runs on the user's Mac only. Data is stored in a local SQLite file plus a folder of PDFs under `~/NeoInsent Invoicing/`, served by a local Express server bound to `127.0.0.1`, with no login screen. Supabase, Vercel and the password gate described below are superseded — see the REVISION section at the top of the implementation plan. Clients are editable; finalized invoices keep a snapshot of the client's details.

Date: 2026-11-02
Status: Approved by Esteban Seravalli, ready for implementation planning.

## Purpose

A private, single-user web app for NeoInsent AI to create invoices (NL and EU clients), generate a PDF, print/download/email it, and keep a permanent record of every invoice for Dutch tax (BTW/VAT) reporting.

## Company data (fixed, baked into the app — not user-editable per invoice)

- Name: NeoInsent AI
- KVK number: 96887176
- BTW / VAT: NL005235763B30
- OB-nummer: 567510785B01
- Branch number: 000062171925
- IBAN: NL62BUNQ2202589686
- BIC: BUNQNL2A
- Address: Wagenlaan 2, 6225KE, Maastricht
- Email: finance@neoinsentai.com
- Contact name: Esteban Seravalli
- Logo: `assets/neoinsent-logo.png` (blue gradient hexagon mark + wordmark)

## Stack

Matches the existing FootTrack project in this workspace (same repo, new top-level folder `neoinsent-invoicing/`, no nested git repo — deployed from Vercel with its root directory set to this folder).

- **Frontend**: React + TypeScript + Vite
- **Backend**: Vercel serverless functions (Node/TypeScript) under `/api`
- **Database + file storage**: Supabase (Postgres for records, Storage for generated invoice PDFs)
- **Auth**: lightweight password gate — single password stored as a Vercel env var (hashed), checked by `/api/login`, which sets a signed, httpOnly session cookie (HMAC-signed with a server-only secret). No per-user accounts; this is for one person.
- **PDF generation**: `@react-pdf/renderer`, server-side, so every invoice's PDF is generated deterministically from stored data and never depends on a browser.
- **Email**: Nodemailer over Gmail SMTP, authenticating as `finance@neoinsentai.com` with a Google app password (requires 2-Step Verification enabled on that account — covered in setup steps during implementation).
- **Hosting**: Vercel.

## Visual design

Approved direction: **Minimal Modern** (option A from the comparison mockup at `https://claude.ai/artifact/W9Bwdd49uhjr5eoqgnvCsU`).

- Thin rule lines, generous white space.
- The actual NeoInsent logo image in the top-left of the invoice header (not a text wordmark).
- Blue accent (drawn from the logo's gradient, roughly `#1565c0` → `#0d47a1`) used sparingly: the total amount, and small accents — not a colored block/band.
- Typeface pairing: "Libre Franklin" for headings/brand, "Public Sans" for body and tabular data, `font-variant-numeric: tabular-nums` on all monetary figures.
- Same visual language (tokens, type pairing, logo placement) is reused for both the in-app UI and the generated PDF, so the web app and the invoice document feel like one product.

## Data model (Supabase / Postgres)

### `clients`
- `id` (uuid, pk)
- `name` (text)
- `contact_person` (text, nullable)
- `email` (text)
- `address_line` (text)
- `postal_code` (text)
- `city` (text)
- `country` (text, ISO code)
- `vat_number` (text, nullable) — required for EU reverse-charge treatment
- `kvk_number` (text, nullable) — for NL clients, optional
- `created_at` (timestamptz)

### `invoices`
- `id` (uuid, pk)
- `invoice_number` (text, nullable until finalized — e.g. `NEO-2026-0001`)
- `client_id` (fk → clients)
- `status` (`draft` | `final`)
- `language` (`nl` | `en`)
- `vat_treatment` (`nl_standard` | `eu_reverse_charge`)
- `issue_date` (date)
- `due_date` (date)
- `notes` (text, nullable)
- `subtotal` (numeric)
- `vat_amount` (numeric)
- `total` (numeric)
- `pdf_path` (text, nullable) — Supabase Storage path, set at finalize time, never regenerated
- `paid` (boolean, default false)
- `sent_at` (timestamptz, nullable)
- `created_at` (timestamptz)
- `finalized_at` (timestamptz, nullable)

### `invoice_items`
- `id` (uuid, pk)
- `invoice_id` (fk → invoices)
- `description` (text)
- `quantity` (numeric)
- `unit_price` (numeric)
- `vat_rate` (numeric — 21, 9, or 0) — defaults from the invoice's `vat_treatment` but is overridable per line
- `line_total` (numeric)
- `sort_order` (int)

"EU" throughout this document means the other 26 EU member states (Netherlands is always handled as the domestic case, never as "EU reverse charge"). The country list is a fixed static list in code, not fetched from anywhere.

## Core flows

### 1. Login
Single password field. On success, sets a session cookie valid for a long-lived period (e.g. 30 days). All `/api/*` routes except `/api/login` require a valid session.

### 2. Dashboard
List of invoices (number, client, date, total, VAT treatment, status, paid/unpaid), newest first. Filterable by year and quarter. A summary strip for the selected period: total revenue, VAT collected at 21%, total reverse-charged (0%) revenue.

### 3. New invoice
- Client: searchable dropdown over saved `clients`, or an inline "+ New client" form.
- Dates: issue date (defaults today), due date (defaults +14 days, editable).
- Language: NL or EN, defaulting to NL when the client's country is NL, EN otherwise. Editable. Each invoice is generated in a single chosen language (not bilingual).
- VAT treatment: auto-set from client country + presence of a VAT number —
  - NL client → `nl_standard`, 21% on all lines by default.
  - Non-NL EU client with a VAT number → `eu_reverse_charge`, 0% on all lines, and the PDF includes the mandatory reverse-charge note ("BTW verlegd naar de ontvanger" / "VAT reverse-charged to the recipient") plus both parties' VAT numbers.
  - Non-NL EU client with no VAT number → blocked with an inline warning: reverse charge requires a valid-format VAT number; either add one or treat the client as a normal NL-VAT sale.
  - Line-level VAT rate can still be overridden per row for mixed cases.
- Line items: description, quantity, unit price, VAT rate (defaulted, editable) — add/remove rows, live-calculated line totals, subtotal, VAT, and grand total.
- Save as **Draft** (fully editable, no invoice number yet, excluded from tax totals) or **Finalize**.

### 4. Finalize
- Assigns the next sequential invoice number for the current calendar year (`NEO-<year>-<0001...>`), gapless — this is a hard Dutch legal requirement, so numbering is assigned transactionally at finalize time, never pre-allocated or reusable.
- Locks every field on the invoice (no further edits). Corrections after this point are handled by issuing a new invoice, not editing an old one (credit notes are explicitly out of scope for v1 — see below).
- Generates the PDF server-side and stores it in Supabase Storage at a fixed path (e.g. `invoices/<year>/<invoice_number>.pdf`); `pdf_path` is set once and never overwritten.

### 5. Invoice detail
Shows the rendered invoice with actions:
- **Print** — opens the stored PDF in a new tab so the browser's native PDF print dialog handles it.
- **Download** — downloads the PDF file.
- **Email** — sends the PDF as an attachment via Gmail SMTP from `finance@neoinsentai.com` to the client's email, with a subject/body pre-filled in the invoice's language and editable before sending. Sets `sent_at`.
- **Paid toggle** — manual mark as paid/unpaid. No reminders or chasing logic in v1.

### 6. Tax records / export
Filter by quarter or year. Shows:
- Total revenue, VAT collected at 21%, total 0% reverse-charged revenue — the figures needed for the quarterly BTW aangifte.
- A per-client breakdown of reverse-charged sales (client name + VAT number + total for the period) — the data needed for the quarterly ICP opgave (intra-EU transactions declaration).
- CSV export of the filtered invoice list.

## Out of scope for v1

- Payment reminders / chasing.
- Live VIES VAT-number verification (format validation only — no external lookup).
- Credit notes / invoice corrections as a first-class flow.
- Multi-currency (EUR only).
- Recurring/subscription invoices.
- EU B2C OSS handling (destination-country VAT rates) — only NL-standard and EU-business-reverse-charge are handled.

## Setup dependencies (to resolve during implementation)

- New Supabase project (or new schema in an existing one).
- New Vercel project, root directory `neoinsent-invoicing/`.
- Google app password for `finance@neoinsentai.com` (requires 2-Step Verification).
- Env vars: Supabase URL/keys, app password hash + session secret, Gmail app password.
