import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiClient'
import { formatCurrency } from '../lib/format'
import { lastCompletedQuarter, yearOptions, type Period } from '../lib/periods'
import { PeriodPicker } from '../components/PeriodPicker'

/** `GET /api/tax` — exact amounts in euros. */
interface TaxData {
  btw: {
    r1a: { base: number; vat: number }
    r1b: { base: number; vat: number }
    r1e: { base: number }
    r3b: { base: number }
    vatDue: number
  }
  icp: { country: string; vatNumber: string; clientName: string; servicesTotal: number }[]
  invoiceCount: number
  /** Earliest year with a final invoice; null when there are none. */
  firstYear: number | null
}

function periodQuery({ year, quarter }: Period): string {
  return `year=${year}` + (quarter ? `&quarter=${quarter}` : '')
}

const hint = { color: 'var(--ink-soft)', fontSize: '0.85rem', margin: '12px 0 0' } as const
const rowHint = { display: 'block', color: 'var(--ink-soft)', fontSize: '0.8rem', marginTop: 2 } as const
const right = { textAlign: 'right' } as const

function Amount({ value }: { value: number | null }) {
  return (
    <td className="num" style={right}>
      {value === null ? '' : formatCurrency(value)}
    </td>
  )
}

export function TaxPage() {
  const currentYear = new Date().getFullYear()
  // What gets filed is the quarter that has just ended.
  const [period, setPeriod] = useState<Period>(() => lastCompletedQuarter())
  const [data, setData] = useState<TaxData | null>(null)
  const [firstYear, setFirstYear] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    apiFetch<TaxData>(`/api/tax?${periodQuery(period)}`)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setFirstYear(result.firstYear)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the tax records')
      })
    return () => {
      cancelled = true
    }
  }, [period, attempt])

  const query = periodQuery(period)
  // The default period may be last year (in Q1), which yearOptions always includes.
  const years = yearOptions(currentYear, firstYear)

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Tax records</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a className="btn" href={`/api/tax/invoices.csv?${query}`}>
            Download invoices CSV
          </a>
          <a className="btn" href={`/api/tax/icp.csv?${query}`}>
            Download ICP CSV
          </a>
        </div>
      </div>

      <PeriodPicker period={period} years={years} onChange={setPeriod} />

      {error ? (
        <div>
          <p role="alert" className="error">
            {error}
          </p>
          <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : !data ? (
        <p role="status">Loading tax records…</p>
      ) : (
        <>
          <section className="card" aria-labelledby="btw-heading" style={{ marginBottom: 24 }}>
            <h2 id="btw-heading">BTW return (aangifte omzetbelasting)</h2>
            <p style={{ ...hint, margin: '0 0 12px' }}>
              {data.invoiceCount} {data.invoiceCount === 1 ? 'invoice' : 'invoices'} in this period
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table aria-labelledby="btw-heading">
                <thead>
                  <tr>
                    <th scope="col">Rubriek</th>
                    <th scope="col">Omschrijving</th>
                    <th scope="col" style={right}>
                      Omzet
                    </th>
                    <th scope="col" style={right}>
                      Btw
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1a</td>
                    <td>Leveringen/diensten belast met hoog tarief</td>
                    <Amount value={data.btw.r1a.base} />
                    <Amount value={data.btw.r1a.vat} />
                  </tr>
                  <tr>
                    <td>1b</td>
                    <td>Leveringen/diensten belast met laag tarief</td>
                    <Amount value={data.btw.r1b.base} />
                    <Amount value={data.btw.r1b.vat} />
                  </tr>
                  <tr>
                    <td>1e</td>
                    <td>
                      Leveringen/diensten belast met 0% of niet bij u belast
                      <small style={rowHint}>
                        Only for 0%-rated or VAT-shifted supplies. Exempt (vrijgestelde) turnover is not reported on
                        the return.
                      </small>
                    </td>
                    <Amount value={data.btw.r1e.base} />
                    <Amount value={null} />
                  </tr>
                  <tr>
                    <td>3b</td>
                    <td>Leveringen naar/diensten in landen binnen de EU</td>
                    <Amount value={data.btw.r3b.base} />
                    <Amount value={null} />
                  </tr>
                  <tr>
                    <td />
                    <td style={{ fontWeight: 700 }}>Verschuldigde btw</td>
                    <Amount value={null} />
                    <td className="num" style={{ ...right, fontWeight: 700 }}>
                      {formatCurrency(data.btw.vatDue)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={hint}>
              Amounts are exact. In the return you enter whole euros; you may round turnover and VAT due down to the
              nearest euro.
            </p>
          </section>

          <section className="card" aria-labelledby="icp-heading">
            <h2 id="icp-heading">ICP opgave (intracommunautaire diensten)</h2>
            {data.icp.length === 0 ? (
              <p>No EU reverse-charge invoices in this period.</p>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table aria-labelledby="icp-heading">
                    <thead>
                      <tr>
                        <th scope="col">Country</th>
                        <th scope="col">VAT number</th>
                        <th scope="col">Client</th>
                        <th scope="col" style={right}>
                          Services total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.icp.map((row) => (
                        <tr key={`${row.country}|${row.vatNumber}`}>
                          <td>{row.country}</td>
                          <td className="num">{row.vatNumber}</td>
                          <td>{row.clientName}</td>
                          <Amount value={row.servicesTotal} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={hint}>Report these as services (diensten) in the ICP declaration.</p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
