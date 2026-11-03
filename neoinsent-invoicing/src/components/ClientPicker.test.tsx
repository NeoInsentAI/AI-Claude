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

const CLIENTS: ClientSummary[] = [
  {
    id: '1',
    name: 'Acme BV',
    email: 'ap@acme.test',
    address_line: 'Main St 1',
    postal_code: '1000AA',
    city: 'Amsterdam',
    country: 'NL',
    vat_number: null,
    kvk_number: '12345678',
    contact_person: null,
  },
  {
    id: '2',
    name: 'Globex GmbH',
    email: 'ap@globex.test',
    address_line: 'Hauptstr 1',
    postal_code: '10115',
    city: 'Berlin',
    country: 'DE',
    vat_number: 'DE123456789',
    kvk_number: null,
    contact_person: 'Hank Scorpio',
  },
]

function stubFetchClients() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ clients: CLIENTS })))
}

function ControlledPicker({
  onChange,
  initial = null,
}: {
  onChange: (client: ClientSummary) => void
  initial?: ClientSummary | null
}) {
  const [value, setValue] = useState<ClientSummary | null>(initial)
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
          client: {
            id: '3',
            name: 'New Co',
            email: 'ap@newco.test',
            address_line: 'Rue 1',
            postal_code: '75001',
            city: 'Paris',
            country: 'FR',
            vat_number: 'FR12345678901',
            kvk_number: null,
            contact_person: null,
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    render(<ControlledPicker onChange={onChange} />)
    await screen.findByText('Acme BV')

    await fillNewClientForm()
    await userEvent.click(screen.getByText('Save client'))

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: '3', name: 'New Co', vat_number: 'FR12345678901' }),
      ),
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

  it('hides the Edit button when no client is selected', async () => {
    stubFetchClients()
    render(<ClientPicker value={null} onChange={() => {}} />)
    await screen.findByText('Acme BV')
    expect(screen.queryByText('Edit client')).not.toBeInTheDocument()
  })

  it('prefills the form from the selected client when editing', async () => {
    stubFetchClients()
    render(<ClientPicker value={CLIENTS[1]} onChange={() => {}} />)
    await screen.findByText('Acme BV')

    await userEvent.click(screen.getByText('Edit client'))

    expect(screen.getByLabelText('Name')).toHaveValue('Globex GmbH')
    expect(screen.getByLabelText('Email')).toHaveValue('ap@globex.test')
    expect(screen.getByLabelText('Address')).toHaveValue('Hauptstr 1')
    expect(screen.getByLabelText('Postal code')).toHaveValue('10115')
    expect(screen.getByLabelText('City')).toHaveValue('Berlin')
    expect(screen.getByLabelText('Country')).toHaveValue('DE')
    expect(screen.getByLabelText('VAT number (EU clients)')).toHaveValue('DE123456789')
    expect(screen.getByLabelText('KVK number (NL clients)')).toHaveValue('')
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })

  it('closes the edit form when a different client is selected', async () => {
    stubFetchClients()
    const onChange = vi.fn()
    render(<ControlledPicker onChange={onChange} initial={CLIENTS[1]} />)
    await screen.findByText('Acme BV')

    await userEvent.click(screen.getByText('Edit client'))
    expect(screen.getByText('Save changes')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Client'), '1')

    expect(onChange).toHaveBeenCalledWith(CLIENTS[0])
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('hides "+ New client" while editing', async () => {
    stubFetchClients()
    render(<ClientPicker value={CLIENTS[1]} onChange={() => {}} />)
    await screen.findByText('Acme BV')

    await userEvent.click(screen.getByText('Edit client'))
    expect(screen.queryByText('+ New client')).not.toBeInTheDocument()
  })

  it('hides "Edit client" while creating a new client', async () => {
    stubFetchClients()
    render(<ClientPicker value={CLIENTS[1]} onChange={() => {}} />)
    await screen.findByText('Acme BV')

    await userEvent.click(screen.getByText('+ New client'))
    expect(screen.queryByText('Edit client')).not.toBeInTheDocument()
  })

  it('starts "+ New client" from an empty form after an edit is closed', async () => {
    stubFetchClients()
    render(<ControlledPicker onChange={() => {}} initial={CLIENTS[1]} />)
    await screen.findByText('Acme BV')

    await userEvent.click(screen.getByText('Edit client'))
    expect(screen.getByLabelText('Name')).toHaveValue('Globex GmbH')
    await userEvent.selectOptions(screen.getByLabelText('Client'), '1')
    await userEvent.click(screen.getByText('+ New client'))

    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByText('Save client')).toBeInTheDocument()
  })

  it('saves edits with a PATCH and calls onChange with the returned client', async () => {
    const updated = { ...CLIENTS[1], address_line: 'Hauptstr 2' }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ clients: CLIENTS }))
      .mockResolvedValueOnce(jsonResponse({ client: updated }))
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    render(<ControlledPicker onChange={onChange} initial={CLIENTS[1]} />)
    await screen.findByText('Acme BV')

    await userEvent.click(screen.getByText('Edit client'))
    const address = screen.getByLabelText('Address')
    await userEvent.clear(address)
    await userEvent.type(address, 'Hauptstr 2')
    await userEvent.click(screen.getByText('Save changes'))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(updated))

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/clients/2')
    expect(init.method).toBe('PATCH')
    const payload = JSON.parse(init.body as string)
    expect(payload.address_line).toBe('Hauptstr 2')
    expect(payload.kvk_number).toBeNull()
    expect(payload.contact_person).toBe('Hank Scorpio')

    expect(screen.queryByText('Save changes')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Client')).toHaveValue('2')
  })

  it('shows the server error when an edit fails and keeps the form open', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ clients: CLIENTS }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Email address looks invalid' }, 400))
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    render(<ClientPicker value={CLIENTS[1]} onChange={onChange} />)
    await screen.findByText('Acme BV')

    await userEvent.click(screen.getByText('Edit client'))
    const email = screen.getByLabelText('Email')
    await userEvent.clear(email)
    await userEvent.type(email, 'broken')
    await userEvent.click(screen.getByText('Save changes'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email address looks invalid')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email')).toHaveValue('broken')
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
