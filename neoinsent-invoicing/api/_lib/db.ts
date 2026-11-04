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

/**
 * The columns of a final invoice that may never change (paid, sent_at, pdf_path, updated_at may),
 * as of schema v1. Frozen: v1's trigger is built from it. Later versions extend it.
 */
const FINAL_INVOICE_LOCKED_COLUMNS_V1 = [
  'status',
  'invoice_number',
  'client_id',
  'client_snapshot',
  'issue_date',
  'due_date',
  'vat_treatment',
  'language',
  'notes',
  'subtotal_cents',
  'vat_amount_cents',
  'total_cents',
  'finalized_at',
  'created_at',
]

/** v2 adds service_period (leverdatum), which is part of the legal record too. */
const FINAL_INVOICE_LOCKED_COLUMNS_V2 = [...FINAL_INVOICE_LOCKED_COLUMNS_V1, 'service_period']

/** The trigger that rejects changes to the locked columns of a final invoice. */
function finalInvoiceNoUpdateTrigger(lockedColumns: readonly string[]): string {
  return `
create trigger invoices_final_no_update
before update on invoices
when old.status = 'final' and (
  ${lockedColumns.map((c) => `old.${c} IS NOT new.${c}`).join('\n  or ')}
)
begin
  select raise(abort, 'final invoices cannot be changed');
end;
`
}

const DATE_GLOB = "'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'"

const SCHEMA_V1 = `
create table clients (
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
  created_at TEXT NOT NULL,
  updated_at TEXT
);

create table invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE,
  client_id TEXT NOT NULL REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  language TEXT NOT NULL CHECK (language IN ('nl','en')),
  vat_treatment TEXT NOT NULL CHECK (vat_treatment IN ('nl_standard','eu_reverse_charge')),
  issue_date TEXT NOT NULL CHECK (issue_date GLOB ${DATE_GLOB}),
  due_date TEXT NOT NULL CHECK (due_date GLOB ${DATE_GLOB}),
  notes TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  vat_amount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  client_snapshot TEXT,
  pdf_path TEXT,
  paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0,1)),
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  finalized_at TEXT,
  CHECK (status = 'draft' OR (client_snapshot IS NOT NULL AND invoice_number IS NOT NULL
                              AND finalized_at IS NOT NULL))
);

create table invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity_hundredths INTEGER NOT NULL CHECK (quantity_hundredths > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  vat_rate INTEGER NOT NULL CHECK (vat_rate IN (0,9,21)),
  line_total_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (invoice_id, sort_order)
);

create table invoice_counters (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

create index invoices_status_idx on invoices(status);
create index invoices_issue_date_idx on invoices(issue_date);
create index invoices_client_id_idx on invoices(client_id);

-- Final invoices are a legal record: the database itself refuses to delete or alter them.
create trigger invoices_final_no_delete
before delete on invoices
when old.status = 'final'
begin
  select raise(abort, 'final invoices cannot be deleted');
end;

${finalInvoiceNoUpdateTrigger(FINAL_INVOICE_LOCKED_COLUMNS_V1)}
create trigger invoice_items_final_no_insert
before insert on invoice_items
when (select status from invoices where id = new.invoice_id) = 'final'
begin
  select raise(abort, 'items of a final invoice cannot be changed');
end;

create trigger invoice_items_final_no_update
before update on invoice_items
when (select status from invoices where id = old.invoice_id) = 'final'
  or (select status from invoices where id = new.invoice_id) = 'final'
begin
  select raise(abort, 'items of a final invoice cannot be changed');
end;

create trigger invoice_items_final_no_delete
before delete on invoice_items
when (select status from invoices where id = old.invoice_id) = 'final'
begin
  select raise(abort, 'items of a final invoice cannot be changed');
end;
`

/**
 * Schema migrations in order: MIGRATIONS[i] brings the database from user_version i to i + 1.
 * Never edit a migration once a real database has run it — append a new one instead.
 */
export const MIGRATIONS: readonly ((db: DatabaseSync) => void)[] = [
  (db) => db.exec(SCHEMA_V1),
  // v2: optional service period / leverdatum (free text, e.g. 'October 2026'), locked once final.
  (db) =>
    db.exec(`
alter table invoices add column service_period TEXT;
drop trigger invoices_final_no_update;
${finalInvoiceNoUpdateTrigger(FINAL_INVOICE_LOCKED_COLUMNS_V2)}
`),
]

