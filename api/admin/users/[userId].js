import { getSingleQueryValue, runAdminAppAtPath } from '../../_appAdapter.js'

export default function handler(req, res) {
  const userId = getSingleQueryValue(req.query?.userId).trim()

  if (!userId) {
    res.status(400).json({ error: 'Parametro userId requerido.' })
    return
  }

  return runAdminAppAtPath(req, res, `/admin/users/${encodeURIComponent(userId)}`)
}
