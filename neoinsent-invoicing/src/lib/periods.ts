export type Quarter = 1 | 2 | 3 | 4

/** A reporting period: a quarter of a year, or the whole year when `quarter` is null. */
export interface Period {
  year: number
  quarter: Quarter | null
}

/** At least this many years (the current one included) are always offered. */
export const MIN_YEARS_SHOWN = 5

/** Current year back to the first year with an invoice, and at least the last five years. */
export function yearOptions(currentYear: number, firstYear: number | null): number[] {
  const oldest = Math.min(firstYear ?? currentYear, currentYear - (MIN_YEARS_SHOWN - 1))
  return Array.from({ length: currentYear - oldest + 1 }, (_, i) => currentYear - i)
}

/** The most recent quarter that has fully ended on `now`'s local date (the one to file). */
export function lastCompletedQuarter(now: Date = new Date()): { year: number; quarter: Quarter } {
  const current = Math.floor(now.getMonth() / 3) + 1
  return current === 1
    ? { year: now.getFullYear() - 1, quarter: 4 }
    : { year: now.getFullYear(), quarter: (current - 1) as Quarter }
}
