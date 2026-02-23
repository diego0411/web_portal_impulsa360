import { computed, ref } from 'vue'

const STORAGE_KEY = 'impulsa360.admin_api_auth.v1'

const username = ref('')
const password = ref('')
let hydrated = false

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function readFromStorage() {
  if (!canUseSessionStorage()) {
    return null
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    return {
      username: typeof parsed.username === 'string' ? parsed.username : '',
      password: typeof parsed.password === 'string' ? parsed.password : '',
    }
  } catch {
    return null
  }
}

function persistToStorage() {
  if (!canUseSessionStorage()) {
    return
  }

  if (!username.value.trim() || !password.value) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }

  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      username: username.value,
      password: password.value,
    })
  )
}

function hydrateOnce() {
  if (hydrated) {
    return
  }

  hydrated = true
  const stored = readFromStorage()
  if (!stored) {
    return
  }

  username.value = stored.username
  password.value = stored.password
}

function setCredentials(nextUsername, nextPassword) {
  username.value = typeof nextUsername === 'string' ? nextUsername : ''
  password.value = typeof nextPassword === 'string' ? nextPassword : ''
  persistToStorage()
}

function clearCredentials() {
  username.value = ''
  password.value = ''
  persistToStorage()
}

function refreshCredentials() {
  const stored = readFromStorage()
  if (!stored) {
    clearCredentials()
    return
  }

  username.value = stored.username
  password.value = stored.password
}

export function useAdminApiAuth() {
  hydrateOnce()

  const hasCredentials = computed(() => Boolean(username.value.trim() && password.value))

  return {
    username,
    password,
    hasCredentials,
    setCredentials,
    clearCredentials,
    refreshCredentials,
  }
}
