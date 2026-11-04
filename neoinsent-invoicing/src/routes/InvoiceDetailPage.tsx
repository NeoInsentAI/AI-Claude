import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ApiError, apiFetch } from '../lib/apiClient'
import { clientForInvoice, type ClientDetails } from '../lib/clientForInvoice'
import { formatCurrency, formatDate, formatDateTime } from '../lib/format'
import { computeLine } from '../lib/invoiceMath'

/** The fields of `GET /api/invoices/:id` this page uses. */
interface InvoiceDetail {
  id: string
  invoice_number: string | null
  status: 'draft' | 'final'
  language: 'nl' | 'en'
  vat_treatment: string
  issue_date: string
  due_date: string
  service_period: string | null
  notes: string | null
  subtotal: number
  vat_amount: number
  total: number
  paid: boolean
  sent_at: string | null
  pdf_path: string | null
  /** The live client row; a final invoice shows `client_snapshot` instead (see clientForInvoice). */
  client: ClientDetails | null
  client_snapshot: ClientDetails | null
  items: { id: string; description: string; quantity: number; unit_price: number; vat_rate: number }[]
}

interface EmailPreview {
  to: string
  subject: string
  text: string
}

type EmailPanel =
  | { state: 'closed' }
  | { state: 'loading' }
  | { state: 'not_configured'; message: string }
  | { state: 'error'; message: string }
  // The email went out but the server could not record it: no form, so it can't be sent twice.
  | { state: 'sent_unrecorded'; message: string }
  | { state: 'ready'; to: string }

const SNAPSHOT_MISSING =
  "This invoice's saved client details are missing — the database may be damaged. Restore from a backup."
const FINALIZE_CONFIRM =
  "Finalize this invoice? It gets the next invoice number, today's date (the due date moves with it) and can no longer be changed."

const hint = { color: 'var(--ink-soft)', fontSize: '0.85rem' } as const
const row = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 } as const

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed'
}

/** Amount excl. VAT, rounded per line exactly like the stored totals and the PDF. */
function lineAmount(item: InvoiceDetail['items'][number]): number | null {
  try {
    return computeLine({ quantity: item.quantity, unitPrice: item.unit_price, vatRate: item.vat_rate }).lineSubtotal
  } catch {
    return null
  }
}

function StatusPill({ invoice }: { invoice: InvoiceDetail }) {
  const [label, kind] =
    invoice.status === 'draft' ? ['Draft', 'draft'] : invoice.paid ? ['Paid', 'paid'] : ['Finalized', 'final']
  return (
    <span data-testid="status-pill" className={`pill pill-${kind}`}>
      {label}
    </span>
  )
}

function ClientBlock({ client, snapshotMissing }: { client: ClientDetails | null; snapshotMissing: boolean }) {
  return (
    <section className="card" aria-labelledby="invoice-client-heading">
      <h2 id="invoice-client-heading">Client</h2>
      {snapshotMissing ? (
        <p role="alert" className="error">
          {SNAPSHOT_MISSING}
        </p>
      ) : client ? (
        <>
          <p style={{ color: 'var(--ink)', fontWeight: 600, margin: 0 }}>{client.name}</p>
          {client.contact_person && <p style={{ margin: 0 }}>{client.contact_person}</p>}
          <p style={{ margin: 0 }}>{client.address_line}</p>
          <p style={{ margin: 0 }}>{`${client.postal_code} ${client.city}`}</p>
          <p style={{ margin: 0 }}>{client.country}</p>
          <p style={{ margin: '8px 0 0' }}>{client.email}</p>
          {client.vat_number && <p style={{ margin: 0 }}>{`VAT ${client.vat_number}`}</p>}
          {client.kvk_number && <p style={{ margin: 0 }}>{`KVK ${client.kvk_number}`}</p>}
        </>
      ) : (
        <p className="error">The client details could not be loaded.</p>
      )}
    </section>
  )
}

