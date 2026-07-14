import { createAdminApiApp } from '../server/app.js'

const app = createAdminApiApp()

export default function handler(req, res) {
  const pathSegments = Array.isArray(req.query?.path)
    ? req.query.path
    : String(req.query?.path ?? '').split('/').filter(Boolean)
  const queryStart = typeof req.url === 'string' ? req.url.indexOf('?') : -1
  const search = queryStart >= 0 ? req.url.slice(queryStart) : ''
  req.url = `/${pathSegments.map(encodeURIComponent).join('/')}${search}`
  return app(req, res)
}
