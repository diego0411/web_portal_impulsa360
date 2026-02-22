function toBase64(value) {
  try {
    return btoa(value)
  } catch {
    const bytes = new TextEncoder().encode(value)
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  }
}

function parseErrorMessage(payload, status) {
  if (payload && typeof payload === 'object') {
    if (payload.error && payload.details) {
      return `${payload.error} (${payload.details})`
    }

    if (payload.error) {
      return payload.error
    }
  }

  return `Error HTTP ${status}`
}

async function parseResponsePayload(response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  try {
    const text = await response.text()
    return text ? { error: text } : null
  } catch {
    return null
  }
}

export async function adminApiRequest({
  baseUrl,
  path,
  username,
  password,
  method = 'GET',
  body,
  headers = {},
  signal,
}) {
  const safeUsername = typeof username === 'string' ? username.trim() : ''
  const safePassword = typeof password === 'string' ? password : ''

  if (!safeUsername || !safePassword) {
    throw new Error('Ingresa usuario y password de API.')
  }

  const normalizedBaseUrl = String(baseUrl || '').replace(/\/$/, '')
  const requestHeaders = {
    Authorization: `Basic ${toBase64(`${safeUsername}:${safePassword}`)}`,
    ...headers,
  }

  const requestInit = {
    method,
    headers: requestHeaders,
    signal,
  }

  if (body !== undefined) {
    requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json'
    requestInit.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const response = await fetch(`${normalizedBaseUrl}${path}`, requestInit)
  const payload = await parseResponsePayload(response)

  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, response.status))
  }

  return payload
}
