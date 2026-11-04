import type { Request } from 'express'

export const MIN_YEAR = 2000
export const MAX_YEAR = 2100

export type Quarter = 1 | 2 | 3 | 4

/** `?year=YYYY[&quarter=1-4]` as given; both undefined when neither was sent. */
export interface PeriodQuery {
  year?: number
  quarter?: Quarter
}

export type PeriodQueryResult = { ok: true; value: PeriodQuery } | { ok: false; error: string }

/** Validates `year` (4 digits, 2000–2100) and `quarter` (1–4, only together with a year). */
export function parsePeriodQuery(query: Request['query'] | undefined): PeriodQueryResult {
  const { year, quarter } = query ?? {}
  if (year === undefined) {
    if (quarter !== undefined) return { ok: false, error: 'A quarter filter needs a year' }
    return { ok: true, value: {} }
  }
  if (typeof year !== 'string' || !/^\d{4}$/.test(year)) {
    return { ok: false, error: 'Year must be a 4-digit number' }
  }
  const yearNumber = Number(year)
  if (yearNumber < MIN_YEAR || yearNumber > MAX_YEAR) {
    return { ok: false, error: `Year must be between ${MIN_YEAR} and ${MAX_YEAR}` }
  }
  if (quarter === undefined) return { ok: true, value: { year: yearNumber } }
  if (typeof quarter !== 'string' || !/^[1-4]$/.test(quarter)) {
    return { ok: false, error: 'Quarter must be 1, 2, 3 or 4' }
  }
  return { ok: true, value: { year: yearNumber, quarter: Number(quarter) as Quarter } }
}
