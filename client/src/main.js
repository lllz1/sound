      const MAX_RECORD_SECONDS = 30;

      const $ = (id) => document.getElementById(id);
      const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      const hash = (value) => { let h = 2166136261; for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return Math.abs(h); };
      const makePeaks = (seed, count = 48) => Array.from({ length: count }, (_, i) => 0.16 + ((hash(seed + i) % 83) / 100));
      const PI = Math.PI;
      const GCJ_A = 6378245.0;
      const GCJ_EE = 0.00669342162296594323;
      const outOfChina = (lat, lng) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
      const transformLat = (x, y) => {
        let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
        value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
        value += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
        value += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
        return value;
      };
      const transformLng = (x, y) => {
        let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
        value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
        value += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
        value += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
        return value;
      };
      function wgsToGcj(lat, lng) {
        if (outOfChina(lat, lng)) return { lat, lng };
        let dLat = transformLat(lng - 105, lat - 35);
        let dLng = transformLng(lng - 105, lat - 35);
        const radLat = lat / 180 * PI;
        let magic = Math.sin(radLat);
        magic = 1 - GCJ_EE * magic * magic;
        const sqrtMagic = Math.sqrt(magic);
        dLat = (dLat * 180) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * PI);
        dLng = (dLng * 180) / (GCJ_A / sqrtMagic * Math.cos(radLat) * PI);
        return { lat: lat + dLat, lng: lng + dLng };
      }
      function gcjToWgs(lat, lng) {
        let result = { lat, lng };
        for (let i = 0; i < 5; i += 1) {
          const gcj = wgsToGcj(result.lat, result.lng);
          result = { lat: result.lat + (lat - gcj.lat), lng: result.lng + (lng - gcj.lng) };
        }
        return result;
      }
      const toMapPoint = (lat, lng) => {
        const point = wgsToGcj(lat, lng);
        return [point.lat, point.lng];
      };
      const fromMapPoint = (latlng) => gcjToWgs(latlng.lat, latlng.lng);
      let allTraces = [];
      let current = null;
      let map = null;
      let markers = new Map();
      let audioContext = null;
      let seedNodes = [];
      let seedTimer = null;
      let progressTimer = null;
      let audioPlayer = new Audio();
      let mediaRecorder = null;
      let mediaStream = null;
      let recordChunks = [];
      let recordStartedAt = 0;
      let recordTimer = null;
      let liveRaf = null;
      let liveAnalyser = null;
      let pendingBlob = null;
      let pendingPeaks = null;
      let pendingDuration = 0;
      let selectedLocation = null;
      let toastTimer = null;
      let userMarker = null;
      let accuracyCircle = null;
      let searchMarker = null;
      let locating = false;
      let editingTrace = null;
      let pendingDelete = null;
      let suppressMapClickUntil = 0;
      let projectionStream = null;
      let projectionRaf = null;
      let projectionLocation = null;
      let projectionHeading = 0;
      let projectionUseOrientation = true;
      let projectionHits = [];
      let projectionPhotoUrl = null;

      async function loadTraces() {
        const response = await fetch('/api/traces');
        if (!response.ok) throw new Error('无法加载声音节点');
        allTraces = await response.json();
      }

      function initMap() {
        if (!window.L) {
          $('map').innerHTML = '<div class="map-fallback">地图资源加载失败，请检查网络后刷新。</div>';
          return;
        }
        map = L.map('map', {
          zoomControl: false,
          attributionControl: true,
          center: toMapPoint(31.2304, 121.4737),
          zoom: 15,
          minZoom: 4,
          maxZoom: 18,
          zoomSnap: 0.5,
          zoomDelta: 0.5,
          wheelPxPerZoomLevel: 100,
        });
        const tileOptions = {
          maxZoom: 18,
          maxNativeZoom: 18,
          updateWhenZooming: false,
          keepBuffer: 4,
          subdomains: ['1', '2', '3', '4'],
          attribution: '&copy; 高德地图',
        };
        L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', tileOptions).addTo(map);
        L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 120 }).addTo(map);
        map.getContainer().querySelectorAll('.leaflet-control a').forEach((control) => {
          control.addEventListener('click', () => { suppressMapClickUntil = performance.now() + 650; }, true);
        });
        map.on('zoomend', updateZoom);
        map.on('click', (event) => {
          const target = event.originalEvent?.target;
          if (target && target.closest && target.closest('.leaflet-control')) return;
          const path = event.originalEvent?.composedPath?.() || [];
          if (path.some((node) => node instanceof Element && node.closest('.leaflet-control'))) return;
          if (performance.now() < suppressMapClickUntil) return;
          if (!$('recordModal').hidden) return;
          openRecord(fromMapPoint(event.latlng));
        });
        allTraces.forEach(addTraceMarker);
        renderRecent();
        updateZoom();
      }

      function locationIcon(className = 'user-marker') {
        return L.divIcon({
          className,
          html: `<div class="user-pin ${className === 'search-marker' ? 'search-pin' : ''}"><span class="user-pin__ring"></span><span class="user-pin__core"></span></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
      }

      const PROJECTION_FOV = 90;
      const PROJECTION_MAX_DISTANCE = 5000;

      function normalizeDegrees(value) {
        return ((value + 180) % 360 + 360) % 360 - 180;
      }

      function distanceMeters(lat1, lng1, lat2, lng2) {
        const radius = 6371000;
        const toRad = (value) => value * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 2 * radius * Math.asin(Math.sqrt(a));
      }

      function bearingDegrees(lat1, lng1, lat2, lng2) {
        const toRad = (value) => value * Math.PI / 180;
        const toDeg = (value) => value * 180 / Math.PI;
        const dLng = toRad(lng2 - lng1);
        const y = Math.sin(dLng) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
      }

      function setProjectionHeading(value) {
        projectionHeading = ((Number(value) % 360) + 360) % 360;
        $('projectionHeading').value = String(Math.round(projectionHeading));
        $('projectionHeadingLabel').textContent = `${Math.round(projectionHeading)}°`;
      }

      function renderProjection() {
        const stage = $('projectionStage');
        const canvas = $('projectionCanvas');
        if (!stage || !canvas) return;
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        projectionHits = [];
        if (!projectionLocation) return;

        const candidates = allTraces.map((trace) => {
          const distance = distanceMeters(projectionLocation.lat, projectionLocation.lng, trace.lat, trace.lng);
          const bearing = bearingDegrees(projectionLocation.lat, projectionLocation.lng, trace.lat, trace.lng);
          return { trace, distance, relative: normalizeDegrees(bearing - projectionHeading) };
        }).filter((item) => item.distance <= PROJECTION_MAX_DISTANCE && Math.abs(item.relative) <= PROJECTION_FOV / 2);

        $('projectionNearby').textContent = `附近 ${candidates.length} 段声音`;
        candidates.sort((a, b) => b.distance - a.distance);

        if (!candidates.length) {
          ctx.fillStyle = 'rgba(241, 246, 251, 0.6)';
          ctx.font = '600 13px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('这个方向暂时没有声音节点', width / 2, height * 0.32);
          ctx.font = '10px "Segoe UI", sans-serif';
          ctx.fillStyle = 'rgba(139, 154, 176, 0.7)';
          ctx.fillText('回到地图添加一段声音，或转动朝向试试', width / 2, height * 0.32 + 20);
          return;
        }

        for (const item of candidates) {
          const x = width / 2 + (item.relative / (PROJECTION_FOV / 2)) * (width / 2);
          const depth = Math.min(1, item.distance / PROJECTION_MAX_DISTANCE);
          const y = height * 0.72 - depth * height * 0.2;
          const scale = 1.1 - depth * 0.42;
          const radius = 20 * scale;
          ctx.save();
          ctx.translate(x, y);
          ctx.strokeStyle = 'rgba(126, 240, 210, 0.28)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, radius + 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(126, 240, 210, 0.16)';
          ctx.beginPath();
          ctx.arc(0, 0, radius + 17, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 209, 102, 0.95)';
          ctx.shadowColor = '#ffd166';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(0, 0, 6 * scale + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(126, 240, 210, 0.8)';
          for (let index = 0; index < 4; index += 1) {
            const barHeight = (7 + (item.trace.peaks?.[index] || 0.4) * 13) * scale;
            ctx.fillRect(-25 * scale + index * 5 * scale, -barHeight / 2, 2, barHeight);
          }
          ctx.fillStyle = '#f1f6fb';
          ctx.font = '600 12px "Segoe UI", "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(item.trace.title, radius + 12, 2);
          ctx.fillStyle = 'rgba(139, 154, 176, 0.9)';
          ctx.font = '9px "Segoe UI", "Microsoft YaHei", sans-serif';
          ctx.fillText(`${Math.round(item.distance)} m · ${item.trace.meta || ''}`.slice(0, 34), radius + 12, 17);
          ctx.restore();
          projectionHits.push({ trace: item.trace, x, y, radius: radius + 22 });
        }
        const nearby = candidates.length;
        $('projectionStatus').textContent = `现场投影 · 朝向 ${Math.round(projectionHeading)}° · ${nearby} 段声音`;
      }

      function projectionLoop() {
        if ($('projectionModal').hidden) return;
        renderProjection();
        projectionRaf = requestAnimationFrame(projectionLoop);
      }

      function stopProjectionCamera() {
        if (projectionStream) projectionStream.getTracks().forEach((track) => track.stop());
        projectionStream = null;
        $('sceneVideo').srcObject = null;
        $('sceneVideo').style.display = 'none';
        $('projectionCamera').textContent = '开启相机';
        if (!projectionPhotoUrl) $('projectionPlaceholder').hidden = false;
      }

      async function startProjectionCamera() {
        if (projectionStream) {
          stopProjectionCamera();
          $('projectionStatus').textContent = '相机已关闭，仍可使用照片投影';
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          showToast('当前浏览器不支持摄像头，请上传现场照片');
          return;
        }
        try {
          projectionStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
          const video = $('sceneVideo');
          video.srcObject = projectionStream;
          video.style.display = 'block';
          $('scenePhoto').style.display = 'none';
          $('projectionPlaceholder').hidden = true;
          $('projectionCamera').textContent = '关闭相机';
          await video.play();
          $('projectionStatus').textContent = '相机场景 · 正在寻找附近声音';
        } catch {
          projectionStream = null;
          showToast('无法开启摄像头，可以上传一张现场照片');
        }
      }

      function useProjectionPhoto(file) {
        if (!file) return;
        stopProjectionCamera();
        if (projectionPhotoUrl) URL.revokeObjectURL(projectionPhotoUrl);
        projectionPhotoUrl = URL.createObjectURL(file);
        $('scenePhoto').src = projectionPhotoUrl;
        $('scenePhoto').style.display = 'block';
        $('sceneVideo').style.display = 'none';
        $('projectionPlaceholder').hidden = true;
        $('projectionStatus').textContent = '照片场景 · 拖动朝向查看声音方向';
      }

      function locateProjection() {
        if (!navigator.geolocation) return showToast('当前浏览器不支持定位');
        $('projectionStatus').textContent = '正在获取当前位置…';
        navigator.geolocation.getCurrentPosition(
          (position) => {
            projectionLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
            $('projectionStatus').textContent = `已定位 · 精度约 ${Math.round(position.coords.accuracy)} 米`;
            renderProjection();
          },
          () => showToast('定位失败，可以在设置里允许位置权限'),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
      }

      function openProjection() {
        projectionLocation = map ? fromMapPoint(map.getCenter()) : { lat: 31.2304, lng: 121.4737 };
        projectionUseOrientation = true;
        setProjectionHeading(0);
        $('projectionModal').hidden = false;
        $('projectionPlaceholder').hidden = false;
        $('scenePhoto').style.display = 'none';
        $('sceneVideo').style.display = 'none';
        $('projectionStatus').textContent = '使用地图中心作为观察点，可重新定位';
        $('projectionNearby').textContent = '附近 0 段声音';
        projectionLoop();
      }

      function closeProjection() {
        stopProjectionCamera();
        if (projectionRaf) cancelAnimationFrame(projectionRaf);
        projectionRaf = null;
        projectionHits = [];
        if (projectionPhotoUrl) URL.revokeObjectURL(projectionPhotoUrl);
        projectionPhotoUrl = null;
        $('scenePhoto').removeAttribute('src');
        $('projectionModal').hidden = true;
      }

      function locateUser() {
        if (!navigator.geolocation) {
          showToast('当前浏览器不支持定位');
          return;
        }
        if (locating) return;
        locating = true;
        setLocateState(true);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            selectedLocation = { lat: latitude, lng: longitude };
            if (map) {
              const displayPoint = toMapPoint(latitude, longitude);
              if (userMarker) userMarker.setLatLng(displayPoint);
              else userMarker = L.marker(displayPoint, { icon: locationIcon(), title: '我的位置' }).addTo(map);
              if (accuracyCircle) {
                accuracyCircle.setLatLng(displayPoint);
                accuracyCircle.setRadius(Math.max(10, accuracy));
              } else {
                accuracyCircle = L.circle(displayPoint, {
                  radius: Math.max(10, accuracy), color: '#7ba8ff', weight: 1,
                  fillColor: '#7ba8ff', fillOpacity: 0.06, opacity: 0.35,
                }).addTo(map);
              }
              const zoom = accuracy < 80 ? 17 : accuracy < 250 ? 16 : 15;
              map.flyTo(displayPoint, Math.min(18, zoom), { duration: 1.2 });
            }
            if (!$('recordModal').hidden) {
              $('recordLocation').textContent = `当前位置 · ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            }
            locating = false;
            setLocateState(false);
            $('statusText').textContent = '已定位到当前位置';
            showToast(`已定位，精度约 ${Math.round(accuracy)} 米`);
          },
          (error) => {
            const messages = {
              1: '定位权限被拒绝，请在浏览器设置里允许位置权限',
              2: '暂时无法获取位置，请检查系统定位服务',
              3: '定位超时，请移动到信号更好的位置重试',
            };
            locating = false;
            setLocateState(false);
            showToast(messages[error.code] || '定位失败，请重试');
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
        );
      }

      function setLocateState(loading) {
        $('locateBtn').disabled = loading;
        $('locateLabel').textContent = loading ? '定位中…' : '定位到我';
      }

      async function searchPlace(event) {
        event.preventDefault();
        const query = $('searchInput').value.trim();
        const results = $('searchResults');
        if (query.length < 2) {
          results.hidden = false;
          results.innerHTML = '<div class="search-empty">请输入至少两个字</div>';
          return;
        }
        results.hidden = false;
        results.innerHTML = '<div class="search-empty">正在搜索地点…</div>';
        try {
          const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
          if (!response.ok) throw new Error('search failed');
          const data = await response.json();
          if (!data.length) throw new Error('empty');
          results.innerHTML = '';
          data.forEach((result) => {
            const button = document.createElement('button');
            button.className = 'search-result';
            const parts = String(result.display_name || '').split(',');
            button.innerHTML = `<strong>${escapeHtml(parts[0] || query)}</strong><span>${escapeHtml(result.display_name || '')}</span>`;
            button.addEventListener('click', () => chooseSearchResult(result));
            results.appendChild(button);
          });
        } catch {
          results.innerHTML = '<div class="search-empty">没有找到地点，或服务端搜索暂时不可用</div>';
        }
      }

      function chooseSearchResult(result) {
        const lat = Number(result.lat);
        const lng = Number(result.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        selectedLocation = { lat, lng };
        if (searchMarker) searchMarker.remove();
        if (map) {
          const displayPoint = toMapPoint(lat, lng);
          searchMarker = L.marker(displayPoint, { icon: locationIcon('search-marker'), title: '搜索位置' }).addTo(map);
          map.flyTo(displayPoint, 17.5, { duration: 1.2 });
        }
        $('searchResults').hidden = true;
        $('searchInput').value = String(result.display_name || '').split(',')[0] || '';
        if (!$('recordModal').hidden) {
          $('recordLocation').textContent = `搜索位置 · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
        showToast('已定位到搜索地点');
      }

      function markerIcon(trace) {
        const bars = (trace.peaks || []).slice(0, 5).map((peak) => `<span class="pin-bar" style="height:${Math.round(5 + peak * 13)}px"></span>`).join('');
        return L.divIcon({ className: 'sound-marker', html: `<div class="pin" data-id="${escapeHtml(trace.id)}"><span class="pin-ring"></span><span class="pin-core"></span><span class="pin-bars">${bars}</span></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
      }

      function addTraceMarker(trace) {
        if (!map) return;
        if (markers.has(trace.id)) {
          markers.get(trace.id).remove();
          markers.delete(trace.id);
        }
        const marker = L.marker(toMapPoint(trace.lat, trace.lng), { icon: markerIcon(trace), title: trace.title }).addTo(map);
        marker.on('click', () => selectTrace(trace));
        markers.set(trace.id, marker);
        updateCount();
      }

      function updateCount() {
        $('markerCount').textContent = `${allTraces.length} 段声音`;
        $('recentCount').textContent = String(allTraces.length);
      }

      function updateZoom() {
        if (!map) return;
        const zoom = map.getZoom();
        $('zoomLevel').textContent = `Z${Number.isInteger(zoom) ? zoom : zoom.toFixed(1)}`;
      }

      function renderWaveform(peaks) {
        const wave = $('waveform');
        wave.innerHTML = '';
        (peaks || makePeaks('empty')).forEach((peak) => {
          const bar = document.createElement('span');
          bar.className = 'wave-bar';
          bar.style.height = `${Math.max(8, Math.round(peak * 50))}px`;
          wave.appendChild(bar);
        });
      }

      function selectTrace(trace) {
        current = trace;
        stopPlayback();
        document.querySelectorAll('.pin').forEach((pin) => pin.classList.toggle('is-active', pin.dataset.id === trace.id));
        $('playerTitle').textContent = trace.title;
        $('playerMeta').textContent = trace.meta || trace.kindLabel || '声音记录';
        $('playerTime').textContent = formatTime(trace.duration || 0);
        $('playerKind').textContent = trace.kindLabel || (trace.type === 'seed' ? 'SEED SOUND' : 'MY RECORDING');
        $('playBtn').disabled = false;
        $('cardBtn').disabled = false;
        $('editBtn').disabled = false;
        $('deleteBtn').disabled = false;
        renderWaveform(trace.peaks);
        renderRecent();
        if (trace.type === 'recording' && trace.audioUrl) {
          audioPlayer.src = trace.audioUrl;
        } else {
          audioPlayer.removeAttribute('src');
        }
        map?.panTo(toMapPoint(trace.lat, trace.lng), { animate: true });
        $('statusDot').classList.add('is-live');
        $('statusText').textContent = '已选择一段声音';
      }

      function resetPlayer() {
        stopPlayback();
        current = null;
        document.querySelectorAll('.pin').forEach((pin) => pin.classList.remove('is-active'));
        $('playerTitle').textContent = '还没有选择声音';
        $('playerMeta').textContent = '点击地图上的光点';
        $('playerTime').textContent = '00:00';
        $('playerKind').textContent = 'LOCAL / SEED';
        $('playBtn').disabled = true;
        $('cardBtn').disabled = true;
        $('editBtn').disabled = true;
        $('deleteBtn').disabled = true;
        renderWaveform(makePeaks('empty'));
        audioPlayer.removeAttribute('src');
        $('statusDot').classList.remove('is-live');
        $('statusText').textContent = '等待一段声音';
      }

      function editCurrent() {
        if (!current) return;
        editingTrace = current;
        $('editName').value = current.title || '';
        $('editMeta').value = current.meta || '';
        $('editLat').value = Number(current.lat).toFixed(5);
        $('editLng').value = Number(current.lng).toFixed(5);
        $('editError').textContent = '';
        $('editModal').hidden = false;
      }

      async function saveEdit() {
        if (!editingTrace) return;
        const title = $('editName').value.trim() || '未命名声音';
        const meta = $('editMeta').value.trim();
        const lat = Number($('editLat').value);
        const lng = Number($('editLng').value);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          $('editError').textContent = '请输入有效的经纬度。';
          return;
        }
        try {
          const response = await fetch(`/api/traces/${encodeURIComponent(editingTrace.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, meta: meta || '声音节点', lat, lng }),
          });
          if (!response.ok) throw new Error('更新失败');
          Object.assign(editingTrace, await response.json());
          addTraceMarker(editingTrace);
          selectTrace(editingTrace);
          $('editModal').hidden = true;
          editingTrace = null;
          showToast('声音节点已更新');
        } catch {
          $('editError').textContent = '更新失败，请检查服务端连接。';
        }
      }

      function deleteCurrent() {
        if (!current) return;
        pendingDelete = current;
        $('deleteName').textContent = `「${current.title}」`;
        $('deleteModal').hidden = false;
      }

      async function performDelete() {
        if (!pendingDelete) return;
        const trace = pendingDelete;
        pendingDelete = null;
        $('deleteModal').hidden = true;
        try {
          const response = await fetch(`/api/traces/${encodeURIComponent(trace.id)}`, { method: 'DELETE' });
          if (!response.ok) throw new Error('删除失败');
          stopPlayback();
          if (markers.has(trace.id)) {
            markers.get(trace.id).remove();
            markers.delete(trace.id);
          }
          allTraces = allTraces.filter((item) => item.id !== trace.id);
          updateCount();
          resetPlayer();
          renderRecent();
          showToast('声音节点已删除');
        } catch {
          showToast('删除失败，请检查服务端连接');
        }
      }

      function togglePlay() {
        if (!current) return;
        if (current.type === 'seed') {
          if (seedNodes.length) stopPlayback();
          else playSeed(current);
        } else if (audioPlayer.paused) {
          audioPlayer.play().then(() => setPlaying(true)).catch(() => showToast('浏览器阻止了播放，请再点一次'));
        } else {
          audioPlayer.pause();
          setPlaying(false);
        }
      }

      function setPlaying(playing) {
        $('playBtn').textContent = playing ? 'Ⅱ' : '▶';
        $('waveform').classList.toggle('is-playing', playing);
        $('statusDot').classList.toggle('is-live', playing);
        $('statusText').textContent = playing ? '正在播放一段声音' : '等待一段声音';
      }

      function stopPlayback() {
        seedNodes.forEach((node) => { try { node.stop(); } catch {} });
        seedNodes = [];
        clearTimeout(seedTimer);
        clearInterval(progressTimer);
        audioPlayer.pause();
        setPlaying(false);
      }

      function ensureAudioContext() {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume();
        return audioContext;
      }

      function playSeed(trace) {
        const ctx = ensureAudioContext();
        const start = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.value = 0.16;
        master.connect(ctx.destination);
        const nodes = [];
        const tone = (frequency, offset, duration, type = 'sine', volume = 0.2) => {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.type = type;
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start + offset);
          gain.gain.linearRampToValueAtTime(volume, start + offset + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, start + offset + duration);
          oscillator.connect(gain).connect(master);
          oscillator.start(start + offset);
          oscillator.stop(start + offset + duration + 0.05);
          nodes.push(oscillator);
        };
        if (trace.kind === 'bell') {
          [523, 659, 784, 1046].forEach((frequency, index) => tone(frequency, index * 0.16, 2.8, 'sine', 0.16 - index * 0.02));
        } else if (trace.kind === 'street') {
          [220, 330, 440].forEach((frequency, index) => tone(frequency, index * 0.2, 2.4, 'triangle', 0.08));
          tone(660, 0.7, 1.1, 'sine', 0.04);
        } else if (trace.kind === 'metro') {
          tone(72, 0, 2.6, 'sawtooth', 0.16);
          tone(110, 0.6, 1.9, 'triangle', 0.08);
          tone(54, 1.4, 1.6, 'sine', 0.12);
        } else if (trace.kind === 'wind') {
          tone(196, 0, 3.2, 'sine', 0.06);
          tone(294, 0.8, 2.4, 'triangle', 0.04);
        } else {
          [880, 1174, 1318].forEach((frequency, index) => tone(frequency, index * 0.22, 1.8, 'sine', 0.1));
        }
        seedNodes = nodes;
        setPlaying(true);
        $('playerTime').textContent = formatTime(trace.duration);
        const started = performance.now();
        progressTimer = setInterval(() => {
          const elapsed = Math.min(trace.duration, (performance.now() - started) / 1000);
          $('playerTime').textContent = formatTime(trace.duration - elapsed);
        }, 120);
        seedTimer = setTimeout(() => { stopPlayback(); $('playerTime').textContent = formatTime(trace.duration); }, trace.duration * 1000);
      }

      audioPlayer.addEventListener('ended', () => { setPlaying(false); if (current) $('playerTime').textContent = formatTime(current.duration || 0); });
      audioPlayer.addEventListener('timeupdate', () => { if (current) $('playerTime').textContent = formatTime(Math.max(0, (current.duration || 0) - audioPlayer.currentTime)); });

      function renderRecent() {
        const list = $('recentList');
        list.innerHTML = '';
        allTraces.slice(-5).reverse().forEach((trace) => {
          const button = document.createElement('button');
          button.className = `recent-item ${current?.id === trace.id ? 'is-active' : ''}`;
          button.innerHTML = `<span class="recent-icon">${trace.type === 'seed' ? '◉' : '●'}</span><span class="recent-copy"><strong>${escapeHtml(trace.title)}</strong><span>${escapeHtml(trace.meta || trace.kindLabel || '')}</span></span>`;
          button.addEventListener('click', () => selectTrace(trace));
          list.appendChild(button);
        });
      }

      function openRecord(latlng) {
        selectedLocation = latlng || map?.getCenter() || { lat: 31.2304, lng: 121.4737 };
        $('recordLocation').textContent = `地图位置 · ${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`;
        $('recordModal').hidden = false;
        $('titleInput').value = '';
        $('recordError').textContent = '';
        resetRecordState();
      }

      function resetRecordState() {
        stopRecording();
        pendingBlob = null;
        pendingPeaks = null;
        pendingDuration = 0;
        $('saveRecord').disabled = true;
        $('modalRecordBtn').textContent = '开始录音';
        $('recordTimer').textContent = '00:00';
        $('recordPreview').hidden = true;
        $('recordPreview').removeAttribute('src');
        clearLiveWave();
      }

      function closeRecord() {
        stopRecording();
        $('recordModal').hidden = true;
      }

      async function startRecording() {
        if (!navigator.mediaDevices?.getUserMedia) {
          $('recordError').textContent = '当前浏览器不支持麦克风录音，请使用 Chrome 或 Edge。';
          return;
        }
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
          mediaRecorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
          recordChunks = [];
          mediaRecorder.ondataavailable = (event) => { if (event.data.size) recordChunks.push(event.data); };
          mediaRecorder.onstop = finalizeRecording;
          mediaRecorder.start();
          recordStartedAt = performance.now();
          pendingBlob = null;
          pendingPeaks = null;
          $('saveRecord').disabled = true;
          $('modalRecordBtn').textContent = '停止录音';
          $('recordError').textContent = '';
          $('recordPreview').hidden = true;
          $('statusText').textContent = '正在录音';
          $('statusDot').classList.add('is-live');
          const ctx = ensureAudioContext();
          liveAnalyser = ctx.createAnalyser();
          liveAnalyser.fftSize = 512;
          const source = ctx.createMediaStreamSource(mediaStream);
          source.connect(liveAnalyser);
          recordTimer = setInterval(() => {
            const elapsed = (performance.now() - recordStartedAt) / 1000;
            $('recordTimer').textContent = formatTime(Math.min(elapsed, MAX_RECORD_SECONDS));
            if (elapsed >= MAX_RECORD_SECONDS) stopRecording();
          }, 100);
          drawLiveWave();
        } catch (error) {
          $('recordError').textContent = '无法使用麦克风，请检查浏览器权限。';
          stopRecording();
        }
      }

      function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
        clearInterval(recordTimer);
        recordTimer = null;
        if (liveRaf) cancelAnimationFrame(liveRaf);
        liveRaf = null;
        $('modalRecordBtn').textContent = '开始录音';
      }

      function finalizeRecording() {
        if (!recordChunks.length) return;
        const blob = new Blob(recordChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
        pendingBlob = blob;
        pendingDuration = Math.min(MAX_RECORD_SECONDS, (performance.now() - recordStartedAt) / 1000);
        $('recordPreview').src = URL.createObjectURL(blob);
        $('recordPreview').hidden = false;
        $('saveRecord').disabled = false;
        $('recordTimer').textContent = formatTime(pendingDuration);
        analyzeBlob(blob).then((peaks) => { pendingPeaks = peaks; }).catch(() => { pendingPeaks = makePeaks('recording'); });
        $('statusText').textContent = '录音完成，等待保存';
      }

      async function analyzeBlob(blob) {
        const ctx = ensureAudioContext();
        const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
        const data = buffer.getChannelData(0);
        const peaks = [];
        const step = Math.max(1, Math.floor(data.length / 48));
        for (let i = 0; i < 48; i += 1) {
          let max = 0;
          for (let j = 0; j < step; j += 1) max = Math.max(max, Math.abs(data[i * step + j] || 0));
          peaks.push(Math.min(1, Math.max(0.08, max)));
        }
        return peaks;
      }

      function drawLiveWave() {
        const canvas = $('liveWave');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        if (!liveAnalyser) return;
        const data = new Uint8Array(liveAnalyser.frequencyBinCount);
        const draw = () => {
          liveAnalyser.getByteTimeDomainData(data);
          ctx.clearRect(0, 0, width, height);
          ctx.strokeStyle = 'rgba(126, 240, 210, 0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const slice = width / data.length;
          data.forEach((value, index) => {
            const x = index * slice;
            const y = height / 2 + ((value - 128) / 128) * (height * 0.36);
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();
          liveRaf = requestAnimationFrame(draw);
        };
        draw();
      }

      function clearLiveWave() {
        const canvas = $('liveWave');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(126, 240, 210, 0.2)';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }

      async function saveRecording() {
        if (!pendingBlob || !selectedLocation) {
          $('recordError').textContent = '还没有可保存的录音。';
          return;
        }
        const title = $('titleInput').value.trim() || '未命名声音';
        const form = new FormData();
        form.append('audio', pendingBlob, `soundtrace-${Date.now()}.webm`);
        form.append('title', title);
        form.append('meta', `现场录音 · ${formatTime(pendingDuration)}`);
        form.append('lat', String(selectedLocation.lat));
        form.append('lng', String(selectedLocation.lng));
        form.append('duration', String(pendingDuration));
        form.append('peaks', JSON.stringify(pendingPeaks || makePeaks('recording')));
        $('saveRecord').disabled = true;
        try {
          const response = await fetch('/api/traces', { method: 'POST', body: form });
          if (!response.ok) throw new Error('上传失败');
          const trace = await response.json();
          allTraces.push(trace);
          addTraceMarker(trace);
          selectTrace(trace);
          closeRecord();
          showToast('声音已经留在这一带');
        } catch {
          $('recordError').textContent = '上传失败，请检查服务端是否启动。';
        } finally {
          $('saveRecord').disabled = false;
        }
      }

      function exportCard(trace) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
        gradient.addColorStop(0, '#0c1926');
        gradient.addColorStop(0.55, '#07111d');
        gradient.addColorStop(1, '#050a11');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1080, 1350);
        ctx.fillStyle = 'rgba(126, 240, 210, 0.12)';
        ctx.beginPath();
        ctx.arc(840, 210, 280, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7ef0d2';
        ctx.font = '600 24px "Segoe UI", sans-serif';
        ctx.fillText('SOUND TRACE / 声迹', 82, 104);
        ctx.fillStyle = '#f1f6fb';
        ctx.font = '500 68px Georgia, "Songti SC", serif';
        wrapText(ctx, trace.title, 82, 240, 820, 78);
        ctx.fillStyle = '#8b9ab0';
        ctx.font = '28px "Segoe UI", sans-serif';
        ctx.fillText(trace.meta || trace.kindLabel || '', 86, 390);
        const peaks = trace.peaks || makePeaks(trace.id);
        const barWidth = 760 / peaks.length;
        peaks.forEach((peak, index) => {
          const height = Math.max(20, peak * 220);
          ctx.fillStyle = index % 5 === 0 ? '#ffd166' : 'rgba(126, 240, 210, 0.78)';
          ctx.fillRect(86 + index * barWidth, 770 - height / 2, Math.max(4, barWidth - 5), height);
        });
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '22px "Cascadia Code", Consolas, monospace';
        ctx.fillText(`${trace.lat.toFixed(4)}, ${trace.lng.toFixed(4)}`, 86, 1130);
        ctx.fillStyle = '#f1f6fb';
        ctx.font = '26px "Segoe UI", sans-serif';
        ctx.fillText('声音留在发生的地方', 86, 1215);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(86, 1248, 908, 1);
        const link = document.createElement('a');
        link.download = `soundtrace-${trace.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('声音明信片已生成');
      }

      function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const chars = Array.from(text);
        let line = '';
        let currentY = y;
        chars.forEach((char) => {
          const test = line + char;
          if (ctx.measureText(test).width > maxWidth && line) {
            ctx.fillText(line, x, currentY);
            line = char;
            currentY += lineHeight;
          } else line = test;
        });
        if (line) ctx.fillText(line, x, currentY);
      }

      function showToast(message) {
        const toast = $('toast');
        toast.textContent = message;
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
      }

      $('recordBtn').addEventListener('click', () => openRecord(map ? fromMapPoint(map.getCenter()) : null));
      $('demoBtn').addEventListener('click', () => {
        if (!allTraces.length) return showToast('地图上还没有声音节点');
        selectTrace(allTraces[0]);
        playSeed(allTraces[0]);
      });
      $('projectBtn').addEventListener('click', openProjection);
      $('closeProjection').addEventListener('click', closeProjection);
      $('projectionCamera').addEventListener('click', startProjectionCamera);
      $('projectionLocate').addEventListener('click', locateProjection);
      $('projectionUpload').addEventListener('click', () => $('projectionPhotoInput').click());
      $('projectionPhotoInput').addEventListener('change', (event) => useProjectionPhoto(event.target.files?.[0]));
      $('projectionHeading').addEventListener('input', (event) => {
        projectionUseOrientation = false;
        setProjectionHeading(event.target.value);
        renderProjection();
      });
      $('projectionStage').addEventListener('click', (event) => {
        const rect = $('projectionStage').getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const hit = projectionHits.find((item) => Math.hypot(item.x - x, item.y - y) <= item.radius);
        if (hit) {
          selectTrace(hit.trace);
          togglePlay();
        }
      });
      $('playBtn').addEventListener('click', togglePlay);
      $('cardBtn').addEventListener('click', () => current && exportCard(current));
      $('editBtn').addEventListener('click', editCurrent);
      $('deleteBtn').addEventListener('click', deleteCurrent);
      $('confirmDelete').addEventListener('click', performDelete);
      $('cancelDelete').addEventListener('click', () => { $('deleteModal').hidden = true; pendingDelete = null; });
      $('closeDelete').addEventListener('click', () => { $('deleteModal').hidden = true; pendingDelete = null; });
      $('saveEdit').addEventListener('click', saveEdit);
      $('cancelEdit').addEventListener('click', () => { $('editModal').hidden = true; editingTrace = null; });
      $('closeEdit').addEventListener('click', () => { $('editModal').hidden = true; editingTrace = null; });
      $('useMapCenter').addEventListener('click', () => {
        if (!map) return;
        const center = fromMapPoint(map.getCenter());
        $('editLat').value = center.lat.toFixed(5);
        $('editLng').value = center.lng.toFixed(5);
      });
      $('searchForm').addEventListener('submit', searchPlace);
      $('locateBtn').addEventListener('click', locateUser);
      $('zoomIn').addEventListener('click', () => map?.zoomIn(0.5));
      $('zoomOut').addEventListener('click', () => map?.zoomOut(0.5));
      $('modalRecordBtn').addEventListener('click', () => { if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording(); else startRecording(); });
      $('saveRecord').addEventListener('click', saveRecording);
      $('cancelRecord').addEventListener('click', closeRecord);
      $('closeRecord').addEventListener('click', closeRecord);
      $('helpBtn').addEventListener('click', () => { $('helpModal').hidden = false; });
      $('closeHelp').addEventListener('click', () => { $('helpModal').hidden = true; });
      $('helpDone').addEventListener('click', () => { $('helpModal').hidden = true; });
      document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { event.target.parentElement.hidden = true; }));
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        closeRecord();
        $('helpModal').hidden = true;
        $('editModal').hidden = true;
        $('deleteModal').hidden = true;
        $('searchResults').hidden = true;
        closeProjection();
        editingTrace = null;
        pendingDelete = null;
        stopPlayback();
      });

      const handleProjectionOrientation = (event) => {
        if (!$('projectionModal').hidden && projectionUseOrientation && event.alpha != null) {
          setProjectionHeading((360 - event.alpha + 360) % 360);
          renderProjection();
        }
      };
      window.addEventListener('deviceorientationabsolute', handleProjectionOrientation, true);
      window.addEventListener('deviceorientation', handleProjectionOrientation, true);

      async function bootstrap() {
        renderWaveform(makePeaks('empty'));
        clearLiveWave();
        try {
          await loadTraces();
        } catch {
          showToast('无法连接声音服务，请确认后端已经启动');
        }
        initMap();
      }

      bootstrap();
