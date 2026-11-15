import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createApi, CHUNK_SIZE } from '../functions/soundtrace-api/api.mjs'
import { createCloudBaseStore } from '../functions/soundtrace-api/cloudbase-store.mjs'
import { uploadTrace, readMediaBlob } from './media-transport.mjs'

function fakeBucket() {
  const files = new Map()
  return {
    files,
    async upload(key, data) { files.set(key, new Blob([data])); return { data: { path: key } } },
    async download(key) { return files.has(key) ? { data: files.get(key) } : { error: { status: 404 } } },
    async remove(keys) { keys.forEach(key => files.delete(key)); return { data: [] } },
    async list(prefix, options) {
      const names = [...files.keys()].filter(key => key.startsWith(prefix)).sort()
      const start = Number(options.cursor || 0)
      const objects = names.slice(start, start + 2).map(name => ({ name }))
      const next = start + objects.length
      return { data: { objects, hasNext: next < names.length, nextCursor: String(next) } }
    },
    async createSignedUploadUrl(key) {
      return { data: { fullSignedURL: `https://upload.test/${encodeURIComponent(key)}`, token: 'test-token' } }
    },
  }
}

test('audio, image and multipart video survive the storage adapter lifecycle', async () => {
  const bucket = fakeBucket()
  const handle = createApi({ store: createCloudBaseStore(bucket) })
  const fetchImpl = async (path, options = {}) => {
    if (String(path).startsWith('https://upload.test/')) {
      const url = new URL(path)
      assert.equal(url.searchParams.get('token'), 'test-token')
      await bucket.upload(decodeURIComponent(url.pathname.slice(1)), await options.body.arrayBuffer())
      return new Response(null, { status: 200 })
    }
    return handle(new Request(new URL(path, 'https://soundtrace.test'), options))
  }
  const ids = []
  for (const [type, size] of [['audio/webm', 91], ['image/png', 203], ['video/webm', CHUNK_SIZE + 41]]) {
    const bytes = new Uint8Array(size)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
    const trace = await uploadTrace(new Blob([bytes], { type }), { lat: 26.9, lng: 112.5, title: '测试' }, fetchImpl)
    ids.push(trace.id)
    const recovered = await readMediaBlob(trace, fetchImpl)
    const hash = data => createHash('sha256').update(data).digest('hex')
    assert.equal(hash(Buffer.from(await recovered.arrayBuffer())), hash(bytes))
  }
  const traces = await (await fetchImpl('/api/traces')).json()
  assert.ok(ids.every(id => traces.some(trace => trace.id === id)))
  const edited = await fetchImpl(`/api/traces/${ids[0]}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '已修改' }) })
  assert.equal((await edited.json()).title, '已修改')
  for (const id of ids) assert.equal((await fetchImpl(`/api/traces/${id}`, { method: 'DELETE' })).status, 200)
  assert.equal(bucket.files.size, 0)
})

test('storage errors are not mistaken for missing files', async () => {
  const store = createCloudBaseStore({ download: async () => ({ error: { status: 403, message: 'denied' } }) })
  await assert.rejects(store.get('traces/a.json'), /denied|\[object Object\]/)
})
