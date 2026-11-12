import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// Google tiles are requested by the browser, never through our application server.
export function createRealScene(container, { key, onSelect, onStatus }) {
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    animation: false,
    timeline: false,
    infoBox: false,
    selectionIndicator: false,
    scene3DOnly: true,
    requestRenderMode: true,
  })
  viewer.scene.globe.show = false
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 3
  const markerTraces = new Map()
  let tileset = null
  let renewalTimer = null
  let visibleTiles = false
  let targetLocation = ''

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((event) => {
    const picked = viewer.scene.pick(event.position)
    const trace = markerTraces.get(picked?.id?.id)
    if (trace) onSelect(trace)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  async function loadTiles() {
    const nextTileset = await Cesium.createGooglePhotorealistic3DTileset(
      { key, onlyUsingWithGoogleGeocoder: true },
      { showCreditsOnScreen: true, maximumScreenSpaceError: 16, cacheBytes: 256 * 1024 * 1024, maximumCacheOverflowBytes: 128 * 1024 * 1024 },
    )
    if (viewer.isDestroyed()) {
      nextTileset.destroy()
      return
    }
    visibleTiles = false
    nextTileset.tileVisible.addEventListener(() => {
      if (visibleTiles) return
      visibleTiles = true
      onStatus('模型瓦片已加载', '已加载可见模型；数据覆盖和细节因地点而异。')
    })
    nextTileset.tileFailed.addEventListener(() => {
      onStatus('部分瓦片加载失败', '请检查网络、API Key 限制、配额或切换地点。')
    })
    viewer.scene.primitives.add(nextTileset)
    if (tileset) viewer.scene.primitives.remove(tileset)
    tileset = nextTileset
    viewer.scene.requestRender()
    onStatus('已连接，正在加载模型', '若长时间空白，当前位置可能没有实景数据；可以搜索其他地点或切换 3D 街景。')
    // Root tileset sessions last at least three hours. Renew before expiry.
    clearTimeout(renewalTimer)
    renewalTimer = setTimeout(() => loadTiles().catch(() => {
      if (!viewer.isDestroyed()) onStatus('连接已过期', '请检查网络和密钥，然后重新进入实景 3D。')
    }), 2.75 * 60 * 60 * 1000)
  }

  const ready = loadTiles()

  function updateView({ location, heading, pitch, fov, preset }) {
    if (viewer.isDestroyed() || !location) return
    const locationId = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`
    if (locationId !== targetLocation) {
      targetLocation = locationId
      visibleTiles = false
      if (tileset) onStatus('正在加载当前位置', '若长时间空白，当前位置可能没有实景数据；可以搜索其他地点或切换 3D 街景。')
    }
    const presets = {
      street: { range: 240, pitch: -30 },
      aerial: { range: 650, pitch: -60 },
      panorama: { range: 1200, pitch: -45 },
    }
    const view = presets[preset] || presets.street
    let groundHeight = 0
    try {
      groundHeight = viewer.scene.sampleHeight(Cesium.Cartographic.fromDegrees(location.lng, location.lat)) ?? 0
    } catch { /* The tiles beneath the target may not be loaded yet. */ }
    const target = Cesium.Cartesian3.fromDegrees(location.lng, location.lat, groundHeight)
    viewer.camera.frustum.fov = Cesium.Math.toRadians(fov)
    viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(heading),
      Cesium.Math.toRadians(Math.max(-85, Math.min(-10, view.pitch - pitch))),
      view.range,
    ))
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    viewer.scene.requestRender()
  }

  function updateMarkers(location, traces, selectedId) {
    if (viewer.isDestroyed() || !location) return
    viewer.entities.removeAll()
    markerTraces.clear()
    for (const trace of traces) {
      const id = `soundtrace-${trace.id}`
      markerTraces.set(id, trace)
      const isSelected = trace.id === selectedId
      const color = trace.mediaType === 'image' ? Cesium.Color.fromCssColorString('#c9b6ff') : Cesium.Color.fromCssColorString('#ffd166')
      viewer.entities.add({
        id,
        position: Cesium.Cartesian3.fromDegrees(trace.lng, trace.lat),
        point: { pixelSize: isSelected ? 16 : 12, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: {
          text: trace.title,
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#07111f').withAlpha(0.85),
          pixelOffset: new Cesium.Cartesian2(0, -22),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    }
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(location.lng, location.lat),
      point: { pixelSize: 10, color: Cesium.Color.fromCssColorString('#7ba8ff'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    })
    viewer.scene.requestRender()
  }

  return {
    ready,
    updateView,
    updateMarkers,
    resize: () => { if (!viewer.isDestroyed()) viewer.resize() },
    destroy: () => {
      clearTimeout(renewalTimer)
      if (!handler.isDestroyed()) handler.destroy()
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}
