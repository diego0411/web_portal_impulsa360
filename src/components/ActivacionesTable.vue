<script setup>
import { computed, ref } from 'vue'
import { adminApiRequest } from '../lib/adminApiClient'
import { useAdminApiAuth } from '../lib/adminAuthStore'
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
  requestConfirmation,
} from '../lib/feedback'
import { isValidEmail, normalizeEmail, normalizeText } from '../lib/textUtils'
import { useAuth } from '../lib/authStore'
import { AUTH_ENABLED } from '../lib/featureFlags'

const props = defineProps({
  activaciones: {
    type: Array,
    default: () => [],
  },
})
const emit = defineEmits(['activacion-eliminada', 'activacion-actualizada'])

const storageBaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const storageBucket =
  import.meta.env.VITE_STORAGE_BUCKET_ACTIVACIONES ?? 'fotos-activaciones'
const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')
const boliviaDateTimeFormatter = new Intl.DateTimeFormat('es-BO', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/La_Paz',
})

const filtroPlaza = ref('')
const filtroDistrito = ref('')
const filtroImpulsador = ref('')
const filtroFechaDesde = ref('')
const filtroFechaHasta = ref('')
const exportandoExcel = ref(false)
const deletingActivationId = ref(null)
const activacionSeleccionada = ref(null)
const editandoActivacion = ref(false)
const guardandoEdicion = ref(false)
const formularioEdicion = ref({})
const motivoEdicion = ref('')
const { username: apiUser, password: apiPass, hasCredentials } = useAdminApiAuth()
const { session, isAdmin } = useAuth()
const canAdminister = computed(() => !AUTH_ENABLED || isAdmin.value)
const canEditActivaciones = computed(() =>
  AUTH_ENABLED ? Boolean(session.value?.access_token && isAdmin.value) : hasCredentials.value
)

function getCiudadActivacion(activacion) {
  return (
    activacion?.ciudad_activacion ??
    activacion?.plaza ??
    ''
  )
}

function normalizeDateOnly(value) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return ''
  }

  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

const activacionesFiltradas = computed(() => {
  const plazaQuery = normalizeText(filtroPlaza.value)
  const distritoQuery = normalizeText(filtroDistrito.value)
  const impulsadorQuery = normalizeText(filtroImpulsador.value)
  const fechaDesde = normalizeDateOnly(filtroFechaDesde.value)
  const fechaHasta = normalizeDateOnly(filtroFechaHasta.value)
  const fechaInicio = fechaDesde && fechaHasta && fechaDesde > fechaHasta ? fechaHasta : fechaDesde
  const fechaFin = fechaDesde && fechaHasta && fechaDesde > fechaHasta ? fechaDesde : fechaHasta

  return props.activaciones.filter((activacion) => {
    const plaza = normalizeText(getCiudadActivacion(activacion))
    const distrito = normalizeText(activacion.zona_activacion)
    const impulsador = normalizeText(activacion.impulsador)
    const fecha = normalizeDateOnly(activacion.fecha_activacion)

    const coincidePlaza = !plazaQuery || plaza.includes(plazaQuery)
    const coincideDistrito = !distritoQuery || distrito.includes(distritoQuery)
    const coincideImpulsador = !impulsadorQuery || impulsador.includes(impulsadorQuery)
    const coincideDesde = !fechaInicio || (fecha && fecha >= fechaInicio)
    const coincideHasta = !fechaFin || (fecha && fecha <= fechaFin)
    const coincideFecha = coincideDesde && coincideHasta

    return coincidePlaza && coincideDistrito && coincideImpulsador && coincideFecha
  })
})

