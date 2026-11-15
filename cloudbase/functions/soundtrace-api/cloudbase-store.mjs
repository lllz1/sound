// This adapter uses a private PG-mode CloudBase storage bucket.
// The caller supplies an already authenticated server-side bucket client.
const missing = error => Number(error?.status ?? error?.statusCode) === 404

function valueOrThrow(result) {
  if (result?.error) throw result.error
  return result?.data
}

export function createCloudBaseStore(bucket) {
  return {
    async get(key, options = {}) {
      const result = await bucket.download(key)
      if (result?.error && missing(result.error)) return null
      const data = valueOrThrow(result)
      if (!data) return null
      if (options.type === 'json') return JSON.parse(await data.text())
      return data.arrayBuffer()
    },
    async setJSON(key, value) {
      valueOrThrow(await bucket.upload(key, Buffer.from(JSON.stringify(value)), {
        contentType: 'application/json', upsert: true,
      }))
    },
    async delete(key) {
      const result = await bucket.remove([key])
      if (result?.error && !missing(result.error)) throw result.error
    },
    async list({ prefix }) {
      const blobs = []
      const seen = new Set()
      let cursor
      do {
        const data = valueOrThrow(await bucket.list(prefix, { limit: 100, cursor, withDelimiter: false }))
        if (!data || !Array.isArray(data.objects)) throw new Error('Invalid cloud storage listing')
        for (const object of data.objects) {
          let key = object.key || object.name
          if (!key.startsWith(prefix)) key = `${prefix}${key}`
          if (key.startsWith(prefix)) blobs.push({ key })
        }
        if (!data.hasNext) break
        cursor = data.nextCursor
        if (!cursor || seen.has(cursor)) throw new Error('Invalid cloud storage cursor')
        seen.add(cursor)
      } while (true)
      return { blobs }
    },
    async createUploadUrl(key) {
      const data = valueOrThrow(await bucket.createSignedUploadUrl(key, { upsert: false }))
      if (!data?.fullSignedURL || !data.token) throw new Error('Missing signed upload URL')
      const url = new URL(data.fullSignedURL)
      if (url.protocol !== 'https:') throw new Error('Invalid signed upload URL')
      if (!url.searchParams.has('token')) url.searchParams.set('token', data.token)
      return { url: url.toString() }
    },
  }
}
