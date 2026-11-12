import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAmapRouter, readAmapConfig } from '../server/amap.js'

async function withServer(t, options) {
  const app = express()
  app.use(createAmapRouter(options))
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('高德未配置时提供状态并拒绝代理', async (t) => {
  const base = await withServer(t, {})
  const config = await (await fetch(`${base}/api/amap/config`)).json()
  assert.deepEqual(config, { configured: false, key: null })
  assert.equal((await fetch(`${base}/_AMapService/v3/place/text`)).status, 503)
})

test('高德代理只向固定上游附加服务端安全密钥', async (t) => {
  const requests = []
  const base = await withServer(t, {
    key: 'public-test-key',
    securityCode: 'private-test-code',
    fetchImpl: async (url) => {
      requests.push(url)
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const config = await (await fetch(`${base}/api/amap/config`)).json()
  assert.deepEqual(config, { configured: true, key: 'public-test-key' })
  assert.equal(JSON.stringify(config).includes('private-test-code'), false)
  const result = await fetch(`${base}/_AMapService/v3/place/text?key=incorrect&jscode=incorrect`)
  assert.deepEqual(await result.json(), { ok: true })
  assert.equal(requests[0].origin, 'https://restapi.amap.com')
  assert.equal(requests[0].searchParams.get('key'), 'public-test-key')
  assert.equal(requests[0].searchParams.get('jscode'), 'private-test-code')
  await fetch(`${base}/_AMapService/v4/map/styles?key=public-test-key`)
  assert.equal(requests[1].origin, 'https://webapi.amap.com')
})

test('保存新配置后可在不重启服务的情况下读取', async (t) => {
  let config = {}
  const base = await withServer(t, { getConfig: async () => config })
  assert.equal((await (await fetch(`${base}/api/amap/config`)).json()).configured, false)
  config = { key: 'public-test-key', securityCode: 'private-test-code' }
  assert.deepEqual(await (await fetch(`${base}/api/amap/config`)).json(), { configured: true, key: 'public-test-key' })
})

test('从本地配置文件读取更新后的密钥', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'soundtrace-amap-'))
  t.after(async () => {
    await fs.unlink(path.join(root, '.env')).catch(() => {})
    await fs.rmdir(root)
  })
  assert.equal((await readAmapConfig(root, {})).key, undefined)
  await fs.writeFile(path.join(root, '.env'), 'AMAP_WEB_KEY=example-key\nAMAP_SECURITY_CODE=example-code\n')
  assert.deepEqual(await readAmapConfig(root, {}), { key: 'example-key', securityCode: 'example-code' })
})
