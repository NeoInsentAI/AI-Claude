import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/apiClient'
import { formatCurrency, formatDate } from '../lib/format'
import { todayLocalIso } from '../lib/invoiceForm'

type Quarter = 1 | 2 | 3 | 4

/** The fields of an invoice in `GET /api/dashboard` this page uses. */
interface DashboardInvoice {
  id: string
  invoice_number: string | null
  client_name: string
  status: 'draft' | 'final'
  issue_date: string
  due_date: string
  total: number
  paid: boolean
  pdf_path: string | null
}

interface DashboardData {
  summary: {
    invoiceCount: number
    subtotal: number
    vatAmount: number
    total: number
    vatByRate: { rate: number; base: number; vat: number }[]
    reverseChargeRevenue: number
    unpaidCount: number
    unpaidTotal: number
  }
  invoices: DashboardInvoice[]
  drafts: DashboardInvoice[]
}

interface Period {
  year: number
  quarter: Quarter | null
}

const PERIOD_KEY = 'neoinsent.dashboardPeriod'
const YEARS_SHOWN = 5

function yearOptions(currentYear: number): number[] {
  return Array.from({ length: YEARS_SHOWN }, (_, i) => currentYear - i)
}

/** The last period picked on this Mac, if it is still one of the offered choices. */
function loadPeriod(currentYear: number): Period {
  const fallback: Period = { year: currentYear, quarter: null }
  try {
    const raw = localStorage.getItem(PERIOD_KEY)
    if (!raw) return fallback
    const saved = JSON.parse(raw) as Partial<Period> | null
    const year = saved?.year
    const quarter = saved?.quarter ?? null
    if (typeof year !== 'number' || !yearOptions(currentYear).includes(year)) return fallback
    if (quarter !== null && ![1, 2, 3, 4].includes(quarter)) return fallback
    return { year, quarter }
  } catch {
    return fallback
  }
}

function savePeriod(period: Period): void {
  try {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(period))
  } catch {
    // Storage blocked or full: the choice simply isn't remembered.
  }
}

function dashboardUrl({ year, quarter }: Period): string {
  return `/api/dashboard?year=${year}` + (quarter ? `&quarter=${quarter}` : '')
}

const hint = { color: 'var(--ink-soft)', fontSize: '0.85rem', margin: 0 } as const

function SummaryCard({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="card" style={{ padding: 16 }}>
      <p id={id} style={hint}>
        {label}
      </p>
      <p className="num" style={{ color: 'var(--ink)', fontSize: '1.35rem', fontWeight: 700, margin: '4px 0 0' }}>
        {value}
      </p>
      {children}
    </div>
  )
}

function StatusPill({ invoice }: { invoice: DashboardInvoice }) {
  return invoice.paid ? <span className="pill pill-paid">Paid</span> : <span className="pill pill-final">Finalized</span>
}

export function DashboardPage() {
  const currentYear = new Date().getFullYear()
  const [period, setPeriod] = useState<Period>(() => loadPeriod(currentYear))
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const yearId = useId()
  const quarterId = useId()

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    apiFetch<DashboardData>(dashboardUrl(period))
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the invoices')
      })
    return () => {
      cancelled = true
    }
  }, [period])

  function choose(next: Period) {
    setPeriod(next)
    savePeriod(next)
  }

  const today = todayLocalIso()
  const summary = data?.summary
  const vatBreakdown = summary?.vatByRate
    .filter((r) => r.rate > 0)
    .map((r) => `${r.rate}%: ${formatCurrency(r.vat)}`)
    .join(' · ')

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Invoices</h1>
        <Link className="btn btn-primary" to="/invoices/new">
          + New invoice
        </Link>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '20px 0' }}>
        <div>
          <label htmlFor={yearId}>Year</label>
          <select
            id={yearId}
            value={period.year}
            onChange={(e) => choose({ ...period, year: Number(e.target.value) })}
          >
            {yearOptions(currentYear).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={quarterId}>Quarter</label>
          <select
            id={quarterId}
            value={period.quarter ?? ''}
            onChange={(e) =>
              choose({ ...period, quarter: e.target.value === '' ? null : (Number(e.target.value) as Quarter) })
            }
          >
            <option value="">Whole year</option>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>{`Q${q}`}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !data || !summary ? (
        <p role="status">Loading invoices…</p>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            <SummaryCard label="Invoiced excl. VAT" value={formatCurrency(summary.subtotal)} />
            <SummaryCard label="VAT" value={formatCurrency(summary.vatAmount)}>
              {vatBreakdown && (
                <p className="num" style={{ ...hint, marginTop: 4 }}>
                  {vatBreakdown}
                </p>
              )}
            </SummaryCard>
            <SummaryCard label="Reverse-charged (EU)" value={formatCurrency(summary.reverseChargeRevenue)} />
            <SummaryCard label="Total incl. VAT" value={formatCurrency(summary.total)} />
            <SummaryCard label="Unpaid" value={formatCurrency(summary.unpaidTotal)}>
              <p style={{ ...hint, marginTop: 4 }}>
                {summary.unpaidCount === 1 ? '1 invoice' : `${summary.unpaidCount} invoices`}
              </p>
            </SummaryCard>
          </div>

          <section className="card" aria-labelledby="final-invoices-heading" style={{ marginBottom: 24 }}>
            <h2 id="final-invoices-heading">Final invoices</h2>
            {data.invoices.length === 0 ? (
              <p>No invoices in this period.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table aria-labelledby="final-invoices-heading">
                  <thead>
                    <tr>
                      <th scope="col">Number</th>
                      <th scope="col">Client</th>
                      <th scope="col">Invoice date</th>
                      <th scope="col">Due date</th>
                      <th scope="col" style={{ textAlign: 'right' }}>
                        Total
                      </th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((invoice) => {
                      const overdue = !invoice.paid && invoice.due_date < today
                      return (
                        <tr key={invoice.id}>
                          <td>
                            <Link to={`/invoices/${encodeURIComponent(invoice.id)}`}>{invoice.invoice_number}</Link>
                          </td>
                          <td>{invoice.client_name}</td>
                          <td className="num">{formatDate(invoice.issue_date)}</td>
                          <td className="num">{formatDate(invoice.due_date)}</td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {formatCurrency(invoice.total)}
                          </td>
                          <td>
                            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
                              <StatusPill invoice={invoice} />
                              {overdue && <span className="flag flag-danger">Overdue</span>}
                              {invoice.pdf_path === null && <span className="flag">PDF missing</span>}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.drafts.length > 0 && (
            <section className="card" aria-labelledby="drafts-heading">
              <h2 id="drafts-heading">Drafts</h2>
              <div style={{ overflowX: 'auto' }}>
                <table aria-labelledby="drafts-heading">
                  <thead>
                    <tr>
                      <th scope="col">Number</th>
                      <th scope="col">Client</th>
                      <th scope="col" style={{ textAlign: 'right' }}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.drafts.map((draft) => (
                      <tr key={draft.id}>
                        <td>
                          <Link to={`/invoices/${encodeURIComponent(draft.id)}`}>Draft</Link>
                        </td>
                        <td>{draft.client_name}</td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {formatCurrency(draft.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
