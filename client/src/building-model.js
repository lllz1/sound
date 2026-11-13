// OpenMapTiles marks building outlines covered by individual parts as hide_3d.
export const BUILDING_3D_FILTER = ['!=', ['get', 'hide_3d'], true]

export function buildingHeightExpression(scale) {
  return ['*', ['max', 0.1, ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height'], 8], 8]], scale]
}

export function buildingBaseExpression(scale) {
  return ['max', 0, ['min', ['*', ['to-number', ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0], 0], scale], ['-', buildingHeightExpression(scale), 0.1]]]
}

export function buildingColorExpression(colors) {
  const fallback = ['interpolate', ['linear'], ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height'], 8], 8],
    0, ['to-color', colors[0]], 20, ['to-color', colors[1]], 60, ['to-color', colors[2]], 140, ['to-color', colors[3]]]
  return ['to-color', ['get', 'colour'], fallback]
}
