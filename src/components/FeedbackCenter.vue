<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import {
  dismissToast,
  settleConfirmation,
  useFeedback,
} from '../lib/feedback'

const { state } = useFeedback()

const toasts = computed(() => state.toasts)
const confirmDialog = computed(() => state.confirm)
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
    settleConfirmation(false)
  }
}

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
        @click.self="settleConfirmation(false)"
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

          <div class="confirm-actions">
            <button type="button" class="boton boton-cancelar" @click="settleConfirmation(false)">
              {{ confirmDialog.cancelLabel }}
            </button>
            <button type="button" :class="confirmButtonClass" @click="settleConfirmation(true)">
              {{ confirmDialog.confirmLabel }}
            </button>
          </div>
        </section>
      </div>
    </transition>
  </teleport>
</template>
