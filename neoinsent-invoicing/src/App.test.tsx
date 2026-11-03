import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  it('renders the start view with a New invoice link', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'NeoInsent Invoicing' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ New invoice' })).toHaveAttribute('href', '/invoices/new')
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

  it('shows the invoice placeholder without an edit link', () => {
    renderAt('/invoices/abc')
    expect(screen.getByRole('heading', { name: 'Invoice' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to start' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a notice passed in router state on the invoice placeholder', () => {
    renderAt({ pathname: '/invoices/abc', state: { notice: 'This invoice is finalized and can no longer be edited.' } })
    expect(screen.getByRole('status')).toHaveTextContent('This invoice is finalized and can no longer be edited.')
  })
})
