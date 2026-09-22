<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  dismissToast,
  settleConfirmation,
  useFeedback,
} from '../lib/feedback'

const { state } = useFeedback()

const toasts = computed(() => state.toasts)
const confirmDialog = computed(() => state.confirm)
const confirmationPassword = ref('')
const passwordInput = ref(null)
const confirmButtonClass = computed(() => {
  return confirmDialog.value.tone === 'danger'
    ? 'boton boton-eliminar'
    : 'boton boton-primario'
})

function getToastTitle(toast) {
  if (toast.title) {
    return toast.title
  }

  if (toast.type === 'success') return 'Exito'
  if (toast.type === 'error') return 'Error'
  if (toast.type === 'warning') return 'Atencion'
  return 'Informacion'
}

function onWindowKeydown(event) {
  if (event.key === 'Escape' && confirmDialog.value.isOpen) {
    settleDialog(false)
  }
}

function settleDialog(accepted) {
  const password = confirmationPassword.value
  confirmationPassword.value = ''
  settleConfirmation(accepted, password)
}

watch(
  () => [confirmDialog.value.isOpen, confirmDialog.value.requiresPassword],
  async ([isOpen, requiresPassword]) => {
    confirmationPassword.value = ''
    if (isOpen && requiresPassword) {
      await nextTick()
      passwordInput.value?.focus()
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<template>
  <div class="toast-stack" aria-live="polite" aria-atomic="true">
    <transition-group name="toast-list">
      <article
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-item"
        :class="`toast-${toast.type}`"
      >
        <div class="toast-content">
          <p class="toast-title">{{ getToastTitle(toast) }}</p>
          <p class="toast-message">{{ toast.message }}</p>
        </div>
        <button
          type="button"
          class="toast-close"
          aria-label="Cerrar notificacion"
          @click="dismissToast(toast.id)"
        >
          ×
        </button>
      </article>
    </transition-group>
  </div>

  <teleport to="body">
    <transition name="confirm-dialog">
      <div
        v-if="confirmDialog.isOpen"
        class="confirm-overlay"
        @click.self="settleDialog(false)"
      >
        <section
          class="confirm-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="confirmDialog.title"
        >
          <h3 class="confirm-title">{{ confirmDialog.title }}</h3>
          <p v-if="confirmDialog.message" class="confirm-message">
            {{ confirmDialog.message }}
          </p>
          <label v-if="confirmDialog.requiresPassword">
            <span class="field-label">Contraseña actual</span>
            <input ref="passwordInput" v-model="confirmationPassword" type="password" class="input-texto" autocomplete="current-password" @keyup.enter="confirmationPassword && settleDialog(true)">
          </label>

          <div class="confirm-actions">
            <button type="button" class="boton boton-cancelar" @click="settleDialog(false)">
              {{ confirmDialog.cancelLabel }}
            </button>
            <button type="button" :class="confirmButtonClass" :disabled="confirmDialog.requiresPassword && !confirmationPassword" @click="settleDialog(true)">
              {{ confirmDialog.confirmLabel }}
            </button>
          </div>
        </section>
      </div>
    </transition>
  </teleport>
</template>
