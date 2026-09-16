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
  token,
  method = 'GET',
  body,
  headers = {},
  signal,
}) {
  const safeToken = typeof token === 'string' ? token.trim() : ''
  if (!safeToken) {
    throw new Error('Sesion administrativa requerida.')
  }

  const normalizedBaseUrl = String(baseUrl || '').replace(/\/$/, '')
  const requestHeaders = {
    Authorization: `Bearer ${safeToken}`,
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
    const error = new Error(parseErrorMessage(payload, response.status))
    error.status = response.status
    throw error
  }

  return payload
}
