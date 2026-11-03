export function quarterDateRange(
  year: number,
  quarter?: 1 | 2 | 3 | 4,
): { fromDate: string; toDate: string } {
  if (!quarter) {
    return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` }
  }
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const lastDay = new Date(year, endMonth, 0).getDate()
  return {
    fromDate: `${year}-${pad(startMonth)}-01`,
    toDate: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
