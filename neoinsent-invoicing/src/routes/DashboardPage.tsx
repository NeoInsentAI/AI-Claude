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
    /** Per VAT treatment and rate; reverse charge is told apart by `treatment`, not by its 0% rate. */
    vatByRate: { treatment: 'nl_standard' | 'eu_reverse_charge'; rate: number; base: number; vat: number }[]
    reverseChargeRevenue: number
    unpaidCount: number
    unpaidTotal: number
  }
  invoices: DashboardInvoice[]
  drafts: DashboardInvoice[]
  /** Every unpaid final invoice, whatever the period, oldest due date first. */
  outstanding: { count: number; total: number; overdueCount: number; invoices: DashboardInvoice[] }
  /** Earliest year with a final invoice; null when there are none. */
  firstYear: number | null
}

interface Period {
  year: number
  quarter: Quarter | null
}

const PERIOD_KEY = 'neoinsent.dashboardPeriod'
const FIRST_YEAR_KEY = 'neoinsent.dashboardFirstYear'
/** At least this many years (the current one included) are always offered. */
const MIN_YEARS_SHOWN = 5

/** Current year back to the first year with an invoice, and at least the last five years. */
function yearOptions(currentYear: number, firstYear: number | null): number[] {
  const oldest = Math.min(firstYear ?? currentYear, currentYear - (MIN_YEARS_SHOWN - 1))
  return Array.from({ length: currentYear - oldest + 1 }, (_, i) => currentYear - i)
}

/** The first year the server last reported, so a remembered older year is valid before it answers. */
function loadFirstYear(): number | null {
  try {
    const raw = localStorage.getItem(FIRST_YEAR_KEY)
    const year = raw === null ? null : Number(JSON.parse(raw))
    return typeof year === 'number' && Number.isInteger(year) ? year : null
  } catch {
    return null
  }
}

/** The last period picked on this Mac, if it is still one of the offered choices. */
function loadPeriod(currentYear: number, firstYear: number | null): Period {
  const fallback: Period = { year: currentYear, quarter: null }
  try {
    const raw = localStorage.getItem(PERIOD_KEY)
    if (!raw) return fallback
    const saved = JSON.parse(raw) as Partial<Period> | null
    const year = saved?.year
    const quarter = saved?.quarter ?? null
    if (typeof year !== 'number' || !yearOptions(currentYear, firstYear).includes(year)) return fallback
    if (quarter !== null && ![1, 2, 3, 4].includes(quarter)) return fallback
    return { year, quarter }
  } catch {
    return fallback
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked or full: the value simply isn't remembered.
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

function invoiceCount(n: number): string {
  return n === 1 ? '1 invoice' : `${n} invoices`
}

function StatusPill({ invoice }: { invoice: DashboardInvoice }) {
  return invoice.paid ? <span className="pill pill-paid">Paid</span> : <span className="pill pill-final">Finalized</span>
}

export function DashboardPage() {
  const currentYear = new Date().getFullYear()
  const [firstYear, setFirstYear] = useState<number | null>(loadFirstYear)
  const [period, setPeriod] = useState<Period>(() => loadPeriod(currentYear, firstYear))
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const yearId = useId()
  const quarterId = useId()

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    apiFetch<DashboardData>(dashboardUrl(period))
      .then((result) => {
        if (cancelled) return
        setData(result)
        setFirstYear(result.firstYear)
        store(FIRST_YEAR_KEY, result.firstYear)
        // The data may no longer reach back to the chosen year (e.g. a restored database).
        if (!yearOptions(currentYear, result.firstYear).includes(period.year)) {
          setPeriod({ year: currentYear, quarter: null })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the invoices')
      })
    return () => {
      cancelled = true
    }
  }, [period, attempt, currentYear])

  function choose(next: Period) {
    setPeriod(next)
    store(PERIOD_KEY, next)
  }

  const today = todayLocalIso()
  const summary = data?.summary
  const vatBreakdown = summary?.vatByRate
    .filter((r) => r.treatment === 'nl_standard' && r.rate > 0)
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
            {yearOptions(currentYear, firstYear).map((y) => (
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
        <div>
          <p role="alert" className="error">
            {error}
          </p>
          <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
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
            <SummaryCard label="Unpaid (this period)" value={formatCurrency(summary.unpaidTotal)}>
              <p style={{ ...hint, marginTop: 4 }}>{invoiceCount(summary.unpaidCount)}</p>
            </SummaryCard>
          </div>

          {data.outstanding.count > 0 && (
            <section className="card" aria-labelledby="outstanding-heading" style={{ marginBottom: 24 }}>
              <h2 id="outstanding-heading">
                Outstanding{' '}
                <span className="num" style={{ fontWeight: 400 }}>
                  · {invoiceCount(data.outstanding.count)} · {formatCurrency(data.outstanding.total)}
                </span>
              </h2>
              {data.outstanding.overdueCount > 0 && (
                <p style={{ ...hint, marginBottom: 8 }}>
                  <span className="flag flag-danger">{`${data.outstanding.overdueCount} overdue`}</span>
                </p>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table aria-label="Outstanding invoices">
                  <thead>
                    <tr>
                      <th scope="col">Number</th>
                      <th scope="col">Client</th>
                      <th scope="col">Due date</th>
                      <th scope="col" style={{ textAlign: 'right' }}>
                        Total
                      </th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.outstanding.invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <Link to={`/invoices/${encodeURIComponent(invoice.id)}`}>{invoice.invoice_number}</Link>
                        </td>
                        <td>{invoice.client_name}</td>
                        <td className="num">{formatDate(invoice.due_date)}</td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {formatCurrency(invoice.total)}
                        </td>
                        <td>{invoice.due_date < today && <span className="flag flag-danger">Overdue</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

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
