const nlEuroFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })

export function formatCurrency(amount: number): string {
  return nlEuroFormatter.format(amount)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** An ISO calendar date ('2026-11-04') as printed on invoices: '04-11-2026'. */
export function formatDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : isoDate
}

/** A timestamp (ISO string) in local time: '05-11-2026 09:07'. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
