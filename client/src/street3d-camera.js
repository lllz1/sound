export const STREET_CAMERA_PRESETS = {
  street: { zoom: 17.6, pitch: 68, offset: 70 },
  aerial: { zoom: 16.2, pitch: 38, offset: 130 },
  panorama: { zoom: 15.4, pitch: 52, offset: 240 },
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
