import { createAdminApiApp } from '../server/app.js'

const app = createAdminApiApp()
const ROUTE_PARAM = '__api_path'

function appendQueryValue(searchParams, key, value) {
  if (Array.isArray(value)) {
    for (const item of value) searchParams.append(key, String(item))
    return
  }
  if (value !== undefined && value !== null) searchParams.append(key, String(value))
}

export function rewriteRequestForApp(req) {
  const rawPath = Array.isArray(req.query?.[ROUTE_PARAM])
    ? req.query[ROUTE_PARAM].join('/')
    : String(req.query?.[ROUTE_PARAM] ?? '')
  const pathSegments = rawPath.split('/').filter(Boolean)
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (key !== ROUTE_PARAM) appendQueryValue(searchParams, key, value)
  }

  const search = searchParams.toString()
  req.url = `/${pathSegments.map(encodeURIComponent).join('/')}${search ? `?${search}` : ''}`
}

export default function handler(req, res) {
  rewriteRequestForApp(req)
  return app(req, res)
}
