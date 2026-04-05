export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatDate(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

export function buildOutputFileName(
  pattern: string,
  originalName: string,
  startTime: number,
  endTime: number
): string {
  const ext = originalName.lastIndexOf('.') > -1
    ? originalName.slice(originalName.lastIndexOf('.'))
    : '.mp4'
  const baseName = originalName.slice(0, originalName.lastIndexOf('.'))

  const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0')
  const startH = pad2(startTime / 3600)
  const startM = pad2((startTime % 3600) / 60)
  const startS = pad2(startTime % 60)
  const endH = pad2(endTime / 3600)
  const endM = pad2((endTime % 3600) / 60)
  const endS = pad2(endTime % 60)

  return pattern
    .replace('{name}', baseName)
    .replace('{ext}', ext.replace('.', ''))
    .replace('{start}', `${startH}${startM}${startS}`)
    .replace('{end}', `${endH}${endM}${endS}`)
    .replace('{HHmmss}', `${startH}${startM}${startS}`) + ext
}
