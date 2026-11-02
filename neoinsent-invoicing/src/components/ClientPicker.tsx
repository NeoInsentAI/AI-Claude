import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiClient'

export interface ClientSummary {
  id: string
  name: string
  country: string
  vat_number: string | null
}

interface Props {
  value: ClientSummary | null
  onChange: (client: ClientSummary) => void
}

const EMPTY_FORM = {
  name: '',
  email: '',
  address_line: '',
  postal_code: '',
  city: '',
  country: '',
  vat_number: '',
  kvk_number: '',
}

type FormState = typeof EMPTY_FORM

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed'
}

export function ClientPicker({ value, onChange }: Props) {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ clients: ClientSummary[] }>('/api/clients')
      .then((data) => {
        if (!cancelled) setClients(data.clients)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(`Could not load clients: ${errorMessage(err)}`)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function update(field: keyof FormState, fieldValue: string) {
    setForm((prev) => ({ ...prev, [field]: fieldValue }))
  }

  function handleSelect(id: string) {
    const client = clients.find((c) => c.id === id)
    if (client) onChange(client)
  }

  async function handleSave() {
    setSaveError(null)
    setSaving(true)
    let created: ClientSummary | null = null
    try {
      const { client } = await apiFetch<{ client: ClientSummary }>('/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          vat_number: form.vat_number || null,
          kvk_number: form.kvk_number || null,
        }),
      })
      created = client
    } catch (err) {
      setSaveError(errorMessage(err))
      return
    } finally {
      setSaving(false)
    }
    if (created) {
      const newClient = created
      setClients((prev) => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)))
      setShowForm(false)
      setForm(EMPTY_FORM)
      onChange(newClient)
    }
  }

  return (
    <div>
      <label htmlFor="client-select">Client</label>
      <select
        id="client-select"
        value={value?.id ?? ''}
        onChange={(e) => handleSelect(e.target.value)}
      >
        <option value="" disabled>
          Select a client…
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {loadError && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {loadError}
        </p>
      )}

      {!showForm && (
        <button type="button" className="btn" onClick={() => setShowForm(true)}>
          + New client
        </button>
      )}

      {showForm && (
        <div className="card">
          <label htmlFor="new-client-name">Name</label>
          <input
            id="new-client-name"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
          <label htmlFor="new-client-email">Email</label>
          <input
            id="new-client-email"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
          <label htmlFor="new-client-address">Address</label>
          <input
            id="new-client-address"
            value={form.address_line}
            onChange={(e) => update('address_line', e.target.value)}
          />
          <label htmlFor="new-client-postal-code">Postal code</label>
          <input
            id="new-client-postal-code"
            value={form.postal_code}
            onChange={(e) => update('postal_code', e.target.value)}
          />
          <label htmlFor="new-client-city">City</label>
          <input
            id="new-client-city"
            value={form.city}
            onChange={(e) => update('city', e.target.value)}
          />
          <label htmlFor="new-client-country">Country</label>
          <input
            id="new-client-country"
            placeholder="NL, DE, FR..."
            value={form.country}
            onChange={(e) => update('country', e.target.value.toUpperCase())}
          />
          <label htmlFor="new-client-vat">VAT number (EU clients)</label>
          <input
            id="new-client-vat"
            value={form.vat_number}
            onChange={(e) => update('vat_number', e.target.value)}
          />
          <label htmlFor="new-client-kvk">KVK number (NL clients)</label>
          <input
            id="new-client-kvk"
            value={form.kvk_number}
            onChange={(e) => update('kvk_number', e.target.value)}
          />
          {saveError && (
            <p role="alert" style={{ color: 'var(--danger)' }}>
              {saveError}
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            Save client
          </button>
        </div>
      )}
    </div>
  )
}
