import fs from 'node:fs/promises'
import path from 'node:path'

const dataFile = path.resolve('server/data/traces.json')

const hash = (value) => {
  let h = 2166136261
  for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return Math.abs(h)
}

export const makePeaks = (seed, count = 48) =>
  Array.from({ length: count }, (_, i) => 0.16 + ((hash(seed + i) % 83) / 100))

export const seedTraces = () => [
  { id: 'seed-bell', type: 'seed', kind: 'bell', title: '外滩的钟声', meta: '江风 · 傍晚 · 4 秒', lat: 31.2402, lng: 121.4902, duration: 4 },
  { id: 'seed-street', type: 'seed', kind: 'street', title: '弄堂里的午后', meta: '街声 · 3 秒', lat: 31.2252, lng: 121.4662, duration: 3 },
  { id: 'seed-metro', type: 'seed', kind: 'metro', title: '地铁进站', meta: '城市交通 · 3 秒', lat: 31.2336, lng: 121.4757, duration: 3 },
  { id: 'seed-wind', type: 'seed', kind: 'wind', title: '梧桐树下的风', meta: '树影 · 4 秒', lat: 31.2146, lng: 121.4552, duration: 4 },
  { id: 'seed-store', type: 'seed', kind: 'store', title: '夜班便利店', meta: '灯光 · 3 秒', lat: 31.2381, lng: 121.4801, duration: 3 },
].map((item) => ({
  ...item,
  kindLabel: 'SEED SOUND',
  peaks: makePeaks(item.id),
  createdAt: Date.now(),
}))

async function ensureFile() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true })
  try {
    await fs.access(dataFile)
  } catch {
    await writeTraces(seedTraces())
  }
}

export async function readTraces() {
  await ensureFile()
  const raw = await fs.readFile(dataFile, 'utf8')
  const items = JSON.parse(raw)
  return Array.isArray(items) ? items : []
}

export async function writeTraces(items) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true })
  const temp = `${dataFile}.tmp`
  await fs.writeFile(temp, JSON.stringify(items, null, 2), 'utf8')
  await fs.rename(temp, dataFile)
}
