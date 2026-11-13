import test from 'node:test'
import assert from 'node:assert/strict'
import { createExpression, latest } from '@maplibre/maplibre-gl-style-spec'
import { BUILDING_3D_FILTER, buildingHeightExpression, buildingBaseExpression, buildingColorExpression } from '../client/src/building-model.js'
import { gcjToWgs, resolveMapFocus, wgsToGcj } from '../client/src/coordinates.js'

function evaluate(expression, properties, specification) {
  const result = createExpression(expression, 'layers[0].paint.test', specification)
  assert.equal(result.result, 'success', result.result === 'error' ? result.value.map((item) => item.message).join('; ') : '')
  return result.value.evaluate({ zoom: 18 }, { type: 'Polygon', properties })
}

test('建筑分段不会被整体轮廓遮住，高楼保留数据里的高度', () => {
  assert.equal(evaluate(BUILDING_3D_FILTER, { hide_3d: true }), false)
  assert.equal(evaluate(BUILDING_3D_FILTER, { hide_3d: false }), true)
  assert.equal(evaluate(BUILDING_3D_FILTER, {}), true)
  assert.equal(evaluate(buildingHeightExpression(1), { render_height: 333 }), 333)
  assert.equal(evaluate(buildingHeightExpression(1.5), { render_height: 333 }), 499.5)
  assert.equal(evaluate(buildingBaseExpression(1), { render_height: 20, render_min_height: 6 }), 6)
  assert.ok(evaluate(buildingBaseExpression(1), { render_height: 20, render_min_height: 30 }) < 20)
})

test('建筑有颜色时使用数据颜色，缺失或无效时安全回退', () => {
  const expression = buildingColorExpression(['#112233', '#223344', '#334455', '#445566'])
  const spec = latest['paint_fill-extrusion']['fill-extrusion-color']
  assert.equal(String(evaluate(expression, { colour: '#aabbcc', render_height: 20 }, spec)), 'rgba(170,187,204,1)')
  assert.equal(String(evaluate(expression, { render_height: 20 }, spec)), 'rgba(34,51,68,1)')
  assert.equal(String(evaluate(expression, { colour: 'invalid-color', render_height: 20 }, spec)), 'rgba(34,51,68,1)')
})

test('高德和 WGS84 坐标可往返，地图移动时保留所选目标', () => {
  const original = { lat: 26.8834284, lng: 112.5111841 }
  const gcj = wgsToGcj(original.lat, original.lng)
  const back = gcjToWgs(gcj.lat, gcj.lng)
  assert.ok(Math.abs(back.lat - original.lat) < 1e-7)
  assert.ok(Math.abs(back.lng - original.lng) < 1e-7)
  assert.deepEqual(wgsToGcj(51.5, -0.12), { lat: 51.5, lng: -0.12 })

  const target = { ...original, source: '搜索结果', accuracy: null, moving: true }
  assert.equal(resolveMapFocus({ lat: 31.23, lng: 121.47 }, target).lat, original.lat)
  target.moving = false
  assert.equal(resolveMapFocus({ lat: original.lat + 0.000001, lng: original.lng }, target).source, '搜索结果')
  assert.equal(resolveMapFocus({ lat: 31.23, lng: 121.47 }, target).source, '地图中心')
})
