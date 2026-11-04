import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCurrency } from '../lib/format'
import { DashboardPage } from './DashboardPage'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

/** formatCurrency with its non-breaking space as a plain space, as toHaveTextContent normalizes it. */
function money(amount: number): string {
  return formatCurrency(amount).replace(/\s/g, ' ')
}

function jsonResponse(payload: unknown, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(payload) }
}

const SUMMARY = {
  invoiceCount: 3,
  subtotal: 2269.98,
  vatAmount: 139.5,
  total: 2409.48,
  vatByRate: [
    { rate: 21, base: 210.01, vat: 44.1 },
    { rate: 9, base: 1059.97, vat: 95.4 },
    { rate: 0, base: 1000, vat: 0 },
  ],
  reverseChargeRevenue: 1000,
  unpaidCount: 2,
  unpaidTotal: 1307.37,
}

function finalInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    invoice_number: 'NEO-2026-0001',
    client_id: 'c1',
    client_name: 'Acme BV',
    status: 'final',
    vat_treatment: 'nl_standard',
    issue_date: '2026-10-01',
    due_date: '2026-10-15',
    subtotal: 100,
    vat_amount: 21,
    total: 121,
    paid: false,
    pdf_path: 'invoices/2026/NEO-2026-0001.pdf',
    ...overrides,
  }
}

function draftInvoice(overrides: Record<string, unknown> = {}) {
  return finalInvoice({
    id: 'd1',
    invoice_number: null,
    client_name: 'Beta BV',
    status: 'draft',
    pdf_path: null,
    total: 50,
    ...overrides,
  })
}

function dashboard(overrides: Record<string, unknown> = {}) {
  return {
    period: { year: 2026, quarter: null, fromDate: '2026-01-01', toDate: '2026-12-31' },
    summary: SUMMARY,
    invoices: [finalInvoice()],
    drafts: [],
    ...overrides,
  }
}

