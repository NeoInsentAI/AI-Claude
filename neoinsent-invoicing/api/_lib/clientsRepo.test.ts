// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from './db'
import { createClient, getClientById, listClients, updateClient, type NewClient } from './clientsRepo'

let tmpDir: string
const originalDataDir = process.env.NEOINSENT_DATA_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-clients-'))
  process.env.NEOINSENT_DATA_DIR = tmpDir
  closeDb()
})

afterEach(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (originalDataDir === undefined) delete process.env.NEOINSENT_DATA_DIR
  else process.env.NEOINSENT_DATA_DIR = originalDataDir
})

const acme: NewClient = {
  name: 'Acme BV',
  contact_person: 'Jan de Vries',
  email: 'billing@acme.nl',
  address_line: 'Damrak 1',
  postal_code: '1012 LG',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: 'NL123456789B01',
  kvk_number: '12345678',
}

const minimal: NewClient = {
  name: 'Berlin GmbH',
  contact_person: null,
  email: 'info@berlin.de',
  address_line: 'Unter den Linden 1',
  postal_code: '10117',
  city: 'Berlin',
  country: 'DE',
  vat_number: null,
  kvk_number: null,
}

describe('createClient', () => {
  it('stores the client and returns it with an id and timestamps', async () => {
    const client = await createClient(acme)

    expect(client).toMatchObject(acme)
    expect(client.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Date(client.created_at).toISOString()).toBe(client.created_at)
    expect(client.updated_at).toBeNull()
    expect(await getClientById(client.id)).toEqual(client)
  })

  it('round-trips null optional fields as null', async () => {
    const client = await createClient(minimal)

    const stored = await getClientById(client.id)
    expect(stored).toMatchObject({ contact_person: null, vat_number: null, kvk_number: null })
  })
})

describe('listClients', () => {
  it('returns an empty list for a fresh database', async () => {
    expect(await listClients()).toEqual([])
  })

  it('orders clients by name, ignoring case', async () => {
    await createClient({ ...minimal, name: 'zeta Labs' })
    await createClient({ ...minimal, name: 'Alpha BV' })
    await createClient({ ...minimal, name: 'beta Studio' })

    expect((await listClients()).map((c) => c.name)).toEqual(['Alpha BV', 'beta Studio', 'zeta Labs'])
  })
})

describe('getClientById', () => {
  it('returns null for an unknown id', async () => {
    expect(await getClientById('00000000-0000-4000-8000-000000000000')).toBeNull()
  })
})

describe('updateClient', () => {
  it('replaces the fields, sets updated_at and keeps id and created_at', async () => {
    const created = await createClient(acme)

    const updated = await updateClient(created.id, { ...minimal, name: 'Acme Holding BV' })

    expect(updated).toMatchObject({ ...minimal, name: 'Acme Holding BV' })
    expect(updated?.id).toBe(created.id)
    expect(updated?.created_at).toBe(created.created_at)
    expect(updated?.updated_at).toEqual(expect.any(String))
    expect(await getClientById(created.id)).toEqual(updated)
  })

  it('returns null for an unknown id', async () => {
    expect(await updateClient('00000000-0000-4000-8000-000000000000', acme)).toBeNull()
  })
})

describe('returned rows', () => {
  it('are plain objects, not null-prototype database rows', async () => {
    const created = await createClient(acme)
    const updated = await updateClient(created.id, acme)
    const fetched = await getClientById(created.id)
    const [listed] = await listClients()

    for (const client of [created, updated, fetched, listed]) {
      expect(Object.getPrototypeOf(client)).toBe(Object.prototype)
    }
  })
})
