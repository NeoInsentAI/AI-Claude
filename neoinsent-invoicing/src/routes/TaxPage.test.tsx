import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatCurrency } from '../lib/format'
import { TaxPage } from './TaxPage'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** formatCurrency with its non-breaking space as a plain space, as toHaveTextContent normalizes it. */
function money(amount: number): string {
  return formatCurrency(amount).replace(/\s/g, ' ')
}

function jsonResponse(payload: unknown, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(payload) }
}

function taxData(overrides: Record<string, unknown> = {}) {
  return {
    period: { year: 2026, quarter: 3, fromDate: '2026-07-01', toDate: '2026-09-30' },
    btw: {
      r1a: { base: 210.01, vat: 44.1 },
      r1b: { base: 1059.97, vat: 95.4 },
      r1e: { base: 50 },
      r3b: { base: 2066.66 },
      vatDue: 139.5,
    },
    icp: [
      { country: 'DE', vatNumber: 'DE123456789', clientName: 'Beispiel GmbH', servicesTotal: 1666.66 },
      { country: 'FR', vatNumber: 'FR12345678901', clientName: 'Exemple SARL', servicesTotal: 400 },
    ],
    invoiceCount: 5,
    firstYear: 2026,
    ...overrides,
  }
}

function stubFetch(...responses: unknown[]) {
  const fetchMock = vi.fn(async (_url: string) => {
    const next = responses.length > 1 ? responses.shift() : responses[0]
    if (next instanceof Error) throw next
    return next
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function today(date: Date) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(date)
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TaxPage />
    </MemoryRouter>,
  )
}

describe('TaxPage', () => {
  it('defaults to the most recent completed quarter (2026-11-04 → 2026 Q3)', async () => {
    today(new Date(2026, 10, 4, 10, 0))
    const fetchMock = stubFetch(jsonResponse(taxData()))
    renderPage()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/tax?year=2026&quarter=3')
    expect(screen.getByLabelText('Year')).toHaveValue('2026')
    expect(screen.getByLabelText('Quarter')).toHaveValue('3')
    await screen.findByRole('table', { name: /BTW return/ })
  })

  it('defaults to Q4 of last year during Q1 (2026-01-15 → 2025 Q4)', async () => {
    today(new Date(2026, 0, 15, 10, 0))
    const fetchMock = stubFetch(jsonResponse(taxData({ firstYear: null })))
    renderPage()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/tax?year=2025&quarter=4')
    expect(screen.getByLabelText('Year')).toHaveValue('2025')
    expect(screen.getByLabelText('Quarter')).toHaveValue('4')
    await screen.findByRole('table', { name: /BTW return/ })
  })

  it('shows every rubriek with its Dutch label and exact amounts, and the rounding note', async () => {
    today(new Date(2026, 10, 4, 10, 0))
    stubFetch(jsonResponse(taxData()))
    renderPage()
    const table = await screen.findByRole('table', { name: /BTW return/ })
    const rows = within(table).getAllByRole('row')
    const row = (code: string) => rows.find((r) => within(r).queryByText(code) !== null) as HTMLElement

    expect(row('1a')).toHaveTextContent('Leveringen/diensten belast met hoog tarief')
    expect(row('1a')).toHaveTextContent(money(210.01))
    expect(row('1a')).toHaveTextContent(money(44.1))
    expect(row('1b')).toHaveTextContent('Leveringen/diensten belast met laag tarief')
    expect(row('1b')).toHaveTextContent(money(1059.97))
    expect(row('1b')).toHaveTextContent(money(95.4))
    expect(row('1e')).toHaveTextContent('Leveringen/diensten belast met 0% of niet bij u belast')
    expect(row('1e')).toHaveTextContent(money(50))
    expect(row('3b')).toHaveTextContent('Leveringen naar/diensten in landen binnen de EU')
    expect(row('3b')).toHaveTextContent(money(2066.66))
    const due = rows.find((r) => r.textContent?.includes('Verschuldigde btw')) as HTMLElement
    expect(due).toHaveTextContent(money(139.5))
    expect(
      screen.getByText(
        'Amounts are exact. In the return you enter whole euros; you may round turnover and VAT due down to the nearest euro.',
      ),
    ).toBeInTheDocument()
  })

  it('lists the ICP rows with a note to report them as services', async () => {
    today(new Date(2026, 10, 4, 10, 0))
    stubFetch(jsonResponse(taxData()))
    renderPage()
    const table = await screen.findByRole('table', { name: /ICP opgave/ })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('DE')
    expect(rows[0]).toHaveTextContent('DE123456789')
    expect(rows[0]).toHaveTextContent('Beispiel GmbH')
    expect(rows[0]).toHaveTextContent(money(1666.66))
    expect(rows[1]).toHaveTextContent('Exemple SARL')
    expect(screen.getByText('Report these as services (diensten) in the ICP declaration.')).toBeInTheDocument()
  })

  it('shows the ICP empty state', async () => {
    today(new Date(2026, 10, 4, 10, 0))
    stubFetch(jsonResponse(taxData({ icp: [] })))
    renderPage()
    expect(await screen.findByText('No EU reverse-charge invoices in this period.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /ICP opgave/ })).not.toBeInTheDocument()
  })

  it('links the CSV downloads to the chosen period', async () => {
    today(new Date(2026, 10, 4, 10, 0))
    const user = userEvent.setup()
    const fetchMock = stubFetch(jsonResponse(taxData()))
    renderPage()
    await screen.findByRole('table', { name: /BTW return/ })
    expect(screen.getByRole('link', { name: 'Download invoices CSV' })).toHaveAttribute(
      'href',
      '/api/tax/invoices.csv?year=2026&quarter=3',
    )
    expect(screen.getByRole('link', { name: 'Download ICP CSV' })).toHaveAttribute(
      'href',
      '/api/tax/icp.csv?year=2026&quarter=3',
    )

    await user.selectOptions(screen.getByLabelText('Quarter'), 'Whole year')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/tax?year=2026', expect.anything())
    expect(screen.getByRole('link', { name: 'Download invoices CSV' })).toHaveAttribute(
      'href',
      '/api/tax/invoices.csv?year=2026',
    )
    expect(screen.getByRole('link', { name: 'Download ICP CSV' })).toHaveAttribute('href', '/api/tax/icp.csv?year=2026')
  })

  it('offers older years back to the first year with an invoice', async () => {
    today(new Date(2026, 10, 4, 10, 0))
    stubFetch(jsonResponse(taxData({ firstYear: 2019 })))
    renderPage()
    await screen.findByRole('table', { name: /BTW return/ })
    const years = within(screen.getByLabelText('Year')).getAllByRole('option').map((o) => o.textContent)
    expect(years[0]).toBe('2026')
    expect(years.at(-1)).toBe('2019')
  })

  it('shows loading, then an error with Retry that reloads', async () => {
    today(new Date(2026, 10, 4, 10, 0))
    const user = userEvent.setup()
    stubFetch(jsonResponse({ error: 'Database error — please try again' }, 500), jsonResponse(taxData()))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading tax records…')
    expect(await screen.findByRole('alert')).toHaveTextContent('Database error — please try again')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('table', { name: /BTW return/ })).toBeInTheDocument()
  })
})
