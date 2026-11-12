let loadedKey = null
let loading = null

export function loadAmap(key) {
  if (loadedKey && loadedKey !== key) return Promise.reject(new Error('更换高德 Key 后请刷新页面。'))
  if (loading) return loading
  loadedKey = key
  window._AMapSecurityConfig = { serviceHost: `${window.location.origin}/_AMapService` }
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    let finished = false
    const finish = (error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      delete window.soundTraceAmapReady
      if (error) { script.remove(); reject(error) } else resolve(window.AMap)
    }
    const timer = setTimeout(() => finish(new Error('高德地图加载超时，请检查网络和密钥。')), 20000)
    window.soundTraceAmapReady = () => window.AMap ? finish() : finish(new Error('高德地图加载失败。'))
    script.onerror = () => finish(new Error('无法连接高德地图服务。'))
    const url = new URL('https://webapi.amap.com/maps')
    url.searchParams.set('v', '2.0')
    url.searchParams.set('key', key)
    url.searchParams.set('callback', 'soundTraceAmapReady')
    script.src = url.toString()
    script.async = true
    document.head.appendChild(script)
  }).catch((error) => {
    loading = null
    if (!window.AMap) loadedKey = null
    throw error
  })
  return loading
}

export function createAmapScene(AMap, container, { location, toAmap, onSelect, onStatus, heightScale }) {
  const point = toAmap(location.lat, location.lng)
  let buildings = new AMap.Buildings({ zooms: [17, 20], zIndex: 10, heightFactor: heightScale })
  const map = new AMap.Map(container, {
    viewMode: '3D',
    center: [point.lng, point.lat],
    zoom: 17.6,
    zooms: [3, 20],
    pitch: 60,
    rotateEnable: true,
    pitchEnable: true,
    showBuildingBlock: false,
    mapStyle: 'amap://styles/dark',
    layers: [new AMap.createDefaultLayer(), buildings],
  })
  let markers = []
  let disposed = false
  const handleComplete = () => onStatus('地图已加载', '3D 楼块在 17–20 级显示；楼宇覆盖以高德当地数据为准。')
  const handleError = () => onStatus('地图加载异常', '请检查网络、Web Key、安全密钥以及高德控制台的服务权限。')
  map.on('complete', handleComplete)
  map.on('error', handleError)

  function updateView({ location: target, heading, pitch, fov, preset }) {
    if (disposed) return
    const presets = {
      street: { zoom: 17.8, pitch: 65 },
      aerial: { zoom: 17.4, pitch: 42 },
      panorama: { zoom: 17.1, pitch: 52 },
    }
    const camera = presets[preset] || presets.street
    const center = toAmap(target.lat, target.lng)
    // AMap does not expose field of view directly; approximate it via zoom.
    const zoom = Math.max(17, Math.min(20, camera.zoom + (90 - fov) * 0.025))
    map.setZoomAndCenter(zoom, [center.lng, center.lat], true)
    map.setPitch(Math.max(0, Math.min(83, camera.pitch + pitch)), true)
    map.setRotation(heading, true)
  }

  function updateMarkers(traces, selectedId) {
    if (disposed) return
    if (markers.length) map.remove(markers)
    markers = traces.map(({ trace, distance }) => {
      const coords = toAmap(trace.lat, trace.lng)
      const element = document.createElement('button')
      const mediaType = trace.mediaType || 'audio'
      element.type = 'button'
      element.className = `street-node-marker ${mediaType === 'video' ? 'is-video' : mediaType === 'image' ? 'is-image' : ''}`
      element.classList.toggle('is-selected', trace.id === selectedId)
      element.innerHTML = '<span class="street-node-marker__ring"></span><span class="street-node-marker__core"></span><span class="street-node-marker__label"><span></span><small></small></span>'
      element.querySelector('.street-node-marker__label span').textContent = trace.title
      element.querySelector('small').textContent = `${Math.round(distance)} m · ${trace.meta || ''}`
      element.addEventListener('click', (event) => { event.stopPropagation(); onSelect(trace) })
      return new AMap.Marker({ position: [coords.lng, coords.lat], content: element, offset: new AMap.Pixel(-17, -17) })
    })
    if (markers.length) map.add(markers)
  }

  function updateHeight(scale) {
    if (disposed) return
    map.remove(buildings)
    buildings = new AMap.Buildings({ zooms: [17, 20], zIndex: 10, heightFactor: scale })
    map.add(buildings)
  }

  return {
    updateView,
    updateMarkers,
    updateHeight,
    destroy() {
      if (disposed) return
      disposed = true
      map.off('complete', handleComplete)
      map.off('error', handleError)
      map.destroy()
    },
  }
}
