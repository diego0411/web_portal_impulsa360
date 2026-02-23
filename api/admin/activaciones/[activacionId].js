import { getSingleQueryValue, runAdminAppAtPath } from '../../_appAdapter.js'

export default function handler(req, res) {
  const activacionId = getSingleQueryValue(req.query?.activacionId).trim()

  if (!activacionId) {
    res.status(400).json({ error: 'Parametro activacionId requerido.' })
    return
  }

  return runAdminAppAtPath(req, res, `/admin/activaciones/${encodeURIComponent(activacionId)}`)
}
