import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiClient'

export interface ClientSummary {
  id: string
  name: string
  email: string
  address_line: string
  postal_code: string
  city: string
  country: string
  vat_number: string | null
  kvk_number: string | null
  contact_person: string | null
}

interface Props {
  value: ClientSummary | null
  onChange: (client: ClientSummary) => void
}

// Every editable client field. The PATCH replaces all of them, so the form must
// carry each one; adding a field to ClientSummary fails the build until it does.
type ClientField = keyof Omit<ClientSummary, 'id'>

type FormState = Record<ClientField, string>

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  address_line: '',
  postal_code: '',
  city: '',
  country: '',
  vat_number: '',
  kvk_number: '',
  // No input for this yet; kept in state so editing a client does not wipe it.
  contact_person: '',
}

// 'create' adds a new client; a client id means that client is being edited.
type FormMode = 'create' | { editingId: string }

function formFromClient(client: ClientSummary): FormState {
  return {
    name: client.name,
    email: client.email,
    address_line: client.address_line,
    postal_code: client.postal_code,
    city: client.city,
    country: client.country,
    vat_number: client.vat_number ?? '',
    kvk_number: client.kvk_number ?? '',
    contact_person: client.contact_person ?? '',
  }
}

function sortByName(clients: ClientSummary[]): ClientSummary[] {
  return [...clients].sort((a, b) => a.name.localeCompare(b.name))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed'
}

export function ClientPicker({ value, onChange }: Props) {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<FormMode | null>(null)
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

  function update(field: ClientField, fieldValue: string) {
    setForm((prev) => ({ ...prev, [field]: fieldValue }))
  }

  function handleSelect(id: string) {
    const client = clients.find((c) => c.id === id)
    if (!client) return
    // An open edit form belongs to the previously selected client; saving it
    // later would switch the selection back, so close it.
    if (formMode !== null && formMode !== 'create') closeForm()
    onChange(client)
  }

  function openCreateForm() {
    setForm(EMPTY_FORM)
    setSaveError(null)
    setFormMode('create')
  }

  function openEditForm(client: ClientSummary) {
    setForm(formFromClient(client))
    setSaveError(null)
    setFormMode({ editingId: client.id })
  }

  function closeForm() {
    setFormMode(null)
    setForm(EMPTY_FORM)
    setSaveError(null)
  }

  function payloadFromForm() {
    return JSON.stringify({
      ...form,
      vat_number: form.vat_number || null,
      kvk_number: form.kvk_number || null,
      contact_person: form.contact_person || null,
    })
  }

  async function handleSave() {
    if (formMode === null) return
    setSaveError(null)
    setSaving(true)
    let saved: ClientSummary | null = null
    try {
      const { client } =
        formMode === 'create'
          ? await apiFetch<{ client: ClientSummary }>('/api/clients', {
              method: 'POST',
              body: payloadFromForm(),
            })
          : await apiFetch<{ client: ClientSummary }>(
              `/api/clients/${encodeURIComponent(formMode.editingId)}`,
              { method: 'PATCH', body: payloadFromForm() },
            )
      saved = client
    } catch (err) {
      setSaveError(errorMessage(err))
      return
    } finally {
      setSaving(false)
    }
    if (saved) {
      const savedClient = saved
      setClients((prev) =>
        sortByName([...prev.filter((c) => c.id !== savedClient.id), savedClient]),
      )
      setFormMode(null)
      setForm(EMPTY_FORM)
      onChange(savedClient)
    }
  }

  const isEditing = formMode !== null && formMode !== 'create'

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

      {formMode === null && (
        <button type="button" className="btn" onClick={openCreateForm}>
          + New client
        </button>
      )}
      {value && formMode === null && (
        <button
          type="button"
          className="btn"
          onClick={() => openEditForm(clients.find((c) => c.id === value.id) ?? value)}
        >
          Edit client
        </button>
      )}

      {formMode !== null && (
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
            {isEditing ? 'Save changes' : 'Save client'}
          </button>
          <button type="button" className="btn" onClick={closeForm} disabled={saving}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
