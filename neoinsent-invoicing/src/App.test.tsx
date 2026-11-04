import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderAt(path: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  it('routes / to the dashboard', () => {
    const fetchMock = vi.fn((_url: string) => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Invoices' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ New invoice' })).toHaveAttribute('href', '/invoices/new')
    expect(fetchMock.mock.calls[0][0]).toMatch(/^\/api\/dashboard\?year=\d{4}/)
  })

  it('shows the logo linking home', () => {
    renderAt('/invoices/new')
    const logo = screen.getByRole('img', { name: 'NeoInsent' })
    expect(logo).toHaveAttribute('src', '/logo.png')
    expect(logo.closest('a')).toHaveAttribute('href', '/')
  })

  it('routes /invoices/new to the invoice form', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderAt('/invoices/new')
    expect(screen.getByRole('heading', { name: 'New invoice' })).toBeInTheDocument()
  })

  it('routes /invoices/:id/edit to the invoice form in edit mode', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderAt('/invoices/abc/edit')
    expect(screen.getByRole('heading', { name: 'Edit draft invoice' })).toBeInTheDocument()
  })

  it('routes /invoices/:id to the invoice detail page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, text: async () => JSON.stringify({ error: 'Invoice not found' }) })),
    )
    renderAt('/invoices/abc')
    expect(await screen.findByRole('heading', { name: 'Invoice not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to start' })).toHaveAttribute('href', '/')
  })

  it('shows a notice passed in router state on the invoice detail page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            invoice: {
              id: 'abc',
              invoice_number: 'NEO-2026-0001',
              status: 'final',
              language: 'nl',
              vat_treatment: 'nl_standard',
              issue_date: '2026-11-04',
              due_date: '2026-11-18',
              service_period: null,
              notes: null,
              subtotal: 0,
              vat_amount: 0,
              total: 0,
              paid: false,
              sent_at: null,
              pdf_path: null,
              client: null,
              client_snapshot: null,
              items: [],
            },
          }),
      })),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderAt({ pathname: '/invoices/abc', state: { notice: 'This invoice is finalized and can no longer be edited.' } })
    expect(await screen.findByRole('heading', { name: 'NEO-2026-0001' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('This invoice is finalized and can no longer be edited.')
  })
})
