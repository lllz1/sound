export const STREET_CAMERA_PRESETS = {
  street: { zoom: 17.6, pitch: 68, offset: 70 },
  aerial: { zoom: 16.2, pitch: 38, offset: 130 },
  panorama: { zoom: 15.4, pitch: 52, offset: 240 },
}

export function destinationPoint(lat, lng, bearing, distance) {
  const radius = 6371000
  const angular = distance / radius
  const theta = bearing * Math.PI / 180
  const phi1 = lat * Math.PI / 180
  const lambda1 = lng * Math.PI / 180
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(angular) + Math.cos(phi1) * Math.sin(angular) * Math.cos(theta))
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(angular) * Math.cos(phi1),
    Math.cos(angular) - Math.sin(phi1) * Math.sin(phi2),
  )
  return { lat: Math.max(-85.051129, Math.min(85.051129, phi2 * 180 / Math.PI)), lng: ((lambda2 * 180 / Math.PI + 540) % 360) - 180 }
}

export function streetWalkAction(position, heading, action) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng) || !Number.isFinite(heading)) return null
  if (action === 'left' || action === 'right') {
    return { position: { ...position }, heading: (heading + (action === 'left' ? -15 : 15) + 360) % 360 }
  }
  if (action === 'forward' || action === 'backward') {
    const bearing = (heading + (action === 'backward' ? 180 : 0)) % 360
    return { position: destinationPoint(position.lat, position.lng, bearing, 5), heading }
  }
  return null
}

// The slider expresses horizontal field of view; MapLibre uses a vertical angle.
export function verticalFieldOfView(horizontalDegrees, width, height) {
  if (!(width > 0 && height > 0) || !Number.isFinite(Number(horizontalDegrees))) return null
  const horizontal = Math.max(1, Math.min(179, Number(horizontalDegrees))) * Math.PI / 180
  return 2 * Math.atan(Math.tan(horizontal / 2) * height / width) * 180 / Math.PI
}

export function nextStreetCamera({ action, preset, heading, pitch, previousPitch, currentPitch, center }) {
  const camera = STREET_CAMERA_PRESETS[preset] || STREET_CAMERA_PRESETS.street
  if (action === 'recenter' || action === 'preset') {
    const result = { zoom: camera.zoom, pitch: Math.max(20, Math.min(80, camera.pitch + pitch * 1.2)), bearing: heading }
    if (action === 'recenter' && center) result.center = center
    return result
  }
  if (action === 'heading') return { bearing: heading }
  if (action === 'pitch') return { pitch: Math.max(20, Math.min(80, currentPitch + (pitch - previousPitch) * 1.2)) }
  return {}
}
