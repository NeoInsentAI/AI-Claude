import { randomUUID } from 'node:crypto'
import { getDb } from './db'

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
  updated_at: string | null
}

export type NewClient = Omit<Client, 'id' | 'created_at' | 'updated_at'>

// The database work is synchronous (node:sqlite); the functions stay async so callers can await
// them the same way whatever the storage.

/** The columns of a `Client`, for `select` statements (also used by invoicesRepo). */
export const CLIENT_COLUMNS =
  'id, name, contact_person, email, address_line, postal_code, city, country, vat_number, kvk_number, created_at, updated_at'

/** node:sqlite rows have a null prototype; callers get ordinary objects. */
export function toClient(row: unknown): Client {
  return { ...(row as Client) }
}

function selectById(id: string): Client | null {
  const row = getDb().prepare(`select ${CLIENT_COLUMNS} from clients where id = ?`).get(id)
  return row === undefined ? null : toClient(row)
}

export async function listClients(): Promise<Client[]> {
  return getDb()
    .prepare(`select ${CLIENT_COLUMNS} from clients order by name collate nocase, created_at`)
    .all()
    .map(toClient)
}

export async function getClientById(id: string): Promise<Client | null> {
  return selectById(id)
}

export async function createClient(input: NewClient): Promise<Client> {
  const id = randomUUID()
  getDb()
    .prepare(
      `insert into clients (id, name, contact_person, email, address_line, postal_code, city,
                            country, vat_number, kvk_number, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.contact_person,
      input.email,
      input.address_line,
      input.postal_code,
      input.city,
      input.country,
      input.vat_number,
      input.kvk_number,
      new Date().toISOString(),
    )
  return selectById(id) as Client
}

export async function updateClient(id: string, input: NewClient): Promise<Client | null> {
  const result = getDb()
    .prepare(
      `update clients set name = ?, contact_person = ?, email = ?, address_line = ?,
                          postal_code = ?, city = ?, country = ?, vat_number = ?, kvk_number = ?,
                          updated_at = ?
       where id = ?`,
    )
    .run(
      input.name,
      input.contact_person,
      input.email,
      input.address_line,
      input.postal_code,
      input.city,
      input.country,
      input.vat_number,
      input.kvk_number,
      new Date().toISOString(),
      id,
    )
  return result.changes === 0 ? null : selectById(id)
}