function stubFetch(payload: unknown = dashboard(), status = 200) {
  const fetchMock = vi.fn(async (_url: string) => jsonResponse(payload, status))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Pins "today" (local time) without faking timers that testing-library relies on. */
function setToday(date: Date) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(date)
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

async function finalTable() {
  return screen.findByRole('table', { name: 'Final invoices' })
}

describe('DashboardPage', () => {
  it('requests the whole current year by default and shows a loading state', async () => {
    setToday(new Date(2026, 10, 4, 12))
    const fetchMock = stubFetch()
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.getByRole('heading', { name: 'Invoices' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ New invoice' })).toHaveAttribute('href', '/invoices/new')
    await finalTable()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/dashboard?year=2026')
  })

  it('offers the current year and the four before it', async () => {
    setToday(new Date(2026, 10, 4, 12))
    stubFetch()
    renderPage()
    const options = within(screen.getByLabelText('Year')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['2026', '2025', '2024', '2023', '2022'])
    expect(within(screen.getByLabelText('Quarter')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Whole year',
      'Q1',
      'Q2',
      'Q3',
      'Q4',
    ])
    await finalTable()
  })

  it('refetches when the quarter or year changes and remembers the choice', async () => {
    setToday(new Date(2026, 10, 4, 12))
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    const { unmount } = renderPage()
    await finalTable()

    await user.selectOptions(screen.getByLabelText('Quarter'), 'Q3')
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/dashboard?year=2026&quarter=3', expect.anything()))
    await user.selectOptions(screen.getByLabelText('Year'), '2025')
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/dashboard?year=2025&quarter=3', expect.anything()))
    await finalTable()
    unmount()

    fetchMock.mockClear()
    renderPage()
    expect(screen.getByLabelText('Year')).toHaveValue('2025')
    expect(screen.getByLabelText('Quarter')).toHaveValue('3')
    await finalTable()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/dashboard?year=2025&quarter=3')
  })

  it('ignores a remembered year outside the offered range', async () => {
    setToday(new Date(2026, 10, 4, 12))
    localStorage.setItem('neoinsent.dashboardPeriod', JSON.stringify({ year: 2019, quarter: 2 }))
    const fetchMock = stubFetch()
    renderPage()
    await finalTable()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/dashboard?year=2026')
  })

  it('still works when localStorage throws', async () => {
    setToday(new Date(2026, 10, 4, 12))
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    renderPage()
    await finalTable()
    await user.selectOptions(screen.getByLabelText('Quarter'), 'Q1')
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/dashboard?year=2026&quarter=1', expect.anything()))
  })

  it('shows the summary figures', async () => {
    stubFetch()
    renderPage()
    await finalTable()
    const card = (label: string) => screen.getByRole('group', { name: label })
    expect(card('Invoiced excl. VAT')).toHaveTextContent(money(2269.98))
    expect(card('VAT')).toHaveTextContent(money(139.5))
    expect(card('VAT')).toHaveTextContent(`21%: ${money(44.1)} · 9%: ${money(95.4)}`)
    expect(card('VAT')).not.toHaveTextContent('0%:')
    expect(card('Reverse-charged (EU)')).toHaveTextContent(money(1000))
    expect(card('Total incl. VAT')).toHaveTextContent(money(2409.48))
    expect(card('Unpaid')).toHaveTextContent(money(1307.37))
    expect(card('Unpaid')).toHaveTextContent('2 invoices')
  })

  it('lists final invoices with links, dates, totals and status', async () => {
    stubFetch(
      dashboard({
        invoices: [
          finalInvoice(),
          finalInvoice({ id: 'f2', invoice_number: 'NEO-2026-0002', client_name: 'Gamma BV', paid: true, total: 300 }),
        ],
      }),
    )
    renderPage()
    const table = await finalTable()
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('link', { name: 'NEO-2026-0001' })).toHaveAttribute('href', '/invoices/f1')
    expect(rows[0]).toHaveTextContent('Acme BV')
    expect(rows[0]).toHaveTextContent('01-10-2026')
    expect(rows[0]).toHaveTextContent('15-10-2026')
    expect(rows[0]).toHaveTextContent(money(121))
    expect(rows[0]).toHaveTextContent('Finalized')
    expect(within(rows[1]).getByRole('link', { name: 'NEO-2026-0002' })).toHaveAttribute('href', '/invoices/f2')
    expect(rows[1]).toHaveTextContent('Paid')
  })

  it('flags only unpaid final invoices past their due date (local date) as overdue', async () => {
    // 15 Oct 23:30 local: an invoice due on the 15th is not overdue yet; one due on the 14th is.
    setToday(new Date(2026, 9, 15, 23, 30))
    stubFetch(
      dashboard({
        invoices: [
          finalInvoice({ id: 'a', invoice_number: 'NEO-A', due_date: '2026-10-14' }),
          finalInvoice({ id: 'b', invoice_number: 'NEO-B', due_date: '2026-10-15' }),
          finalInvoice({ id: 'c', invoice_number: 'NEO-C', due_date: '2026-10-01', paid: true }),
        ],
      }),
    )
    renderPage()
    const table = await finalTable()
    const row = (n: string) => within(table).getByRole('link', { name: n }).closest('tr') as HTMLElement
    expect(within(row('NEO-A')).getByText('Overdue')).toHaveClass('flag-danger')
    expect(within(row('NEO-B')).queryByText('Overdue')).not.toBeInTheDocument()
    expect(within(row('NEO-C')).queryByText('Overdue')).not.toBeInTheDocument()
  })

  it('flags final invoices whose PDF is missing', async () => {
    stubFetch(
      dashboard({
        invoices: [
          finalInvoice({ id: 'a', invoice_number: 'NEO-A', pdf_path: null }),
          finalInvoice({ id: 'b', invoice_number: 'NEO-B' }),
        ],
      }),
    )
    renderPage()
    const table = await finalTable()
    const row = (n: string) => within(table).getByRole('link', { name: n }).closest('tr') as HTMLElement
    expect(within(row('NEO-A')).getByText('PDF missing')).toBeInTheDocument()
    expect(within(row('NEO-B')).queryByText('PDF missing')).not.toBeInTheDocument()
  })

  it('shows an empty state when the period has no final invoices', async () => {
    stubFetch(dashboard({ invoices: [] }))
    renderPage()
    expect(await screen.findByText('No invoices in this period.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Final invoices' })).not.toBeInTheDocument()
  })

  it('shows drafts with links when there are any', async () => {
    stubFetch(dashboard({ drafts: [draftInvoice(), draftInvoice({ id: 'd2', client_name: 'Delta BV', total: 75 })] }))
    renderPage()
    const table = await screen.findByRole('table', { name: 'Drafts' })
    const links = within(table).getAllByRole('link', { name: 'Draft' })
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/invoices/d1', '/invoices/d2'])
    expect(table).toHaveTextContent('Beta BV')
    expect(table).toHaveTextContent(money(75))
  })

  it('hides the drafts section when there are none', async () => {
    stubFetch()
    renderPage()
    await finalTable()
    expect(screen.queryByRole('heading', { name: 'Drafts' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Drafts' })).not.toBeInTheDocument()
  })

  it('shows the server error', async () => {
    stubFetch({ error: 'Database error — please try again' }, 500)
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Database error — please try again')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
