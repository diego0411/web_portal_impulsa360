import { supabase } from './supabaseClient'

const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')

export async function portalRequest(path) {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) throw new Error('Sesion requerida.')
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || `Error HTTP ${response.status}`)
  return payload
}

export async function fetchAllActivaciones() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const payload = await portalRequest(`/portal/activations?from=${from}&to=${from + 999}`)
    const page = payload.activations ?? []
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}
