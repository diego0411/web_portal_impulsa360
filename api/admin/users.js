import { runAdminAppAtPath } from '../_appAdapter.js'

export default function handler(req, res) {
  return runAdminAppAtPath(req, res, '/admin/users')
}
