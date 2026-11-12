# 声迹 · Sound Trace

把声音留在发生地点的城市声音地图。前后端分离，支持音频上传、声音节点增删改、当前位置定位和地点搜索。

## 技术栈

- 前端：Vite + 原生 JavaScript，Leaflet + 高德栅格底图，CesiumJS 实景三维
- 后端：Node.js + Express + Multer
- 数据：JSON 文件持久化，音频保存到 `server/uploads`
- 坐标：前端存储 WGS84，地图展示时转换为 GCJ-02

## 启动

需要 Node.js 20.19.x 或 22.12 及以上。

```powershell
npm install
npm run build
npm start
```

打开 `http://127.0.0.1:8088/`。也可以双击 `启动.bat` 或桌面上的「声迹」快捷方式。

开发模式：

```powershell
npm run dev
```

Vite 运行在 `http://127.0.0.1:5173/`，API 和上传目录代理到 `http://127.0.0.1:8088/`。

## 功能

- 高德高分辨率城市地图，支持 18 级缩放、比例尺和实时 Z 级别
- 浏览器当前位置定位，显示定位点和精度圈
- 地点搜索，后端代理 Nominatim / Photon
- 现场投影：摄像头或现场照片作为背景，按地平面透视、距离、方位、视野和俯仰叠加声音标记
- 3D 街区：MapLibre + OpenFreeMap 矢量瓦片实时挤出 OSM 建筑，节点按真实经纬度落在 3D 场景中
- 实景 3D：可配置 Google Maps API Key，加载摄影测量三维瓦片，并在场景中查看和点击附近的声音、视频与图片节点
- 实景 3D 支持 Google 地点搜索、重新定位、朝向/视野/俯仰调节和镜头预设；没有密钥时仍可切换回原有 3D 街景
- 3D 场景增强：建筑高度分层、垂直明暗、场景光照、天空/地平线配色、建筑轮廓线
- 建筑窗格与楼层纹理、真实地形高程、节点到观察点的 3D 路径提示
- 镜头预设：街景、鸟瞰、全景；支持楼高倍率和光照强度调节
- 3D 模式下“视野”滑杆映射为镜头广度，数值越小越聚焦
- 声音节点 3D 光柱与地面光晕，音频/视频/图片节点使用不同颜色
- 选中节点时显示从观察点到节点的 3D 虚线路径，并高亮对应光柱
- 浏览器录制音频、视频，最长 30 秒
- 摄像头拍摄现场照片，或从相册选择图片
- 音频、视频、图片统一上传到服务端，生成可播放/查看的节点
- 所有种子节点和录音节点都可以编辑标题、描述、经纬度
- 所有节点都可以删除，服务端会同步删除音频文件
- 图片和视频节点在播放面板、地图标记和最近列表中用不同图标区分
- 生成 1080 × 1350 的“声音明信片”PNG
- 响应式深色界面

## 目录

```text
client/
  index.html
  src/main.js
  src/styles.css
  vite.config.js
server/
  index.js          API、静态文件、上传
  store.js          种子数据和 JSON 持久化
  data/             运行时节点数据（已忽略）
  uploads/          音频文件（已忽略）
legacy/
  single-file.html  旧版单文件原型（Git 忽略）
启动.bat
```

## API

- `GET /api/traces`
- `POST /api/traces`：multipart，字段 `media/mediaType/title/meta/lat/lng/duration/peaks`
- `PATCH /api/traces/:id`
- `DELETE /api/traces/:id`
- `GET /api/geocode?q=`
- `GET /api/health`

## 配置 Google 实景三维

1. 在 [Google Cloud 控制台](https://console.cloud.google.com/)创建项目并绑定结算账号，启用 **Map Tiles API**。如需使用实景界面中的地点搜索，还须启用 **Maps JavaScript API** 和 **Geocoding API**。
2. 按 [Google 官方说明](https://developers.google.com/maps/documentation/tile/get-api-key)创建浏览器使用的 API Key。建议设置网站来源限制（本地运行时包括 `http://127.0.0.1:8088/*` 和/或 `http://localhost:8088/*`；开发模式另加 `http://localhost:5173/*`），并限制允许使用的 API。
3. 启动项目，点击「现场投影」→「实景3D」→「密钥设置」，输入密钥并点击「保存并连接」。密钥保存在当前浏览器的本地存储中，不会写入仓库或应用服务器；点击「清除密钥」可以移除。浏览器会直接使用密钥请求 Google，因此该密钥对浏览器用户可见，务必配置来源、API 和配额限制。
4. 初始观察点为地图中心；也可以点击「重新定位」，或者在实景界面使用 Google 地点搜索。拖动地图可调整角度，「视野」和镜头预设会调整三维镜头。实景建筑的楼高、光照和地形来自原始模型，不能由原有模型滑杆调整。

Photorealistic 3D Tiles 是部分地区覆盖的摄影测量模型，不保证衡阳或其他指定位置有数据；也需要能够访问 Google 服务的网络。若区域无数据、密钥无效、API 未启用或网络不可达，可切换回「3D街景」。建议先在已知有覆盖的地区验证密钥。Google 服务可能收费，请查看 [定价](https://developers.google.com/maps/billing-and-pricing/pricing) 和 [服务政策](https://developers.google.com/maps/documentation/tile/policies)。实景中的节点位置为经纬度近似投影，不能视为精确测绘或真实遮挡。

## 说明

高德栅格底图用于本地原型。正式发布前应接入高德开放平台 Key，并遵守其服务条款。当前服务没有账号体系，适合比赛演示；公开部署前需要增加鉴权、审核、限流和对象存储。

现场投影目前是基于经纬度、朝向和平坦地面假设的透视投影，带有近大远小、地面阴影和光柱；3D 街区使用 OpenFreeMap/OpenStreetMap 的建筑轮廓与高度，不包含 SLAM、深度估计、建筑遮挡或真实物体识别；摄像头和指南针权限需要浏览器授权。正式部署前应确认 OpenFreeMap/OSM 的服务条款和配额。
