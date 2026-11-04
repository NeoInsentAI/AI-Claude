// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backupDb,
  closeDb,
  defaultDataDir,
  fromCents,
  getDataDir,
  getDb,
  getInvoicesDir,
  MIGRATIONS,
  MUTABLE_AFTER_FINAL,
  nextInvoiceNumber,
  openDb,
  rotateBackups,
  toCents,
  toHundredths,
  withTransaction,
} from './db'

let tmpDir: string
let db: DatabaseSync
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-'))
  db = openDb(path.join(tmpDir, 'test.db'))
})

afterEach(() => {
  vi.restoreAllMocks()
  if (db.isOpen) db.close()
  closeDb()
  if (originalDataDir === undefined) delete process.env.NEOINSENT_DATA_DIR
  else process.env.NEOINSENT_DATA_DIR = originalDataDir
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const now = '2026-11-03T10:00:00.000Z'

function insertClient(country = 'NL'): string {
  const id = crypto.randomUUID()
  db.prepare(
    `insert into clients (id, name, email, address_line, postal_code, city, country, created_at)
     values (?, 'Acme', 'a@acme.nl', 'Straat 1', '1000 AA', 'Amsterdam', ?, ?)`,
  ).run(id, country, now)
  return id
}

function insertInvoice(fields: {
  clientId: string
  status?: string
  invoiceNumber?: string | null
  snapshot?: string | null
  finalizedAt?: string | null
  issueDate?: string
  dueDate?: string
}): string {
  const id = crypto.randomUUID()
  const status = fields.status ?? 'draft'
  const finalizedAt =
    'finalizedAt' in fields ? fields.finalizedAt : status === 'final' ? now : null
  db.prepare(
    `insert into invoices (id, invoice_number, client_id, status, language, vat_treatment,
       issue_date, due_date, client_snapshot, created_at, finalized_at)
     values (?, ?, ?, ?, 'nl', 'nl_standard', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    fields.invoiceNumber ?? null,
    fields.clientId,
    status,
    fields.issueDate ?? '2026-11-03',
    fields.dueDate ?? '2026-12-03',
    fields.snapshot ?? null,
    now,
    finalizedAt ?? null,
  )
  return id
}

function insertItem(invoiceId: string, sortOrder = 0): string {
  const id = crypto.randomUUID()
  db.prepare(
    `insert into invoice_items (id, invoice_id, description, quantity_hundredths,
       unit_price_cents, vat_rate, line_total_cents, sort_order)
     values (?, ?, 'Work', 100, 5000, 21, 5000, ?)`,
  ).run(id, invoiceId, sortOrder)
  return id
}

/** A draft with one item, then finalized via an UPDATE (as the app will do). */
function finalInvoiceWithItem(): { invoiceId: string; itemId: string } {
  const invoiceId = insertInvoice({ clientId: insertClient() })
  const itemId = insertItem(invoiceId)
  db.prepare(
    `update invoices set status = 'final', invoice_number = '2026-001', client_snapshot = '{}',
       finalized_at = ?, total_cents = 6050 where id = ?`,
  ).run(now, invoiceId)
  return { invoiceId, itemId }
}

function tableNames(d: DatabaseSync): string[] {
  return (
    d.prepare(`select name from sqlite_master where type = 'table' order by name`).all() as {
      name: string
    }[]
  ).map((r) => r.name)
}

function userVersion(d: DatabaseSync): number {
  return (d.prepare('pragma user_version').get() as { user_version: number }).user_version
}

/** Creates a v1 database file (schema v1, one client and one draft invoice) at `file`. */
function createV1Db(file: string): void {
  const v1 = new DatabaseSync(file)
  MIGRATIONS[0](v1)
  v1.exec('pragma user_version = 1')
  v1.prepare(
    `insert into clients (id, name, email, address_line, postal_code, city, country, created_at)
     values ('c1', 'Acme', 'a@acme.nl', 'Straat 1', '1000 AA', 'Amsterdam', 'NL', ?)`,
  ).run(now)
  v1.prepare(
    `insert into invoices (id, client_id, language, vat_treatment, issue_date, due_date, created_at)
     values ('i1', 'c1', 'nl', 'nl_standard', '2026-11-03', '2026-12-03', ?)`,
  ).run(now)
  v1.close()
}

const PRE_MIGRATION_FILE = /^pre-migration-v1-to-v2-\d{8}-\d{6}(-\d+)?\.db$/

function preMigrationBackups(dir: string): string[] {
  const backups = path.join(dir, 'backups')
  if (!fs.existsSync(backups)) return []
  return fs.readdirSync(backups).filter((f) => f.startsWith('pre-migration-'))
}

describe('data dir', () => {
  it('honours NEOINSENT_DATA_DIR', () => {
    process.env.NEOINSENT_DATA_DIR = path.join(tmpDir, 'data')
    expect(getDataDir()).toBe(path.join(tmpDir, 'data'))
    expect(fs.existsSync(path.join(tmpDir, 'data'))).toBe(true)
  })

  it('defaults to ~/NeoInsent Invoicing', () => {
    delete process.env.NEOINSENT_DATA_DIR
    expect(defaultDataDir()).toBe(path.join(os.homedir(), 'NeoInsent Invoicing'))
  })

  it('resolves a relative NEOINSENT_DATA_DIR to an absolute path', () => {
    const target = path.join(tmpDir, 'rel-data')
    process.env.NEOINSENT_DATA_DIR = path.relative(process.cwd(), target)
    expect(path.isAbsolute(process.env.NEOINSENT_DATA_DIR)).toBe(false)
    expect(getDataDir()).toBe(target)
    expect(fs.existsSync(target)).toBe(true)
  })

  it('creates the data dir owner-only (0700)', () => {
    process.env.NEOINSENT_DATA_DIR = path.join(tmpDir, 'data')
    getDataDir()
    expect(fs.statSync(path.join(tmpDir, 'data')).mode & 0o777).toBe(0o700)
  })

  it.each([
    ['Mobile Documents', 'com~apple~CloudDocs'],
    ['CloudStorage', 'Dropbox'],
  ])('refuses a data dir under ~/Library/%s', (cloudDir, sub) => {
    const home = path.join(tmpDir, 'home')
    vi.spyOn(os, 'homedir').mockReturnValue(home)
    const target = path.join(home, 'Library', cloudDir, sub, 'NeoInsent')
    process.env.NEOINSENT_DATA_DIR = target
    expect(() => getDataDir()).toThrow(/iCloud\/cloud sync/)
    expect(fs.existsSync(target)).toBe(false)
  })

  it('getInvoicesDir is <dataDir>/invoices and is created', () => {
    process.env.NEOINSENT_DATA_DIR = path.join(tmpDir, 'data')
    expect(getInvoicesDir()).toBe(path.join(tmpDir, 'data', 'invoices'))
    expect(fs.existsSync(path.join(tmpDir, 'data', 'invoices'))).toBe(true)
  })

  it('getDb opens neoinsent.db in the data dir as a singleton; closeDb resets it', () => {
    process.env.NEOINSENT_DATA_DIR = path.join(tmpDir, 'data')
    const a = getDb()
    expect(getDb()).toBe(a)
    expect(fs.existsSync(path.join(tmpDir, 'data', 'neoinsent.db'))).toBe(true)
    expect(tableNames(a)).toContain('invoices')
    closeDb()
    expect(a.isOpen).toBe(false)
    const b = getDb()
    expect(b === a).toBe(false)
    expect(b.isOpen).toBe(true)
  })
})

describe('openDb schema', () => {
  it('creates all four tables and sets user_version 2', () => {
    expect(tableNames(db)).toEqual(
      expect.arrayContaining(['clients', 'invoices', 'invoice_items', 'invoice_counters']),
    )
    expect(userVersion(db)).toBe(2)
  })

  it('upgrades a v1 database to v2, keeping its rows and adding service_period', () => {
    const file = path.join(tmpDir, 'v1.db')
    createV1Db(file)

    const upgraded = openDb(file)
    try {
      expect(userVersion(upgraded)).toBe(2)
      expect(upgraded.prepare('select id, service_period from invoices').all()).toEqual([
        { id: 'i1', service_period: null },
      ])
      expect(upgraded.prepare('select id from clients').all()).toEqual([{ id: 'c1' }])
    } finally {
      upgraded.close()
    }
  })

  it('backs up a v1 database to backups/pre-migration-v1-to-v2-<timestamp>.db before migrating', () => {
    const dir = path.join(tmpDir, 'upgrade')
    fs.mkdirSync(dir)
    const file = path.join(dir, 'neoinsent.db')
    createV1Db(file)

    openDb(file).close()

    const backups = preMigrationBackups(dir)
    expect(backups).toHaveLength(1)
    expect(backups[0]).toMatch(PRE_MIGRATION_FILE)
    expect(fs.statSync(path.join(dir, 'backups')).mode & 0o777).toBe(0o700)
    const copy = new DatabaseSync(path.join(dir, 'backups', backups[0]), { readOnly: true })
    try {
      expect(userVersion(copy)).toBe(1)
      expect(copy.prepare('select id from clients').all()).toEqual([{ id: 'c1' }])
      expect(copy.prepare('select id from invoices').all()).toEqual([{ id: 'i1' }])
      // The copy really is pre-migration: no v2 column.
      const cols = (copy.prepare('pragma table_info(invoices)').all() as { name: string }[]).map(
        (c) => c.name,
      )
      expect(cols).not.toContain('service_period')
    } finally {
      copy.close()
    }

    // Reopening the now up-to-date database makes no further backup.
    openDb(file).close()
    expect(preMigrationBackups(dir)).toHaveLength(1)
  })

  it('makes no pre-migration backup for a fresh or up-to-date database', () => {
    // beforeEach created tmpDir/test.db from version 0.
    expect(preMigrationBackups(tmpDir)).toEqual([])
    db.close()
    db = openDb(path.join(tmpDir, 'test.db'))
    expect(preMigrationBackups(tmpDir)).toEqual([])
    expect(fs.existsSync(path.join(tmpDir, 'backups'))).toBe(false)
  })

  it('is idempotent when reopening the same file', () => {
    const clientId = insertClient()
    db.close()
    db = openDb(path.join(tmpDir, 'test.db'))
    expect(userVersion(db)).toBe(2)
    expect(db.prepare('select id from clients').all()).toEqual([{ id: clientId }])
  })

  it('uses rollback-journal DELETE mode, synchronous FULL and foreign keys', () => {
    expect((db.prepare('pragma journal_mode').get() as { journal_mode: string }).journal_mode).toBe(
      'delete',
    )
    // 2 = FULL
    expect((db.prepare('pragma synchronous').get() as { synchronous: number }).synchronous).toBe(2)
    expect((db.prepare('pragma foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(
      1,
    )
    expect(
      (db.prepare('pragma busy_timeout').get() as Record<string, number>)['timeout'],
    ).toBe(5000)
  })

  it('refuses to open a database created by a newer app version', () => {
    db.exec('pragma user_version = 99')
    db.close()
    expect(() => openDb(path.join(tmpDir, 'test.db'))).toThrow(
      'This database was created by a newer version of the app',
    )
  })

  it('enforces foreign keys', () => {
    expect(() => insertInvoice({ clientId: crypto.randomUUID() })).toThrow(/FOREIGN KEY/)
  })

  it('cascades invoice item deletes with the invoice', () => {
    const invoiceId = insertInvoice({ clientId: insertClient() })
    db.prepare(
      `insert into invoice_items (id, invoice_id, description, quantity_hundredths,
         unit_price_cents, vat_rate, line_total_cents) values (?, ?, 'Work', 100, 5000, 21, 5000)`,
    ).run(crypto.randomUUID(), invoiceId)
    db.prepare('delete from invoices where id = ?').run(invoiceId)
    expect(db.prepare('select * from invoice_items').all()).toEqual([])
  })

  it('rejects a lowercase or 3-letter country', () => {
    expect(() => insertClient('nl')).toThrow(/CHECK/)
    expect(() => insertClient('NLD')).toThrow(/CHECK/)
    expect(() => insertClient('NL')).not.toThrow()
  })

  it('rejects a final invoice without finalized_at', () => {
    expect(() =>
      insertInvoice({
        clientId: insertClient(),
        status: 'final',
        invoiceNumber: '2026-001',
        snapshot: '{}',
        finalizedAt: null,
      }),
    ).toThrow(/CHECK/)
  })

  it('rejects issue/due dates not in YYYY-MM-DD form', () => {
    const clientId = insertClient()
    expect(() => insertInvoice({ clientId, issueDate: '3-11-2026' })).toThrow(/CHECK/)
    expect(() => insertInvoice({ clientId, dueDate: '2026-12-3' })).toThrow(/CHECK/)
    expect(() => insertInvoice({ clientId, issueDate: '2026-11-03T00:00' })).toThrow(/CHECK/)
    expect(() => insertInvoice({ clientId, issueDate: '2026-11-03' })).not.toThrow()
  })

  it('rejects two items with the same sort_order on one invoice', () => {
    const invoiceId = insertInvoice({ clientId: insertClient() })
    insertItem(invoiceId, 0)
    expect(() => insertItem(invoiceId, 0)).toThrow(/UNIQUE/)
    expect(() => insertItem(invoiceId, 1)).not.toThrow()
    const other = insertInvoice({ clientId: insertClient() })
    expect(() => insertItem(other, 0)).not.toThrow()
  })

  it('rejects a non-positive quantity or negative unit price', () => {
    const invoiceId = insertInvoice({ clientId: insertClient() })
    const insert = (qty: number, price: number) =>
      db
        .prepare(
          `insert into invoice_items (id, invoice_id, description, quantity_hundredths,
             unit_price_cents, vat_rate, line_total_cents) values (?, ?, 'X', ?, ?, 21, 0)`,
        )
        .run(crypto.randomUUID(), invoiceId, qty, price)
    expect(() => insert(0, 100)).toThrow(/CHECK/)
    expect(() => insert(100, -1)).toThrow(/CHECK/)
    expect(() => insert(100, 0)).not.toThrow()
  })

  it('rejects a final invoice without client_snapshot or invoice_number', () => {
    const clientId = insertClient()
    expect(() =>
      insertInvoice({ clientId, status: 'final', invoiceNumber: '2026-001', snapshot: null }),
    ).toThrow(/CHECK/)
    expect(() =>
      insertInvoice({ clientId, status: 'final', invoiceNumber: null, snapshot: '{}' }),
    ).toThrow(/CHECK/)
    expect(() =>
      insertInvoice({ clientId, status: 'final', invoiceNumber: '2026-001', snapshot: '{}' }),
    ).not.toThrow()
  })

  it('accepts a draft without client_snapshot or invoice_number', () => {
    expect(() => insertInvoice({ clientId: insertClient() })).not.toThrow()
  })

  it('rejects an unknown vat_rate on items', () => {
    const invoiceId = insertInvoice({ clientId: insertClient() })
    expect(() =>
      db
        .prepare(
          `insert into invoice_items (id, invoice_id, description, quantity_hundredths,
             unit_price_cents, vat_rate, line_total_cents) values (?, ?, 'X', 100, 1, 6, 1)`,
        )
        .run(crypto.randomUUID(), invoiceId),
    ).toThrow(/CHECK/)
  })
})

describe('final invoices are immutable', () => {
  it('cannot be deleted', () => {
    const { invoiceId } = finalInvoiceWithItem()
    expect(() => db.prepare('delete from invoices where id = ?').run(invoiceId)).toThrow(
      /final invoices cannot be deleted/,
    )
    expect(db.prepare('select id from invoices where id = ?').get(invoiceId)).toBeDefined()
  })

  it('rejects changes to totals, number, snapshot, dates and status', () => {
    const { invoiceId } = finalInvoiceWithItem()
    const attempts = [
      `total_cents = 1`,
      `invoice_number = '2026-999'`,
      `client_snapshot = '{"x":1}'`,
      `issue_date = '2026-01-01'`,
      `status = 'draft'`,
      `notes = 'changed'`,
      `finalized_at = null`,
      `service_period = 'October 2026'`,
    ]
    for (const set of attempts) {
      expect(() => db.prepare(`update invoices set ${set} where id = ?`).run(invoiceId), set).toThrow(
        /final invoices cannot be changed/,
      )
    }
  })

  it('still allows paid, sent_at, pdf_path and updated_at to change', () => {
    const { invoiceId } = finalInvoiceWithItem()
    db.prepare(
      `update invoices set paid = 1, sent_at = ?, pdf_path = 'invoices/2026/2026-001.pdf',
         updated_at = ? where id = ?`,
    ).run(now, now, invoiceId)
    expect(
      db.prepare('select paid, sent_at, pdf_path from invoices where id = ?').get(invoiceId),
    ).toEqual({ paid: 1, sent_at: now, pdf_path: 'invoices/2026/2026-001.pdf' })
  })

  it('locks every invoices column except MUTABLE_AFTER_FINAL (guards future migrations)', () => {
    const otherClientId = insertClient()
    const later = '2027-01-01T00:00:00.000Z'
    // A valid replacement value per column, so a rejection comes from the trigger, not a CHECK.
    // A new invoices column must be added here AND either locked by the trigger or listed in
    // MUTABLE_AFTER_FINAL — otherwise this test fails.
    const replacement: Record<string, string | number> = {
      invoice_number: '2026-999',
      client_id: otherClientId,
      status: 'draft',
      language: 'en',
      vat_treatment: 'eu_reverse_charge',
      issue_date: '2026-01-01',
      due_date: '2026-01-31',
      notes: 'changed',
      subtotal_cents: 1,
      vat_amount_cents: 1,
      total_cents: 1,
      client_snapshot: '{"x":1}',
      pdf_path: 'invoices/2026/changed.pdf',
      paid: 1,
      sent_at: later,
      created_at: later,
      updated_at: later,
      finalized_at: later,
      service_period: 'October 2026',
    }
    const columns = (db.prepare('pragma table_info(invoices)').all() as { name: string }[]).map(
      (c) => c.name,
    )
    const mutable = new Set<string>(MUTABLE_AFTER_FINAL)
    let n = 0
    const freshFinal = () => {
      n += 1
      return insertInvoice({
        clientId: insertClient(),
        status: 'final',
        invoiceNumber: `2026-${String(n).padStart(3, '0')}`,
        snapshot: '{}',
      })
    }

    const unclassified = columns.filter((c) => !(c in replacement) && c !== 'id')
    expect(unclassified, 'invoices columns with no replacement value in this test').toEqual([])
    for (const m of MUTABLE_AFTER_FINAL) expect(columns, m).toContain(m)

    const unlocked: string[] = []
    const lockedButListedMutable: string[] = []
    for (const column of columns) {
      if (column === 'id') continue // primary key; foreign keys from invoice_items protect it
      const id = freshFinal()
      let rejected = false
      try {
        db.prepare(`update invoices set ${column} = ? where id = ?`).run(replacement[column], id)
      } catch (err) {
        expect(String(err), column).toMatch(/final invoices cannot be changed/)
        rejected = true
      }
      if (mutable.has(column) && rejected) lockedButListedMutable.push(column)
      if (!mutable.has(column) && !rejected) unlocked.push(column)
    }
    expect(unlocked, 'columns of a final invoice the trigger does not lock').toEqual([])
    expect(lockedButListedMutable, 'MUTABLE_AFTER_FINAL columns the trigger rejects').toEqual([])
  })

  it('locks the items of a final invoice', () => {
    const { invoiceId, itemId } = finalInvoiceWithItem()
    expect(() => insertItem(invoiceId, 1)).toThrow(/items of a final invoice cannot be changed/)
    expect(() =>
      db.prepare(`update invoice_items set unit_price_cents = 1 where id = ?`).run(itemId),
    ).toThrow(/items of a final invoice cannot be changed/)
    expect(() => db.prepare(`delete from invoice_items where id = ?`).run(itemId)).toThrow(
      /items of a final invoice cannot be changed/,
    )
  })

  it('does not let an item move from a draft into a final invoice', () => {
    const { invoiceId: finalId } = finalInvoiceWithItem()
    const draftId = insertInvoice({ clientId: insertClient() })
    const itemId = insertItem(draftId)
    expect(() =>
      db
        .prepare(`update invoice_items set invoice_id = ?, sort_order = 5 where id = ?`)
        .run(finalId, itemId),
    ).toThrow(/items of a final invoice cannot be changed/)
  })

  it('leaves draft invoices and their items editable', () => {
    const draftId = insertInvoice({ clientId: insertClient() })
    const itemId = insertItem(draftId)
    insertItem(draftId, 1)
    db.prepare(`update invoice_items set unit_price_cents = 1 where id = ?`).run(itemId)
    db.prepare(`delete from invoice_items where id = ?`).run(itemId)
    db.prepare(
      `update invoices set total_cents = 42, notes = 'x', service_period = 'October 2026' where id = ?`,
    ).run(draftId)
    expect(db.prepare('select service_period from invoices where id = ?').get(draftId)).toEqual({
      service_period: 'October 2026',
    })
    db.prepare('delete from invoices where id = ?').run(draftId)
    expect(db.prepare('select * from invoice_items').all()).toEqual([])
  })
})

describe('backups', () => {
  it('backupDb writes a copy that opens and contains the rows', () => {
    const clientId = insertClient()
    const dest = path.join(tmpDir, 'copy.db')
    backupDb(db, dest)
    const copy = openDb(dest)
    try {
      expect(copy.prepare('select id from clients').all()).toEqual([{ id: clientId }])
    } finally {
      copy.close()
    }
  })

  it('backupDb makes the copy owner-only', () => {
    const dest = path.join(tmpDir, 'private.db')
    backupDb(db, dest)
    expect(fs.statSync(dest).mode & 0o777).toBe(0o600)
  })

  it('backupDb refuses to overwrite an existing file', () => {
    const dest = path.join(tmpDir, 'copy.db')
    fs.writeFileSync(dest, 'x')
    expect(() => backupDb(db, dest)).toThrow(/exists/)
  })

  it('rotateBackups writes today\'s backup and keeps only the newest N', () => {
    const dataDir = path.join(tmpDir, 'data')
    const backupsDir = path.join(dataDir, 'backups')
    fs.mkdirSync(backupsDir, { recursive: true })
    for (const d of ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']) {
      fs.writeFileSync(path.join(backupsDir, `neoinsent-${d}.db`), 'old')
    }
    fs.writeFileSync(path.join(backupsDir, 'unrelated.txt'), 'keep me')
    const clientId = insertClient()

    const written = rotateBackups(dataDir, 3, db)

    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(written).toBe(path.join(backupsDir, `neoinsent-${today}.db`))
    expect(fs.readdirSync(backupsDir).sort()).toEqual([
      'neoinsent-2026-03-01.db',
      'neoinsent-2026-04-01.db',
      `neoinsent-${today}.db`,
      'unrelated.txt',
    ])
    const copy = openDb(written)
    try {
      expect(copy.prepare('select id from clients').all()).toEqual([{ id: clientId }])
    } finally {
      copy.close()
    }

    // Second call the same day keeps the existing backup untouched.
    const before = fs.statSync(written).mtimeMs
    expect(rotateBackups(dataDir, 3, db)).toBe(written)
    expect(fs.statSync(written).mtimeMs).toBe(before)
  })

  it('rotateBackups never deletes pre-migration backups', () => {
    const dataDir = path.join(tmpDir, 'data')
    fs.mkdirSync(dataDir)
    const file = path.join(dataDir, 'neoinsent.db')
    createV1Db(file)
    const appDb = openDb(file)
    try {
      const [preMigration] = preMigrationBackups(dataDir)
      expect(preMigration).toMatch(PRE_MIGRATION_FILE)
      const backupsDir = path.join(dataDir, 'backups')
      for (const d of ['2026-01-01', '2026-02-01']) {
        fs.writeFileSync(path.join(backupsDir, `neoinsent-${d}.db`), 'old')
      }

      const written = rotateBackups(dataDir, 1, appDb)

      expect(fs.readdirSync(backupsDir).sort()).toEqual(
        [path.basename(written), preMigration].sort(),
      )
    } finally {
      appDb.close()
    }
  })
})

describe('withTransaction', () => {
  it('commits on success', () => {
    const result = withTransaction(db, () => insertClient())
    expect(db.prepare('select id from clients').all()).toEqual([{ id: result }])
  })

  it('rolls back and rethrows on throw', () => {
    let id = ''
    expect(() =>
      withTransaction(db, () => {
        id = insertClient()
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(db.prepare('select id from clients where id = ?').get(id)).toBeUndefined()
    expect(db.isTransaction).toBe(false)
  })

  it('rejects an async callback and rolls back what it wrote', () => {
    let id = ''
    expect(() =>
      withTransaction(
        db,
        // @ts-expect-error — a Promise-returning callback is a type error
        async () => {
          id = insertClient()
        },
      ),
    ).toThrow('withTransaction callback must be synchronous')
    expect(id).not.toBe('')
    expect(db.isTransaction).toBe(false)
    expect(db.prepare('select id from clients where id = ?').get(id)).toBeUndefined()
  })
})

describe('nextInvoiceNumber', () => {
  it('counts 1, 2, 3 per year and restarts for a new year', () => {
    const next = (year: number) => withTransaction(db, () => nextInvoiceNumber(db, year))
    expect(next(2026)).toBe(1)
    expect(next(2026)).toBe(2)
    expect(next(2026)).toBe(3)
    expect(next(2027)).toBe(1)
    expect(next(2026)).toBe(4)
  })

  it('does not consume a number when the transaction rolls back (gap-free)', () => {
    expect(withTransaction(db, () => nextInvoiceNumber(db, 2026))).toBe(1)
    expect(() =>
      withTransaction(db, () => {
        expect(nextInvoiceNumber(db, 2026)).toBe(2)
        throw new Error('finalize failed')
      }),
    ).toThrow('finalize failed')
    expect(withTransaction(db, () => nextInvoiceNumber(db, 2026))).toBe(2)
  })

  it('refuses to run outside a transaction', () => {
    expect(() => nextInvoiceNumber(db, 2026)).toThrow(/transaction/)
  })
})

describe('units helpers', () => {
  it('converts without float drift', () => {
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(fromCents(1999)).toBe(19.99)
  })

  it('converts quantities to hundredths', () => {
    expect(toHundredths(1.5)).toBe(150)
    expect(toHundredths(0.25)).toBe(25)
    expect(toHundredths(2)).toBe(200)
  })

  it('normalizes -0 to 0', () => {
    expect(Object.is(toCents(-0), 0)).toBe(true)
    expect(Object.is(toCents(-0.001), 0)).toBe(true)
    expect(Object.is(toHundredths(-0), 0)).toBe(true)
  })

  it('throws when the result is not a safe integer', () => {
    expect(() => toCents(Number.NaN)).toThrow()
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow()
    expect(() => toCents(Number.MAX_SAFE_INTEGER)).toThrow()
    expect(() => toHundredths(Number.NaN)).toThrow()
  })
})
