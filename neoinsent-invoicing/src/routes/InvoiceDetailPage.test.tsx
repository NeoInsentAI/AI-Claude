import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InvoiceDetailPage } from './InvoiceDetailPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(payload: unknown, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(payload) }
}

const ID = '11111111-1111-4111-8111-111111111111'

const LIVE_CLIENT = {
  id: 'c1',
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

function draftInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    invoice_number: null,
    client_id: 'c1',
    status: 'draft',
    language: 'nl',
    vat_treatment: 'nl_standard',
    issue_date: '2026-11-02',
    due_date: '2026-11-16',
    notes: 'Thanks for your business',
    service_period: 'October 2026',
    vat_note: null,
    subtotal: 220,
    vat_amount: 43.8,
    total: 263.8,
    paid: false,
    sent_at: null,
    pdf_path: null,
    client: LIVE_CLIENT,
    client_snapshot: null,
    items: [
      { id: 'i1', description: 'Consulting', quantity: 2, unit_price: 100, vat_rate: 21, line_total: 242 },
      { id: 'i2', description: 'Books', quantity: 1, unit_price: 20, vat_rate: 9, line_total: 21.8 },
    ],
    ...overrides,
  }
}

function finalInvoice(overrides: Record<string, unknown> = {}) {
  return draftInvoice({
    status: 'final',
    invoice_number: 'NEO-2026-0001',
    issue_date: '2026-11-04',
    due_date: '2026-11-18',
    pdf_path: 'invoices/2026/NEO-2026-0001.pdf',
    // Edited after finalize: the page must show what was invoiced.
    client: { ...LIVE_CLIENT, name: 'Acme Renamed BV' },
    client_snapshot: { ...LIVE_CLIENT, id: undefined },
    ...overrides,
  })
}

type Res = ReturnType<typeof jsonResponse> | Promise<ReturnType<typeof jsonResponse>>
type Handler = (url: string, init?: RequestInit) => Res | undefined

