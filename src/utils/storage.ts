const KEYS = {
  folderPath:   'zideo:folderPath',
  sortKey:      'zideo:sortKey',
  sortOrder:    'zideo:sortOrder',
  exportConfig: 'zideo:exportConfig',
} as const

export function loadState<T>(key: keyof typeof KEYS, fallback: T): T {
  try {
    const raw = localStorage.getItem(KEYS[key])
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function saveState(key: keyof typeof KEYS, value: unknown): void {
  try {
    localStorage.setItem(KEYS[key], JSON.stringify(value))
  } catch {
    // storage quota exceeded or unavailable — fail silently
  }
}
