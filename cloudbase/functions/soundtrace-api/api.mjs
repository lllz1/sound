import { randomUUID } from 'node:crypto'

export const CHUNK_SIZE = 4 * 1024 * 1024
export const MAX_MEDIA_SIZE = 25 * 1024 * 1024
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (message, status = 400) => json({ error: message }, status)
const traceKey = (id) => `traces/${id}.json`
const mediaKey = (id, index) => `media/${id}/${index}`
const validId = (id) => /^(?:seed-[a-z]+|rec-[0-9a-f-]{36})$/i.test(id)

function makePeaks(seed, count = 48) {
  function hash(value) { let h = 2166136261; for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return Math.abs(h) }
  return Array.from({ length: count }, (_, i) => 0.16 + (hash(seed + i) % 83) / 100)
}

const seeds = [
  { id: 'seed-bell', kind: 'bell', title: '外滩的钟声', meta: '江风 · 傍晚 · 4 秒', lat: 31.2402, lng: 121.4902, duration: 4 },
  { id: 'seed-street', kind: 'street', title: '弄堂里的午后', meta: '街声 · 3 秒', lat: 31.2252, lng: 121.4662, duration: 3 },
  { id: 'seed-metro', kind: 'metro', title: '地铁进站', meta: '城市交通 · 3 秒', lat: 31.2336, lng: 121.4757, duration: 3 },
  { id: 'seed-wind', kind: 'wind', title: '梧桐树下的风', meta: '树影 · 4 秒', lat: 31.2146, lng: 121.4552, duration: 4 },
  { id: 'seed-store', kind: 'store', title: '夜班便利店', meta: '灯光 · 3 秒', lat: 31.2381, lng: 121.4801, duration: 3 },
].map(item => ({ ...item, type: 'seed', kindLabel: 'SEED SOUND', peaks: makePeaks(item.id), createdAt: 0 }))

async function getTrace(store, id) {
  if (!validId(id)) return null
  const item = await store.get(traceKey(id), { type: 'json', consistency: 'strong' })
  if (item?.deleted) return null
  return item || structuredClone(seeds.find(seed => seed.id === id) || null)
}

async function listTraces(store) {
  const listing = await store.list({ prefix: 'traces/', consistency: 'strong' })
  const items = await Promise.all(listing.blobs.map(({ key }) => store.get(key, { type: 'json', consistency: 'strong' })))
  const byId = new Map(seeds.map(item => [item.id, item]))
  for (const item of items) {
    if (!item || !validId(item.id)) continue
    if (item.deleted) byId.delete(item.id)
    else byId.set(item.id, item)
  }
  return [...byId.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

async function readJson(request) {
  try { const data = await request.json(); return data && typeof data === 'object' && !Array.isArray(data) ? data : null } catch { return null }
}

async function geocode(query, fetchImpl) {
  if (query.length < 2) return fail('请输入至少两个字')
  const clean = value => String(value).replace(/[\s()（）,，·\-]/g, '')
  if (clean(query).includes('南华大学雨母') || clean(query) === '雨母校区') {
    return json([{ name: '南华大学（雨母校区）', display_name: '南华大学（雨母校区），湖南省衡阳市（校园参考位置）', lat: 26.8834284, lon: 112.5111841 }])
  }
  let mirrorReturnedEmpty = false
  try {
    const mirror = `https://api.mirror-earth.com/nominatim/search?format=json&limit=5&accept-language=zh-CN&q=${encodeURIComponent(query)}`
    const response = await fetchImpl(mirror, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) })
    if (!response.ok) throw new Error('mirror unavailable')
    const items = await response.json()
    if (!Array.isArray(items)) throw new Error('invalid mirror response')
    const matches = items.filter(item => clean(item.display_name).includes(clean(query)) && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
    if (matches.length) return json(matches.map(item => ({ name: String(item.display_name).split(',')[0], display_name: item.display_name, lat: Number(item.lat), lon: Number(item.lon) })))
    mirrorReturnedEmpty = true
  } catch { /* use the other open-data sources */ }
  try {
    const u = `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=zh-CN&q=${encodeURIComponent(query)}`
    const response = await fetchImpl(u, { headers: { 'User-Agent': 'SoundTrace/1.0 (prototype)', Accept: 'application/json' }, signal: AbortSignal.timeout(9000) })
    if (!response.ok) throw new Error('geocoder unavailable')
    const items = await response.json()
    return json(items.map(item => ({ name: String(item.display_name || '').split(',')[0] || query, display_name: item.display_name, lat: Number(item.lat), lon: Number(item.lon) })))
  } catch {
    try {
      const response = await fetchImpl(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=zh`, { signal: AbortSignal.timeout(9000) })
      if (!response.ok) throw new Error('geocoder unavailable')
      const data = await response.json()
      return json((data.features || []).map(feature => ({ name: feature.properties.name || query, display_name: [feature.properties.name, feature.properties.city, feature.properties.county, feature.properties.state, feature.properties.country].filter(Boolean).join(', '), lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0] })))
    } catch {
      try {
        // The original published service can still query the open map data when
        // the domestic function cannot reach the geocoders directly.
        const response = await fetchImpl(`https://soundtrace-lzz.twiggykoala5.chatgpt.site/api/geocode?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(9000) })
        if (!response.ok) throw new Error('fallback unavailable')
        const items = await response.json()
        if (!Array.isArray(items)) throw new Error('invalid fallback response')
        return json(items.filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))).slice(0, 5))
      } catch { return mirrorReturnedEmpty ? json([]) : fail('地点搜索暂时不可用', 502) }
    }
  }
}

