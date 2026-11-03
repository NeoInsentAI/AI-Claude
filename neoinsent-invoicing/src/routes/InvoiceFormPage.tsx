import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ClientPicker, type ClientSummary } from '../components/ClientPicker'
import { InvoiceLineItems, type LineItemRow } from '../components/InvoiceLineItems'
import { ApiError, apiFetch } from '../lib/apiClient'
import {
  addDaysIso,
  canSave,
  itemsForApi,
  normalizeRatesForTreatment,
  rowsFromInvoiceItems,
  todayLocalIso,
  type ApiInvoiceItem,
} from '../lib/invoiceForm'
import { determineVatTreatment, type VatTreatment } from '../lib/vat'

type Language = 'nl' | 'en'

/** The fields of `GET /api/invoices/:id` this page uses. */
interface LoadedInvoice {
  id: string
  status: 'draft' | 'final'
  language: Language
  vat_treatment: VatTreatment
  issue_date: string
  due_date: string
  notes: string | null
  /** The live client row. */
  client: ClientSummary | null
  items: ApiInvoiceItem[]
}

const TREATMENT_CHANGED_NOTICE =
  "This client's VAT details changed since the draft was created — VAT lines were updated."

function treatmentOf(client: ClientSummary | null): VatTreatment | null {
  return client ? determineVatTreatment(client.country, client.vat_number).treatment : null
}

/** Only these treatments set line rates; the blocked states leave the lines as they were. */
function isRateTreatment(t: VatTreatment | null): boolean {
  return t === 'nl_standard' || t === 'eu_reverse_charge'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed'
}

interface Props {
  mode: 'new' | 'edit'
}

export function InvoiceFormPage({ mode }: Props) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(mode === 'edit')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [client, setClient] = useState<ClientSummary | null>(null)
  const [issueDate, setIssueDate] = useState(() => todayLocalIso())
  const [dueDate, setDueDate] = useState(() => addDaysIso(todayLocalIso(), 14))
  const [language, setLanguage] = useState<Language | null>(null)
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<LineItemRow[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The last treatment that set the line rates. Passing through a blocked client (which leaves the
  // rates alone) must not hide a reverse-charge → NL switch from normalizeRatesForTreatment.
  const rateTreatment = useRef<VatTreatment | null>(null)

  useEffect(() => {
    if (mode !== 'edit' || !id) return
    let cancelled = false
    apiFetch<{ invoice: LoadedInvoice }>(`/api/invoices/${encodeURIComponent(id)}`)
      .then(({ invoice }) => {
        if (cancelled) return
        if (invoice.status === 'final') {
          navigate(`/invoices/${encodeURIComponent(invoice.id)}`, { replace: true })
          return
        }
        // The draft's treatment was fixed when it was saved; the client may have been edited since.
        const live = treatmentOf(invoice.client)
        const loadedRows = rowsFromInvoiceItems(invoice.items)
        setRows(normalizeRatesForTreatment(loadedRows, live, invoice.vat_treatment))
        if (invoice.client && live !== invoice.vat_treatment) setNotice(TREATMENT_CHANGED_NOTICE)
        rateTreatment.current = isRateTreatment(live) ? live : invoice.vat_treatment
        setClient(invoice.client)
        setIssueDate(invoice.issue_date)
        setDueDate(invoice.due_date)
        setLanguage(invoice.language)
        setNotes(invoice.notes ?? '')
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(`Could not load the invoice: ${errorMessage(err)}`)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, id, navigate])

  const treatment = treatmentOf(client)
  const effectiveLanguage: Language = language ?? (client?.country.trim().toUpperCase() === 'NL' ? 'nl' : 'en')
  const check = canSave({ client, treatment, rows, issueDate, dueDate })
  const vatLocked = treatment === 'eu_reverse_charge'

  function handleClientChange(next: ClientSummary) {
    const nextTreatment = treatmentOf(next)
    // Read the ref now: the state updater runs later, after the ref has moved on.
    const previous = rateTreatment.current
    setRows((prev) => normalizeRatesForTreatment(prev, nextTreatment, previous))
    if (isRateTreatment(nextTreatment)) rateTreatment.current = nextTreatment
    setClient(next)
    setNotice(null)
  }

  async function handleSave() {
    if (!check.ok || !client || saving) return
    setSaving(true)
    setSaveError(null)
    const body = JSON.stringify({
      client_id: client.id,
      language: effectiveLanguage,
      vat_treatment: treatment,
      issue_date: issueDate,
      due_date: dueDate,
      notes: notes.trim() === '' ? null : notes,
      items: itemsForApi(rows),
    })
    try {
      const { invoice } =
        mode === 'edit' && id
          ? await apiFetch<{ invoice: { id: string } }>(`/api/invoices/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body,
            })
          : await apiFetch<{ invoice: { id: string } }>('/api/invoices', { method: 'POST', body })
      navigate(`/invoices/${encodeURIComponent(invoice.id)}`)
    } catch (err) {
      setSaving(false)
      if (mode === 'edit' && id && err instanceof ApiError && err.status === 409) {
        // Finalized in the meantime: it can no longer be edited, so show it instead.
        navigate(`/invoices/${encodeURIComponent(id)}`, { replace: true })
        return
      }
      setSaveError(errorMessage(err))
    }
  }

  const title = mode === 'edit' ? 'Edit draft invoice' : 'New invoice'

  if (loading) {
    return (
      <div>
        <h1>{title}</h1>
        <p>Loading invoice…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div>
        <h1>{title}</h1>
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {loadError}
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1>{title}</h1>

      {notice && (
        <p role="status" className="card">
          {notice}
        </p>
      )}

      <ClientPicker value={client} onChange={handleClientChange} />

      {treatment === 'blocked_missing_vat_number' && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          This client is in the EU but has no valid VAT number on file, so a reverse-charge invoice can&apos;t be
          issued. Edit the client to add it.
        </p>
      )}
      {treatment === 'not_supported' && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          This client&apos;s country isn&apos;t supported (NL and EU business clients only).
        </p>
      )}

      <div className="card">
        <label htmlFor="issue-date">Issue date</label>
        <input id="issue-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />

        <label htmlFor="due-date">Due date</label>
        <input id="due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

        <label htmlFor="invoice-language">Language</label>
        <select
          id="invoice-language"
          value={effectiveLanguage}
          onChange={(e) => setLanguage(e.target.value as Language)}
        >
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
        </select>

        <label htmlFor="invoice-notes">Notes</label>
        <textarea id="invoice-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <InvoiceLineItems
        items={rows}
        onChange={setRows}
        defaultVatRate={vatLocked ? 0 : 21}
        vatLocked={vatLocked}
      />

      {saveError && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {saveError}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!check.ok || saving}
          aria-describedby={check.ok ? undefined : 'save-blocked-reason'}
          onClick={handleSave}
        >
          Save draft
        </button>
        {!check.ok && (
          <span id="save-blocked-reason" style={{ color: 'var(--ink-soft)' }}>
            {check.reason}
          </span>
        )}
        {saving && <span>Saving…</span>}
      </div>
    </div>
  )
}
