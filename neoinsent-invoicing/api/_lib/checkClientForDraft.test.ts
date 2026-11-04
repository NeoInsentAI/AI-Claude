import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkClientForDraft } from './checkClientForDraft'
import * as clientsRepo from './clientsRepo'

vi.mock('./clientsRepo')

const CLIENT_ID = '0b8f3c2e-1d4a-4f6b-9c7e-2a1b3c4d5e6f'

const baseClient = {
  id: CLIENT_ID,
  name: 'Acme BV',
  contact_person: null,
  email: 'billing@acme.nl',
  address_line: 'Damrak 1',
  postal_code: '1012 LG',
  city: 'Amsterdam',
  country: 'NL',
  vat_number: 'NL123456789B01',
  kvk_number: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
}

describe('checkClientForDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a client whose VAT treatment matches', async () => {
    vi.mocked(clientsRepo.getClientById).mockResolvedValue(baseClient)
    expect(await checkClientForDraft(CLIENT_ID, 'nl_standard')).toEqual({ ok: true })
    expect(clientsRepo.getClientById).toHaveBeenCalledWith(CLIENT_ID)
  })

  it('rejects an unknown client', async () => {
    vi.mocked(clientsRepo.getClientById).mockResolvedValue(null)
    expect(await checkClientForDraft(CLIENT_ID, 'nl_standard')).toEqual({
      ok: false,
      error: 'Client not found',
    })
  })

  it('names the expected treatment on a plain mismatch', async () => {
    vi.mocked(clientsRepo.getClientById).mockResolvedValue(baseClient)
    expect(await checkClientForDraft(CLIENT_ID, 'eu_reverse_charge')).toEqual({
      ok: false,
      error: "VAT treatment doesn't match this client (expected nl_standard)",
    })
  })

  it('explains a missing VAT number for an EU client', async () => {
    vi.mocked(clientsRepo.getClientById).mockResolvedValue({ ...baseClient, country: 'DE', vat_number: null })
    expect(await checkClientForDraft(CLIENT_ID, 'eu_reverse_charge')).toEqual({
      ok: false,
      error: 'This client needs a valid VAT number matching their country before you can invoice them',
    })
  })

  it('explains an unsupported country', async () => {
    vi.mocked(clientsRepo.getClientById).mockResolvedValue({ ...baseClient, country: 'US', vat_number: null })
    expect(await checkClientForDraft(CLIENT_ID, 'nl_standard')).toEqual({
      ok: false,
      error: "This client's country isn't supported for invoicing",
    })
  })

  it('lets repository errors propagate', async () => {
    vi.mocked(clientsRepo.getClientById).mockRejectedValue(new Error('disk full'))
    await expect(checkClientForDraft(CLIENT_ID, 'nl_standard')).rejects.toThrow('disk full')
  })
})
