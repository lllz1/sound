const normalize = text => String(text).replace(/[\s()（）,，·\-]/g, '')

export async function searchPlaceNames(query, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(12000) })
    if (response.ok) {
      const items = await response.json()
      if (Array.isArray(items) && items.length) return items
    }
  } catch { /* try the browser-accessible open map service */ }

  const url = `https://api.mirror-earth.com/nominatim/search?format=json&limit=5&accept-language=zh-CN&q=${encodeURIComponent(query)}`
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('地点搜索暂时不可用')
  const data = await response.json()
  if (!Array.isArray(data)) throw new Error('地点搜索返回异常')
  return data
    .filter(item => normalize(item.display_name).includes(normalize(query)) && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
    .map(item => ({ name: String(item.display_name).split(',')[0], display_name: item.display_name, lat: Number(item.lat), lon: Number(item.lon) }))
}
