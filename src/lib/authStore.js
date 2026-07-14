import { computed, readonly, ref } from 'vue'
import { supabase } from './supabaseClient'

const session = ref(null)
const profile = ref(null)
const loading = ref(true)
const accessError = ref('')
const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')
let initialization

async function loadProfile(currentSession) {
  session.value = currentSession
  profile.value = null
  accessError.value = ''
  if (!currentSession?.user) return
  const response = await fetch(`${apiBaseUrl}/portal/me`, { headers: { Authorization: `Bearer ${currentSession.access_token}` } })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.profile) accessError.value = payload?.error || 'No existe un perfil habilitado para este usuario.'
  else profile.value = payload.profile
}

export function initializeAuth() {
  if (!initialization) {
    initialization = (async () => {
      loading.value = true
      const { data } = await supabase.auth.getSession()
      await loadProfile(data.session)
      supabase.auth.onAuthStateChange((_event, nextSession) => { loadProfile(nextSession) })
      loading.value = false
    })()
  }
  return initialization
}

export async function signIn(email, password) {
  loading.value = true
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) { loading.value = false; throw error }
  await loadProfile(data.session)
  loading.value = false
  if (!profile.value) { const reason = accessError.value || 'Acceso no autorizado.'; await supabase.auth.signOut(); accessError.value = reason; throw new Error(reason) }
}

export async function signOut() { await supabase.auth.signOut(); session.value = null; profile.value = null }
export function useAuth() { return { session: readonly(session), profile: readonly(profile), loading: readonly(loading), accessError: readonly(accessError), isAdmin: computed(() => profile.value?.rol === 'administrador') } }
