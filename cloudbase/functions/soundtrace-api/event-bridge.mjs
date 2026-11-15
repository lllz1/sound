// Adapts a CloudBase HTTP-gateway event to the app's existing Fetch API.
export function eventToRequest(event) {
  const path = typeof event.path === 'string' && event.path.startsWith('/') ? event.path : '/'
  const url = new URL(path, 'https://soundtrace.internal')
  for (const [key, value] of Object.entries(event.queryStringParameters || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  const method = String(event.httpMethod || 'GET').toUpperCase()
  const headers = new Headers()
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (value != null && !['host', 'content-length'].includes(key.toLowerCase())) headers.set(key, String(value))
  }
  const options = { method, headers }
  if (method !== 'GET' && method !== 'HEAD' && event.body != null) {
    options.body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : String(event.body)
  }
  return new Request(url, options)
}

export async function responseToEvent(response) {
  const headers = Object.fromEntries(response.headers)
  delete headers['content-length']
  delete headers['content-encoding']
  delete headers['content-disposition']
  const body = Buffer.from(await response.arrayBuffer())
  const type = response.headers.get('content-type') || 'application/octet-stream'
  const isBase64Encoded = !/^(text\/|application\/(?:json|javascript|x-javascript|xml)|image\/svg\+xml)/i.test(type)
  return {
    statusCode: response.status,
    headers,
    body: body.toString(isBase64Encoded ? 'base64' : 'utf8'),
    isBase64Encoded,
  }
}

export function createEventHandler(handle) {
  return async event => responseToEvent(await handle(eventToRequest(event)))
}
