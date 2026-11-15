import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { uploadTrace, readMediaBlob } from './media-transport.mjs'

const origin = process.env.SOUNDTRACE_TEST_ORIGIN
if (!origin) throw new Error('SOUNDTRACE_TEST_ORIGIN is required')
const request = (path, options = {}) => fetch(new URL(path, origin), { ...options, signal: AbortSignal.timeout(45000) })
const created = []
try {
  assert.equal((await request('/api/health')).status, 200)
  const campusResponse = await request(`/api/geocode?q=${encodeURIComponent('南华大学雨母校区')}`)
  assert.equal(campusResponse.status, 200)
  assert.ok((await campusResponse.json()).some(item => item.name.includes('雨母校区')))
  for (const [mime, size] of [['image/png', 97], ['audio/webm', 149], ['video/webm', 4 * 1024 * 1024 + 123]]) {
    const input = new Uint8Array(size)
    for (let i = 0; i < input.length; i++) input[i] = i % 251
    const trace = await uploadTrace(new Blob([input], { type: mime }), { title: '自动测试', lat: 26.9, lng: 112.5 }, request)
    created.push(trace.id)
    const list = await (await request('/api/traces')).json()
    assert.ok(list.some(item => item.id === trace.id))
    const recovered = await readMediaBlob(trace, request)
    const hash = data => createHash('sha256').update(data).digest('hex')
    assert.equal(hash(Buffer.from(await recovered.arrayBuffer())), hash(input))
    const edit = await request(`/api/traces/${trace.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自动测试已修改' }) })
    assert.equal((await edit.json()).title, '自动测试已修改')
    assert.equal((await request(`/api/traces/${trace.id}`, { method: 'DELETE' })).status, 200)
    created.pop()
    assert.equal((await request(`/api/media/${trace.id}/0`)).status, 404)
    console.log(`${mime}: upload, list, read, edit and delete passed`)
  }
  console.log('Campus search passed')
} finally {
  for (const id of created) await request(`/api/traces/${id}`, { method: 'DELETE' }).catch(() => {})
}
