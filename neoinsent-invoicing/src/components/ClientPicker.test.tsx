import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientPicker, type ClientSummary } from './ClientPicker'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(payload: unknown, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(payload) }
}

const CLIENTS = [
  { id: '1', name: 'Acme BV', country: 'NL', vat_number: null },
  { id: '2', name: 'Globex GmbH', country: 'DE', vat_number: 'DE123456789' },
]

function stubFetchClients() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ clients: CLIENTS })))
}

function ControlledPicker({ onChange }: { onChange: (client: ClientSummary) => void }) {
  const [value, setValue] = useState<ClientSummary | null>(null)
  return (
    <ClientPicker
      value={value}
      onChange={(client) => {
        setValue(client)
        onChange(client)
      }}
    />
  )
}

async function fillNewClientForm() {
  await userEvent.click(screen.getByText('+ New client'))
  await userEvent.type(screen.getByLabelText('Name'), 'New Co')
  await userEvent.type(screen.getByLabelText('Email'), 'ap@newco.test')
  await userEvent.type(screen.getByLabelText('Address'), 'Rue 1')
  await userEvent.type(screen.getByLabelText('Postal code'), '75001')
  await userEvent.type(screen.getByLabelText('City'), 'Paris')
  await userEvent.type(screen.getByLabelText('Country'), 'FR')
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
      .mockResolvedValueOnce(jsonResponse({ clients: CLIENTS }))
      .mockResolvedValueOnce(
        jsonResponse({
          client: { id: '3', name: 'New Co', country: 'FR', vat_number: 'FR12345678901' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    render(<ControlledPicker onChange={onChange} />)
    await screen.findByText('Acme BV')

    await fillNewClientForm()
    await userEvent.click(screen.getByText('Save client'))

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        id: '3',
        name: 'New Co',
        country: 'FR',
        vat_number: 'FR12345678901',
      }),
    )

    const postInit = fetchMock.mock.calls[1][1] as RequestInit
    const payload = JSON.parse(postInit.body as string)
    expect(payload.vat_number).toBeNull()
    expect(payload.kvk_number).toBeNull()

    expect(screen.getByLabelText('Client')).toHaveValue('3')
    expect(screen.getByRole('option', { name: 'New Co' })).toBeInTheDocument()
  })

  it('shows the server error when saving fails and keeps the form open', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ clients: CLIENTS }))
      .mockResolvedValueOnce(jsonResponse({ error: 'VAT number looks invalid' }, 400))
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    render(<ClientPicker value={null} onChange={onChange} />)
    await screen.findByText('Acme BV')

    await fillNewClientForm()
    await userEvent.click(screen.getByText('Save client'))

    expect(await screen.findByRole('alert')).toHaveTextContent('VAT number looks invalid')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveValue('New Co')
  })

  it('shows an error when the client list fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'Database unavailable' }, 500)),
    )
    render(<ClientPicker value={null} onChange={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load clients: Database unavailable',
    )
  })
})
