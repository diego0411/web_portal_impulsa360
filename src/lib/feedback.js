import { reactive, readonly } from 'vue'

const MAX_TOASTS = 5
const DEFAULT_TOAST_DURATION = 3800

let nextToastId = 1
const toastTimers = new Map()

const feedbackState = reactive({
  toasts: [],
  confirm: {
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    tone: 'primary',
    resolver: null,
  },
})

function removeToastTimer(toastId) {
  const timerId = toastTimers.get(toastId)
  if (timerId) {
    clearTimeout(timerId)
    toastTimers.delete(toastId)
  }
}

export function dismissToast(toastId) {
  removeToastTimer(toastId)
  feedbackState.toasts = feedbackState.toasts.filter((toast) => toast.id !== toastId)
}

export function showToast({
  type = 'info',
  title = '',
  message = '',
  duration = DEFAULT_TOAST_DURATION,
} = {}) {
  const normalizedMessage = String(message || '').trim()
  if (!normalizedMessage) {
    return null
  }

  const toast = {
    id: nextToastId++,
    type,
    title: String(title || '').trim(),
    message: normalizedMessage,
  }

  const nextToasts = [...feedbackState.toasts, toast]
  if (nextToasts.length > MAX_TOASTS) {
    const overflow = nextToasts.slice(0, nextToasts.length - MAX_TOASTS)
    for (const oldToast of overflow) {
      removeToastTimer(oldToast.id)
    }
  }
  feedbackState.toasts = nextToasts.slice(-MAX_TOASTS)

  if (duration > 0) {
    const timerId = setTimeout(() => {
      dismissToast(toast.id)
    }, duration)
    toastTimers.set(toast.id, timerId)
  }

  return toast.id
}

export function notifySuccess(message, title = 'Operacion completada') {
  return showToast({ type: 'success', title, message })
}

export function notifyError(message, title = 'Error') {
  return showToast({ type: 'error', title, message, duration: 5200 })
}

export function notifyInfo(message, title = 'Informacion') {
  return showToast({ type: 'info', title, message })
}

export function notifyWarning(message, title = 'Revision requerida') {
  return showToast({ type: 'warning', title, message })
}

function resetConfirmationState() {
  feedbackState.confirm.isOpen = false
  feedbackState.confirm.title = ''
  feedbackState.confirm.message = ''
  feedbackState.confirm.confirmLabel = 'Confirmar'
  feedbackState.confirm.cancelLabel = 'Cancelar'
  feedbackState.confirm.tone = 'primary'
  feedbackState.confirm.resolver = null
}

export function requestConfirmation({
  title = 'Confirmar accion',
  message = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
} = {}) {
  if (typeof feedbackState.confirm.resolver === 'function') {
    feedbackState.confirm.resolver(false)
  }

  return new Promise((resolve) => {
    feedbackState.confirm.isOpen = true
    feedbackState.confirm.title = String(title || '').trim() || 'Confirmar accion'
    feedbackState.confirm.message = String(message || '').trim()
    feedbackState.confirm.confirmLabel = String(confirmLabel || '').trim() || 'Confirmar'
    feedbackState.confirm.cancelLabel = String(cancelLabel || '').trim() || 'Cancelar'
    feedbackState.confirm.tone = tone === 'danger' ? 'danger' : 'primary'
    feedbackState.confirm.resolver = resolve
  })
}

export function settleConfirmation(accepted) {
  const resolver = feedbackState.confirm.resolver
  resetConfirmationState()

  if (typeof resolver === 'function') {
    resolver(Boolean(accepted))
  }
}

export function useFeedback() {
  return {
    state: readonly(feedbackState),
  }
}
