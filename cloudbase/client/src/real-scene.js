import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// Model tiles are requested by the browser, never through our application server.
export function createRealScene(container, { key, onSelect, onStatus, onBuilding = () => {}, onPickLocation = () => {}, source = 'google' }) {
  const openBuildings = source === 'open'
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
  viewer.scene.globe.show = openBuildings
  if (openBuildings) {
    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: 'https://basemap.queeniemella.cc/tiles/countries/{z}/{x}/{y}.png',
      maximumLevel: 20,
      credit: new Cesium.Credit('© queeniemella.cc | © OpenStreetMap contributors', true),
    }))
  }
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 3
  const markerTraces = new Map()
  let tileset = null
  let renewalTimer = null
  let visibleTimer = null
  let visibleTiles = false
  let targetLocation = ''
  let terrainReady = false
  let sampledLocation = ''
  let sampledHeight = null
  let lastView = null
  let pickingLocation = false

  function scheduleVisibleTimeout() {
    clearTimeout(visibleTimer)
    if (!openBuildings) return
    visibleTimer = setTimeout(() => {
      if (!viewer.isDestroyed() && !visibleTiles) onStatus('暂无可见建筑', '当前区域可能没有可用模型，或服务加载较慢；可重试或切换 3D 街景。')
    }, 20000)
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((event) => {
    if (openBuildings && pickingLocation) {
      const ray = viewer.camera.getPickRay(event.position)
      const point = ray && viewer.scene.globe.pick(ray, viewer.scene)
      if (!point) { onStatus('请选择地面', '请点击可见地面来设置观察点。'); return }
      const position = Cesium.Cartographic.fromCartesian(point)
      pickingLocation = false
      viewer.scene.canvas.style.cursor = ''
      onPickLocation({ lat: Cesium.Math.toDegrees(position.latitude), lng: Cesium.Math.toDegrees(position.longitude) })
      return
    }
    const picked = viewer.scene.pick(event.position)
    const trace = markerTraces.get(picked?.id?.id)
    if (trace) { onSelect(trace); return }
    if (openBuildings && typeof picked?.getProperty === 'function') {
      try {
        const height = Number(picked.getProperty('height'))
        if (Number.isFinite(height)) onBuilding({
          name: picked.getProperty('name'),
          height,
          method: picked.getProperty('height_method'),
        })
      } catch { /* Some picked objects are not building features. */ }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  async function loadTiles() {
    const options = { showCreditsOnScreen: true, maximumScreenSpaceError: openBuildings ? 8 : 16, cacheBytes: 256 * 1024 * 1024, maximumCacheOverflowBytes: 128 * 1024 * 1024 }
    const tilesetPromise = openBuildings
      ? Cesium.Cesium3DTileset.fromUrl('https://buildings.reearth.land/tileset.json', options)
      : Cesium.createGooglePhotorealistic3DTileset({ key, onlyUsingWithGoogleGeocoder: true }, options)
    const terrainPromise = openBuildings
      ? Cesium.CesiumTerrainProvider.fromUrl('https://terrain.reearth.land/cesium-mesh/ellipsoid', { requestVertexNormals: true }).catch(() => null)
      : Promise.resolve(null)
    const [nextTileset, terrain] = await Promise.all([tilesetPromise, terrainPromise])
    if (viewer.isDestroyed()) {
      nextTileset.destroy()
      return
    }
    if (openBuildings && terrain) {
      viewer.terrainProvider = terrain
      terrainReady = true
    }
    visibleTiles = false
    nextTileset.tileVisible.addEventListener(() => {
      if (visibleTiles) return
      visibleTiles = true
      clearTimeout(visibleTimer)
      onStatus('模型瓦片已加载', openBuildings
        ? (terrain ? '开放建筑模型已加载；部分楼高根据数据估算，无实拍立面。' : '建筑模型已加载；地形暂不可用，模型可能出现高差。')
        : '已加载可见模型；数据覆盖和细节因地点而异。')
    })
    nextTileset.tileFailed.addEventListener(() => {
      onStatus('部分瓦片加载失败', openBuildings
        ? '开放建筑服务暂时不可用，请检查网络或稍后重试。'
        : '请检查网络、API Key 限制、配额或切换地点。')
    })
    viewer.scene.primitives.add(nextTileset)
    if (tileset) viewer.scene.primitives.remove(tileset)
    tileset = nextTileset
    viewer.scene.requestRender()
    onStatus('已连接，正在加载模型', openBuildings
      ? '正在加载开放建筑；部分楼高为估算值。'
      : '若长时间空白，当前位置可能没有实景数据；可以搜索其他地点或切换 3D 街景。')
    scheduleVisibleTimeout()
    if (openBuildings && lastView) updateView(lastView)
    // Root tileset sessions last at least three hours. Renew before expiry.
    if (!openBuildings) {
      clearTimeout(renewalTimer)
      renewalTimer = setTimeout(() => loadTiles().catch(() => {
        if (!viewer.isDestroyed()) onStatus('连接已过期', '请检查网络和密钥，然后重新进入实景 3D。')
      }), 2.75 * 60 * 60 * 1000)
    }
  }

  const ready = loadTiles()

  function updateView({ location, heading, pitch, fov, preset }) {
    if (viewer.isDestroyed() || !location) return
    lastView = { location, heading, pitch, fov, preset }
    const locationId = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`
    if (locationId !== targetLocation) {
      targetLocation = locationId
      sampledHeight = null
      visibleTiles = false
      if (tileset) {
        onStatus('正在加载当前位置', openBuildings ? '正在加载开放建筑；部分楼高为估算值。' : '若长时间空白，当前位置可能没有实景数据；可以搜索其他地点或切换 3D 街景。')
        scheduleVisibleTimeout()
      }
    }
    const presets = {
      street: { range: 240, pitch: -30 },
      aerial: { range: 650, pitch: -60 },
      panorama: { range: 1200, pitch: -45 },
    }
    const view = presets[preset] || presets.street
    let groundHeight = 0
    const position = Cesium.Cartographic.fromDegrees(location.lng, location.lat)
    if (openBuildings) {
      groundHeight = sampledHeight ?? viewer.scene.globe.getHeight(position) ?? 0
      if (terrainReady && sampledLocation !== locationId) {
        sampledLocation = locationId
        Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [position]).then(([sample]) => {
          if (viewer.isDestroyed() || targetLocation !== locationId || !Number.isFinite(sample?.height)) return
          sampledHeight = sample.height
          if (lastView) updateView(lastView)
        }).catch(() => { /* Keep the last known ground height if terrain is unavailable. */ })
      }
    } else {
      try { groundHeight = viewer.scene.sampleHeight(position) ?? 0 } catch { /* The tiles beneath the target may not be loaded yet. */ }
    }
    const target = Cesium.Cartesian3.fromDegrees(location.lng, location.lat, groundHeight)
    if (openBuildings) {
      const frame = Cesium.Transforms.eastNorthUpToFixedFrame(target)
      const direction = Cesium.Matrix4.multiplyByPointAsVector(frame, new Cesium.Cartesian3(0.4, 0.3, -1), new Cesium.Cartesian3())
      viewer.scene.light = new Cesium.DirectionalLight({ direction: Cesium.Cartesian3.normalize(direction, direction), intensity: 2 })
    }
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
    setPickingLocation: (active) => {
      pickingLocation = Boolean(openBuildings && active)
      viewer.scene.canvas.style.cursor = pickingLocation ? 'crosshair' : ''
    },
    resize: () => { if (!viewer.isDestroyed()) viewer.resize() },
    destroy: () => {
      clearTimeout(renewalTimer)
      clearTimeout(visibleTimer)
      if (!handler.isDestroyed()) handler.destroy()
      if (!viewer.isDestroyed()) viewer.destroy()
    },
  }
}
