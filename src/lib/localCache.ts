type CacheEntry<T> = { savedAt: number; data: T }

const prefix = 'chamomile.cache.'

export function readLocalCache<T>(key: string, maxAgeMs: number): { data: T; savedAt: number } | undefined {
  try {
    const raw = localStorage.getItem(prefix + key)
    if (!raw) return undefined
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (!entry.savedAt || Date.now() - entry.savedAt > maxAgeMs) {
      localStorage.removeItem(prefix + key)
      return undefined
    }
    return entry
  } catch {
    return undefined
  }
}

export function writeLocalCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify({ savedAt: Date.now(), data } satisfies CacheEntry<T>))
  } catch {
    // Storage can be unavailable or full; the in-memory query cache still works.
  }
}

export function clearLocalCache(...keys: string[]) {
  keys.forEach((key) => localStorage.removeItem(prefix + key))
}