function stubFetch(handler: Handler) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const res = handler(url, init)
    if (res) return res
    throw new Error(`unexpected fetch ${init?.method ?? 'GET'} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function callsTo(fetchMock: ReturnType<typeof stubFetch>, method: string, url: string) {
  return fetchMock.mock.calls.filter(([u, init]) => u === url && (init?.method ?? 'GET') === method)
}

function renderAt(entry: string | { pathname: string; state?: unknown } = `/invoices/${ID}`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<h1>Home</h1>} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/invoices/:id/edit" element={<h1>Edit page</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

const GET_URL = `/api/invoices/${ID}`

describe('InvoiceDetailPage — loading', () => {
  it('shows a loading state, then the invoice', async () => {
    stubFetch((url) => (url === GET_URL ? jsonResponse({ invoice: draftInvoice() }) : undefined))
    renderAt()
    expect(screen.getByText('Loading invoice…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Draft' })).toBeInTheDocument()
  })

  it('shows "Invoice not found" with a link home for an unknown id', async () => {
    stubFetch((url) => (url === GET_URL ? jsonResponse({ error: 'Invoice not found' }, 404) : undefined))
    renderAt()
    expect(await screen.findByRole('heading', { name: 'Invoice not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to start' })).toHaveAttribute('href', '/')
  })

  it('shows a load error', async () => {
    stubFetch((url) => (url === GET_URL ? jsonResponse({ error: 'Database error — please try again' }, 500) : undefined))
    renderAt()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the invoice: Database error — please try again',
    )
  })

  it('shows a notice passed in router state', async () => {
    stubFetch((url) => (url === GET_URL ? jsonResponse({ invoice: finalInvoice() }) : undefined))
    renderAt({ pathname: `/invoices/${ID}`, state: { notice: 'This invoice is finalized and can no longer be edited.' } })
    await screen.findByRole('heading', { level: 1, name: 'NEO-2026-0001' })
    expect(screen.getByText('This invoice is finalized and can no longer be edited.')).toHaveAttribute('role', 'status')
  })
})

describe('InvoiceDetailPage — draft', () => {
  it('shows the draft details with Edit and Finalize, and no PDF or email actions', async () => {
    stubFetch((url) => (url === GET_URL ? jsonResponse({ invoice: draftInvoice() }) : undefined))
    renderAt()
    await screen.findByRole('heading', { level: 1, name: 'Draft' })
    expect(screen.getByTestId('status-pill')).toHaveTextContent('Draft')

    // Client block (live client for a draft).
    const client = screen.getByRole('region', { name: 'Client' })
    expect(within(client).getByText('Acme BV')).toBeInTheDocument()
    expect(within(client).getByText('Jan de Vries')).toBeInTheDocument()
    expect(within(client).getByText('Damrak 1')).toBeInTheDocument()
    expect(within(client).getByText('1012 LG Amsterdam')).toBeInTheDocument()
    expect(within(client).getByText(/NL123456789B01/)).toBeInTheDocument()
    expect(within(client).getByText(/12345678$/)).toBeInTheDocument()

    // Dates, lines, totals, notes.
    expect(screen.getByText('02-11-2026')).toBeInTheDocument()
    expect(screen.getByText('16-11-2026')).toBeInTheDocument()
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Consulting')
    expect(rows[1]).toHaveTextContent('21%')
    expect(rows[1]).toHaveTextContent(/100,00/)
    expect(rows[1]).toHaveTextContent(/200,00/) // amount excl. VAT
    expect(screen.getByTestId('subtotal')).toHaveTextContent(/220,00/)
    expect(screen.getByTestId('vat-amount')).toHaveTextContent(/43,80/)
    expect(screen.getByTestId('total')).toHaveTextContent(/263,80/)
    expect(screen.getByText('Thanks for your business')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `/invoices/${ID}/edit`)
    expect(screen.getByRole('button', { name: 'Finalize' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open PDF' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Download PDF' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Email to client' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mark as/ })).not.toBeInTheDocument()
  })

  it('finalizes only after confirmation, POSTs once on a double click, then shows the number', async () => {
    let resolveFinalize: (r: ReturnType<typeof jsonResponse>) => void = () => {}
    const fetchMock = stubFetch((url, init) => {
      if (url === GET_URL) return jsonResponse({ invoice: draftInvoice() })
      if (url === `${GET_URL}/finalize` && init?.method === 'POST') {
        return new Promise((resolve) => {
          resolveFinalize = resolve
        })
      }
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Finalize' }))
    expect(callsTo(fetchMock, 'POST', `${GET_URL}/finalize`)).toHaveLength(0)

    const confirm = screen.getByRole('group', { name: 'Confirm finalize' })
    expect(confirm).toHaveTextContent(
      "Finalize this invoice? It gets the next invoice number, today's date (the due date moves with it) and can no longer be changed.",
    )
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Confirm finalize' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Finalize' }))
    const panel = screen.getByRole('group', { name: 'Confirm finalize' })
    await user.dblClick(within(panel).getByRole('button', { name: 'Finalize' }))
    const busy = within(panel).getByRole('button', { name: 'Finalizing…' })
    expect(busy).toBeDisabled()
    await user.click(busy)
    expect(callsTo(fetchMock, 'POST', `${GET_URL}/finalize`)).toHaveLength(1)

    resolveFinalize(jsonResponse({ invoice: finalInvoice() }))
    expect(await screen.findByRole('heading', { level: 1, name: 'NEO-2026-0001' })).toBeInTheDocument()
    expect(screen.getByTestId('status-pill')).toHaveTextContent('Finalized')
    expect(screen.getByText('04-11-2026')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Confirm finalize' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open PDF' })).toBeInTheDocument()
  })

  it('shows a pdfWarning from finalize', async () => {
    const warning = 'A different file was already saved under this invoice number and has been kept as x.conflict.pdf.'
    stubFetch((url, init) => {
      if (url === GET_URL) return jsonResponse({ invoice: draftInvoice() })
      if (url === `${GET_URL}/finalize` && init?.method === 'POST') {
        return jsonResponse({ invoice: finalInvoice(), pdfWarning: warning })
      }
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Finalize' }))
    await user.click(within(screen.getByRole('group', { name: 'Confirm finalize' })).getByRole('button', { name: 'Finalize' }))
    expect(await screen.findByText(warning)).toHaveAttribute('role', 'status')
  })

  it('shows a pdfError from finalize as an alert', async () => {
    const pdfError = 'The invoice was finalized, but its PDF could not be created yet — it will be retried when you open it.'
    stubFetch((url, init) => {
      if (url === GET_URL) return jsonResponse({ invoice: draftInvoice() })
      if (url === `${GET_URL}/finalize` && init?.method === 'POST') {
        return jsonResponse({ invoice: finalInvoice({ pdf_path: null }), pdfError })
      }
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Finalize' }))
    await user.click(within(screen.getByRole('group', { name: 'Confirm finalize' })).getByRole('button', { name: 'Finalize' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(pdfError)
    expect(screen.getByRole('heading', { level: 1, name: 'NEO-2026-0001' })).toBeInTheDocument()
  })

  it('shows a 409 from finalize and keeps the draft', async () => {
    const message = "This client's VAT details changed since the draft was created. Edit the draft and save it again."
    stubFetch((url, init) => {
      if (url === GET_URL) return jsonResponse({ invoice: draftInvoice() })
      if (url === `${GET_URL}/finalize` && init?.method === 'POST') return jsonResponse({ error: message }, 409)
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Finalize' }))
    await user.click(within(screen.getByRole('group', { name: 'Confirm finalize' })).getByRole('button', { name: 'Finalize' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { level: 1, name: 'Draft' })).toBeInTheDocument()
    // The draft can be finalized again once fixed.
    expect(screen.getByRole('button', { name: 'Finalize' })).toBeEnabled()
  })

  it('shows a 422 from finalize and keeps the draft', async () => {
    const message = 'This invoice has no lines. Add at least one line before finalizing.'
    stubFetch((url, init) => {
      if (url === GET_URL) return jsonResponse({ invoice: draftInvoice() })
      if (url === `${GET_URL}/finalize` && init?.method === 'POST') return jsonResponse({ error: message }, 422)
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Finalize' }))
    await user.click(within(screen.getByRole('group', { name: 'Confirm finalize' })).getByRole('button', { name: 'Finalize' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { level: 1, name: 'Draft' })).toBeInTheDocument()
    expect(screen.getByTestId('status-pill')).toHaveTextContent('Draft')
  })

  it('blocks Finalize with the reason when a Dutch draft has a 0% line but no VAT note', async () => {
    const fetchMock = stubFetch((url) =>
      url === GET_URL
        ? jsonResponse({
            invoice: draftInvoice({
              items: [{ id: 'i1', description: 'Training', quantity: 1, unit_price: 50, vat_rate: 0, line_total: 50 }],
            }),
          })
        : undefined,
    )
    const user = userEvent.setup()
    renderAt()
    const button = await screen.findByRole('button', { name: 'Finalize' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription(
      'Add a VAT note explaining why a line has 0% VAT (e.g. the legal basis) — edit the draft to add it.',
    )
    await user.click(button)
    expect(screen.queryByRole('group', { name: 'Confirm finalize' })).not.toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', `${GET_URL}/finalize`)).toHaveLength(0)
  })

  it('shows the VAT note and allows Finalize when a Dutch draft with a 0% line has one', async () => {
    stubFetch((url) =>
      url === GET_URL
        ? jsonResponse({
            invoice: draftInvoice({
              vat_note: 'Vrijgesteld van btw (art. 11 Wet OB)',
              items: [{ id: 'i1', description: 'Training', quantity: 1, unit_price: 50, vat_rate: 0, line_total: 50 }],
            }),
          })
        : undefined,
    )
    const user = userEvent.setup()
    renderAt()
    const button = await screen.findByRole('button', { name: 'Finalize' })
    expect(button).toHaveAttribute('aria-disabled', 'false')
    const note = screen.getByRole('region', { name: 'VAT note' })
    expect(note).toHaveTextContent('Vrijgesteld van btw (art. 11 Wet OB)')
    await user.click(button)
    expect(screen.getByRole('group', { name: 'Confirm finalize' })).toBeInTheDocument()
  })

  it('focuses the confirm button when the confirmation opens, and returns focus to Finalize on Cancel', async () => {
    stubFetch((url) => (url === GET_URL ? jsonResponse({ invoice: draftInvoice() }) : undefined))
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Finalize' }))
    const group = screen.getByRole('group', { name: 'Confirm finalize' })
    expect(within(group).getByRole('button', { name: 'Finalize' })).toHaveFocus()
    await user.click(within(group).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Confirm finalize' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalize' })).toHaveFocus()
  })
})

describe('InvoiceDetailPage — final', () => {
  it('shows the client snapshot, not the live client', async () => {
    stubFetch((url) => (url === GET_URL ? jsonResponse({ invoice: finalInvoice() }) : undefined))
    renderAt()
    const client = await screen.findByRole('region', { name: 'Client' })
    expect(within(client).getByText('Acme BV')).toBeInTheDocument()
    expect(screen.queryByText('Acme Renamed BV')).not.toBeInTheDocument()
  })

  it('warns instead of showing the live client when a final invoice has no snapshot', async () => {
    stubFetch((url) => (url === GET_URL ? jsonResponse({ invoice: finalInvoice({ client_snapshot: null }) }) : undefined))
    renderAt()
    const client = await screen.findByRole('region', { name: 'Client' })
    expect(within(client).getByRole('alert')).toHaveTextContent(
      "This invoice's saved client details are missing — the database may be damaged. Restore from a backup.",
    )
    expect(screen.queryByText('Acme Renamed BV')).not.toBeInTheDocument()
    expect(screen.queryByText('Acme BV')).not.toBeInTheDocument()
  })

  it('links to the PDF inline and as a download, with no Edit or Finalize', async () => {
    stubFetch((url) => (url === GET_URL ? jsonResponse({ invoice: finalInvoice() }) : undefined))
    renderAt()
    const open = await screen.findByRole('link', { name: 'Open PDF' })
    expect(open).toHaveAttribute('href', `/api/invoices/${ID}/pdf`)
    expect(open).toHaveAttribute('target', '_blank')
    expect(open).toHaveAttribute('rel', 'noopener')
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', `/api/invoices/${ID}/pdf?download=1`)
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finalize' })).not.toBeInTheDocument()
  })

  it('shows the sent date when the invoice was emailed', async () => {
    const sentAt = new Date(2026, 10, 5, 9, 15).toISOString()
    stubFetch((url) => (url === GET_URL ? jsonResponse({ invoice: finalInvoice({ sent_at: sentAt }) }) : undefined))
    renderAt()
    expect(await screen.findByText('Sent 05-11-2026 09:15')).toBeInTheDocument()
  })

  it('marks the invoice paid and back to unpaid', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url === GET_URL) return jsonResponse({ invoice: finalInvoice() })
      if (url === `${GET_URL}/paid` && init?.method === 'POST') {
        const { paid } = JSON.parse(String(init.body)) as { paid: boolean }
        return jsonResponse({ invoice: finalInvoice({ paid }) })
      }
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Mark as paid' }))
    await waitFor(() => expect(screen.getByTestId('status-pill')).toHaveTextContent('Paid'))
    const calls = callsTo(fetchMock, 'POST', `${GET_URL}/paid`)
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ paid: true })

    await user.click(screen.getByRole('button', { name: 'Mark as unpaid' }))
    await waitFor(() => expect(screen.getByTestId('status-pill')).toHaveTextContent('Finalized'))
    expect(JSON.parse(String(callsTo(fetchMock, 'POST', `${GET_URL}/paid`)[1][1]?.body))).toEqual({ paid: false })
  })

  it('shows an error when the paid toggle fails', async () => {
    stubFetch((url, init) => {
      if (url === GET_URL) return jsonResponse({ invoice: finalInvoice() })
      if (url === `${GET_URL}/paid` && init?.method === 'POST') {
        return jsonResponse({ error: 'Database error — please try again' }, 500)
      }
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Mark as paid' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Database error — please try again')
    expect(screen.getByTestId('status-pill')).toHaveTextContent('Finalized')
  })
})

describe('InvoiceDetailPage — email', () => {
  const PREVIEW = {
    to: 'billing@acme.nl',
    subject: 'Factuur NEO-2026-0001 — NeoInsent AI',
    text: 'Beste Jan de Vries,\n\nIn de bijlage vindt u factuur NEO-2026-0001.',
  }

  it('explains how to set up email when it is not configured, without a form', async () => {
    const fetchMock = stubFetch((url) => {
      if (url === GET_URL) return jsonResponse({ invoice: finalInvoice() })
      if (url === '/api/email/status') {
        return jsonResponse({ configured: false, from: null, message: 'Server says: email is not set up.' })
      }
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Email to client' }))
    expect(await screen.findByText('Server says: email is not set up.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
    expect(callsTo(fetchMock, 'GET', `${GET_URL}/email-preview`)).toHaveLength(0)
  })

  it('prefills the preview, sends the edited email once, and shows where it went', async () => {
    const sentAt = new Date(2026, 10, 5, 9, 15).toISOString()
    let resolveSend: (r: ReturnType<typeof jsonResponse>) => void = () => {}
    const fetchMock = stubFetch((url, init) => {
      if (url === GET_URL) return jsonResponse({ invoice: finalInvoice() })
      if (url === '/api/email/status') return jsonResponse({ configured: true, from: 'finance@neoinsentai.com' })
      if (url === `${GET_URL}/email-preview`) return jsonResponse(PREVIEW)
      if (url === `${GET_URL}/send` && init?.method === 'POST') {
        return new Promise((resolve) => {
          resolveSend = resolve
        })
      }
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Email to client' }))

    const to = await screen.findByLabelText('To')
    expect(to).toHaveValue('billing@acme.nl')
    expect(to).toHaveAttribute('readonly')
    const subject = screen.getByLabelText('Subject')
    const message = screen.getByLabelText('Message')
    expect(subject).toHaveValue(PREVIEW.subject)
    expect(message).toHaveValue(PREVIEW.text)

    await user.clear(subject)
    await user.type(subject, 'Your invoice')
    await user.type(message, '\nKind regards')

    await user.dblClick(screen.getByRole('button', { name: 'Send' }))
    const busy = screen.getByRole('button', { name: 'Sending…' })
    expect(busy).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Email to client' })).toBeDisabled()
    await user.click(busy)
    const sends = callsTo(fetchMock, 'POST', `${GET_URL}/send`)
    expect(sends).toHaveLength(1)
    expect(JSON.parse(String(sends[0][1]?.body))).toEqual({
      subject: 'Your invoice',
      text: `${PREVIEW.text}\nKind regards`,
    })

    resolveSend(jsonResponse({ invoice: finalInvoice({ sent_at: sentAt }), sentTo: 'billing@acme.nl' }))
    expect(await screen.findByText('Sent to billing@acme.nl')).toHaveAttribute('role', 'status')
    expect(screen.getByText('Sent 05-11-2026 09:15')).toBeInTheDocument()
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
  })

  it('shows the server message when sending fails, and keeps the form', async () => {
    stubFetch((url, init) => {
      if (url === GET_URL) return jsonResponse({ invoice: finalInvoice() })
      if (url === '/api/email/status') return jsonResponse({ configured: true, from: 'finance@neoinsentai.com' })
      if (url === `${GET_URL}/email-preview`) return jsonResponse(PREVIEW)
      if (url === `${GET_URL}/send` && init?.method === 'POST') {
        return jsonResponse({ error: 'Could not reach Gmail. Check your internet connection and try again.' }, 502)
      }
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Email to client' }))
    await user.click(await screen.findByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach Gmail. Check your internet connection and try again.',
    )
    expect(screen.getByLabelText('Subject')).toHaveValue(PREVIEW.subject)
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('closes the form and warns not to resend when the email went out but was not recorded', async () => {
    const message = "The email was sent to billing@acme.nl, but the app could not record it. Don't send it again."
    let gets = 0
    stubFetch((url, init) => {
      if (url === GET_URL) {
        gets += 1
        return jsonResponse({ invoice: finalInvoice() })
      }
      if (url === '/api/email/status') return jsonResponse({ configured: true, from: 'finance@neoinsentai.com' })
      if (url === `${GET_URL}/email-preview`) return jsonResponse(PREVIEW)
      if (url === `${GET_URL}/send` && init?.method === 'POST') {
        return jsonResponse({ error: message, emailSent: true }, 500)
      }
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Email to client' }))
    await user.click(await screen.findByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
    await waitFor(() => expect(gets).toBe(2))
  })

  it('shows why the preview could not be loaded (e.g. no client email)', async () => {
    const error = 'This invoice has no client email address to send it to. Download the PDF and send it yourself.'
    stubFetch((url) => {
      if (url === GET_URL) return jsonResponse({ invoice: finalInvoice() })
      if (url === '/api/email/status') return jsonResponse({ configured: true, from: 'finance@neoinsentai.com' })
      if (url === `${GET_URL}/email-preview`) return jsonResponse({ error }, 409)
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Email to client' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(error)
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
  })

  it('closes the panel on Cancel', async () => {
    stubFetch((url) => {
      if (url === GET_URL) return jsonResponse({ invoice: finalInvoice() })
      if (url === '/api/email/status') return jsonResponse({ configured: true, from: 'finance@neoinsentai.com' })
      if (url === `${GET_URL}/email-preview`) return jsonResponse(PREVIEW)
      return undefined
    })
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Email to client' }))
    await screen.findByLabelText('Subject')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
  })
})
