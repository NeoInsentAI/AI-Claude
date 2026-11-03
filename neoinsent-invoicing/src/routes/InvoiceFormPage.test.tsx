import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientSummary } from '../components/ClientPicker'
import { addDaysIso, todayLocalIso } from '../lib/invoiceForm'
import { InvoiceFormPage } from './InvoiceFormPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(payload: unknown, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(payload) }
}

const NL_CLIENT: ClientSummary = {
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
}

const EU_CLIENT: ClientSummary = {
  id: '2',
  name: 'Globex GmbH',
  email: 'ap@globex.test',
  address_line: 'Hauptstr 1',
  postal_code: '10115',
  city: 'Berlin',
  country: 'DE',
  vat_number: 'DE123456789',
  kvk_number: null,
  contact_person: null,
}

const EU_NO_VAT: ClientSummary = { ...EU_CLIENT, id: '3', name: 'Initech SARL', country: 'FR', vat_number: null }

const CLIENTS = [NL_CLIENT, EU_CLIENT, EU_NO_VAT]

const INVOICE_ID = '11111111-1111-4111-8111-111111111111'

function draftInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    invoice_number: null,
    client_id: NL_CLIENT.id,
    status: 'draft',
    language: 'en',
    vat_treatment: 'nl_standard',
    issue_date: '2026-10-01',
    due_date: '2026-10-15',
    notes: 'Thanks!',
    client: NL_CLIENT,
    client_snapshot: null,
    items: [
      { id: 'i1', description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21, line_total: 242 },
      { id: 'i2', description: 'Books', quantity: 1, unit_price: 20, vat_rate: 9, line_total: 21.8 },
    ],
    ...overrides,
  }
}

type Handler = (url: string, init?: RequestInit) => ReturnType<typeof jsonResponse> | undefined

