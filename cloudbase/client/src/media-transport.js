export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

async function readResponse(response, fallback) {
  if (response.ok) return response.json()
  try { const body = await response.json(); throw new Error(body.error || fallback) } catch (error) {
    if (error instanceof SyntaxError) throw new Error(fallback)
    throw error
  }
}

export async function uploadTrace(blob, metadata, fetchImpl = fetch) {
  if (!blob || blob.size < 1 || blob.size > MAX_UPLOAD_BYTES) throw new Error('文件须大于 0 且不超过 25 MB')
  const mimeType = blob.type || (metadata.mediaType === 'image' ? 'image/jpeg' : metadata.mediaType === 'video' ? 'video/webm' : 'audio/webm')
  const init = await fetchImpl('/api/uploads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ size: blob.size, mimeType }),
  }).then(response => readResponse(response, '准备上传失败'))
  try {
    for (const chunk of init.chunks) {
      const start = chunk.index * init.chunkSize
      const body = blob.slice(start, start + init.chunkSize, 'application/octet-stream')
      const response = await fetchImpl(chunk.url, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body })
      if (!response.ok) throw new Error('上传文件失败，请检查网络')
    }
    const response = await fetchImpl('/api/traces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...metadata, id: init.id, size: blob.size, mimeType, chunkCount: init.chunks.length }),
    })
    return await readResponse(response, '保存记录失败')
  } catch (error) {
    await fetchImpl(`/api/uploads/${encodeURIComponent(init.id)}?count=${init.chunks.length}`, { method: 'DELETE' }).catch(() => {})
    throw error
  }
}

export async function readMediaBlob(trace, fetchImpl = fetch) {
  if (!Number.isInteger(trace.mediaChunks) || trace.mediaChunks < 1 || trace.mediaChunks > 7) throw new Error('媒体文件信息无效')
  const chunks = []
  for (let index = 0; index < trace.mediaChunks; index++) {
    const response = await fetchImpl(`/api/media/${encodeURIComponent(trace.id)}/${index}`)
    if (!response.ok) throw new Error('媒体加载失败')
    chunks.push(await response.arrayBuffer())
  }
  const blob = new Blob(chunks, { type: trace.mimeType || 'application/octet-stream' })
  if (trace.mediaSize && blob.size !== trace.mediaSize) throw new Error('媒体文件不完整')
  return blob
}
