export const PUBLISHED_HISTORY_KEY = 'soundtrace-published-history-v1'

function parseEntries(raw) {
  let value
  try { value = JSON.parse(raw || '[]') } catch { return [] }
  if (!Array.isArray(value)) return []
  const ids = new Set()
  return value.filter((entry) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) return false
    ids.add(entry.id)
    return true
  }).map((entry) => ({
    id: entry.id,
    title: typeof entry.title === 'string' ? entry.title : '未命名记录',
    mediaType: ['audio', 'video', 'image'].includes(entry.mediaType) ? entry.mediaType : 'audio',
    publishedAt: Number.isFinite(entry.publishedAt) ? entry.publishedAt : 0,
  }))
}

// History belongs to the current browser profile. Media stays on the server.
export function createPublishedHistory(getStorage) {
  let entries = []
  let memoryOnly = false

  function read() {
    if (!memoryOnly) {
      try { entries = parseEntries(getStorage().getItem(PUBLISHED_HISTORY_KEY)) } catch { memoryOnly = true }
    }
    return entries.map((entry) => ({ ...entry }))
  }

  function write(next) {
    entries = next
    if (!memoryOnly) {
      try { getStorage().setItem(PUBLISHED_HISTORY_KEY, JSON.stringify(entries)) } catch { memoryOnly = true }
    }
    return { persisted: !memoryOnly }
  }

  function add(trace) {
    if (!trace || typeof trace.id !== 'string' || !trace.id) throw new TypeError('记录缺少 ID')
    const current = read()
    const previous = current.find((item) => item.id === trace.id)
    const publishedAt = previous?.publishedAt || (Number.isFinite(trace.createdAt) ? trace.createdAt : Date.now())
    const item = {
      id: trace.id,
      title: String(trace.title || '未命名记录'),
      mediaType: ['audio', 'video', 'image'].includes(trace.mediaType) ? trace.mediaType : 'audio',
      publishedAt,
    }
    const next = [item, ...current.filter((entry) => entry.id !== item.id)]
      .sort((a, b) => b.publishedAt - a.publishedAt)
    return write(next)
  }

  function remove(id) {
    return write(read().filter((entry) => entry.id !== id))
  }

  return { read, add, remove, isPersistent: () => !memoryOnly }
}
