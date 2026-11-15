let loadedKey = null
let loading = null

function loadGoogleMaps(key) {
  if (loadedKey && loadedKey !== key) {
    return Promise.reject(new Error('更换密钥后请刷新页面，再使用实景地点搜索。'))
  }
  if (loading) return loading
  loadedKey = key
  loading = new Promise((resolve, reject) => {
    let finished = false
    const script = document.createElement('script')
    const finish = (error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      delete window.soundTraceGoogleMapsReady
      if (error) {
        script.remove()
        reject(error)
      } else resolve(window.google.maps)
    }
    const timer = setTimeout(() => finish(new Error('搜索服务连接超时，请检查网络。')), 15000)
    window.soundTraceGoogleMapsReady = () => finish()
    window.gm_authFailure = () => finish(new Error('搜索服务认证失败，请检查密钥和 API 配置。'))
    script.onerror = () => finish(new Error('无法连接 Google 搜索服务，请检查网络。'))
    const url = new URL('https://maps.googleapis.com/maps/api/js')
    url.searchParams.set('key', key)
    url.searchParams.set('loading', 'async')
    url.searchParams.set('callback', 'soundTraceGoogleMapsReady')
    url.searchParams.set('language', 'zh-CN')
    script.src = url.toString()
    script.async = true
    document.head.appendChild(script)
  }).catch((error) => {
    loading = null
    // An already-loaded Google Maps script cannot be reinitialized with a different key.
    if (!window.google?.maps) loadedKey = null
    throw error
  })
  return loading
}

export async function geocodeWithGoogle(key, query) {
  const maps = await loadGoogleMaps(key)
  try {
    const { Geocoder } = await maps.importLibrary('geocoding')
    const result = await new Geocoder().geocode({ address: query })
    const first = result.results?.[0]
    if (!first) throw new Error('未找到该地点，请换一个关键词。')
    return { lat: first.geometry.location.lat(), lng: first.geometry.location.lng(), name: first.formatted_address }
  } catch (error) {
    if (error.message?.includes('未找到')) throw error
    throw new Error('地点搜索失败，请检查密钥是否启用了 Maps JavaScript API 和 Geocoding API。')
  }
}
