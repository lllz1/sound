import { defineConfig, normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium/') },
  plugins: [viteStaticCopy({ targets: [
    { src: normalizePath(path.resolve(__dirname, '../node_modules/cesium/Build/Cesium/Workers')), dest: 'cesium', rename: { stripBase: 4 } },
    { src: normalizePath(path.resolve(__dirname, '../node_modules/cesium/Build/Cesium/ThirdParty')), dest: 'cesium', rename: { stripBase: 4 } },
    { src: normalizePath(path.resolve(__dirname, '../node_modules/cesium/Build/Cesium/Assets')), dest: 'cesium', rename: { stripBase: 4 } },
    { src: normalizePath(path.resolve(__dirname, '../node_modules/cesium/Build/Cesium/Widgets')), dest: 'cesium', rename: { stripBase: 4 } },
  ] })],
  build: {
    outDir: path.resolve(__dirname, '../dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8088',
      '/uploads': 'http://127.0.0.1:8088',
    },
  },
})
