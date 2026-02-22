import { createAdminApiApp } from '../server/app.js'

const app = createAdminApiApp()

export default function handler(req, res) {
  if (req.url === '/api' || req.url === '/api/') {
    req.url = '/'
  } else if (typeof req.url === 'string' && req.url.startsWith('/api/')) {
    req.url = req.url.slice(4)
  }

  return app(req, res)
}
