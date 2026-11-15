import { createHmac, timingSafeEqual } from 'node:crypto'
import { CHUNK_SIZE, createApi } from './api.mjs'
import { createCloudBaseStore } from './cloudbase-store.mjs'
import { createEventHandler, eventToRequest, responseToEvent } from './event-bridge.mjs'

const STATIC_ORIGIN = 'https://fresh-salamander-d5e3n8i7cbe7352-1532780264.tcloudbaseapp.com'
const mediaPattern = /^media\/(rec-[0-9a-f-]{36})\/(\d+)$/i
const chunkPattern = /^\/api\/upload-chunk\/(rec-[0-9a-f-]{36})\/(\d+)$/i
const staticPattern = /^\/(?:$|index\.html$|field-notes-cover\.jpg$|assets\/|cesium\/|maplibre\/)/

function signature(secret, key, expires) {
  return createHmac('sha256', secret).update(`${key}\n${expires}`).digest('hex')
}

export function createRouter({ bucket, secret, fetchStatic = fetch, now = Date.now }) {
  if (!secret) throw new Error('Upload signing key is missing')
  const store = createCloudBaseStore(bucket)
  store.createUploadUrl = async key => {
    const match = key.match(mediaPattern)
    if (!match || Number(match[2]) > 6) throw new Error('Invalid upload target')
    const expires = Math.floor(now() / 1000) + 900
    const sig = signature(secret, key, expires)
    return { url: `/api/upload-chunk/${match[1]}/${match[2]}?expires=${expires}&sig=${sig}` }
  }
  const api = createEventHandler(createApi({ store }))
  return async event => {
    const method = String(event.httpMethod || 'GET').toUpperCase()
    let path = event.path || '/'
    if (method === 'GET' && staticPattern.test(path) && !path.includes('..')) {
      const upstream = new URL(path, STATIC_ORIGIN)
      if (upstream.origin !== STATIC_ORIGIN) return responseToEvent(new Response('Not found', { status: 404 }))
      const response = await fetchStatic(upstream, { signal: AbortSignal.timeout(15000) })
      const headers = new Headers()
      headers.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream')
      headers.set('Cache-Control', path === '/' || path === '/index.html' ? 'no-store' : 'public, max-age=3600')
      return responseToEvent(new Response(await response.arrayBuffer(), { status: response.status, headers }))
    }
    if (!path.startsWith('/api/')) path = `/api${path.startsWith('/') ? path : `/${path}`}`
    const match = path.match(chunkPattern)
    if (match && method === 'PUT') {
      const request = eventToRequest({ ...event, path })
      const url = new URL(request.url)
      const expires = Number(url.searchParams.get('expires'))
      const actual = url.searchParams.get('sig') || ''
      const key = `media/${match[1]}/${match[2]}`
      const expected = signature(secret, key, expires)
      if (!Number.isSafeInteger(expires) || expires < Math.floor(now() / 1000) || expires > Math.floor(now() / 1000) + 900 || Number(match[2]) > 6 || !/^[0-9a-f]{64}$/.test(actual) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
        return responseToEvent(Response.json({ error: '上传链接无效或已过期' }, { status: 403 }))
      }
      if (!event.isBase64Encoded) return responseToEvent(Response.json({ error: '上传格式不受支持' }, { status: 400 }))
      const bytes = Buffer.from(await request.arrayBuffer())
      if (!bytes.length || bytes.length > CHUNK_SIZE) return responseToEvent(Response.json({ error: '上传文件大小无效' }, { status: 413 }))
      const result = await bucket.upload(key, bytes, { contentType: 'application/octet-stream', upsert: false })
      if (result.error) return responseToEvent(Response.json({ error: '上传暂时不可用' }, { status: 500 }))
      return responseToEvent(Response.json({ ok: true }))
    }
    return api({ ...event, path })
  }
}
