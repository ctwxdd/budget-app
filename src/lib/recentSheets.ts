export type RecentSheet = { id: string; title: string; lastUsed: number }

const KEY = 'budget.recentSheets'
const MAX = 8

export function getRecentSheets(): RecentSheet[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is RecentSheet => item && typeof item.id === 'string' && typeof item.title === 'string')
  } catch {
    return []
  }
}

export function rememberSheet(id: string, title: string) {
  if (!id) return
  const list = getRecentSheets().filter((entry) => entry.id !== id)
  list.unshift({ id, title: title || id, lastUsed: Date.now() })
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
}

export function forgetSheet(id: string) {
  const next = getRecentSheets().filter((entry) => entry.id !== id)
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function renameSheet(id: string, title: string) {
  const list = getRecentSheets()
  const match = list.find((entry) => entry.id === id)
  if (!match) return
  match.title = title || match.title
  localStorage.setItem(KEY, JSON.stringify(list))
}