function csvEscape(value) {
  if (value === null || value === undefined) {
    return ''
  }

  const normalized = String(value).replace(/"/g, '""')

  if (/[";\r\n]/.test(normalized)) {
    return `"${normalized}"`
  }

  return normalized
}

function getFotoPublicUrl(fotoUrl) {
  if (!fotoUrl) {
    return ''
  }

  if (/^https?:\/\//i.test(fotoUrl)) {
    return fotoUrl
  }

  if (!storageBaseUrl) {
    return fotoUrl
  }

  const cleanPath = String(fotoUrl).replace(/^\/+/, '')

  if (cleanPath.startsWith('storage/v1/object/public/')) {
    return `${storageBaseUrl}/${cleanPath}`
  }

  const bucketPrefix = `${storageBucket}/`
  const objectPath = cleanPath.startsWith(bucketPrefix)
    ? cleanPath.slice(bucketPrefix.length)
    : cleanPath

  return `${storageBaseUrl}/storage/v1/object/public/${storageBucket}/${objectPath}`
}


function getRowKey(activacion, index) {
  return (
    activacion.id ??
    `${activacion.usuario_id ?? 'sin-usuario'}-${activacion.created_at ?? 'sin-fecha'}-${index}`
  )
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Se produjo un error inesperado.'
}

function formatCreatedAtBolivia(value, { emptyValue = '-' } = {}) {
  if (!value) {
    return emptyValue
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return boliviaDateTimeFormatter.format(date)
}

function tieneValor(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

function esUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function etiquetaCampo(key) {
  const especiales = {
    id: 'ID del registro', usuario_id: 'ID del usuario', created_at: 'Fecha de registro',
    fecha_activacion: 'Fecha de activacion', nombres_cliente: 'Nombres del cliente',
    apellidos_cliente: 'Apellidos del cliente', ci_cliente: 'CI del cliente',
    telefono_cliente: 'Telefono del cliente', email_cliente: 'Correo del cliente',
    ciudad_activacion: 'Ciudad de activacion', zona_activacion: 'Distrito o zona',
    tipo_activacion: 'Tipo de activacion', tipo_comercio: 'Tipo de comercio',
    tamano_tienda: 'Tamano de tienda', foto_url: 'Fotografia', descargo_app: 'Descargo la app',
    cash_in: 'Cash-In', cash_out: 'Cash-Out', qr_fisico: 'QR fisico', p2p: 'P2P',
    hubo_error: 'Hubo error', descripcion_error: 'Descripcion del error',
  }
  return especiales[key] ?? key.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function formatearValor(value, key) {
  if (typeof value === 'boolean') return value ? 'Si' : 'No'
  if ((key.includes('fecha') || key.endsWith('_at')) && value) {
    if (key.endsWith('_at')) return formatCreatedAtBolivia(value)
    const dateOnly = normalizeDateOnly(value)
    if (dateOnly) {
      const [year, month, day] = dateOnly.split('-')
      return `${day}/${month}/${year}`
    }
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const seccionesDetalleConfig = [
  { title: 'Datos generales', keys: ['fecha_activacion', 'impulsador', 'ciudad_activacion', 'plaza', 'zona_activacion'] },
  { title: 'Datos del cliente', keys: ['nombres_cliente', 'apellidos_cliente', 'ci_cliente', 'telefono_cliente', 'email_cliente'] },
  { title: 'Informacion de la activacion', keys: ['tipo_activacion', 'descargo_app', 'registro', 'cash_in', 'cash_out', 'p2p', 'qr_fisico', 'respaldo'] },
  { title: 'Informacion del comercio o tienda', keys: ['nombre_comercio', 'comercio', 'cliente', 'tipo_comercio', 'tamano_tienda', 'tipo_tienda', 'rubro_comercio', 'rubro_comercio_otro', 'comercio_fuera_mercado', 'es_plaza_temporal', 'plaza_temporal'] },
  { title: 'Evidencias y fotografias', keys: ['foto_url', 'foto_cash_in', 'foto_cashin'] },
  { title: 'Ubicacion', keys: ['latitud', 'longitud', 'direccion', 'ubicacion'] },
  { title: 'Errores u observaciones', keys: ['hubo_error', 'tipo_error', 'descripcion_error', 'observaciones'] },
  { title: 'Informacion tecnica del registro', keys: ['id', 'usuario_id', 'created_at', 'updated_at'] },
]

const seccionesDetalle = computed(() => {
  const row = activacionSeleccionada.value
  if (!row) return []
  const usedKeys = new Set(seccionesDetalleConfig.flatMap((section) => section.keys))
  const sections = seccionesDetalleConfig.map((section) => ({
    title: section.title,
    fields: section.keys
      .filter((key) => tieneValor(row[key]))
      .map((key) => ({ key, label: etiquetaCampo(key), value: row[key], image: key.toLowerCase().includes('foto') })),
  }))
  const extras = Object.entries(row)
    .filter(([key, value]) => !usedKeys.has(key) && tieneValor(value))
    .map(([key, value]) => ({ key, label: etiquetaCampo(key), value, image: key.toLowerCase().includes('foto') }))
  sections.at(-1).fields.push(...extras)
  return sections.filter((section) => section.fields.length)
})

function getClienteComercio(activacion) {
  return activacion.nombre_comercio ?? activacion.comercio ?? activacion.cliente ??
    ([activacion.nombres_cliente, activacion.apellidos_cliente].filter(Boolean).join(' ') || '-')
}

function getResultado(activacion) {
  if (activacion.hubo_error === true) return 'Con error'
  return activacion.resultado ?? activacion.estado ?? 'Registrada'
}

function abrirDetalle(activacion) { activacionSeleccionada.value = activacion }
function cerrarDetalle() {
  if (guardandoEdicion.value) return
  activacionSeleccionada.value = null
  editandoActivacion.value = false
}

function tieneCampo(row, key) {
  return Object.prototype.hasOwnProperty.call(row ?? {}, key)
}

const nombreEditableKey = computed(() => {
  const row = activacionSeleccionada.value
  return ['nombre_comercio', 'comercio', 'cliente', 'nombres_cliente'].find((key) => tieneCampo(row, key)) ?? 'nombres_cliente'
})
const plazaEditableKey = computed(() => tieneCampo(activacionSeleccionada.value, 'ciudad_activacion') ? 'ciudad_activacion' : 'plaza')
const resultadoEditableKey = computed(() => ['resultado', 'estado'].find((key) => tieneCampo(activacionSeleccionada.value, key)) ?? null)
const esActivacionComercio = computed(() => normalizeText(formularioEdicion.value.tipo_activacion).includes('comercio'))
const esTiendaBarrio = computed(() => {
  const tipo = `${normalizeText(formularioEdicion.value.tipo_activacion)} ${normalizeText(activacionSeleccionada.value?.tipo_comercio)}`
  return tipo.includes('tienda') && tipo.includes('barrio')
})

function iniciarEdicion() {
  const row = activacionSeleccionada.value
  if (!row) return
  formularioEdicion.value = {
    nombre: row[nombreEditableKey.value] ?? '',
    telefono_cliente: row.telefono_cliente ?? '',
    email_cliente: row.email_cliente ?? '',
    plaza: row[plazaEditableKey.value] ?? '',
    tipo_activacion: row.tipo_activacion ?? '',
    resultado: resultadoEditableKey.value ? row[resultadoEditableKey.value] ?? '' : '',
    observaciones: row.observaciones ?? '',
    tipo_tienda: row.tipo_tienda ?? '',
    rubro_comercio: row.rubro_comercio ?? '',
    rubro_comercio_otro: row.rubro_comercio_otro ?? '',
    comercio_fuera_mercado: row.comercio_fuera_mercado === true,
    tipo_error: row.tipo_error ?? '',
    descripcion_error: row.descripcion_error ?? '',
    es_plaza_temporal: row.es_plaza_temporal === true,
    plaza_temporal: row.plaza_temporal ?? '',
  }
  motivoEdicion.value = ''
  editandoActivacion.value = true
}

function cancelarEdicion() {
  if (guardandoEdicion.value) return
  editandoActivacion.value = false
  formularioEdicion.value = {}
  motivoEdicion.value = ''
}

function validarEdicion() {
  const form = formularioEdicion.value
  if (!motivoEdicion.value.trim()) return 'El motivo de edicion es obligatorio.'
  if (form.email_cliente && !isValidEmail(normalizeEmail(form.email_cliente))) return 'Ingresa un correo valido.'
  if (form.telefono_cliente && !/^\+?[0-9\s()\-]{6,20}$/.test(form.telefono_cliente.trim())) return 'Ingresa un telefono valido.'
  if (form.es_plaza_temporal && !form.plaza_temporal.trim()) return 'La plaza temporal es obligatoria.'
  if (normalizeText(form.rubro_comercio) === 'otro' && !form.rubro_comercio_otro.trim()) return 'Especifica el otro rubro comercial.'
  if (form.tipo_tienda && !['Pequeña', 'Mediana', 'Grande'].includes(form.tipo_tienda)) return 'Selecciona un tamaño de tienda valido.'
  return null
}

function construirCambiosEdicion() {
  const form = formularioEdicion.value
  const changes = {
    [nombreEditableKey.value]: form.nombre,
    telefono_cliente: form.telefono_cliente,
    email_cliente: form.email_cliente,
    [plazaEditableKey.value]: form.plaza,
    tipo_activacion: form.tipo_activacion,
    observaciones: form.observaciones,
    tipo_error: form.tipo_error,
    descripcion_error: form.descripcion_error,
    es_plaza_temporal: form.es_plaza_temporal,
    plaza_temporal: form.es_plaza_temporal ? form.plaza_temporal : null,
  }
  if (resultadoEditableKey.value) changes[resultadoEditableKey.value] = form.resultado
  if (esActivacionComercio.value) {
    changes.rubro_comercio = form.rubro_comercio
    changes.rubro_comercio_otro = normalizeText(form.rubro_comercio) === 'otro' ? form.rubro_comercio_otro : null
    changes.comercio_fuera_mercado = form.comercio_fuera_mercado
    changes.tipo_tienda = esTiendaBarrio.value ? form.tipo_tienda : null
  }
  return changes
}

async function guardarEdicion() {
  const validationError = validarEdicion()
  if (validationError) { notifyWarning(validationError); return }
  const activationId = normalizeText(activacionSeleccionada.value?.id)
  if (!activationId || !canEditActivaciones.value) {
    notifyWarning(!activationId ? 'La activacion no tiene ID.' : 'Conecta la API admin para editar activaciones.')
    return
  }
  guardandoEdicion.value = true
  try {
    const result = await requestAdmin(`/admin/activaciones/${encodeURIComponent(activationId)}`, {
      method: 'PATCH',
      body: { changes: construirCambiosEdicion(), motivoEdicion: motivoEdicion.value.trim() },
    })
    activacionSeleccionada.value = result.activation
    emit('activacion-actualizada', { activation: result.activation })
    editandoActivacion.value = false
    formularioEdicion.value = {}
    motivoEdicion.value = ''
    notifySuccess('Activacion actualizada correctamente.')
  } catch (error) { notifyError(getErrorMessage(error)) }
  finally { guardandoEdicion.value = false }
}

async function requestAdmin(path, options = {}) {
  return adminApiRequest({
    baseUrl: apiBaseUrl,
    path,
    username: apiUser.value,
    password: apiPass.value,
    token: session.value?.access_token,
    ...options,
  })
}

async function eliminarActivacion(activacion) {
  if (!hasCredentials.value) {
    notifyWarning(
      'Conecta la API admin desde Usuarios, Notificaciones o Capacidad para eliminar activaciones.'
    )
    return
  }

  const activacionId = normalizeText(activacion?.id)
  if (!activacionId) {
    notifyWarning('Esta activacion no tiene ID y no se puede eliminar de forma segura.')
    return
  }

  const confirmacion = await requestConfirmation({
    title: 'Eliminar activacion',
    message: 'Se eliminara el registro y su foto asociada de forma permanente.',
    confirmLabel: 'Eliminar',
    cancelLabel: 'Cancelar',
    tone: 'danger',
  })
  if (!confirmacion) {
    return
  }

  deletingActivationId.value = activacionId

  try {
    const result = await requestAdmin(`/admin/activaciones/${encodeURIComponent(activacionId)}`, {
      method: 'DELETE',
    })

    emit('activacion-eliminada', { id: activacionId })

    if (result?.photoDelete?.ok === false) {
      notifyWarning(
        'Activacion eliminada, pero no fue posible borrar la foto en Storage. Revisa limpieza manual.'
      )
    } else if (result?.photoDelete?.attempted) {
      notifySuccess('Activacion y foto eliminadas correctamente.')
    } else {
      notifySuccess('Activacion eliminada correctamente.')
    }
  } catch (error) {
    notifyError(getErrorMessage(error))
  } finally {
    deletingActivationId.value = null
  }
}

function descargarArchivo({ filename, content, mimeType }) {
  const blob = new Blob([content], { type: mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function getDatosParaExportar() {
  const hayFiltros =
    filtroPlaza.value ||
    filtroDistrito.value ||
    filtroImpulsador.value ||
    filtroFechaDesde.value ||
    filtroFechaHasta.value

  return hayFiltros ? activacionesFiltradas.value : props.activaciones
}

const columnasExportacion = [
  ['#', (_row, index) => index + 1],
  ['Creado', (row) => formatCreatedAtBolivia(row.created_at, { emptyValue: '' })],
  ['Fecha', (row) => row.fecha_activacion],
  ['Impulsador', (row) => row.impulsador],
  ['Plaza', (row) => getCiudadActivacion(row)],
  ['Distrito', (row) => row.zona_activacion],
  ['Nombres Cliente', (row) => row.nombres_cliente],
  ['Apellidos Cliente', (row) => row.apellidos_cliente],
  ['CI Cliente', (row) => row.ci_cliente],
  ['Telefono Cliente', (row) => row.telefono_cliente],
  ['Email Cliente', (row) => row.email_cliente],
  ['Descargo App', (row) => (row.descargo_app ? 'Si' : 'No')],
  ['Registro', (row) => (row.registro ? 'Si' : 'No')],
  ['Cash In', (row) => (row.cash_in ? 'Si' : 'No')],
  ['Cash Out', (row) => (row.cash_out ? 'Si' : 'No')],
  ['P2P', (row) => (row.p2p ? 'Si' : 'No')],
  ['QR Fisico', (row) => (row.qr_fisico ? 'Si' : 'No')],
  ['Respaldo', (row) => (row.respaldo ? 'Si' : 'No')],
  ['Hubo Error', (row) => (row.hubo_error ? 'Si' : 'No')],
  ['Descripcion Error', (row) => row.descripcion_error],
  ['Tipo Activacion', (row) => row.tipo_activacion],
  ['Tipo Comercio', (row) => row.tipo_comercio],
  ['Tamano Tienda', (row) => row.tamano_tienda],
  ['Tipo Tienda', (row) => row.tipo_tienda],
  ['Rubro Comercio', (row) => row.rubro_comercio],
  ['Otro Rubro', (row) => row.rubro_comercio_otro],
  ['Comercio Fuera de Mercado', (row) => row.comercio_fuera_mercado == null ? '' : row.comercio_fuera_mercado ? 'Si' : 'No'],
  ['Tipo Error', (row) => row.tipo_error],
  ['Observaciones', (row) => row.observaciones],
  ['Es Plaza Temporal', (row) => row.es_plaza_temporal == null ? '' : row.es_plaza_temporal ? 'Si' : 'No'],
  ['Plaza Temporal', (row) => row.plaza_temporal],
  ['Foto URL', (row) => getFotoPublicUrl(row.foto_url)],
  ['Foto Cash-In', (row) => getFotoPublicUrl(row.foto_cash_in)],
  ['Latitud', (row) => row.latitud],
  ['Longitud', (row) => row.longitud],
  ['Usuario ID', (row) => row.usuario_id],
]

function exportarACsv() {
  const datos = getDatosParaExportar()

  if (!datos.length) {
    notifyInfo('No hay datos para exportar con los filtros actuales.')
    return
  }

  const csvLines = []
  csvLines.push(columnasExportacion.map(([header]) => csvEscape(header)).join(';'))

  for (const [index, row] of datos.entries()) {
    const values = columnasExportacion.map(([, getValue]) =>
      csvEscape(getValue(row, index))
    )
    csvLines.push(values.join(';'))
  }

  descargarArchivo({
    filename: 'activaciones.csv',
    content: `\uFEFF${csvLines.join('\r\n')}`,
    mimeType: 'text/csv;charset=utf-8;',
  })

  notifySuccess('CSV exportado correctamente.')
}

async function exportarAExcelConImagenes() {
  exportandoExcel.value = true
  try {
    const params = new URLSearchParams()
    if (filtroPlaza.value) params.set('plaza', filtroPlaza.value)
    if (filtroDistrito.value) params.set('distrito', filtroDistrito.value)
    if (filtroImpulsador.value) params.set('impulsador', filtroImpulsador.value)
    if (filtroFechaDesde.value) params.set('fechaDesde', filtroFechaDesde.value)
    if (filtroFechaHasta.value) params.set('fechaHasta', filtroFechaHasta.value)
    params.set('exportVersion', 'links-v2')

    const token = session.value?.access_token
    if (!token) throw new Error('Sesion requerida para generar el Excel.')
    const response = await fetch(`${apiBaseUrl}/portal/activations/export-excel?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error || `Error HTTP ${response.status}`)
    }
    if (response.headers.get('X-Export-Version') !== 'links-v2') {
      throw new Error('La API respondio con una version antigua de la exportacion. Vuelve a desplegar el backend.')
    }

    const rowCount = Number(response.headers.get('X-Export-Row-Count')) || 0
    const imageMode = response.headers.get('X-Export-Images')
    descargarArchivo({
      filename: 'activaciones.xlsx',
      content: await response.arrayBuffer(),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    notifySuccess(
      imageMode === 'links'
        ? `Excel exportado con ${rowCount} registros y enlaces a imagenes.`
        : `Excel exportado con ${rowCount} registros e imagenes.`
    )
  } catch (error) {
    console.error('Error al exportar excel:', error)
    notifyError(getErrorMessage(error))
  } finally {
    exportandoExcel.value = false
  }
}

</script>

<template>
  <div class="activaciones-container section-block">
    <div class="section-head">
      <h2 class="section-title">Bitacora Completa</h2>
      <p class="section-caption">
        Filtra la base por rango de fechas, impulsador, plaza o distrito y exporta los resultados.
      </p>
    </div>
    <p v-if="canAdminister && !hasCredentials" class="capacity-detail">
      Eliminacion disponible cuando conectas la API admin en otro modulo.
    </p>

    <div class="filtros filtros-grid filtros-activaciones">
      <label>
        <span class="field-label">Fecha desde</span>
        <input type="date" v-model="filtroFechaDesde" class="input-texto" />
      </label>

      <label>
        <span class="field-label">Fecha hasta</span>
        <input type="date" v-model="filtroFechaHasta" class="input-texto" />
      </label>

      <label>
        <span class="field-label">Impulsador</span>
        <input
          type="text"
          v-model="filtroImpulsador"
          placeholder="Buscar impulsador"
          class="input-texto"
        />
      </label>

      <label>
        <span class="field-label">Plaza</span>
        <input
          type="text"
          v-model="filtroPlaza"
          placeholder="Buscar plaza"
          class="input-texto"
        />
      </label>

      <label>
        <span class="field-label">Distrito</span>
        <input
          type="text"
          v-model="filtroDistrito"
          placeholder="Buscar distrito"
          class="input-texto"
        />
      </label>
    </div>

    <div class="toolbar-line">
      <div class="toolbar-actions">
        <button type="button" @click="exportarACsv" class="boton-exportar" :disabled="exportandoExcel || deletingActivationId">Exportar CSV</button>
        <button
          type="button"
          @click="exportarAExcelConImagenes"
          class="boton-exportar boton-exportar-excel"
          :disabled="exportandoExcel || deletingActivationId"
        >
          {{ exportandoExcel ? 'Generando Excel en servidor...' : 'Exportar Excel + Imagenes' }}
        </button>
      </div>
      <span class="meta-pill">{{ activacionesFiltradas.length }} visibles</span>
    </div>

    <p v-if="activacionesFiltradas.length === 0" class="panel-empty">
      No hay registros para los filtros seleccionados.
    </p>

    <div v-else class="table-wrap activaciones-table-wrap activaciones-resumen-wrap">
      <table class="tabla-activaciones">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Activador o impulsador</th>
            <th>Cliente o comercio</th>
            <th>Tipo Activacion</th>
            <th>Plaza</th>
            <th>Estado o resultado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(activacion, index) in activacionesFiltradas" :key="getRowKey(activacion, index)" class="activacion-row" tabindex="0" @click="abrirDetalle(activacion)" @keydown.enter="abrirDetalle(activacion)">
            <td>{{ activacion.fecha_activacion || formatCreatedAtBolivia(activacion.created_at) }}</td>
            <td>{{ activacion.impulsador || '-' }}</td>
            <td>{{ getClienteComercio(activacion) }}</td>
            <td>{{ activacion.tipo_activacion || '-' }}</td>
            <td>{{ getCiudadActivacion(activacion) || '-' }}</td>
            <td><span class="resultado-etiqueta" :class="{ 'resultado-error': activacion.hubo_error === true }">{{ getResultado(activacion) }}</span></td>
            <td>
              <div class="acciones">
                <button class="boton boton-editar" @click.stop="abrirDetalle(activacion)">Ver detalle</button>
                <button v-if="canAdminister" class="boton boton-eliminar" :disabled="!hasCredentials || deletingActivationId === activacion.id || !activacion.id" @click.stop="eliminarActivacion(activacion)">{{ deletingActivationId === activacion.id ? 'Eliminando...' : !activacion.id ? 'Sin ID' : 'Eliminar' }}</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <teleport to="body">
      <div v-if="activacionSeleccionada" class="detalle-overlay" @click.self="cerrarDetalle">
        <aside class="detalle-activacion" role="dialog" aria-modal="true" aria-label="Detalle de activacion">
          <header class="detalle-header">
            <div><p class="view-kicker">Registro de activacion</p><h3 class="detalle-title">{{ getClienteComercio(activacionSeleccionada) }}</h3></div>
            <button v-if="canAdminister && !editandoActivacion" type="button" class="boton boton-editar" :disabled="!canEditActivaciones || !activacionSeleccionada.id" @click="iniciarEdicion">Editar</button>
            <button type="button" class="detalle-close" aria-label="Cerrar detalle" @click="cerrarDetalle">×</button>
          </header>
          <form v-if="editandoActivacion" class="detalle-body" @submit.prevent="guardarEdicion">
            <fieldset class="edicion-activacion" :disabled="guardandoEdicion">
              <label><span class="field-label">Nombre del cliente o comercio</span><input v-model="formularioEdicion.nombre" class="input-texto"></label>
              <label><span class="field-label">Telefono</span><input v-model="formularioEdicion.telefono_cliente" class="input-texto" inputmode="tel"></label>
              <label><span class="field-label">Correo</span><input v-model="formularioEdicion.email_cliente" type="email" class="input-texto"></label>
              <label><span class="field-label">Plaza</span><input v-model="formularioEdicion.plaza" class="input-texto"></label>
              <label><span class="field-label">Tipo de activacion</span><input v-model="formularioEdicion.tipo_activacion" class="input-texto"></label>
              <label v-if="resultadoEditableKey"><span class="field-label">Resultado o estado</span><input v-model="formularioEdicion.resultado" class="input-texto"></label>
              <label class="edicion-field-wide"><span class="field-label">Observaciones</span><textarea v-model="formularioEdicion.observaciones" class="input-texto" rows="3"></textarea></label>
              <template v-if="esActivacionComercio">
                <label><span class="field-label">Rubro del comercio</span><input v-model="formularioEdicion.rubro_comercio" class="input-texto"></label>
                <label v-if="normalizeText(formularioEdicion.rubro_comercio) === 'otro'"><span class="field-label">Otro rubro</span><input v-model="formularioEdicion.rubro_comercio_otro" class="input-texto"></label>
                <label><span class="field-label">Comercio fuera de mercado</span><select v-model="formularioEdicion.comercio_fuera_mercado" class="input-texto"><option :value="false">No</option><option :value="true">Si</option></select></label>
                <label v-if="esTiendaBarrio"><span class="field-label">Tipo de tienda</span><select v-model="formularioEdicion.tipo_tienda" class="input-texto"><option value="">Sin especificar</option><option>Pequeña</option><option>Mediana</option><option>Grande</option></select></label>
              </template>
              <label><span class="field-label">Tipo de error</span><input v-model="formularioEdicion.tipo_error" class="input-texto"></label>
              <label class="edicion-field-wide"><span class="field-label">Descripcion del error</span><textarea v-model="formularioEdicion.descripcion_error" class="input-texto" rows="3"></textarea></label>
              <label><span class="field-label">Es plaza temporal</span><select v-model="formularioEdicion.es_plaza_temporal" class="input-texto"><option :value="false">No</option><option :value="true">Si</option></select></label>
              <label v-if="formularioEdicion.es_plaza_temporal"><span class="field-label">Plaza temporal</span><input v-model="formularioEdicion.plaza_temporal" class="input-texto"></label>
              <label class="edicion-field-wide"><span class="field-label">Motivo de edicion</span><textarea v-model="motivoEdicion" class="input-texto" rows="3" placeholder="Obligatorio"></textarea></label>
            </fieldset>
            <div class="confirm-actions"><button type="button" class="boton boton-cancelar" :disabled="guardandoEdicion" @click="cancelarEdicion">Cancelar</button><button type="submit" class="boton boton-guardar" :disabled="guardandoEdicion || !motivoEdicion.trim()">{{ guardandoEdicion ? 'Guardando...' : 'Guardar cambios' }}</button></div>
          </form>
          <div v-else class="detalle-body">
            <section v-for="section in seccionesDetalle" :key="section.title" class="detalle-section">
              <h4>{{ section.title }}</h4>
              <dl class="detalle-grid">
                <div v-for="field in section.fields" :key="field.key" class="detalle-field" :class="{ 'detalle-field-wide': field.image || typeof field.value === 'object' }">
                  <dt>{{ field.label }}</dt>
                  <dd v-if="field.image">
                    <a :href="getFotoPublicUrl(field.value)" target="_blank" rel="noreferrer"><img :src="getFotoPublicUrl(field.value)" :alt="field.label" class="detalle-thumbnail"></a>
                  </dd>
                  <dd v-else-if="esUrl(field.value)"><a :href="field.value" target="_blank" rel="noreferrer" class="link-foto">Abrir enlace</a></dd>
                  <dd v-else>{{ formatearValor(field.value, field.key) }}</dd>
                </div>
              </dl>
            </section>
          </div>
        </aside>
      </div>
    </teleport>
  </div>
</template>
