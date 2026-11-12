import test from 'node:test'
import assert from 'node:assert/strict'

function mockPage(onAppend) {
  globalThis.window = {}
  globalThis.document = {
    createElement: () => ({ remove() { this.removed = true } }),
    head: { appendChild: onAppend },
  }
}

test('实景搜索使用 Google 地理编码，并返回可定位的坐标', async (t) => {
  t.after(() => { delete globalThis.window; delete globalThis.document })
  let requestedUrl
  let requestedAddress
  mockPage((script) => {
    requestedUrl = new URL(script.src)
    window.google = { maps: {
      importLibrary: async (name) => {
        assert.equal(name, 'geocoding')
        return { Geocoder: class {
          async geocode({ address }) {
            requestedAddress = address
            return { results: [{ formatted_address: '测试地点', geometry: { location: { lat: () => 31.23, lng: () => 121.47 } } }] }
          }
        } }
      },
    } }
    queueMicrotask(() => window.soundTraceGoogleMapsReady())
  })
  const { geocodeWithGoogle } = await import('../client/src/google-geocoder.js?success')
  const result = await geocodeWithGoogle('test-key', '上海外滩')
  assert.equal(requestedUrl.hostname, 'maps.googleapis.com')
  assert.equal(requestedUrl.searchParams.get('key'), 'test-key')
  assert.equal(requestedAddress, '上海外滩')
  assert.deepEqual(result, { lat: 31.23, lng: 121.47, name: '测试地点' })
  await assert.rejects(geocodeWithGoogle('another-test-key', '上海'), /刷新页面/)
})

test('Google 搜索认证失败时返回可读的错误并移除加载脚本', async (t) => {
  t.after(() => { delete globalThis.window; delete globalThis.document })
  let script
  mockPage((element) => {
    script = element
    queueMicrotask(() => window.gm_authFailure())
  })
  const { geocodeWithGoogle } = await import('../client/src/google-geocoder.js?failure')
  await assert.rejects(geocodeWithGoogle('invalid-key', '上海'), /认证失败/)
  assert.equal(script.removed, true)
})
