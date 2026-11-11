# 声迹 · Sound Trace

把声音留在发生地点的城市声音地图。前后端分离，支持音频上传、声音节点增删改、当前位置定位和地点搜索。

## 技术栈

- 前端：Vite + 原生 JavaScript，Leaflet + 高德栅格底图
- 后端：Node.js + Express + Multer
- 数据：JSON 文件持久化，音频保存到 `server/uploads`
- 坐标：前端存储 WGS84，地图展示时转换为 GCJ-02

## 启动

需要 Node.js 20 以上。

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
- 浏览器麦克风录音，最长 30 秒
- 音频上传到服务端，生成可播放的声音节点
- 所有种子节点和录音节点都可以编辑标题、描述、经纬度
- 所有节点都可以删除，服务端会同步删除音频文件
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
- `POST /api/traces`：multipart，字段 `audio/title/meta/lat/lng/duration/peaks`
- `PATCH /api/traces/:id`
- `DELETE /api/traces/:id`
- `GET /api/geocode?q=`
- `GET /api/health`

## 说明

高德栅格底图用于本地原型。正式发布前应接入高德开放平台 Key，并遵守其服务条款。当前服务没有账号体系，适合比赛演示；公开部署前需要增加鉴权、审核、限流和对象存储。

现场投影目前是基于经纬度、朝向和平坦地面假设的透视投影，带有近大远小、地面阴影和光柱，但不包含 SLAM、深度估计、遮挡或真实物体识别；摄像头和指南针权限需要浏览器授权。
