import { useId } from 'react'
import type { Period, Quarter } from '../lib/periods'

/** Year and quarter ("Whole year" = no quarter) selects. */
export function PeriodPicker({
  period,
  years,
  onChange,
}: {
  period: Period
  years: number[]
  onChange: (next: Period) => void
}) {
  const yearId = useId()
  const quarterId = useId()
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '20px 0' }}>
      <div>
        <label htmlFor={yearId}>Year</label>
        <select id={yearId} value={period.year} onChange={(e) => onChange({ ...period, year: Number(e.target.value) })}>
          {years.map((y) => (
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
            onChange({ ...period, quarter: e.target.value === '' ? null : (Number(e.target.value) as Quarter) })
          }
        >
          <option value="">Whole year</option>
          {[1, 2, 3, 4].map((q) => (
            <option key={q} value={q}>{`Q${q}`}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