function stubFetch(handler: Handler) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/clients' && (init?.method ?? 'GET') === 'GET') return jsonResponse({ clients: CLIENTS })
    const res = handler(url, init)
    if (res) return res
    throw new Error(`unexpected fetch ${init?.method ?? 'GET'} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function InvoiceStub() {
  const { id } = useParams()
  return <p>Invoice page {id}</p>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invoices/new" element={<InvoiceFormPage mode="new" />} />
        <Route path="/invoices/:id/edit" element={<InvoiceFormPage mode="edit" />} />
        <Route path="/invoices/:id" element={<InvoiceStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function pickClient(name: string) {
  const select = screen.getByLabelText('Client')
  await within(select).findByText(name)
  const option = within(select).getByText(name) as HTMLOptionElement
  await userEvent.selectOptions(select, option.value)
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save draft' })
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>, method: string) {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method)
  expect(call).toBeDefined()
  return JSON.parse(String(call![1]!.body))
}

describe('InvoiceFormPage — new', () => {
  it('disables Save with a reason until there is a client and a valid line', async () => {
    stubFetch(() => undefined)
    renderAt('/invoices/new')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Choose a client.')).toBeInTheDocument()

    await pickClient('Acme BV')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Add at least one line.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    expect(screen.getByText('Line 1 needs a description.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Description 1'), 'Consulting')
    expect(saveButton()).toBeEnabled()
  })

  it('defaults the dates to today and +14 days', async () => {
    stubFetch(() => undefined)
    renderAt('/invoices/new')
    expect(screen.getByLabelText('Issue date')).toHaveValue(todayLocalIso())
    expect(screen.getByLabelText('Due date')).toHaveValue(addDaysIso(todayLocalIso(), 14))
  })

  it('saves an NL draft with 21% lines via POST and goes to the invoice', async () => {
    const fetchMock = stubFetch((url, init) =>
      url === '/api/invoices' && init?.method === 'POST' ? jsonResponse({ invoice: { id: 'inv-1' } }, 201) : undefined,
    )
    renderAt('/invoices/new')
    await pickClient('Acme BV')
    expect(screen.getByLabelText('Language')).toHaveValue('nl')

    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    expect(screen.getByLabelText('VAT rate 1')).toHaveValue('21')
    await userEvent.type(screen.getByLabelText('Description 1'), '  Consulting ')
    await userEvent.clear(screen.getByLabelText('Unit price 1'))
    await userEvent.type(screen.getByLabelText('Unit price 1'), '100,50')
    await userEvent.type(screen.getByLabelText('Notes'), 'Thank you')
    await userEvent.click(saveButton())

    expect(await screen.findByText('Invoice page inv-1')).toBeInTheDocument()
    expect(bodyOf(fetchMock, 'POST')).toEqual({
      client_id: '1',
      language: 'nl',
      vat_treatment: 'nl_standard',
      issue_date: todayLocalIso(),
      due_date: addDaysIso(todayLocalIso(), 14),
      notes: 'Thank you',
      items: [{ description: 'Consulting', quantity: 1, unit_price: 100.5, vat_rate: 21 }],
    })
  })

  it('sends notes as null when empty and keeps a language the user picked', async () => {
    const fetchMock = stubFetch((url, init) =>
      url === '/api/invoices' && init?.method === 'POST' ? jsonResponse({ invoice: { id: 'inv-2' } }, 201) : undefined,
    )
    renderAt('/invoices/new')
    await pickClient('Acme BV')
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'en')
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    await userEvent.type(screen.getByLabelText('Description 1'), 'Work')
    await userEvent.click(saveButton())
    await screen.findByText('Invoice page inv-2')
    const body = bodyOf(fetchMock, 'POST')
    expect(body.language).toBe('en')
    expect(body.notes).toBeNull()
  })

  it('forces 0% and locks the VAT select for an EU client with a VAT number', async () => {
    stubFetch(() => undefined)
    renderAt('/invoices/new')
    await pickClient('Acme BV')
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    await userEvent.selectOptions(screen.getByLabelText('VAT rate 1'), '9')

    await pickClient('Globex GmbH')
    expect(screen.getByLabelText('VAT rate 1')).toHaveValue('0')
    expect(screen.getByLabelText('VAT rate 1')).toBeDisabled()
    expect(screen.getByLabelText('Language')).toHaveValue('en')

    // Back to NL: the zeroed lines go back to the standard rate.
    await pickClient('Acme BV')
    expect(screen.getByLabelText('VAT rate 1')).toHaveValue('21')
    expect(screen.getByLabelText('VAT rate 1')).toBeEnabled()
  })

  it('restores 21% after reverse charge even when a blocked client was picked in between', async () => {
    stubFetch(() => undefined)
    renderAt('/invoices/new')
    await pickClient('Globex GmbH')
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    expect(screen.getByLabelText('VAT rate 1')).toHaveValue('0')
    await pickClient('Initech SARL')
    await pickClient('Acme BV')
    expect(screen.getByLabelText('VAT rate 1')).toHaveValue('21')
  })

  it('warns and blocks saving for an EU client without a VAT number', async () => {
    stubFetch(() => undefined)
    renderAt('/invoices/new')
    await pickClient('Initech SARL')
    expect(screen.getByText(/no valid VAT number/i)).toBeInTheDocument()
    expect(screen.getByText(/Edit the client to add it/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    await userEvent.type(screen.getByLabelText('Description 1'), 'Work')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText("Add the client's VAT number first.")).toBeInTheDocument()
  })

  it("shows the server's error text when saving fails", async () => {
    stubFetch((url, init) =>
      url === '/api/invoices' && init?.method === 'POST'
        ? jsonResponse({ error: 'Due date must not be before the issue date' }, 400)
        : undefined,
    )
    renderAt('/invoices/new')
    await pickClient('Acme BV')
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    await userEvent.type(screen.getByLabelText('Description 1'), 'Work')
    await userEvent.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Due date must not be before the issue date')
    expect(saveButton()).toBeEnabled()
  })
})

describe('InvoiceFormPage — edit', () => {
  const editPath = `/invoices/${INVOICE_ID}/edit`
  const invoiceUrl = `/api/invoices/${INVOICE_ID}`

  it('loads a draft into the form and saves it via PATCH', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url !== invoiceUrl) return undefined
      if (init?.method === 'PATCH') return jsonResponse({ invoice: draftInvoice() })
      return jsonResponse({ invoice: draftInvoice() })
    })
    renderAt(editPath)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()

    expect(await screen.findByLabelText('Description 1')).toHaveValue('Consulting')
    expect(screen.getByLabelText('VAT rate 2')).toHaveValue('9')
    expect(screen.getByLabelText('Issue date')).toHaveValue('2026-10-01')
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-10-15')
    expect(screen.getByLabelText('Language')).toHaveValue('en')
    expect(screen.getByLabelText('Notes')).toHaveValue('Thanks!')
    await waitFor(() => expect(screen.getByLabelText('Client')).toHaveValue('1'))
    expect(screen.queryByText(/VAT details changed/)).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Description 2'))
    await userEvent.type(screen.getByLabelText('Description 2'), 'Manuals')
    await userEvent.click(saveButton())

    expect(await screen.findByText(`Invoice page ${INVOICE_ID}`)).toBeInTheDocument()
    expect(bodyOf(fetchMock, 'PATCH')).toEqual({
      client_id: '1',
      language: 'en',
      vat_treatment: 'nl_standard',
      issue_date: '2026-10-01',
      due_date: '2026-10-15',
      notes: 'Thanks!',
      items: [
        { description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21 },
        { description: 'Manuals', quantity: 1, unit_price: 20, vat_rate: 9 },
      ],
    })
  })

  it('redirects to the invoice when it is already final', async () => {
    stubFetch((url) => (url === invoiceUrl ? jsonResponse({ invoice: draftInvoice({ status: 'final' }) }) : undefined))
    renderAt(editPath)
    expect(await screen.findByText(`Invoice page ${INVOICE_ID}`)).toBeInTheDocument()
  })

  it("updates the VAT lines when the live client's treatment changed", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url !== invoiceUrl) return undefined
      if (init?.method === 'PATCH') return jsonResponse({ invoice: draftInvoice() })
      // Drafted as NL; the client has since been edited into a German business with a VAT number.
      return jsonResponse({ invoice: draftInvoice({ client: { ...NL_CLIENT, country: 'DE', vat_number: 'DE999999999' } }) })
    })
    renderAt(editPath)
    expect(
      await screen.findByText(
        "This client's VAT details changed since the draft was created — VAT lines were updated.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('VAT rate 1')).toHaveValue('0')
    expect(screen.getByLabelText('VAT rate 2')).toHaveValue('0')
    expect(screen.getByLabelText('VAT rate 1')).toBeDisabled()

    await userEvent.click(saveButton())
    await screen.findByText(`Invoice page ${INVOICE_ID}`)
    const body = bodyOf(fetchMock, 'PATCH')
    expect(body.vat_treatment).toBe('eu_reverse_charge')
    expect(body.items.map((i: { vat_rate: number }) => i.vat_rate)).toEqual([0, 0])
  })

  it('goes to the invoice when the PATCH says it was finalized meanwhile (409)', async () => {
    stubFetch((url, init) => {
      if (url !== invoiceUrl) return undefined
      if (init?.method === 'PATCH') {
        return jsonResponse({ error: 'This invoice is finalized and can no longer be edited' }, 409)
      }
      return jsonResponse({ invoice: draftInvoice() })
    })
    renderAt(editPath)
    await screen.findByLabelText('Description 1')
    await userEvent.click(saveButton())
    expect(await screen.findByText(`Invoice page ${INVOICE_ID}`)).toBeInTheDocument()
  })

  it('shows a load error', async () => {
    stubFetch((url) => (url === invoiceUrl ? jsonResponse({ error: 'Invoice not found' }, 404) : undefined))
    renderAt(editPath)
    expect(await screen.findByRole('alert')).toHaveTextContent('Invoice not found')
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument()
  })
})
