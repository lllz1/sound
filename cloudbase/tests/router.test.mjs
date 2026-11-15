import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRouter } from '../functions/soundtrace-api/router.mjs'
import { CHUNK_SIZE } from '../functions/soundtrace-api/api.mjs'
import { uploadTrace, readMediaBlob } from './media-transport.mjs'

function harness() {
  const files = new Map()
  const bucket = {
    async upload(key, value) { files.set(key, new Blob([value])); return { data: { path: key } } },
    async download(key) { return files.has(key) ? { data: files.get(key) } : { error: { status: 404 } } },
    async remove(keys) { keys.forEach(key => files.delete(key)); return { data: [] } },
    async list(prefix) { return { data: { objects: [...files.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })), hasNext: false } } },
  }
  const router = createRouter({ bucket, secret: 'test-secret', fetchStatic: async url => new Response(`asset:${url.pathname}`, { headers: { 'content-type': 'text/plain' } }) })
  const fetchImpl = async (path, options = {}) => {
    const url = new URL(path, 'https://soundtrace.test')
    const data = options.body instanceof Blob ? Buffer.from(await options.body.arrayBuffer()) : options.body
    const binary = Buffer.isBuffer(data)
    const event = { path: url.pathname.replace(/^\/api(?=\/)/, ''), httpMethod: options.method || 'GET', queryStringParameters: Object.fromEntries(url.searchParams), headers: options.headers || {}, body: binary ? data.toString('base64') : data, isBase64Encoded: binary }
    const result = await router(event)
    const body = result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body
    return new Response(body, { status: result.statusCode, headers: result.headers })
  }
  return { router, fetchImpl, files }
}

test('gateway handles page assets and full media upload lifecycle', async () => {
  const { router, fetchImpl, files } = harness()
  const page = await router({ path: '/', httpMethod: 'GET' })
  assert.equal(page.body, 'asset:/')
  const bytes = new Uint8Array(CHUNK_SIZE + 29)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
  const trace = await uploadTrace(new Blob([bytes], { type: 'video/webm' }), { lat: 26.9, lng: 112.5 }, fetchImpl)
  const recovered = await readMediaBlob(trace, fetchImpl)
  const hash = data => createHash('sha256').update(data).digest('hex')
  assert.equal(hash(Buffer.from(await recovered.arrayBuffer())), hash(bytes))
  assert.ok((await (await fetchImpl('/api/traces')).json()).some(item => item.id === trace.id))
  assert.equal((await fetchImpl(`/api/traces/${trace.id}`, { method: 'DELETE' })).status, 200)
  assert.equal(files.size, 0)
})

test('gateway rejects forged and non-binary chunk uploads', async () => {
  const { router } = harness()
  const path = '/upload-chunk/rec-00000000-0000-4000-8000-000000000001/0'
  const result = await router({ path, httpMethod: 'PUT', body: 'a', queryStringParameters: { expires: String(Math.floor(Date.now() / 1000) + 60), sig: '0'.repeat(64) } })
  assert.equal(result.statusCode, 403)
})
