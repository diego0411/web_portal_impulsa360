<script setup>
import { computed, onMounted, ref } from 'vue'
import { adminApiRequest } from '../lib/adminApiClient'
import { useAuth } from '../lib/authStore'
import { notifyError } from '../lib/feedback'

const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')

const { session, isAdmin } = useAuth()
const accessError = ref(null)
const loadingSummary = ref(false)
const summary = ref(null)
const lastUpdated = ref(null)

const hasSummary = computed(() => Boolean(summary.value))
const hasDatabaseExact = computed(() => {
  const value = summary.value?.database_size_bytes
  return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0
})

const databaseEstimate = computed(() => summary.value?.database_estimation ?? null)
const combinedCapacityEstimate = computed(() => summary.value?.combined_capacity_estimation ?? null)

const storageUsageLabel = computed(() => formatPercent(summary.value?.storage_usage_percent))
const databaseUsageLabel = computed(() => formatPercent(summary.value?.database_usage_percent))

const databaseUsedLabel = computed(() => {
  if (hasDatabaseExact.value) {
    return formatBytes(summary.value?.database_size_bytes)
  }

  const estimated = databaseEstimate.value?.estimated_database_used_bytes
  if (estimated === null || estimated === undefined) {
    return 'N/D'
  }

  return `~${formatBytes(estimated)}`
})

const databaseRemainingLabel = computed(() => {
  const remaining = summary.value?.database_remaining_bytes
  if (remaining === null || remaining === undefined) {
    const estimated = databaseEstimate.value?.estimated_database_remaining_bytes
    if (estimated === null || estimated === undefined) {
      return 'N/D'
    }
    return `~${formatBytes(estimated)}`
  }

  if (!hasDatabaseExact.value) {
    return `~${formatBytes(remaining)}`
  }

  return formatBytes(remaining)
})

const perActivationEstimatedLabel = computed(() => {
  const perActivation = databaseEstimate.value?.per_activation_estimated_bytes
  return perActivation ? formatBytes(perActivation) : 'N/D'
})

const remainingActivacionesEstimatedLabel = computed(() => {
  const remaining = databaseEstimate.value?.estimated_activaciones_capacity_remaining
  if (remaining === null || remaining === undefined) {
    return 'N/D'
  }

  return formatNumber(remaining)
})

const remainingActivacionesWithPhotoLabel = computed(() => {
  const remaining = combinedCapacityEstimate.value?.estimated_activaciones_with_photo_remaining
  if (remaining === null || remaining === undefined) {
    return 'N/D'
  }

  return formatNumber(remaining)
})

const averagePhotoBytesLabel = computed(() => {
  const averagePhotoBytes = combinedCapacityEstimate.value?.average_photo_bytes
  if (averagePhotoBytes === null || averagePhotoBytes === undefined) {
    return 'N/D'
  }

  return formatBytes(averagePhotoBytes)
})

const averagePhotoSampleLabel = computed(() => {
  const sampleCount = combinedCapacityEstimate.value?.sample_photos_count
  if (sampleCount === null || sampleCount === undefined) {
    return 'N/D'
  }

  return formatNumber(sampleCount)
})

const averagePhotoCoverageLabel = computed(() => {
  const coverage = combinedCapacityEstimate.value?.photo_coverage_percent
  if (coverage === null || coverage === undefined) {
    return 'Cobertura: N/D'
  }

  return `Cobertura: ${formatPercent(coverage)}`
})

const limitingFactorLabel = computed(() => {
  const limitingFactor = combinedCapacityEstimate.value?.limiting_factor
  if (limitingFactor === 'storage') {
    return 'Limite actual: Storage'
  }

  if (limitingFactor === 'database') {
    return 'Limite actual: Base de datos'
  }

  return 'Limite actual: N/D'
})

const combinedEstimateHint = computed(() => {
  const reason = combinedCapacityEstimate.value?.unavailable_reason
  if (reason) {
    return reason
  }

  return `Estimacion combinada basada en un promedio de 1 foto por activacion y ${averagePhotoBytesLabel.value} por foto.`
})

const estimateHint = computed(() => {
  if (hasDatabaseExact.value) {
    return 'Medicion real de base de datos activa.'
  }

  if (databaseEstimate.value) {
    const sampleSize = databaseEstimate.value.sample_size
    return `Estimado por promedio de activaciones (muestra ${formatNumber(sampleSize)}).`
  }

  return 'Sin datos suficientes para estimar el uso de base de datos.'
})

function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) {
    return 'N/D'
  }

  if (value === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const normalized = value / 1024 ** unitIndex

  if (unitIndex === 0) {
    return `${Math.round(normalized)} ${units[unitIndex]}`
  }

  return `${normalized.toFixed(1)} ${units[unitIndex]}`
}

function formatPercent(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 'N/D'
  }

  return `${parsed.toFixed(1)}%`
}

function formatNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 'N/D'
  }

  return new Intl.NumberFormat('es-BO').format(parsed)
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Se produjo un error inesperado.'
}

async function requestAdmin(path, options = {}) {
  return adminApiRequest({
    baseUrl: apiBaseUrl,
    path,
    token: session.value?.access_token,
    ...options,
  })
}

async function cargarResumen() {
  if (!isAdmin.value || loadingSummary.value) {
    return
  }

  loadingSummary.value = true
  accessError.value = null

  try {
    const result = await requestAdmin('/admin/storage/summary')
    summary.value = result.summary ?? null
    lastUpdated.value = new Date()
  } catch (error) {
    accessError.value = getErrorMessage(error)
    notifyError(accessError.value)
  } finally {
    loadingSummary.value = false
  }
}

