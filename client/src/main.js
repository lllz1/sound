      import * as maplibregl from 'maplibre-gl'
      import 'maplibre-gl/dist/maplibre-gl.css'
      import { STREET_CAMERA_PRESETS, nextStreetCamera, verticalFieldOfView } from './street3d-camera.js'

      maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

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
      let recordMediaType = 'audio';
      let pendingMediaType = 'audio';
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
      let projectionFov = 90;
      let projectionPitch = 0;
      const projectionCameraHeight = 1.7;
      let projectionUseOrientation = true;
      let projectionHits = [];
      let projectionPhotoUrl = null;
      let street3dMap = null;
      let street3dMarkers = [];
      let street3dActive = false;
      let street3dUserMarker = null;
      let street3dStatus = '加载中';
      let street3dError = '';
      let street3dHeightScale = 1;
      let street3dLight = 0.6;
      let street3dPreset = 'street';
      let street3dSyncingCamera = false;
      let street3dTerrain = false;
      let street3dTheme = 'clear';
      let street3dAppliedPitch = 0;
      let street3dLoadTimer = null;
      let amap3dActive = false;
      let amap3dScene = null;
      let amap3dRequestId = 0;
      let amap3dStatus = '等待配置';
      let real3dActive = false;
      let real3dScene = null;
      let real3dRequestId = 0;
      let real3dStatus = '等待配置';
      let real3dKey = '';
      try { real3dKey = localStorage.getItem('soundtrace-google-maps-key') || ''; } catch { /* storage may be disabled */ }

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

      function updateProjectionStatus(text) {
        if ($('projectionStatus').textContent !== text) $('projectionStatus').textContent = text;
      }

      function renderProjection() {
        const stage = $('projectionStage');
        const canvas = $('projectionCanvas');
        if (!stage || !canvas) return;
        projectionHits = [];
        if (!projectionLocation) return;
        if (street3dActive) {
          updateProjectionStatus(`3D街景 · ${street3dStatus}${street3dError ? `：${street3dError}` : ''} · 视野 ${projectionFov}° · ${street3dMarkers.length} 段`);
          return;
        }
        if (amap3dActive) {
          updateProjectionStatus(`高德3D · ${amap3dStatus} · 视野 ${projectionFov}°`);
          return;
        }
        if (real3dActive) {
          updateProjectionStatus(`实景3D · ${real3dStatus} · 视野 ${projectionFov}°`);
          return;
        }
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
        const activeFov = Number($('projectionFov').value) || projectionFov;
        const fovRad = activeFov * Math.PI / 180;
        const focal = width / (2 * Math.tan(fovRad / 2));
        const horizon = Math.max(
          height * 0.25,
          Math.min(height * 0.75, height * 0.5 + Math.tan(projectionPitch * Math.PI / 180) * focal * 0.35),
        );

        ctx.save();
        ctx.strokeStyle = 'rgba(126, 240, 210, 0.075)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, horizon);
        ctx.lineTo(width, horizon);
        ctx.stroke();
        for (let index = -6; index <= 6; index += 1) {
          ctx.beginPath();
          ctx.moveTo(width / 2 + index * width * 0.018, horizon);
          ctx.lineTo(width / 2 + index * width * 0.13, height);
          ctx.stroke();
        }
        for (let index = 1; index <= 5; index += 1) {
          const ratio = index / 6;
          const y = horizon + (height - horizon) * ratio * ratio;
          ctx.globalAlpha = 0.35 + ratio * 0.4;
          ctx.beginPath();
          ctx.moveTo(width * 0.06, y);
          ctx.lineTo(width * 0.94, y);
          ctx.stroke();
        }
        ctx.restore();

        const candidates = allTraces.map((trace) => {
          const distance = distanceMeters(projectionLocation.lat, projectionLocation.lng, trace.lat, trace.lng);
          const bearing = bearingDegrees(projectionLocation.lat, projectionLocation.lng, trace.lat, trace.lng);
          return { trace, distance, relative: normalizeDegrees(bearing - projectionHeading) };
        }).filter((item) => item.distance <= PROJECTION_MAX_DISTANCE && Math.abs(item.relative) <= activeFov / 2);

        $('projectionNearby').textContent = `附近 ${candidates.length} 段声音`;
        candidates.sort((a, b) => b.distance - a.distance);

        $('projectionStatus').textContent = `现场投影 · 朝向 ${Math.round(projectionHeading)}° · 视野 ${activeFov}° · ${candidates.length} 段声音`;

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
          const relativeRad = item.relative * Math.PI / 180;
          const x = width / 2 + focal * Math.tan(relativeRad);
          if (x < -80 || x > width + 80) continue;
          const forward = Math.max(1, item.distance * Math.cos(relativeRad));
          const groundY = Math.min(height * 1.08, horizon + (projectionCameraHeight * focal) / forward);
          const scale = Math.max(0.3, Math.min(1.35, 140 / (item.distance + 70)));
          const nodeY = Math.min(height * 0.94, groundY - 34 * scale);
          const depth = Math.min(1, item.distance / PROJECTION_MAX_DISTANCE);
          const radius = 18 * scale;
          ctx.save();
          ctx.globalAlpha = 0.45 + (1 - depth) * 0.55;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
          ctx.beginPath();
          ctx.ellipse(x, groundY, 28 * scale, 7 * scale, 0, 0, Math.PI * 2);
          ctx.fill();
          const beacon = ctx.createLinearGradient(x, groundY, x, nodeY);
          beacon.addColorStop(0, 'rgba(126, 240, 210, 0.04)');
          beacon.addColorStop(0.65, 'rgba(126, 240, 210, 0.28)');
          beacon.addColorStop(1, 'rgba(255, 209, 102, 0.7)');
          ctx.strokeStyle = beacon;
          ctx.lineWidth = Math.max(1, 2 * scale);
          ctx.beginPath();
          ctx.moveTo(x, groundY);
          ctx.lineTo(x, nodeY);
          ctx.stroke();
          ctx.save();
          ctx.translate(x, nodeY);
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
          const labelRight = x < width * 0.7;
          ctx.textAlign = labelRight ? 'left' : 'right';
          const labelX = labelRight ? radius + 12 : -radius - 12;
          ctx.fillText(item.trace.title, labelX, 2);
          ctx.fillStyle = 'rgba(139, 154, 176, 0.9)';
          ctx.font = '9px "Segoe UI", "Microsoft YaHei", sans-serif';
          ctx.fillText(`${Math.round(item.distance)} m · ${item.trace.meta || ''}`.slice(0, 34), labelX, 17);
          ctx.restore();
          ctx.restore();
          projectionHits.push({ trace: item.trace, x, y: nodeY, radius: radius + 22 });
        }
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
        setAmap3DMode(false);
        setReal3DMode(false);
        setStreet3DMode(false);
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
        setAmap3DMode(false);
        setReal3DMode(false);
        setStreet3DMode(false);
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
            if (street3dActive) {
              updateStreet3DMarkers();
              updateStreet3DRoute(current);
              syncStreet3DView('recenter');
            }
            if (real3dActive) {
              updateReal3DMarkers();
              syncReal3DView();
              $('real3dHint').textContent = `已定位，精度约 ${Math.round(position.coords.accuracy)} 米；实景数据覆盖因地点而异。`;
            }
            if (amap3dActive) {
              updateAmap3DMarkers();
              syncAmap3DView();
              $('amap3dHint').textContent = `已定位，精度约 ${Math.round(position.coords.accuracy)} 米；建筑覆盖以高德当地数据为准。`;
            }
          },
          () => showToast('定位失败，可以在设置里允许位置权限'),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
      }

      function openProjection() {
        setAmap3DMode(false);
        setReal3DMode(false);
        setStreet3DMode(false);
        projectionLocation = map ? fromMapPoint(map.getCenter()) : { lat: 31.2304, lng: 121.4737 };
        projectionUseOrientation = true;
        setProjectionHeading(0);
        $('projectionFov').value = String(projectionFov);
        $('projectionFovLabel').textContent = `${projectionFov}°`;
        $('projectionPitch').value = String(projectionPitch);
        $('projectionPitchLabel').textContent = `${projectionPitch}°`;
        $('projectionHeight').value = String(street3dHeightScale);
        $('projectionHeightLabel').textContent = `${street3dHeightScale.toFixed(1)}×`;
        $('projectionLight').value = String(street3dLight);
        $('projectionLightLabel').textContent = street3dLight.toFixed(2);
        $('street3dLoading').hidden = true;
        document.querySelectorAll('[data-camera-preset]').forEach((button) => {
          button.classList.toggle('is-active', button.dataset.cameraPreset === street3dPreset);
        });
        $('projectionTerrain').classList.toggle('is-active', street3dTerrain);
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
        setAmap3DMode(false);
        setReal3DMode(false);
        setStreet3DMode(false);
        clearTimeout(street3dLoadTimer);
        if (street3dMap) {
          street3dMap.remove();
          street3dMap = null;
        }
        street3dMarkers = [];
        street3dUserMarker = null;
        if (projectionRaf) cancelAnimationFrame(projectionRaf);
        projectionRaf = null;
        projectionHits = [];
        if (projectionPhotoUrl) URL.revokeObjectURL(projectionPhotoUrl);
        projectionPhotoUrl = null;
        $('scenePhoto').removeAttribute('src');
        $('projectionModal').hidden = true;
      }

      function destinationPoint(lat, lng, bearing, distance) {
        const radius = 6371000;
        const angular = distance / radius;
        const theta = bearing * Math.PI / 180;
        const phi1 = lat * Math.PI / 180;
        const lambda1 = lng * Math.PI / 180;
        const phi2 = Math.asin(Math.sin(phi1) * Math.cos(angular) + Math.cos(phi1) * Math.sin(angular) * Math.cos(theta));
        const lambda2 = lambda1 + Math.atan2(
          Math.sin(theta) * Math.sin(angular) * Math.cos(phi1),
          Math.cos(angular) - Math.sin(phi1) * Math.sin(phi2),
        );
        return { lat: phi2 * 180 / Math.PI, lng: ((lambda2 * 180 / Math.PI + 540) % 360) - 180 };
      }

      function applyStreet3DFov() {
        if (!street3dMap) return;
        const canvas = street3dMap.getCanvas();
        const vertical = verticalFieldOfView(projectionFov, canvas.clientWidth, canvas.clientHeight);
        if (vertical != null && Math.abs(street3dMap.getVerticalFieldOfView() - vertical) > 0.01) {
          street3dMap.setVerticalFieldOfView(vertical);
        }
      }

      function syncStreet3DView(action = 'recenter') {
        if (!street3dMap || !projectionLocation) return;
        if (action === 'fov') { applyStreet3DFov(); return; }
        const preset = STREET_CAMERA_PRESETS[street3dPreset] || STREET_CAMERA_PRESETS.street;
        const ahead = action === 'recenter' ? destinationPoint(projectionLocation.lat, projectionLocation.lng, projectionHeading, preset.offset) : null;
        const view = nextStreetCamera({
          action, preset: street3dPreset, heading: projectionHeading, pitch: projectionPitch,
          previousPitch: street3dAppliedPitch, currentPitch: street3dMap.getPitch(),
          center: ahead ? [ahead.lng, ahead.lat] : null,
        });
        street3dSyncingCamera = true;
        try { street3dMap.jumpTo(view); } finally { street3dSyncingCamera = false; }
        if (action === 'pitch' || action === 'preset' || action === 'recenter') street3dAppliedPitch = projectionPitch;
        if (action === 'preset' || action === 'recenter') applyStreet3DFov();
      }

      function updateStreet3DMarkers() {
        if (!street3dMap || !projectionLocation) return;
        street3dMarkers.forEach((marker) => marker.remove());
        street3dMarkers = [];
        if (street3dUserMarker) street3dUserMarker.remove();
        const observer = document.createElement('div');
        observer.className = 'street3d-observer';
        observer.title = '观察点';
        observer.setAttribute('aria-label', '观察点');
        observer.innerHTML = '<span></span><small>观察点</small>';
        street3dUserMarker = new maplibregl.Marker({ element: observer, anchor: 'center' })
          .setLngLat([projectionLocation.lng, projectionLocation.lat])
          .addTo(street3dMap);

        const nearby = allTraces
          .map((trace) => ({
            trace,
            distance: distanceMeters(projectionLocation.lat, projectionLocation.lng, trace.lat, trace.lng),
          }))
          .filter((item) => item.distance <= PROJECTION_MAX_DISTANCE)
          .sort((a, b) => a.distance - b.distance);
        $('street3dNearbyTitle').textContent = `附近 ${nearby.length} 条记录`;
        const list = $('street3dNearbyList');
        list.replaceChildren();
        if (!nearby.length) {
          const empty = document.createElement('div');
          empty.className = 'street3d-nearby__empty';
          empty.textContent = '附近还没有记录';
          list.appendChild(empty);
        }
        nearby.forEach(({ trace, distance }) => {
          const button = document.createElement('button');
          const title = document.createElement('span');
          const range = document.createElement('span');
          button.type = 'button';
          button.dataset.id = trace.id;
          title.textContent = trace.title;
          range.textContent = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
          button.append(title, range);
          button.addEventListener('click', () => activateStreetTrace(trace, true));
          list.appendChild(button);
        });

        [...nearby].reverse()
          .forEach(({ trace, distance }) => {
            const element = document.createElement('button');
            const mediaType = trace.mediaType || 'audio';
            element.type = 'button';
            element.className = `street-node-marker ${mediaType === 'video' ? 'is-video' : mediaType === 'image' ? 'is-image' : ''}`;
            element.dataset.id = trace.id;
            element.setAttribute('aria-label', `${trace.title}，距离观察点 ${Math.round(distance)} 米`);
            if (current?.id === trace.id) element.classList.add('is-selected');
            element.innerHTML = `<span class="street-node-marker__ring"></span><span class="street-node-marker__core"></span><span class="street-node-marker__label">${escapeHtml(trace.title)}<small>${Math.round(distance)} m · ${escapeHtml(trace.meta || '')}</small></span>`;
            element.addEventListener('click', (event) => {
              event.stopPropagation();
              activateStreetTrace(trace);
            });
            const marker = new maplibregl.Marker({ element, anchor: 'center' })
              .setLngLat([trace.lng, trace.lat])
              .addTo(street3dMap);
            street3dMarkers.push(marker);
          });
        $('projectionNearby').textContent = `附近 ${street3dMarkers.length} 段声音`;
        refreshStreet3DMarkerSides();
        updateStreet3DSelection();
      }

      function refreshStreet3DMarkerSides() {
        if (!street3dMap) return;
        const width = street3dMap.getContainer().clientWidth;
        street3dMarkers.forEach((marker) => {
          const element = marker.getElement();
          const label = element.querySelector('.street-node-marker__label');
          const point = street3dMap.project(marker.getLngLat());
          element.classList.toggle('is-left', point.x + 30 + (label?.offsetWidth || 0) > width - 12);
        });
      }

      function activateStreetTrace(trace, focus = false) {
        if (focus && street3dMap) street3dMap.easeTo({ center: [trace.lng, trace.lat], zoom: Math.max(16.8, street3dMap.getZoom()), duration: 700 });
        if (current?.id !== trace.id) selectTrace(trace);
        togglePlay();
      }

      function syncStreet3DInspector() {
        const selected = $('street3dSelected');
        selected.hidden = !street3dActive || !current;
        if (!current) return;
        $('street3dSelectedTitle').textContent = current.title;
        const mediaType = current.mediaType || 'audio';
        $('street3dPlay').textContent = mediaType === 'audio' ? ($('playBtn').textContent === 'Ⅱ' ? (current.type === 'seed' ? '停止' : '暂停') : '播放') : '查看';
      }

      function updateStreet3DSelection() {
        street3dMarkers.forEach((marker) => {
          marker.getElement().classList.toggle('is-selected', marker.getElement().dataset.id === current?.id);
        });
        $('street3dNearbyList').querySelectorAll('button').forEach((button) => button.classList.toggle('is-selected', button.dataset.id === current?.id));
        syncStreet3DInspector();
      }

      function updateStreet3DRoute(trace) {
        if (!street3dMap || !projectionLocation) return;
        const source = street3dMap.getSource('soundtrace-route');
        if (!source) return;
        const coordinates = trace
          ? [[projectionLocation.lng, projectionLocation.lat], [trace.lng, trace.lat]]
          : [];
        source.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: {},
        });
      }

      function initializeStreet3D() {
        if (street3dMap || !projectionLocation) return;
        street3dStatus = '加载中';
        street3dError = '';
        $('street3dRetry').hidden = true;
        $('street3dLoading').hidden = false;
        const ahead = destinationPoint(projectionLocation.lat, projectionLocation.lng, projectionHeading, 90);
        street3dMap = new maplibregl.Map({
          container: 'street3d',
          style: 'https://tiles.openfreemap.org/styles/dark',
          transformStyle: (_previous, next) => ({
            ...next,
            layers: next.layers.map((layer) => {
              if (layer.id !== 'landcover_wood' || !layer.paint) return layer;
              const { 'fill-pattern': _missingPattern, ...paint } = layer.paint;
              return { ...layer, paint };
            }),
          }),
          center: [ahead.lng, ahead.lat],
          zoom: 17.6,
          pitch: 68,
          bearing: projectionHeading,
          attributionControl: true,
          antialias: true,
          maxPitch: 80,
        });
        street3dMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'bottom-right');
        street3dMap.on('load', () => {
          clearTimeout(street3dLoadTimer);
          $('street3dRetry').hidden = true;
          street3dStatus = '数据已加载';
          street3dError = '';
          $('street3dLoading').hidden = true;
          applyStreet3DTerrain();
          if (street3dMap.getLayer('soundtrace-3d-buildings')) return;
          const labelLayer = street3dMap.getStyle().layers.find((layer) => layer.id.startsWith('highway_name') && layer.type === 'symbol')?.id;
          street3dMap.addLayer({
            id: 'soundtrace-3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': '#708581',
              'fill-extrusion-height': buildingHeightExpression(),
              'fill-extrusion-base': buildingBaseExpression(),
              'fill-extrusion-opacity': 1,
              'fill-extrusion-vertical-gradient': true,
            },
          }, labelLayer);
          street3dMap.addLayer({
            id: 'soundtrace-3d-outline',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'line',
            minzoom: 14,
            paint: {
              'line-color': 'rgba(126, 240, 210, 0.22)',
              'line-width': 0.6,
              'line-opacity': 0.5,
            },
          }, labelLayer);
          street3dMap.addSource('soundtrace-route', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
          });
          street3dMap.addLayer({
            id: 'soundtrace-route-shadow',
            type: 'line',
            source: 'soundtrace-route',
            paint: { 'line-color': '#08131a', 'line-width': 5, 'line-opacity': 0.7 },
          });
          street3dMap.addLayer({
            id: 'soundtrace-route-line',
            type: 'line',
            source: 'soundtrace-route',
            paint: {
              'line-color': '#ffd166',
              'line-width': 2.5,
              'line-opacity': 0.9,
              'line-dasharray': [1, 2],
            },
          });
          applyStreet3DTheme();
          updateStreet3DMarkers();
          updateStreet3DRoute(current);
          if (street3dActive) syncStreet3DView('fov');
          renderProjection();
        });
        street3dMap.on('error', (event) => {
          street3dStatus = '部分数据不可用';
          street3dError = '请检查网络';
          $('street3dLoading').hidden = true;
          $('street3dRetry').hidden = false;
          console.warn('3D street map error', event?.error);
          renderProjection();
        });
        street3dMap.on('rotate', () => {
          if (!street3dActive || street3dSyncingCamera) return;
          const bearing = street3dMap.getBearing();
          if (Math.abs(normalizeDegrees(bearing - projectionHeading)) > 1.5) {
            setProjectionHeading(bearing);
            renderProjection();
          }
        });
        street3dMap.on('moveend', refreshStreet3DMarkerSides);
        street3dMap.on('resize', applyStreet3DFov);
      }

      function scheduleStreet3DTimeout() {
        clearTimeout(street3dLoadTimer);
        street3dLoadTimer = setTimeout(() => {
          if (!street3dActive || !street3dMap || street3dMap.isStyleLoaded()) return;
          street3dStatus = '加载超时';
          street3dError = '请检查网络后重试';
          $('street3dLoading').hidden = true;
          $('street3dRetry').hidden = false;
          renderProjection();
        }, 18000);
      }

      function retryStreet3D() {
        if (!street3dActive) return;
        clearTimeout(street3dLoadTimer);
        if (street3dMap) street3dMap.remove();
        street3dMap = null;
        street3dMarkers = [];
        street3dUserMarker = null;
        initializeStreet3D();
        updateStreet3DMarkers();
        syncStreet3DView('recenter');
        scheduleStreet3DTimeout();
        renderProjection();
      }

      function buildingHeightExpression() {
        return ['min', ['*', ['max', 3, ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height'], 8], 8]], street3dHeightScale], 260];
      }

      function buildingBaseExpression() {
        return ['max', 0, ['min', ['*', ['to-number', ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0], 0], street3dHeightScale], ['-', buildingHeightExpression(), 0.1]]];
      }

      function applyStreet3DTheme() {
        if (!street3dMap || !street3dMap.getLayer('soundtrace-3d-buildings')) return;
        const clear = street3dTheme === 'clear';
        const palette = clear ? {
          background: '#17272e', water: '#205063', residential: '#2a3d3d', park: '#315a44', wood: '#274a3b',
          path: '#687c79', road: '#52646a', major: '#758282', casing: '#9da9a0',
          text: '#e6ede7', halo: '#263b40', buildings: ['#647a73', '#7b8d84', '#a2b1a5', '#c1c8b9'],
          sky: '#5a7881', horizon: '#9fb3ad', fog: '#293e43',
        } : {
          background: '#0c1922', water: '#153547', residential: '#142b35', park: '#1b3e35', wood: '#19372f',
          path: '#4d626d', road: '#344d5b', major: '#4e6976', casing: '#6e8087',
          text: '#c8d8df', halo: '#10212b', buildings: ['#284655', '#3b5a68', '#5d7a86', '#859ca0'],
          sky: '#102834', horizon: '#315261', fog: '#101f2b',
        };
        const paint = (id, property, value) => {
          if (street3dMap.getLayer(id)) street3dMap.setPaintProperty(id, property, value);
        };
        paint('background', 'background-color', palette.background);
        paint('water', 'fill-color', palette.water);
        paint('waterway', 'line-color', palette.water);
        paint('landuse_residential', 'fill-color', palette.residential);
        paint('landuse_park', 'fill-color', palette.park);
        paint('landcover_wood', 'fill-pattern', null);
        paint('landcover_wood', 'fill-color', palette.wood);
        paint('highway_path', 'line-color', palette.path);
        paint('highway_minor', 'line-color', palette.road);
        paint('highway_major_inner', 'line-color', palette.major);
        paint('highway_motorway_inner', 'line-color', palette.major);
        paint('highway_major_casing', 'line-color', palette.casing);
        paint('highway_motorway_casing', 'line-color', palette.casing);
        paint('soundtrace-3d-buildings', 'fill-extrusion-color', [
          'interpolate', ['linear'], ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height'], 8], 8],
          0, palette.buildings[0], 20, palette.buildings[1], 60, palette.buildings[2], 140, palette.buildings[3],
        ]);
        paint('soundtrace-3d-outline', 'line-color', clear ? 'rgba(205, 228, 213, 0.3)' : 'rgba(126, 210, 215, 0.3)');
        street3dMap.getStyle().layers.filter((layer) => layer.type === 'symbol' && layer.layout?.['text-field']).forEach((layer) => {
          paint(layer.id, 'text-color', palette.text);
          paint(layer.id, 'text-halo-color', palette.halo);
          paint(layer.id, 'text-halo-width', 0.8);
        });
        try {
          street3dMap.setSky({ 'sky-color': palette.sky, 'horizon-color': palette.horizon, 'fog-color': palette.fog, 'sky-horizon-blend': 0.72, 'horizon-fog-blend': 0.85, 'atmosphere-blend': 0.6 });
        } catch (error) { console.warn('Sky style unavailable', error); }
        applyStreet3DLight();
      }

      function applyStreet3DLight() {
        if (!street3dMap) return;
        try {
          street3dMap.setLight({
            anchor: 'map',
            position: [1.1, 215, 38],
            color: street3dTheme === 'clear' ? '#fff2dc' : '#cfe6ff',
            intensity: street3dLight,
          });
        } catch (error) {
          console.warn('Light style unavailable', error);
        }
      }

      function updateStreet3DBuildings() {
        if (!street3dMap || !street3dMap.getLayer('soundtrace-3d-buildings')) return;
        street3dMap.setPaintProperty('soundtrace-3d-buildings', 'fill-extrusion-height', buildingHeightExpression());
        street3dMap.setPaintProperty('soundtrace-3d-buildings', 'fill-extrusion-base', buildingBaseExpression());
      }

      function applyStreet3DTerrain() {
        if (!street3dMap) return;
        try {
          if (!street3dTerrain) {
            street3dMap.setTerrain(null);
            return;
          }
          if (!street3dMap.getSource('terrain-dem')) {
            street3dMap.addSource('terrain-dem', {
              type: 'raster-dem',
              tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
              encoding: 'terrarium',
              tileSize: 256,
              maxzoom: 14,
              attribution: 'Terrain: Mapzen / AWS',
            });
          }
          street3dMap.setTerrain({ source: 'terrain-dem', exaggeration: 1 });
        } catch (error) {
          console.warn('Terrain unavailable', error);
        }
      }

      function setStreet3DMode(active) {
        if (active && amap3dActive) setAmap3DMode(false);
        if (active && real3dActive) setReal3DMode(false);
        street3dActive = active;
        $('street3d').hidden = !active;
        $('street3dPanel').hidden = !active;
        $('projectionCanvas').style.display = active ? 'none' : 'block';
        $('projection3d').textContent = active ? '退出3D' : '3D街景';
        $('projectionNearby').style.display = active ? 'none' : '';
        if (active) {
          stopProjectionCamera();
          $('scenePhoto').style.display = 'none';
          $('projectionPlaceholder').hidden = true;
          initializeStreet3D();
          if (street3dMap && !street3dMap.isStyleLoaded()) scheduleStreet3DTimeout();
          setTimeout(() => {
            if (!street3dActive || !street3dMap) return;
            street3dMap?.resize();
            updateStreet3DMarkers();
            updateStreet3DRoute(current);
            syncStreet3DView('recenter');
          }, 60);
          syncStreet3DInspector();
          $('projectionStatus').textContent = '3D街景 · 建筑数据来自 OpenStreetMap';
        } else {
          clearTimeout(street3dLoadTimer);
          $('street3dLoading').hidden = true;
          syncStreet3DInspector();
          if (!projectionStream && !projectionPhotoUrl) $('projectionPlaceholder').hidden = false;
        }
      }

      function refreshProjectionControls() {
        $('projectionTerrain').disabled = real3dActive || amap3dActive;
        $('projectionHeight').disabled = real3dActive;
        $('projectionLight').disabled = real3dActive || amap3dActive;
        $('projectionTerrain').title = real3dActive ? '实景模型包含原始地形，无法单独调整' : amap3dActive ? '高德楼块模式暂不支持此地形开关' : '开启高程地形；如画面出现突起，可再次点击关闭';
        $('projectionHeight').title = real3dActive ? '实景建筑使用原始高度' : '';
        $('projectionLight').title = real3dActive ? '实景纹理使用原始光照' : amap3dActive ? '高德地图光照不支持此滑杆' : '';
      }

      function setAmap3DStatus(status, hint) {
        amap3dStatus = status;
        if (hint) $('amap3dHint').textContent = hint;
        renderProjection();
      }

      function syncAmap3DView() {
        if (!amap3dActive || !amap3dScene || !projectionLocation) return;
        amap3dScene.updateView({ location: projectionLocation, heading: projectionHeading, pitch: projectionPitch, fov: projectionFov, preset: street3dPreset });
      }

      function updateAmap3DMarkers() {
        if (!amap3dScene || !projectionLocation) return;
        const nearby = allTraces.map((trace) => ({ trace, distance: distanceMeters(projectionLocation.lat, projectionLocation.lng, trace.lat, trace.lng) }))
          .filter((item) => item.distance <= PROJECTION_MAX_DISTANCE);
        amap3dScene.updateMarkers(nearby, current?.id);
      }

      async function connectAmap3D() {
        const requestId = ++amap3dRequestId;
        setAmap3DStatus('正在连接', '正在准备高德三维地图…');
        try {
          const response = await fetch('/api/amap/config', { cache: 'no-store' });
          if (!response.ok) throw new Error('无法读取高德配置，请确认本地服务已启动。');
          const config = await response.json();
          if (!amap3dActive || requestId !== amap3dRequestId) return;
          if (!config.configured || !config.key) {
            setAmap3DStatus('等待配置', '请复制项目中的 .env.example 为 .env，填写高德 Web Key 和安全密钥，再重新进入高德3D。');
            return;
          }
          const { loadAmap, createAmapScene } = await import('./amap-scene.js');
          const AMap = await loadAmap(config.key);
          if (!amap3dActive || requestId !== amap3dRequestId) return;
          amap3dScene = createAmapScene(AMap, $('amap3d'), {
            location: projectionLocation,
            toAmap: wgsToGcj,
            heightScale: street3dHeightScale,
            onSelect: (trace) => { selectTrace(trace); togglePlay(); },
            onStatus: (status, hint) => {
              if (amap3dActive && requestId === amap3dRequestId) setAmap3DStatus(status, hint);
            },
          });
          updateAmap3DMarkers();
          syncAmap3DView();
        } catch (error) {
          if (!amap3dActive || requestId !== amap3dRequestId) return;
          amap3dScene?.destroy();
          amap3dScene = null;
          setAmap3DStatus('连接失败', error.message || '高德地图加载失败，请检查网络和配置。');
        }
      }

      function setAmap3DMode(active) {
        if (active && real3dActive) setReal3DMode(false);
        if (active && street3dActive) setStreet3DMode(false);
        amap3dActive = active;
        $('amap3d').hidden = !active;
        $('amap3dTools').hidden = !active;
        $('projectionAmap3d').textContent = active ? '退出高德3D' : '高德3D';
        $('projectionAmap3d').classList.toggle('is-active', active);
        $('projectionCanvas').style.display = (active || street3dActive || real3dActive) ? 'none' : 'block';
        $('projectionNearby').style.display = (active || street3dActive || real3dActive) ? 'none' : '';
        refreshProjectionControls();
        if (active) {
          stopProjectionCamera();
          $('scenePhoto').style.display = 'none';
          $('projectionPlaceholder').hidden = true;
          connectAmap3D();
        } else {
          amap3dRequestId += 1;
          amap3dScene?.destroy();
          amap3dScene = null;
          if (!street3dActive && !real3dActive && !projectionStream && !projectionPhotoUrl) $('projectionPlaceholder').hidden = false;
        }
      }

      function real3dSetStatus(status, hint) {
        real3dStatus = status;
        if (hint) $('real3dHint').textContent = hint;
        renderProjection();
      }

      function syncReal3DView() {
        if (!real3dActive || !real3dScene || !projectionLocation) return;
        real3dScene.updateView({ location: projectionLocation, heading: projectionHeading, pitch: projectionPitch, fov: projectionFov, preset: street3dPreset });
      }

      function updateReal3DMarkers() {
        if (!real3dScene || !projectionLocation) return;
        const nearby = allTraces.filter((trace) => distanceMeters(projectionLocation.lat, projectionLocation.lng, trace.lat, trace.lng) <= PROJECTION_MAX_DISTANCE);
        real3dScene.updateMarkers(projectionLocation, nearby, current?.id);
      }

      async function connectReal3D() {
        const requestId = ++real3dRequestId;
        real3dScene?.destroy();
        real3dScene = null;
        if (!real3dActive || !real3dKey) return;
        real3dSetStatus('正在连接', '正在加载实景三维，请稍候…');
        let timeout;
        try {
          const { createRealScene } = await import('./real-scene.js');
          if (!real3dActive || requestId !== real3dRequestId) return;
          real3dScene = createRealScene($('real3d'), {
            key: real3dKey,
            onSelect: (trace) => { selectTrace(trace); togglePlay(); },
            onStatus: (status, hint) => {
              if (real3dActive && requestId === real3dRequestId) real3dSetStatus(status, hint);
            },
          });
          updateReal3DMarkers();
          syncReal3DView();
          real3dScene.resize();
          await Promise.race([
            real3dScene.ready,
            new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 25000); }),
          ]);
        } catch {
          if (!real3dActive || requestId !== real3dRequestId) return;
          real3dScene?.destroy();
          real3dScene = null;
          real3dSetStatus('连接失败', '请检查网络、Key、Map Tiles API 和结算状态；也可切换到 3D 街景。');
          $('real3dSettingsPanel').hidden = false;
        } finally {
          clearTimeout(timeout);
        }
      }

      function setReal3DMode(active) {
        if (active && amap3dActive) setAmap3DMode(false);
        if (active && street3dActive) setStreet3DMode(false);
        real3dActive = active;
        $('real3d').hidden = !active;
        $('real3dTools').hidden = !active;
        $('projectionReal3d').textContent = active ? '退出实景3D' : '实景3D';
        $('projectionReal3d').classList.toggle('is-active', active);
        $('projectionCanvas').style.display = (active || street3dActive) ? 'none' : 'block';
        $('projectionNearby').style.display = (active || street3dActive) ? 'none' : '';
        refreshProjectionControls();
        if (active) {
          stopProjectionCamera();
          $('scenePhoto').style.display = 'none';
          $('projectionPlaceholder').hidden = true;
          $('real3dKey').value = '';
          $('real3dSettingsPanel').hidden = Boolean(real3dKey);
          if (real3dKey) connectReal3D();
          else real3dSetStatus('等待密钥', '请先设置 Google Maps API Key。');
        } else {
          real3dRequestId += 1;
          real3dScene?.destroy();
          real3dScene = null;
          $('real3dKey').value = '';
          if (!street3dActive && !projectionStream && !projectionPhotoUrl) $('projectionPlaceholder').hidden = false;
        }
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
        const mediaType = trace.mediaType || 'audio';
        if (mediaType !== 'audio') {
          const glyph = mediaType === 'video' ? '▶' : '◧';
          return L.divIcon({ className: 'sound-marker', html: `<div class="pin pin-media pin-${mediaType}" data-id="${escapeHtml(trace.id)}"><span class="pin-ring"></span><span class="pin-core"></span><span class="pin-glyph">${glyph}</span></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
        }
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
        $('markerCount').textContent = `${allTraces.length} 条记录`;
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
        const mediaType = trace.mediaType || (trace.type === 'seed' ? 'audio' : 'audio');
        const kindLabels = { audio: 'AUDIO', video: 'VIDEO', image: 'PHOTO' };
        $('playerKind').textContent = trace.kindLabel ? `${trace.kindLabel} / ${kindLabels[mediaType]}` : (trace.type === 'seed' ? 'SEED SOUND' : kindLabels[mediaType]);
        $('playBtn').disabled = false;
        $('cardBtn').disabled = false;
        $('editBtn').disabled = false;
        $('deleteBtn').disabled = false;
        $('waveform').style.display = mediaType === 'audio' ? 'flex' : 'none';
        renderWaveform(trace.peaks);
        renderRecent();
        if (mediaType === 'audio' && (trace.mediaUrl || trace.audioUrl)) {
          audioPlayer.src = trace.mediaUrl || trace.audioUrl;
        } else {
          audioPlayer.removeAttribute('src');
        }
        $('playBtn').textContent = '▶';
        map?.panTo(toMapPoint(trace.lat, trace.lng), { animate: true });
        if (street3dActive) {
          updateStreet3DRoute(trace);
          updateStreet3DSelection();
        }
        if (real3dActive) updateReal3DMarkers();
        if (amap3dActive) updateAmap3DMarkers();
        $('statusDot').classList.add('is-live');
        $('statusText').textContent = mediaType === 'image' ? '已选择一张照片' : mediaType === 'video' ? '已选择一段视频' : '已选择一段声音';
      }

      function openMediaViewer(trace) {
        const mediaType = trace.mediaType || 'audio';
        const mediaUrl = trace.mediaUrl || trace.audioUrl;
        if (!mediaUrl || mediaType === 'audio') return;
        $('mediaViewerTitle').textContent = trace.title;
        $('mediaViewerMeta').textContent = trace.meta || '';
        $('mediaViewerVideo').hidden = mediaType !== 'video';
        $('mediaViewerImage').hidden = mediaType !== 'image';
        $('mediaViewerVideo').removeAttribute('src');
        $('mediaViewerImage').removeAttribute('src');
        if (mediaType === 'video') $('mediaViewerVideo').src = mediaUrl;
        else $('mediaViewerImage').src = mediaUrl;
        $('mediaViewerModal').hidden = false;
      }

      function resetPlayer() {
        stopPlayback();
        current = null;
        document.querySelectorAll('.pin').forEach((pin) => pin.classList.remove('is-active'));
        $('playerTitle').textContent = '还没有选择声音';
        $('playerMeta').textContent = '点击地图上的光点';
        $('playerTime').textContent = '00:00';
        $('playerKind').textContent = 'LOCAL / SEED';
        $('waveform').style.display = 'flex';
        $('playBtn').disabled = true;
        $('cardBtn').disabled = true;
        $('editBtn').disabled = true;
        $('deleteBtn').disabled = true;
        renderWaveform(makePeaks('empty'));
        audioPlayer.removeAttribute('src');
        $('statusDot').classList.remove('is-live');
        $('statusText').textContent = '等待一段声音';
        if (street3dActive) {
          updateStreet3DRoute(null);
          updateStreet3DSelection();
        }
        if (real3dActive) updateReal3DMarkers();
        if (amap3dActive) updateAmap3DMarkers();
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
        const mediaType = current.mediaType || 'audio';
        if (mediaType === 'video' || mediaType === 'image') {
          openMediaViewer(current);
          return;
        }
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
        syncStreet3DInspector();
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
          const mediaType = trace.mediaType || 'audio';
          const icon = mediaType === 'video' ? '▶' : mediaType === 'image' ? '◧' : trace.type === 'seed' ? '◉' : '●';
          button.innerHTML = `<span class="recent-icon recent-${mediaType}">${icon}</span><span class="recent-copy"><strong>${escapeHtml(trace.title)}</strong><span>${escapeHtml(trace.meta || trace.kindLabel || '')}</span></span>`;
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
        setRecordMediaType('audio');
      }

      function updateRecordButtonText(recording = false) {
        if (recordMediaType === 'image') {
          $('modalRecordBtn').textContent = pendingBlob ? '重新拍摄' : '开启相机';
          return;
        }
        if (recording) {
          $('modalRecordBtn').textContent = recordMediaType === 'video' ? '停止录像' : '停止录音';
          return;
        }
        $('modalRecordBtn').textContent = recordMediaType === 'video' ? '开始录像' : '开始录音';
      }

      function setRecordMediaType(type) {
        recordMediaType = ['audio', 'video', 'image'].includes(type) ? type : 'audio';
        document.querySelectorAll('.media-type-tabs button').forEach((button) => {
          const active = button.dataset.mediaType === recordMediaType;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-selected', String(active));
        });
        $('chooseImage').hidden = recordMediaType !== 'image';
        $('recordNote').textContent = recordMediaType === 'image'
          ? '可以拍摄一张现场照片，或从相册选择。图片会保存到 SoundTrace 服务端。'
          : recordMediaType === 'video'
            ? '最长 30 秒。视频会保存到 SoundTrace 服务端，其他设备也能播放。'
            : '最长 30 秒。音频会保存到 SoundTrace 服务端，其他设备也能播放。';
        resetRecordState();
      }

      function resetRecordState() {
        stopRecording();
        pendingBlob = null;
        pendingPeaks = null;
        pendingDuration = 0;
        pendingMediaType = recordMediaType;
        $('saveRecord').disabled = true;
        $('recordTimer').textContent = '00:00';
        $('recordPreview').hidden = true;
        $('recordPreview').removeAttribute('src');
        $('recordVideoPlayback').hidden = true;
        $('recordVideoPlayback').removeAttribute('src');
        $('recordImagePlayback').hidden = true;
        $('recordImagePlayback').removeAttribute('src');
        $('recordVideoPreview').hidden = true;
        $('recordImagePreview').hidden = true;
        $('liveWave').hidden = recordMediaType !== 'audio';
        $('chooseImage').hidden = recordMediaType !== 'image';
        updateRecordButtonText(false);
        clearLiveWave();
      }

      function closeRecord() {
        stopRecording();
        $('recordModal').hidden = true;
      }

      async function startRecording() {
        if (recordMediaType === 'image') {
          if (mediaStream) {
            captureImage();
          } else {
            await startImageCamera();
          }
          return;
        }
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          stopRecording();
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          $('recordError').textContent = '当前浏览器不支持媒体录制，请使用 Chrome 或 Edge。';
          return;
        }
        try {
          const isVideo = recordMediaType === 'video';
          mediaStream = await navigator.mediaDevices.getUserMedia(isVideo
            ? { video: { facingMode: { ideal: 'environment' } }, audio: true }
            : { audio: true });
          const mimeCandidates = isVideo
            ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
            : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
          const mime = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
          mediaRecorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
          recordChunks = [];
          mediaRecorder.ondataavailable = (event) => { if (event.data.size) recordChunks.push(event.data); };
          mediaRecorder.onstop = finalizeRecording;
          mediaRecorder.start();
          recordStartedAt = performance.now();
          pendingBlob = null;
          pendingPeaks = null;
          pendingMediaType = recordMediaType;
          $('saveRecord').disabled = true;
          updateRecordButtonText(true);
          $('recordError').textContent = '';
          $('recordPreview').hidden = true;
          $('recordVideoPlayback').hidden = true;
          $('recordImagePlayback').hidden = true;
          if (isVideo) {
            $('liveWave').hidden = true;
            $('recordVideoPreview').srcObject = mediaStream;
            $('recordVideoPreview').hidden = false;
          } else {
            $('liveWave').hidden = false;
            $('recordVideoPreview').hidden = true;
          }
          $('statusText').textContent = isVideo ? '正在录像' : '正在录音';
          $('statusDot').classList.add('is-live');
          if (!isVideo) {
            const ctx = ensureAudioContext();
            liveAnalyser = ctx.createAnalyser();
            liveAnalyser.fftSize = 512;
            const source = ctx.createMediaStreamSource(mediaStream);
            source.connect(liveAnalyser);
            drawLiveWave();
          }
          recordTimer = setInterval(() => {
            const elapsed = (performance.now() - recordStartedAt) / 1000;
            $('recordTimer').textContent = formatTime(Math.min(elapsed, MAX_RECORD_SECONDS));
            if (elapsed >= MAX_RECORD_SECONDS) stopRecording();
          }, 100);
        } catch (error) {
          $('recordError').textContent = recordMediaType === 'video' ? '无法使用摄像头和麦克风，请检查浏览器权限。' : '无法使用麦克风，请检查浏览器权限。';
          stopRecording();
        }
      }

      function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
        $('recordVideoPreview').srcObject = null;
        $('recordVideoPreview').hidden = true;
        clearInterval(recordTimer);
        recordTimer = null;
        if (liveRaf) cancelAnimationFrame(liveRaf);
        liveRaf = null;
        updateRecordButtonText(false);
      }

      function finalizeRecording() {
        if (!recordChunks.length) return;
        const isVideo = pendingMediaType === 'video';
        const blob = new Blob(recordChunks, { type: mediaRecorder?.mimeType || (isVideo ? 'video/webm' : 'audio/webm') });
        pendingBlob = blob;
        pendingDuration = Math.min(MAX_RECORD_SECONDS, (performance.now() - recordStartedAt) / 1000);
        const url = URL.createObjectURL(blob);
        if (isVideo) {
          $('recordVideoPlayback').src = url;
          $('recordVideoPlayback').hidden = false;
        } else {
          $('recordPreview').src = url;
          $('recordPreview').hidden = false;
        }
        $('saveRecord').disabled = false;
        $('recordTimer').textContent = formatTime(pendingDuration);
        if (!isVideo) {
          analyzeBlob(blob).then((peaks) => { pendingPeaks = peaks; }).catch(() => { pendingPeaks = makePeaks('recording'); });
        }
        $('statusText').textContent = isVideo ? '录像完成，等待保存' : '录音完成，等待保存';
      }

      async function startImageCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
          $('recordError').textContent = '当前浏览器不支持摄像头，请从相册选择图片。';
          return;
        }
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
          const preview = $('recordVideoPreview');
          preview.srcObject = mediaStream;
          preview.hidden = false;
          $('liveWave').hidden = true;
          $('recordImagePreview').hidden = true;
          $('modalRecordBtn').textContent = '拍摄';
          $('recordError').textContent = '';
          await preview.play();
          $('statusText').textContent = '相机已开启，点击拍摄';
        } catch {
          $('recordError').textContent = '无法开启摄像头，请检查浏览器权限，或从相册选择图片。';
        }
      }

      function captureImage() {
        const video = $('recordVideoPreview');
        if (!video.videoWidth) {
          $('recordError').textContent = '相机还没有准备好，请稍等再拍。';
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return;
          pendingBlob = blob;
          pendingMediaType = 'image';
          pendingDuration = 0;
          const url = URL.createObjectURL(blob);
          $('recordImagePreview').src = url;
          $('recordImagePreview').hidden = false;
          $('recordImagePlayback').src = url;
          $('recordImagePlayback').hidden = false;
          $('saveRecord').disabled = false;
          if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
          mediaStream = null;
          video.srcObject = null;
          video.hidden = true;
          $('modalRecordBtn').textContent = '重新开启相机';
          $('recordError').textContent = '';
          $('statusText').textContent = '照片已拍下，等待保存';
        }, 'image/jpeg', 0.9);
      }

      function useSelectedImage(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          $('recordError').textContent = '请选择图片文件。';
          return;
        }
        if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
        $('recordVideoPreview').srcObject = null;
        $('recordVideoPreview').hidden = true;
        pendingBlob = file;
        pendingMediaType = 'image';
        pendingDuration = 0;
        const url = URL.createObjectURL(file);
        $('recordImagePreview').src = url;
        $('recordImagePreview').hidden = false;
        $('recordImagePlayback').src = url;
        $('recordImagePlayback').hidden = false;
        $('saveRecord').disabled = false;
        $('modalRecordBtn').textContent = '重新选择/拍摄';
        $('recordError').textContent = '';
        $('statusText').textContent = '图片已选择，等待保存';
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
          $('recordError').textContent = '还没有可保存的媒体。';
          return;
        }
        const title = $('titleInput').value.trim() || '未命名声音';
        const ext = pendingMediaType === 'video' ? 'webm' : pendingMediaType === 'image' ? (pendingBlob.type.includes('png') ? 'png' : 'jpg') : 'webm';
        const form = new FormData();
        form.append('media', pendingBlob, `soundtrace-${Date.now()}.${ext}`);
        form.append('title', title);
        form.append('mediaType', pendingMediaType);
        form.append('meta', pendingMediaType === 'image' ? '现场照片' : pendingMediaType === 'video' ? `现场视频 · ${formatTime(pendingDuration)}` : `现场录音 · ${formatTime(pendingDuration)}`);
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
          showToast(pendingMediaType === 'image' ? '照片已经留在这一带' : pendingMediaType === 'video' ? '视频已经留在这一带' : '声音已经留在这一带');
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
      $('projection3d').addEventListener('click', () => setStreet3DMode(!street3dActive));
      $('street3dRecenter').addEventListener('click', () => syncStreet3DView('recenter'));
      $('street3dRetry').addEventListener('click', retryStreet3D);
      $('street3dPlay').addEventListener('click', togglePlay);
      document.querySelectorAll('[data-street-theme]').forEach((button) => {
        button.addEventListener('click', () => {
          street3dTheme = button.dataset.streetTheme;
          document.querySelectorAll('[data-street-theme]').forEach((item) => {
            const active = item === button;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-pressed', String(active));
          });
          applyStreet3DTheme();
        });
      });
      $('projectionAmap3d').addEventListener('click', () => setAmap3DMode(!amap3dActive));
      $('projectionReal3d').addEventListener('click', () => setReal3DMode(!real3dActive));
      $('real3dSettings').addEventListener('click', () => {
        $('real3dSettingsPanel').hidden = !$('real3dSettingsPanel').hidden;
      });
      $('real3dSaveKey').addEventListener('click', () => {
        const key = $('real3dKey').value.trim();
        if (key.length < 8 || key.length > 256 || /\s/.test(key)) {
          $('real3dHint').textContent = '请输入有效格式的 API Key。';
          return;
        }
        real3dKey = key;
        try { localStorage.setItem('soundtrace-google-maps-key', key); } catch { showToast('浏览器未允许保存密钥，本次仍可尝试连接'); }
        $('real3dKey').value = '';
        $('real3dSettingsPanel').hidden = true;
        connectReal3D();
      });
      $('real3dClearKey').addEventListener('click', () => {
        try { localStorage.removeItem('soundtrace-google-maps-key'); } catch { /* storage may be disabled */ }
        real3dKey = '';
        real3dRequestId += 1;
        real3dScene?.destroy();
        real3dScene = null;
        $('real3dKey').value = '';
        $('real3dSettingsPanel').hidden = false;
        real3dSetStatus('等待密钥', '本浏览器保存的密钥已清除。');
      });
      $('real3dSearch').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!real3dKey) {
          $('real3dSettingsPanel').hidden = false;
          real3dSetStatus('等待密钥', '请先设置 Google Maps API Key。');
          return;
        }
        const query = $('real3dSearchInput').value.trim();
        if (!query) return;
        const requestId = real3dRequestId;
        $('real3dHint').textContent = '正在搜索地点…';
        try {
          const { geocodeWithGoogle } = await import('./google-geocoder.js');
          const place = await geocodeWithGoogle(real3dKey, query);
          if (!real3dActive || requestId !== real3dRequestId) return;
          projectionLocation = { lat: place.lat, lng: place.lng };
          updateReal3DMarkers();
          syncReal3DView();
          $('real3dHint').textContent = `已定位到 ${place.name}。实景数据覆盖因地点而异。`;
        } catch (error) {
          if (real3dActive && requestId === real3dRequestId) $('real3dHint').textContent = error.message || '搜索失败，请稍后重试。';
        }
      });
      $('projectionLocate').addEventListener('click', locateProjection);
      $('projectionUpload').addEventListener('click', () => $('projectionPhotoInput').click());
      $('projectionPhotoInput').addEventListener('change', (event) => useProjectionPhoto(event.target.files?.[0]));
      document.querySelectorAll('.media-type-tabs button').forEach((button) => {
        button.addEventListener('click', () => setRecordMediaType(button.dataset.mediaType));
      });
      $('chooseImage').addEventListener('click', () => $('recordImageInput').click());
      $('recordImageInput').addEventListener('change', (event) => useSelectedImage(event.target.files?.[0]));
      $('closeMediaViewer').addEventListener('click', () => {
        $('mediaViewerVideo').pause();
        $('mediaViewerVideo').removeAttribute('src');
        $('mediaViewerImage').removeAttribute('src');
        $('mediaViewerModal').hidden = true;
      });
      $('projectionHeading').addEventListener('input', (event) => {
        projectionUseOrientation = false;
        setProjectionHeading(event.target.value);
        renderProjection();
        if (street3dActive) syncStreet3DView('heading');
        if (real3dActive) syncReal3DView();
        if (amap3dActive) syncAmap3DView();
      });
      $('projectionFov').addEventListener('input', (event) => {
        projectionFov = Number(event.target.value);
        $('projectionFovLabel').textContent = `${projectionFov}°`;
        renderProjection();
        if (street3dActive) syncStreet3DView('fov');
        if (real3dActive) syncReal3DView();
        if (amap3dActive) syncAmap3DView();
      });
      $('projectionPitch').addEventListener('input', (event) => {
        projectionPitch = Number(event.target.value);
        $('projectionPitchLabel').textContent = `${projectionPitch}°`;
        renderProjection();
        if (street3dActive) syncStreet3DView('pitch');
        if (real3dActive) syncReal3DView();
        if (amap3dActive) syncAmap3DView();
      });
      $('projectionHeight').addEventListener('input', (event) => {
        street3dHeightScale = Number(event.target.value);
        $('projectionHeightLabel').textContent = `${street3dHeightScale.toFixed(1)}×`;
        updateStreet3DBuildings();
        if (amap3dActive) amap3dScene?.updateHeight(street3dHeightScale);
      });
      $('projectionLight').addEventListener('input', (event) => {
        street3dLight = Number(event.target.value);
        $('projectionLightLabel').textContent = street3dLight.toFixed(2);
        applyStreet3DLight();
      });
      document.querySelectorAll('[data-camera-preset]').forEach((button) => {
        button.addEventListener('click', () => {
          street3dPreset = button.dataset.cameraPreset;
          document.querySelectorAll('[data-camera-preset]').forEach((item) => item.classList.toggle('is-active', item === button));
          if (street3dActive) syncStreet3DView('preset');
          if (real3dActive) syncReal3DView();
          if (amap3dActive) syncAmap3DView();
        });
      });
      $('projectionTerrain').addEventListener('click', () => {
        street3dTerrain = !street3dTerrain;
        $('projectionTerrain').classList.toggle('is-active', street3dTerrain);
        applyStreet3DTerrain();
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
        $('mediaViewerVideo').pause();
        $('mediaViewerVideo').removeAttribute('src');
        $('mediaViewerImage').removeAttribute('src');
        $('mediaViewerModal').hidden = true;
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
