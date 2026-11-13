const PI = Math.PI
const GCJ_A = 6378245.0
const GCJ_EE = 0.00669342162296594323
const outOfChina = (lat, lng) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271

function transformLat(x, y) {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3
  value += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3
  value += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3
  return value
}

function transformLng(x, y) {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3
  value += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3
  value += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3
  return value
}

export function wgsToGcj(lat, lng) {
  if (outOfChina(lat, lng)) return { lat, lng }
  let dLat = transformLat(lng - 105, lat - 35)
  let dLng = transformLng(lng - 105, lat - 35)
  const radLat = lat / 180 * PI
  let magic = Math.sin(radLat)
  magic = 1 - GCJ_EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180) / (GCJ_A / sqrtMagic * Math.cos(radLat) * PI)
  return { lat: lat + dLat, lng: lng + dLng }
}

export function gcjToWgs(lat, lng) {
  let result = { lat, lng }
  for (let i = 0; i < 5; i += 1) {
    const gcj = wgsToGcj(result.lat, result.lng)
    result = { lat: result.lat + (lat - gcj.lat), lng: result.lng + (lng - gcj.lng) }
  }
  return result
}

export function resolveMapFocus(center, target) {
  if (target) {
    const latMetres = (center.lat - target.lat) * 111320
    const lngMetres = (center.lng - target.lng) * 111320 * Math.cos(center.lat * PI / 180)
    if (target.moving || Math.hypot(latMetres, lngMetres) < 2) return { ...target }
  }
  return { lat: center.lat, lng: center.lng, source: '地图中心', accuracy: null }
}
