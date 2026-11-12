import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readTraces, writeTraces } from './store.js'
import { createAmapRouter, readAmapConfig } from './amap.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const uploadDir = path.join(__dirname, 'uploads')
const distDir = path.join(root, 'dist')
const port = Number(process.env.PORT || 8088)

await fs.mkdir(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, done) => done(null, uploadDir),
  filename: (_req, file, done) => {
    const ext = file.mimetype.includes('wav')
      ? '.wav'
      : file.mimetype.includes('mpeg')
        ? '.mp3'
        : file.mimetype.includes('ogg')
          ? '.ogg'
          : file.mimetype.includes('mp4')
            ? '.mp4'
            : file.mimetype.includes('jpeg')
              ? '.jpg'
              : file.mimetype.includes('png')
                ? '.png'
                : file.mimetype.includes('webp')
                  ? '.webp'
                  : '.webm'
    done(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) done(null, true)
    else done(new Error('只允许上传音频、视频或图片'))
  },
})

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use(createAmapRouter({ getConfig: () => readAmapConfig(root) }))
app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/traces', async (_req, res) => {
  try {
    const traces = await readTraces()
    res.json(traces.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: '无法读取声音节点' })
  }
})

app.post('/api/traces', upload.fields([{ name: 'media', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
  try {
    const file = req.files?.media?.[0] || req.files?.audio?.[0]
    const lat = Number(req.body.lat)
    const lng = Number(req.body.lng)
    const duration = Number(req.body.duration)
    if (!file) return res.status(400).json({ error: '缺少媒体文件' })
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      await fs.unlink(file.path).catch(() => {})
      return res.status(400).json({ error: '无效的经纬度' })
    }
    let peaks = []
    try { peaks = JSON.parse(req.body.peaks || '[]') } catch { peaks = [] }
    const inferredType = file.mimetype.startsWith('video/') ? 'video' : file.mimetype.startsWith('image/') ? 'image' : 'audio'
    const mediaType = ['audio', 'video', 'image'].includes(req.body.mediaType) ? req.body.mediaType : inferredType
    const trace = {
      id: `rec-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      type: 'recording',
      kindLabel: 'MY RECORDING',
      title: String(req.body.title || '未命名声音').slice(0, 32),
      meta: String(req.body.meta || `${mediaType === 'audio' ? '现场录音' : mediaType === 'video' ? '现场视频' : '现场照片'} · ${Math.max(1, Math.round(duration || 1))} 秒`).slice(0, 80),
      lat,
      lng,
      duration: Math.max(0.1, Math.min(30, duration || 1)),
      peaks: Array.isArray(peaks) && peaks.length ? peaks.slice(0, 64) : [],
      mediaType,
      mediaUrl: `/uploads/${file.filename}`,
      audioUrl: mediaType === 'audio' ? `/uploads/${file.filename}` : undefined,
      createdAt: Date.now(),
    }
    const traces = await readTraces()
    traces.push(trace)
    await writeTraces(traces)
    res.status(201).json(trace)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: '保存录音失败' })
  }
})

app.patch('/api/traces/:id', async (req, res) => {
  try {
    const traces = await readTraces()
    const trace = traces.find((item) => item.id === req.params.id)
    if (!trace) return res.status(404).json({ error: '声音节点不存在' })
    if (req.body.title !== undefined) trace.title = String(req.body.title).slice(0, 32) || '未命名声音'
    if (req.body.meta !== undefined) trace.meta = String(req.body.meta).slice(0, 80)
    if (req.body.lat !== undefined) {
      const lat = Number(req.body.lat)
      if (!Number.isFinite(lat) || Math.abs(lat) > 90) return res.status(400).json({ error: '无效纬度' })
      trace.lat = lat
    }
    if (req.body.lng !== undefined) {
      const lng = Number(req.body.lng)
      if (!Number.isFinite(lng) || Math.abs(lng) > 180) return res.status(400).json({ error: '无效经度' })
      trace.lng = lng
    }
    await writeTraces(traces)
    res.json(trace)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: '更新声音节点失败' })
  }
})

app.delete('/api/traces/:id', async (req, res) => {
  try {
    const traces = await readTraces()
    const index = traces.findIndex((item) => item.id === req.params.id)
    if (index === -1) return res.status(404).json({ error: '声音节点不存在' })
    const [trace] = traces.splice(index, 1)
    await writeTraces(traces)
    const mediaPath = trace.mediaUrl || trace.audioUrl
    if (trace.type === 'recording' && mediaPath?.startsWith('/uploads/')) {
      await fs.unlink(path.join(uploadDir, path.basename(mediaPath))).catch(() => {})
    }
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: '删除声音节点失败' })
  }
})

app.get('/api/geocode', async (req, res) => {
  const query = String(req.query.q || '').trim()
  if (query.length < 2) return res.status(400).json({ error: '请输入至少两个字' })
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=zh-CN&q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'SoundTrace/1.0 (local prototype)', Accept: 'application/json' }, signal: AbortSignal.timeout(9000) },
    )
    if (!response.ok) throw new Error('nominatim failed')
    const data = await response.json()
    res.json(data.map((item) => ({
      name: String(item.display_name || '').split(',')[0] || query,
      display_name: item.display_name,
      lat: Number(item.lat),
      lon: Number(item.lon),
    })))
  } catch {
    try {
      const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=zh`, {
        signal: AbortSignal.timeout(9000),
      })
      const data = await response.json()
      res.json((data.features || []).map((feature) => {
        const props = feature.properties || {}
        return {
          name: props.name || query,
          display_name: [props.name, props.city, props.county, props.state, props.country].filter(Boolean).join(', '),
          lat: feature.geometry.coordinates[1],
          lon: feature.geometry.coordinates[0],
        }
      }))
    } catch {
      res.status(502).json({ error: '地点搜索暂时不可用' })
    }
  }
})

app.use(express.static(distDir))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distDir, 'index.html'), (error) => {
    if (error) res.status(404).send('前端尚未构建，请先运行 npm run build')
  })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(400).json({ error: error.message || '请求失败' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`SoundTrace server listening on http://127.0.0.1:${port}`)
})
