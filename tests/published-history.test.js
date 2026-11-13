import test from 'node:test'
import assert from 'node:assert/strict'
import { createPublishedHistory, PUBLISHED_HISTORY_KEY } from '../client/src/published-history.js'

function makeStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('不同设备分别保存音频、视频和图片的发布记录', () => {
  const deviceA = makeStorage()
  const deviceB = makeStorage()
  const a = createPublishedHistory(() => deviceA)
  const b = createPublishedHistory(() => deviceB)
  a.add({ id: 'audio-1', title: '声音', mediaType: 'audio', createdAt: 100 })
  a.add({ id: 'video-1', title: '视频', mediaType: 'video', createdAt: 200 })
  b.add({ id: 'image-1', title: '图片', mediaType: 'image', createdAt: 300 })
  assert.deepEqual(a.read().map((item) => item.id), ['video-1', 'audio-1'])
  assert.deepEqual(b.read().map((item) => item.id), ['image-1'])
  assert.deepEqual(createPublishedHistory(() => deviceA).read().map((item) => item.mediaType), ['video', 'audio'])
  a.remove('audio-1')
  assert.deepEqual(a.read().map((item) => item.id), ['video-1'])
  assert.equal(b.read().length, 1)
})

test('重复加入更新记录，错误数据和存储不可用时不阻断使用', () => {
  const storage = makeStorage()
  storage.setItem(PUBLISHED_HISTORY_KEY, '{bad json')
  const history = createPublishedHistory(() => storage)
  assert.deepEqual(history.read(), [])
  history.add({ id: 'old', title: '旧标题', createdAt: 10 })
  history.add({ id: 'old', title: '新标题', mediaType: 'image', createdAt: 20 })
  assert.deepEqual(history.read(), [{ id: 'old', title: '新标题', mediaType: 'image', publishedAt: 10 }])

  const unavailable = createPublishedHistory(() => { throw new Error('storage denied') })
  assert.equal(unavailable.add({ id: 'tmp', title: '临时记录' }).persisted, false)
  assert.equal(unavailable.read()[0].id, 'tmp')
  assert.equal(unavailable.isPersistent(), false)
  unavailable.remove('tmp')
  assert.deepEqual(unavailable.read(), [])

  const fullStorage = createPublishedHistory(() => ({
    getItem: () => '[{"id":"old","title":"旧记录","mediaType":"audio","publishedAt":1}]',
    setItem: () => { throw new Error('quota exceeded') },
  }))
  assert.equal(fullStorage.add({ id: 'new', title: '新记录', createdAt: 2 }).persisted, false)
  assert.deepEqual(fullStorage.read().map((item) => item.id), ['new', 'old'])
})
