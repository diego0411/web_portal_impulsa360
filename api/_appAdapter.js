import { createAdminApiApp } from '../server/app.js'

const app = createAdminApiApp()

export function runAdminAppAtPath(req, res, path) {
  const queryStart = typeof req.url === 'string' ? req.url.indexOf('?') : -1
  const search = queryStart >= 0 ? req.url.slice(queryStart) : ''
  req.url = `${path}${search}`
  return app(req, res)
}

export function getSingleQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }

  if (typeof value === 'string') {
    return value
  }

  return ''
}