export function createApi({ store, fetchImpl = fetch, uuid = randomUUID }) {
  return async function handle(request) {
    const url = new URL(request.url), path = url.pathname, method = request.method
    try {
      if (path === '/api/health' && method === 'GET') return json({ ok: true, storage: true })
      if (path === '/api/amap/config' && method === 'GET') return json({ configured: false, key: null })
      if (path === '/api/geocode' && method === 'GET') return geocode((url.searchParams.get('q') || '').trim(), fetchImpl)
      if (path === '/api/traces' && method === 'GET') return json(await listTraces(store))

      if (path === '/api/uploads' && method === 'POST') {
        const data = await readJson(request)
        const size = Number(data?.size), mimeType = String(data?.mimeType || '')
        if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_MEDIA_SIZE) return fail('文件须大于 0 且不超过 25 MB', 413)
        if (!/^(audio|video|image)\//i.test(mimeType) || mimeType.length > 120) return fail('只允许上传音频、视频或图片')
        const id = `rec-${uuid()}`
        const count = Math.ceil(size / CHUNK_SIZE)
        const chunks = await Promise.all(Array.from({ length: count }, async (_, index) => {
          const signed = await store.createUploadUrl(mediaKey(id, index), { contentType: 'application/octet-stream', expireSeconds: 900 })
          return { index, url: signed.url }
        }))
        return json({ id, chunkSize: CHUNK_SIZE, chunks })
      }

      const abandoned = path.match(/^\/api\/uploads\/(rec-[0-9a-f-]{36})$/i)
      if (abandoned && method === 'DELETE') {
        const id = abandoned[1], count = Number(url.searchParams.get('count'))
        if (!Number.isInteger(count) || count < 1 || count > Math.ceil(MAX_MEDIA_SIZE / CHUNK_SIZE)) return fail('上传信息无效')
        if (await getTrace(store, id)) return fail('记录已发布', 409)
        await Promise.all(Array.from({ length: count }, (_, index) => store.delete(mediaKey(id, index))))
        return json({ ok: true })
      }

      if (path === '/api/traces' && method === 'POST') {
        const data = await readJson(request)
        const id = String(data?.id || ''), size = Number(data?.size), count = Number(data?.chunkCount)
        const lat = Number(data?.lat), lng = Number(data?.lng), mimeType = String(data?.mimeType || '')
        if (!/^rec-[0-9a-f-]{36}$/i.test(id) || !Number.isSafeInteger(size) || size <= 0 || size > MAX_MEDIA_SIZE || count !== Math.ceil(size / CHUNK_SIZE)) return fail('上传信息无效')
        if (!/^(audio|video|image)\//i.test(mimeType) || mimeType.length > 120) return fail('媒体格式无效')
        if (data?.lat == null || data?.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail('无效的经纬度')
        if (await getTrace(store, id)) return fail('记录已存在', 409)
        for (let index = 0; index < count; index++) {
          const part = await store.get(mediaKey(id, index), { type: 'arrayBuffer', consistency: 'strong' })
          const expected = index === count - 1 ? size - index * CHUNK_SIZE : CHUNK_SIZE
          if (!part || part.byteLength !== expected) return fail('上传未完成，请重新上传')
        }
        const mediaType = mimeType.toLowerCase().startsWith('video/') ? 'video' : mimeType.toLowerCase().startsWith('image/') ? 'image' : 'audio'
        const duration = Number(data?.duration) || 1
        const trace = {
          id, type: 'recording', kindLabel: 'MY RECORDING', title: String(data?.title || '未命名声音').slice(0, 32),
          meta: String(data?.meta || '现场记录').slice(0, 80), lat, lng, duration: Math.max(0.1, Math.min(30, duration)),
          peaks: Array.isArray(data?.peaks) ? data.peaks.filter(Number.isFinite).slice(0, 64) : [],
          mediaType, mimeType, mediaSize: size, mediaChunks: count, mediaUrl: `/api/media/${id}`,
          ...(mediaType === 'audio' ? { audioUrl: `/api/media/${id}` } : {}), createdAt: Date.now(),
        }
        await store.setJSON(traceKey(id), trace)
        return json(trace, 201)
      }

      const media = path.match(/^\/api\/media\/(rec-[0-9a-f-]{36})\/(\d+)$/i)
      if (media && method === 'GET') {
        const trace = await getTrace(store, media[1]), index = Number(media[2])
        if (!trace || !Number.isSafeInteger(index) || index < 0 || index >= trace.mediaChunks) return fail('文件不存在', 404)
        const part = await store.get(mediaKey(trace.id, index), { type: 'arrayBuffer', consistency: 'strong' })
        if (!part) return fail('文件不存在', 404)
        return new Response(part, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
      }

      const match = path.match(/^\/api\/traces\/([^/]+)$/)
      if (match && (method === 'PATCH' || method === 'DELETE')) {
        const id = decodeURIComponent(match[1]), trace = await getTrace(store, id)
        if (!trace) return fail('声音节点不存在', 404)
        if (method === 'DELETE') {
          if (trace.type === 'recording') {
            await Promise.all(Array.from({ length: trace.mediaChunks }, (_, i) => store.delete(mediaKey(id, i))))
            await store.delete(traceKey(id))
          } else await store.setJSON(traceKey(id), { id, deleted: true })
          return json({ ok: true })
        }
        const changes = await readJson(request)
        if (!changes) return fail('请求格式错误')
        if (changes.title !== undefined) trace.title = String(changes.title).slice(0, 32) || '未命名声音'
        if (changes.meta !== undefined) trace.meta = String(changes.meta).slice(0, 80)
        if (changes.lat !== undefined) { const value = Number(changes.lat); if (!Number.isFinite(value) || Math.abs(value) > 90) return fail('无效纬度'); trace.lat = value }
        if (changes.lng !== undefined) { const value = Number(changes.lng); if (!Number.isFinite(value) || Math.abs(value) > 180) return fail('无效经度'); trace.lng = value }
        await store.setJSON(traceKey(id), trace)
        return json(trace)
      }
      return fail('请求不存在', 404)
    } catch (error) {
      console.error('SoundTrace API error', error)
      return fail('服务暂时不可用，请稍后重试', 500)
    }
  }
}