function usageStatus(value) {
  const percent = Number(value)
  if (!Number.isFinite(percent) || percent < 70) return 'normal'
  if (percent <= 85) return 'warning'
  return 'critical'
}

function usageWidth(value) {
  const percent = Number(value)
  return `${Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0))}%`
}

function formatUpdatedAt(value) {
  return value ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'medium' }).format(value) : 'Sin actualizar'
}

onMounted(() => {
  if (!isAdmin.value) {
    accessError.value = 'Este modulo esta disponible solo para administradores activos.'
    return
  }
  cargarResumen()
})
</script>

<template>
  <section class="view-page">
    <header class="view-header">
      <p class="view-kicker">Capacidad y Consumo</p>
      <h1 class="view-title">Espacio del Proyecto</h1>
      <p class="view-description">
        Controla de forma clara el uso de Storage y base de datos, con medicion real o estimada.
      </p>
      <div class="meta-row">
        <span class="meta-pill" :class="{ 'meta-pill-ok': isAdmin }">Sesion administrativa</span>
        <span class="meta-pill">Ultima actualizacion: {{ formatUpdatedAt(lastUpdated) }}</span>
      </div>
    </header>

    <div class="forms-grid">
      <div class="formulario-registro">
        <div class="toolbar-line">
          <h2 class="subtitulo subtitulo-inline">Resumen</h2>
          <button class="boton" :disabled="!isAdmin || loadingSummary" @click="cargarResumen">
            {{ loadingSummary ? 'Actualizando...' : 'Actualizar' }}
          </button>
        </div>
        <p v-if="accessError" class="mensaje-error">{{ accessError }}</p>
        <p v-else-if="hasSummary" class="capacity-detail">{{ estimateHint }}</p>
        <p v-else class="panel-empty">{{ loadingSummary ? 'Cargando resumen...' : 'No hay datos de capacidad disponibles.' }}</p>
      </div>
    </div>

    <div v-if="hasSummary" class="panel-card">
      <div class="capacity-grid">
        <div class="capacity-card">
          <p class="capacity-label">Storage usado</p>
          <p class="capacity-value">{{ formatBytes(summary.storage_used_bytes) }}</p>
          <span class="capacity-source-badge">Medido</span>
          <div class="capacity-progress" :class="`capacity-progress-${usageStatus(summary.storage_usage_percent)}`">
            <span :style="{ width: usageWidth(summary.storage_usage_percent) }"></span>
          </div>
          <p class="capacity-detail">{{ storageUsageLabel }} · {{ summary.storage_objects_count }} archivos</p>
        </div>

        <div class="capacity-card">
          <p class="capacity-label">Storage disponible</p>
          <p class="capacity-value">{{ formatBytes(summary.storage_remaining_bytes) }}</p>
          <p class="capacity-detail">de {{ formatBytes(summary.storage_limit_bytes) }}</p>
        </div>

        <div class="capacity-card">
          <p class="capacity-label">Tamano promedio de foto</p>
          <p class="capacity-value">{{ averagePhotoBytesLabel }}</p>
          <p class="capacity-detail">Muestra: {{ averagePhotoSampleLabel }} fotos</p>
          <p class="capacity-detail">{{ averagePhotoCoverageLabel }}</p>
        </div>

        <div class="capacity-card">
          <p class="capacity-label">Base de datos usada</p>
          <p class="capacity-value">{{ databaseUsedLabel }}</p>
          <span class="capacity-source-badge" :class="{ 'capacity-source-estimated': !hasDatabaseExact }">{{ hasDatabaseExact ? 'Medido' : 'Estimado' }}</span>
          <div class="capacity-progress" :class="`capacity-progress-${usageStatus(summary.database_usage_percent)}`">
            <span :style="{ width: usageWidth(summary.database_usage_percent) }"></span>
          </div>
          <p class="capacity-detail">{{ databaseUsageLabel }} del limite</p>
        </div>

        <div class="capacity-card">
          <p class="capacity-label">Base de datos disponible</p>
          <p class="capacity-value">{{ databaseRemainingLabel }}</p>
          <p class="capacity-detail">de {{ formatBytes(summary.database_limit_bytes) }}</p>
        </div>

        <div class="capacity-card">
          <p class="capacity-label">Peso estimado por activacion</p>
          <p class="capacity-value">{{ perActivationEstimatedLabel }}</p>
          <p class="capacity-detail">Incluye factor de seguridad para estimacion.</p>
        </div>

        <div class="capacity-card">
          <p class="capacity-label">Activaciones restantes estimadas</p>
          <p class="capacity-value">{{ remainingActivacionesEstimatedLabel }}</p>
          <p class="capacity-detail">Antes de alcanzar el limite de base de datos.</p>
        </div>

        <div class="capacity-card">
          <p class="capacity-label">Activaciones restantes (con foto)</p>
          <p class="capacity-value">{{ remainingActivacionesWithPhotoLabel }}</p>
          <p class="capacity-detail">{{ limitingFactorLabel }}</p>
          <p class="capacity-detail">{{ combinedEstimateHint }}</p>
        </div>
      </div>

      <div v-if="summary.plan_reference" class="capacity-chips">
        <span class="capacity-chip">{{ summary.plan_reference.name }}</span>
        <span class="capacity-chip">API ilimitada</span>
        <span class="capacity-chip">MAU {{ formatNumber(summary.plan_reference.monthly_active_users_limit) }}</span>
        <span class="capacity-chip">DB {{ formatBytes(summary.plan_reference.database_limit_bytes) }}</span>
        <span class="capacity-chip">Storage {{ formatBytes(summary.plan_reference.file_storage_limit_bytes) }}</span>
        <span class="capacity-chip">Egress {{ formatBytes(summary.plan_reference.egress_limit_bytes) }}</span>
      </div>
    </div>
  </section>
</template>
