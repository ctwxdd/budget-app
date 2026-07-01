export function dateToIsoDate(date: Date) {
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayIso() {
  return dateToIsoDate(new Date())
}

export function localDateFromIso(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

export function normalizeDateCell(value: unknown) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return dateToIsoDate(value)
  const text = String(value).trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : dateToIsoDate(parsed)
}

export function addMonthsIso(iso: string, months: number) {
  if (!iso || !months) return ''
  const source = localDateFromIso(iso)
  if (!source) return ''
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(source.getDate(), lastDay))
  return dateToIsoDate(target)
}

export function daysBetweenIso(start: string, end: string) {
  const a = localDateFromIso(start)
  const b = localDateFromIso(end)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
