import test from 'node:test'
import assert from 'node:assert/strict'
import { nextStreetCamera, streetWalkAction, verticalFieldOfView } from '../client/src/street3d-camera.js'

test('街景水平视野按画面比例转换为真实垂直视野', () => {
  const vertical = verticalFieldOfView(90, 1600, 900)
  assert.ok(Math.abs(vertical - 58.7155) < 0.001)
  assert.ok(verticalFieldOfView(55, 1600, 900) < vertical)
  assert.ok(verticalFieldOfView(110, 1600, 900) > vertical)
  assert.equal(verticalFieldOfView(90, 0, 900), null)
})

test('调整朝向或俯仰时保留用户拖动后的中心与缩放', () => {
  const common = { preset: 'street', heading: 85, pitch: 10, previousPitch: 5, currentPitch: 50, center: [112, 27] }
  assert.deepEqual(nextStreetCamera({ ...common, action: 'heading' }), { bearing: 85 })
  assert.deepEqual(nextStreetCamera({ ...common, action: 'pitch' }), { pitch: 56 })
  assert.deepEqual(nextStreetCamera({ ...common, action: 'preset' }), { zoom: 17.6, pitch: 80, bearing: 85 })
  assert.deepEqual(nextStreetCamera({ ...common, action: 'recenter' }), { zoom: 17.6, pitch: 80, bearing: 85, center: [112, 27] })
})

test('模型漫游按照朝向前进、后退和转向', () => {
  const start = { lat: 26.9, lng: 112.6 }
  const forward = streetWalkAction(start, 0, 'forward')
  assert.ok(forward.position.lat > start.lat)
  assert.ok(Math.abs(forward.position.lng - start.lng) < 1e-8)
  const back = streetWalkAction(forward.position, 0, 'backward')
  assert.ok(Math.abs(back.position.lat - start.lat) < 1e-8)
  assert.equal(streetWalkAction(start, 0, 'left').heading, 345)
  assert.equal(streetWalkAction(start, 350, 'right').heading, 5)
  assert.equal(streetWalkAction(start, 0, 'invalid'), null)
  assert.deepEqual(start, { lat: 26.9, lng: 112.6 })
})
