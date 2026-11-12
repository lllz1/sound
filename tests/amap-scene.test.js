import test from 'node:test'
import assert from 'node:assert/strict'
import { createAmapScene } from '../client/src/amap-scene.js'

test('高德场景使用转换后的坐标并让节点可选', (t) => {
  t.after(() => { delete globalThis.document })
  globalThis.document = { createElement: () => ({
    classList: { toggle() {} },
    querySelector: () => ({}),
    addEventListener(name, handler) { if (name === 'click') this.onClick = handler },
  }) }
  let map
  class FakeMap {
    constructor(_container, options) { this.options = options; this.events = {}; this.added = []; map = this }
    on(name, callback) { this.events[name] = callback }
    off(name) { delete this.events[name] }
    setZoomAndCenter(zoom, center) { this.view = { zoom, center } }
    setPitch(pitch) { this.pitch = pitch }
    setRotation(rotation) { this.rotation = rotation }
    add(item) { this.added.push(item) }
    remove() {}
    destroy() { this.destroyed = true }
  }
  class Buildings { constructor(options) { this.options = options } }
  class Marker { constructor(options) { this.options = options } }
  class Pixel { constructor(x, y) { this.x = x; this.y = y } }
  function createDefaultLayer() {}
  const AMap = { Map: FakeMap, Buildings, Marker, Pixel, createDefaultLayer }
  const location = { lat: 26, lng: 112 }
  const trace = { id: 'one', lat: 26.1, lng: 112.1, title: '声音节点' }
  let selected
  const scene = createAmapScene(AMap, {}, {
    location, heightScale: 1,
    toAmap: (lat, lng) => ({ lat: lat + 1, lng: lng + 2 }),
    onSelect: (item) => { selected = item }, onStatus() {},
  })
  assert.equal(map.options.viewMode, '3D')
  assert.deepEqual(map.options.center, [114, 27])
  scene.updateView({ location, heading: 45, pitch: 0, fov: 90, preset: 'street' })
  assert.deepEqual(map.view.center, [114, 27])
  assert.equal(map.rotation, 45)
  scene.updateMarkers([{ trace, distance: 100 }], 'one')
  const marker = map.added.at(-1)[0]
  assert.deepEqual(marker.options.position, [114.1, 27.1])
  marker.options.content.onClick({ stopPropagation() {} })
  assert.equal(selected, trace)
  scene.updateHeight(1.5)
  assert.equal(map.added.at(-1).options.heightFactor, 1.5)
  scene.destroy()
  assert.equal(map.destroyed, true)
})
