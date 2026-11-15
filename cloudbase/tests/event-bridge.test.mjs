import test from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../functions/soundtrace-api/api.mjs'
import { createEventHandler, eventToRequest } from '../functions/soundtrace-api/event-bridge.mjs'

test('gateway request preserves query parameters and JSON response', async () => {
  const handle = createEventHandler(createApi({ store: {} }))
  const result = await handle({ path: '/api/geocode', httpMethod: 'GET', queryStringParameters: { q: '南华大学雨母校区' } })
  assert.equal(result.statusCode, 200)
  assert.equal(result.isBase64Encoded, false)
  assert.equal(JSON.parse(result.body)[0].lat, 26.8834284)
})

test('gateway forwards binary requests and responses without changing bytes', async () => {
  const bytes = Buffer.from([0, 1, 127, 128, 254, 255])
  const request = eventToRequest({ path: '/upload', httpMethod: 'PUT', body: bytes.toString('base64'), isBase64Encoded: true })
  assert.deepEqual(Buffer.from(await request.arrayBuffer()), bytes)
  const store = { async get(key) {
    if (key.startsWith('traces/')) return { id: 'rec-00000000-0000-4000-8000-000000000001', mediaChunks: 1 }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } }
  const handle = createEventHandler(createApi({ store }))
  const result = await handle({ path: '/api/media/rec-00000000-0000-4000-8000-000000000001/0', httpMethod: 'GET' })
  assert.equal(result.statusCode, 200)
  assert.equal(result.isBase64Encoded, true)
  assert.deepEqual(Buffer.from(result.body, 'base64'), bytes)
})
