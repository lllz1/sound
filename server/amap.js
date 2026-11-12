import express from 'express'
import { Readable } from 'node:stream'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseEnv } from 'node:util'

export async function readAmapConfig(root, environment = process.env) {
  let localConfig = {}
  try { localConfig = parseEnv(await fs.readFile(path.join(root, '.env'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  return {
    key: environment.AMAP_WEB_KEY || localConfig.AMAP_WEB_KEY,
    securityCode: environment.AMAP_SECURITY_CODE || localConfig.AMAP_SECURITY_CODE,
  }
}

// The browser receives the Web key; the security code stays on the server.
export function createAmapRouter({ key, securityCode, getConfig = () => ({ key, securityCode }), fetchImpl = fetch }) {
  const router = express.Router()

  router.get('/api/amap/config', async (_req, res) => {
    try {
      const config = await getConfig()
      const configured = Boolean(config.key && config.securityCode)
      res.set('Cache-Control', 'no-store')
      res.json({ configured, key: configured ? config.key : null })
    } catch {
      res.status(503).json({ error: '无法读取高德配置' })
    }
  })

  router.get('/_AMapService/*', async (req, res) => {
    let config
    try { config = await getConfig() } catch { return res.status(503).json({ error: '无法读取高德配置' }) }
    if (!config.key || !config.securityCode) return res.status(503).json({ error: '尚未配置高德地图' })
    const requestUrl = new URL(req.originalUrl, 'http://localhost')
    const path = requestUrl.pathname.slice('/_AMapService'.length)
    if (!path.startsWith('/') || path.includes('\\')) return res.status(400).end()
    const origin = path === '/v4/map/styles' || path.startsWith('/v4/map/styles/')
      ? 'https://webapi.amap.com'
      : 'https://restapi.amap.com'
    const upstream = new URL(origin)
    upstream.pathname = path
    upstream.search = requestUrl.search
    upstream.searchParams.set('key', config.key)
    upstream.searchParams.set('jscode', config.securityCode)
    try {
      const headers = {}
      if (req.get('referer')) headers.Referer = req.get('referer')
      if (req.get('user-agent')) headers['User-Agent'] = req.get('user-agent')
      const response = await fetchImpl(upstream, { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) })
      res.status(response.status)
      const contentType = response.headers.get('content-type')
      if (contentType) res.set('Content-Type', contentType)
      if (!response.body) return res.end()
      Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res)
    } catch {
      res.status(502).json({ error: '高德服务暂时不可用' })
    }
  })
  return router
}
