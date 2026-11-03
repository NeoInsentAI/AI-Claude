import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Local SQLite storage for the Mac-only app. Everything lives in one data folder
 * (default `~/NeoInsent Invoicing`, override with NEOINSENT_DATA_DIR):
 *   neoinsent.db         — the database
 *   invoices/            — finalized invoice PDFs
 *
 * Conventions: ids are UUID strings from crypto.randomUUID(); money is INTEGER cents;
 * quantities are INTEGER hundredths; dates are 'YYYY-MM-DD' TEXT; timestamps ISO TEXT.
 */

const SCHEMA_VERSION = 1

const SCHEMA_V1 = `
create table if not exists clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT NOT NULL,
  address_line TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL CHECK (length(country) = 2 AND country = upper(country)),
  vat_number TEXT,
  kvk_number TEXT,
  created_at TEXT NOT NULL
);

create table if not exists invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE,
  client_id TEXT NOT NULL REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  language TEXT NOT NULL CHECK (language IN ('nl','en')),
  vat_treatment TEXT NOT NULL CHECK (vat_treatment IN ('nl_standard','eu_reverse_charge')),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  notes TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  vat_amount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  client_snapshot TEXT,
  pdf_path TEXT,
  paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0,1)),
  sent_at TEXT,
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  CHECK (status = 'draft' OR (client_snapshot IS NOT NULL AND invoice_number IS NOT NULL))
);

create table if not exists invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity_hundredths INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  vat_rate INTEGER NOT NULL CHECK (vat_rate IN (0,9,21)),
  line_total_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

create table if not exists invoice_counters (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

create index if not exists invoices_status_idx on invoices(status);
create index if not exists invoices_issue_date_idx on invoices(issue_date);
create index if not exists invoices_client_id_idx on invoices(client_id);
create index if not exists invoice_items_invoice_id_idx on invoice_items(invoice_id);
`

export function defaultDataDir(): string {
  return path.join(os.homedir(), 'NeoInsent Invoicing')
}

/** The data folder (created if missing). */
export function getDataDir(): string {
  const dir = process.env.NEOINSENT_DATA_DIR || defaultDataDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Where finalized invoice PDFs are written (created if missing). */
export function getInvoicesDir(): string {
  const dir = path.join(getDataDir(), 'invoices')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function migrate(db: DatabaseSync): void {
  const { user_version } = db.prepare('pragma user_version').get() as { user_version: number }
  if (user_version >= SCHEMA_VERSION) return
  withTransaction(db, () => {
    db.exec(SCHEMA_V1)
    db.exec(`pragma user_version = ${SCHEMA_VERSION}`)
  })
}

/** Opens a specific database file, configures it and brings the schema up to date. */
export function openDb(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath)
  try {
    db.exec('pragma journal_mode = WAL')
    db.exec('pragma foreign_keys = ON')
    db.exec('pragma busy_timeout = 5000')
    migrate(db)
  } catch (err) {
    db.close()
    throw err
  }
  return db
}

let singleton: DatabaseSync | null = null

/** The app's database (`<dataDir>/neoinsent.db`), opened on first use. */
export function getDb(): DatabaseSync {
  if (!singleton) singleton = openDb(path.join(getDataDir(), 'neoinsent.db'))
  return singleton
}

/** Closes the app database; the next getDb() reopens it (e.g. after changing the data dir). */
export function closeDb(): void {
  if (singleton) {
    singleton.close()
    singleton = null
  }
}

/** Runs fn inside BEGIN IMMEDIATE … COMMIT; rolls back and rethrows if fn throws. */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw err
  }
}

/** Euros → integer cents. Math.round absorbs float noise such as 19.99 * 100. */
export function toCents(n: number): number {
  return Math.round(n * 100)
}

export function fromCents(c: number): number {
  return c / 100
}

/**
 * Increments and returns the invoice counter for `year`. Must run inside withTransaction so a
 * failed finalize rolls the counter back too — Dutch law requires gap-free numbering.
 */
export function nextInvoiceNumber(db: DatabaseSync, year: number): number {
  if (!db.isTransaction) {
    throw new Error('nextInvoiceNumber must be called inside a transaction')
  }
  const row = db
    .prepare(
      `insert into invoice_counters (year, last_number) values (?, 1)
       on conflict(year) do update set last_number = last_number + 1
       returning last_number`,
    )
    .get(year) as { last_number: number }
  return row.last_number
}
