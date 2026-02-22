import { createAdminApiApp } from '../server/app.js'

const app = createAdminApiApp()

export function runAdminAppAtPath(req, res, path) {
  req.url = path
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
