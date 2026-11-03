// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDb,
  fromCents,
  getDataDir,
  getDb,
  getInvoicesDir,
  nextInvoiceNumber,
  openDb,
  toCents,
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
  db.close()
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
}): string {
  const id = crypto.randomUUID()
  db.prepare(
    `insert into invoices (id, invoice_number, client_id, status, language, vat_treatment,
       issue_date, due_date, client_snapshot, created_at)
     values (?, ?, ?, ?, 'nl', 'nl_standard', '2026-11-03', '2026-12-03', ?, ?)`,
  ).run(
    id,
    fields.invoiceNumber ?? null,
    fields.clientId,
    fields.status ?? 'draft',
    fields.snapshot ?? null,
    now,
  )
  return id
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

describe('data dir', () => {
  it('honours NEOINSENT_DATA_DIR', () => {
    process.env.NEOINSENT_DATA_DIR = path.join(tmpDir, 'data')
    expect(getDataDir()).toBe(path.join(tmpDir, 'data'))
    expect(fs.existsSync(path.join(tmpDir, 'data'))).toBe(true)
  })

  it('defaults to ~/NeoInsent Invoicing', async () => {
    delete process.env.NEOINSENT_DATA_DIR
    const { defaultDataDir } = await import('./db')
    expect(defaultDataDir()).toBe(path.join(os.homedir(), 'NeoInsent Invoicing'))
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
  it('creates all four tables and sets user_version 1', () => {
    expect(tableNames(db)).toEqual(
      expect.arrayContaining(['clients', 'invoices', 'invoice_items', 'invoice_counters']),
    )
    expect(userVersion(db)).toBe(1)
  })

  it('is idempotent when reopening the same file', () => {
    const clientId = insertClient()
    db.close()
    db = openDb(path.join(tmpDir, 'test.db'))
    expect(userVersion(db)).toBe(1)
    expect(db.prepare('select id from clients').all()).toEqual([{ id: clientId }])
  })

  it('enables WAL and foreign keys', () => {
    expect((db.prepare('pragma journal_mode').get() as { journal_mode: string }).journal_mode).toBe(
      'wal',
    )
    expect((db.prepare('pragma foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(
      1,
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

describe('cents helpers', () => {
  it('converts without float drift', () => {
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(fromCents(1999)).toBe(19.99)
  })
})