export function defaultDataDir(): string {
  return path.join(os.homedir(), 'NeoInsent Invoicing')
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Creates a directory (and parents) readable by the owner only. */
function mkdirPrivate(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
}

/**
 * The data folder (absolute; created owner-only if missing). Refuses iCloud Drive and other
 * cloud-synced folders: syncing an open SQLite file can corrupt it.
 */
export function getDataDir(): string {
  const dir = path.resolve(process.env.NEOINSENT_DATA_DIR || defaultDataDir())
  const library = path.join(os.homedir(), 'Library')
  for (const synced of ['Mobile Documents', 'CloudStorage']) {
    if (isInside(dir, path.join(library, synced))) {
      throw new Error(
        `Keep the data folder out of iCloud/cloud sync — syncing an open database can corrupt it (${dir})`,
      )
    }
  }
  mkdirPrivate(dir)
  return dir
}

/** Where finalized invoice PDFs are written (created if missing). */
export function getInvoicesDir(): string {
  const dir = path.join(getDataDir(), 'invoices')
  mkdirPrivate(dir)
  return dir
}

function userVersion(db: DatabaseSync): number {
  return (db.prepare('pragma user_version').get() as { user_version: number }).user_version
}

function migrate(db: DatabaseSync): void {
  if (userVersion(db) === MIGRATIONS.length) return
  withTransaction(db, () => {
    // Re-read under the write lock: another process may have migrated in the meantime.
    const current = userVersion(db)
    if (current > MIGRATIONS.length) {
      throw new Error('This database was created by a newer version of the app')
    }
    for (let v = current; v < MIGRATIONS.length; v++) MIGRATIONS[v](db)
    db.exec(`pragma user_version = ${MIGRATIONS.length}`)
  })
}

/** Opens a specific database file, configures it and brings the schema up to date. */
export function openDb(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath)
  try {
    db.exec('pragma busy_timeout = 5000')
    // Rollback journal (not WAL) + FULL sync: after every commit the .db file alone is complete,
    // so a copy or Time Machine restore of just that file never loses committed data.
    db.exec('pragma journal_mode = DELETE')
    db.exec('pragma synchronous = FULL')
    db.exec('pragma foreign_keys = ON')
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

/** Rejects Promise-like return types at compile time (async work would escape the transaction). */
type Synchronous<T> = T extends PromiseLike<unknown> ? never : T

/**
 * Runs fn inside BEGIN IMMEDIATE … COMMIT; rolls back and rethrows if fn throws. fn must be
 * synchronous: an async callback would commit before its awaited work ran.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => Synchronous<T>): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result: unknown = fn()
    if (
      result !== null &&
      (typeof result === 'object' || typeof result === 'function') &&
      typeof (result as { then?: unknown }).then === 'function'
    ) {
      throw new Error('withTransaction callback must be synchronous')
    }
    db.exec('COMMIT')
    return result as T
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw err
  }
}

/**
 * Copies the database to destPath (which must not exist yet) as one consistent, compacted file.
 * Safe while the app is running; cannot be called inside a transaction.
 */
export function backupDb(db: DatabaseSync, destPath: string): void {
  if (fs.existsSync(destPath)) throw new Error(`Backup destination already exists: ${destPath}`)
  db.prepare('VACUUM INTO ?').run(destPath)
}

const BACKUP_FILE = /^neoinsent-\d{4}-\d{2}-\d{2}\.db$/

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Writes today's backup to `<dataDir>/backups/neoinsent-YYYY-MM-DD.db` (skipped if it already
 * exists) and deletes the oldest dated backups beyond `keep`. Returns today's backup path.
 * `db` defaults to the app database.
 */
export function rotateBackups(dataDir: string, keep = 30, db: DatabaseSync = getDb()): string {
  const dir = path.join(dataDir, 'backups')
  mkdirPrivate(dir)
  const today = path.join(dir, `neoinsent-${localDate(new Date())}.db`)
  if (!fs.existsSync(today)) backupDb(db, today)
  const backups = fs
    .readdirSync(dir)
    .filter((f) => BACKUP_FILE.test(f))
    .sort()
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    fs.rmSync(path.join(dir, old))
  }
  return today
}

function toInteger100(n: number, what: string): number {
  const result = Math.round(n * 100) + 0 // + 0 turns -0 into 0
  if (!Number.isSafeInteger(result)) throw new Error(`Invalid ${what}: ${n}`)
  return result
}

/**
 * Euros → integer cents. Math.round absorbs float noise such as 19.99 * 100; exact only for
 * inputs with at most 2 decimals (validateDraftInvoice enforces that).
 */
export function toCents(n: number): number {
  return toInteger100(n, 'amount')
}

/** Quantity → integer hundredths (1.5 → 150); same rounding caveat as toCents. */
export function toHundredths(qty: number): number {
  return toInteger100(qty, 'quantity')
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