export function InvoiceDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const routerNotice = (location.state as { notice?: unknown } | null)?.notice
  const apiBase = `/api/invoices/${encodeURIComponent(id)}`

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [confirmingFinalize, setConfirmingFinalize] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfWarning, setPdfWarning] = useState<string | null>(null)

  const [savingPaid, setSavingPaid] = useState(false)
  const [paidError, setPaidError] = useState<string | null>(null)

  const [emailPanel, setEmailPanel] = useState<EmailPanel>({ state: 'closed' })
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  // Set synchronously on the first click so a second click before the re-render can't send again.
  const finalizeInFlight = useRef(false)
  const paidInFlight = useRef(false)
  const sendInFlight = useRef(false)
  // Identifies the latest email-panel load, so a cancelled or superseded load can't open the form.
  const emailLoad = useRef(0)
  const finalizeButton = useRef<HTMLButtonElement>(null)
  const confirmFinalizeButton = useRef<HTMLButtonElement>(null)
  // Set when Cancel closes the confirmation, so focus goes back to the Finalize button.
  const refocusFinalize = useRef(false)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ invoice: InvoiceDetail }>(apiBase)
      .then(({ invoice: loaded }) => {
        if (cancelled) return
        setInvoice(loaded)
        setLoadState('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setLoadState('not_found')
          return
        }
        setLoadError(`Could not load the invoice: ${errorMessage(err)}`)
        setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [apiBase])

  useEffect(() => {
    if (confirmingFinalize) {
      confirmFinalizeButton.current?.focus()
    } else if (refocusFinalize.current) {
      refocusFinalize.current = false
      finalizeButton.current?.focus()
    }
  }, [confirmingFinalize])

  function cancelFinalize() {
    refocusFinalize.current = true
    setConfirmingFinalize(false)
  }

  /** Re-reads the invoice (e.g. after a send whose result the server could not record). */
  async function refreshInvoice() {
    try {
      const { invoice: loaded } = await apiFetch<{ invoice: InvoiceDetail }>(apiBase)
      setInvoice(loaded)
    } catch {
      // Keep showing what we have; the alert already explains what happened.
    }
  }

  async function handleFinalize() {
    if (finalizeInFlight.current) return
    finalizeInFlight.current = true
    setFinalizing(true)
    setFinalizeError(null)
    try {
      const res = await apiFetch<{ invoice: InvoiceDetail; pdfError?: string; pdfWarning?: string }>(
        `${apiBase}/finalize`,
        { method: 'POST' },
      )
      setInvoice(res.invoice)
      setPdfError(res.pdfError ?? null)
      setPdfWarning(res.pdfWarning ?? null)
    } catch (err) {
      setFinalizeError(errorMessage(err))
    } finally {
      finalizeInFlight.current = false
      setFinalizing(false)
      setConfirmingFinalize(false)
    }
  }

  async function handleTogglePaid() {
    if (!invoice || paidInFlight.current) return
    paidInFlight.current = true
    setSavingPaid(true)
    setPaidError(null)
    try {
      const res = await apiFetch<{ invoice: InvoiceDetail }>(`${apiBase}/paid`, {
        method: 'POST',
        body: JSON.stringify({ paid: !invoice.paid }),
      })
      setInvoice(res.invoice)
    } catch (err) {
      setPaidError(errorMessage(err))
    } finally {
      paidInFlight.current = false
      setSavingPaid(false)
    }
  }

  function closeEmailPanel() {
    emailLoad.current += 1
    setEmailPanel({ state: 'closed' })
    setSendError(null)
  }

  async function openEmailPanel() {
    const load = ++emailLoad.current
    setEmailPanel({ state: 'loading' })
    setSendError(null)
    setSentTo(null)
    try {
      const status = await apiFetch<{ configured: boolean; message?: string }>('/api/email/status')
      if (load !== emailLoad.current) return
      if (!status.configured) {
        setEmailPanel({ state: 'not_configured', message: status.message ?? 'Email is not set up yet.' })
        return
      }
      const preview = await apiFetch<EmailPreview>(`${apiBase}/email-preview`)
      if (load !== emailLoad.current) return
      setSubject(preview.subject)
      setText(preview.text)
      setEmailPanel({ state: 'ready', to: preview.to })
    } catch (err) {
      if (load !== emailLoad.current) return
      setEmailPanel({ state: 'error', message: errorMessage(err) })
    }
  }

  async function handleSend() {
    if (sendInFlight.current) return
    sendInFlight.current = true
    setSending(true)
    setSendError(null)
    try {
      const res = await apiFetch<{ invoice: InvoiceDetail; sentTo: string }>(`${apiBase}/send`, {
        method: 'POST',
        body: JSON.stringify({ subject, text }),
      })
      setInvoice(res.invoice)
      setSentTo(res.sentTo)
      closeEmailPanel()
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { emailSent?: unknown } | null) : null
      if (body?.emailSent === true) {
        // The email did go out: drop the form so it can't be sent again, and say so.
        emailLoad.current += 1
        setEmailPanel({ state: 'sent_unrecorded', message: errorMessage(err) })
        void refreshInvoice()
      } else {
        setSendError(errorMessage(err))
      }
    } finally {
      sendInFlight.current = false
      setSending(false)
    }
  }

  const noticeBox =
    typeof routerNotice === 'string' && routerNotice !== '' ? (
      <p role="status" className="card">
        {routerNotice}
      </p>
    ) : null

  if (loadState === 'loading') {
    return (
      <div>
        <h1>Invoice</h1>
        <p role="status">Loading invoice…</p>
      </div>
    )
  }

  if (loadState === 'not_found') {
    return (
      <div>
        <h1>Invoice not found</h1>
        <p>
          <Link to="/">Back to start</Link>
        </p>
      </div>
    )
  }

  if (loadState === 'error' || !invoice) {
    return (
      <div>
        <h1>Invoice</h1>
        <p role="alert" className="error">
          {loadError}
        </p>
        <p>
          <Link to="/">Back to start</Link>
        </p>
      </div>
    )
  }

  const isFinal = invoice.status === 'final'
  // Never fall back to the live client for a final invoice: it would show details that weren't invoiced.
  const snapshotMissing = isFinal && !invoice.client_snapshot
  const client = snapshotMissing ? null : clientForInvoice(invoice)

  return (
    <div>
      <div style={{ ...row, marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>{invoice.invoice_number ?? 'Draft'}</h1>
        <StatusPill invoice={invoice} />
      </div>
      {invoice.sent_at && <p style={hint}>{`Sent ${formatDateTime(invoice.sent_at)}`}</p>}

      {noticeBox}

      {/* Actions */}
      <div style={{ ...row, margin: '16px 0' }}>
        {!isFinal && !confirmingFinalize && (
          <>
            <Link className="btn" to={`/invoices/${encodeURIComponent(invoice.id)}/edit`}>
              Edit
            </Link>
            <button
              ref={finalizeButton}
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setFinalizeError(null)
                setConfirmingFinalize(true)
              }}
            >
              Finalize
            </button>
          </>
        )}
        {isFinal && (
          <>
            <a className="btn" href={`${apiBase}/pdf`} target="_blank" rel="noopener">
              Open PDF
            </a>
            <a className="btn" href={`${apiBase}/pdf?download=1`}>
              Download PDF
            </a>
            <button type="button" className="btn" disabled={savingPaid} onClick={handleTogglePaid}>
              {invoice.paid ? 'Mark as unpaid' : 'Mark as paid'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={sending}
              aria-expanded={emailPanel.state !== 'closed'}
              onClick={() => (emailPanel.state === 'closed' ? openEmailPanel() : closeEmailPanel())}
            >
              Email to client
            </button>
          </>
        )}
      </div>

      {!isFinal && confirmingFinalize && (
        <div role="group" aria-label="Confirm finalize" className="card" style={{ marginBottom: 16 }}>
          <p style={{ color: 'var(--ink)' }}>{FINALIZE_CONFIRM}</p>
          <div style={row}>
            <button
              ref={confirmFinalizeButton}
              type="button"
              className="btn btn-primary"
              disabled={finalizing}
              onClick={handleFinalize}
            >
              {finalizing ? 'Finalizing…' : 'Finalize'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={finalizing}
              onClick={cancelFinalize}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {finalizeError && (
        <p role="alert" className="error">
          {finalizeError}
        </p>
      )}
      {pdfError && (
        <p role="alert" className="error card">
          {pdfError}
        </p>
      )}
      {pdfWarning && (
        <p role="status" className="card">
          {pdfWarning}
        </p>
      )}
      {paidError && (
        <p role="alert" className="error">
          {paidError}
        </p>
      )}
      {sentTo && (
        <p role="status" className="card" style={{ color: 'var(--success)' }}>
          {`Sent to ${sentTo}`}
        </p>
      )}

      {emailPanel.state !== 'closed' && (
        <section className="card" aria-labelledby="email-panel-heading" style={{ marginBottom: 16 }}>
          <h2 id="email-panel-heading">Email to client</h2>
          {emailPanel.state === 'loading' && <p role="status">Loading…</p>}
          {emailPanel.state === 'not_configured' && <p>{emailPanel.message}</p>}
          {(emailPanel.state === 'error' || emailPanel.state === 'sent_unrecorded') && (
            <p role="alert" className="error">
              {emailPanel.message}
            </p>
          )}
          {emailPanel.state === 'ready' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label htmlFor="email-to">To</label>
                <input id="email-to" type="email" readOnly value={emailPanel.to} style={{ width: '100%' }} />
              </div>
              <div>
                <label htmlFor="email-subject">Subject</label>
                <input
                  id="email-subject"
                  type="text"
                  maxLength={200}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label htmlFor="email-text">Message</label>
                <textarea
                  id="email-text"
                  rows={10}
                  maxLength={5000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <p style={{ ...hint, margin: 0 }}>The invoice PDF is attached.</p>
              {sendError && (
                <p role="alert" className="error" style={{ margin: 0 }}>
                  {sendError}
                </p>
              )}
            </div>
          )}
          <div style={{ ...row, marginTop: 12 }}>
            {emailPanel.state === 'ready' && (
              <button type="button" className="btn btn-primary" disabled={sending} onClick={handleSend}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            )}
            <button type="button" className="btn" disabled={sending} onClick={closeEmailPanel}>
              {emailPanel.state === 'ready' || emailPanel.state === 'loading' ? 'Cancel' : 'Close'}
            </button>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <ClientBlock client={client} snapshotMissing={snapshotMissing} />
        <section className="card" aria-labelledby="invoice-dates-heading">
          <h2 id="invoice-dates-heading">Dates</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', margin: 0 }}>
            <dt style={hint}>Issue date</dt>
            <dd style={{ margin: 0 }}>{formatDate(invoice.issue_date)}</dd>
            <dt style={hint}>Due date</dt>
            <dd style={{ margin: 0 }}>{formatDate(invoice.due_date)}</dd>
            {invoice.service_period && (
              <>
                <dt style={hint}>Service period</dt>
                <dd style={{ margin: 0 }}>{invoice.service_period}</dd>
              </>
            )}
          </dl>
          {!isFinal && (
            <p style={{ ...hint, margin: '8px 0 0' }}>The issue date becomes the day you finalize.</p>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="invoice-lines-heading" style={{ marginTop: 16 }}>
        <h2 id="invoice-lines-heading">Lines</h2>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Qty</th>
              <th className="num">Unit price excl. VAT</th>
              <th className="num">VAT %</th>
              <th className="num">Amount excl. VAT</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => {
              const amount = lineAmount(item)
              return (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td className="num">{item.quantity.toLocaleString('nl-NL')}</td>
                  <td className="num">{formatCurrency(item.unit_price)}</td>
                  <td className="num">{`${item.vat_rate}%`}</td>
                  <td className="num">{amount === null ? '—' : formatCurrency(amount)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <dl
          className="num"
          style={{ display: 'grid', gridTemplateColumns: 'auto auto', justifyContent: 'end', gap: '4px 24px', marginTop: 16 }}
        >
          <dt style={hint}>Subtotal</dt>
          <dd data-testid="subtotal" style={{ margin: 0, textAlign: 'right' }}>
            {formatCurrency(invoice.subtotal)}
          </dd>
          <dt style={hint}>{invoice.vat_treatment === 'eu_reverse_charge' ? 'VAT (reverse charged)' : 'VAT'}</dt>
          <dd data-testid="vat-amount" style={{ margin: 0, textAlign: 'right' }}>
            {formatCurrency(invoice.vat_amount)}
          </dd>
          <dt style={{ fontWeight: 700 }}>Total</dt>
          <dd data-testid="total" style={{ margin: 0, textAlign: 'right', fontWeight: 700 }}>
            {formatCurrency(invoice.total)}
          </dd>
        </dl>
      </section>

      {invoice.notes && (
        <section className="card" aria-labelledby="invoice-notes-heading" style={{ marginTop: 16 }}>
          <h2 id="invoice-notes-heading">Notes</h2>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{invoice.notes}</p>
        </section>
      )}
    </div>
  )
}
