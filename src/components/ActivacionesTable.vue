<script setup>
import { computed, ref } from 'vue'
import { adminApiRequest } from '../lib/adminApiClient'
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
  requestConfirmation,
} from '../lib/feedback'
import { normalizeText } from '../lib/textUtils'

const props = defineProps({
  activaciones: {
    type: Array,
    default: () => [],
  },
})
const emit = defineEmits(['activacion-eliminada'])

const storageBaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const storageBucket =
  import.meta.env.VITE_STORAGE_BUCKET_ACTIVACIONES ?? 'fotos-activaciones'
const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')
let excelJsModulePromise = null

const filtroPlaza = ref('')
const filtroDistrito = ref('')
const filtroImpulsador = ref('')
const filtroFecha = ref('')
const exportandoExcel = ref(false)
const apiUser = ref('')
const apiPass = ref('')
const conectado = ref(false)
const conectando = ref(false)
const authErrorMsg = ref(null)
const deletingActivationId = ref(null)
const loadingStorageSummary = ref(false)
const storageSummary = ref(null)

const activacionesFiltradas = computed(() => {
  const plazaQuery = normalizeText(filtroPlaza.value)
  const distritoQuery = normalizeText(filtroDistrito.value)
  const impulsadorQuery = normalizeText(filtroImpulsador.value)

  return props.activaciones.filter((activacion) => {
    const plaza = normalizeText(activacion.plaza)
    const distrito = normalizeText(activacion.zona_activacion)
    const impulsador = normalizeText(activacion.impulsador)
    const fecha = activacion.fecha_activacion ?? ''

    const coincidePlaza = !plazaQuery || plaza.includes(plazaQuery)
    const coincideDistrito = !distritoQuery || distrito.includes(distritoQuery)
    const coincideImpulsador = !impulsadorQuery || impulsador.includes(impulsadorQuery)
    const coincideFecha = !filtroFecha.value || fecha === filtroFecha.value

    return coincidePlaza && coincideDistrito && coincideImpulsador && coincideFecha
  })
})

const puedeConectar = computed(() => {
  return Boolean(apiUser.value.trim() && apiPass.value)
})

const storageUsagePercentLabel = computed(() => {
  const percent = storageSummary.value?.storage_usage_percent
  if (percent === null || percent === undefined) {
    return 'N/D'
  }

  return `${percent.toFixed(1)}%`
})

const databaseUsagePercentLabel = computed(() => {
  const percent = storageSummary.value?.database_usage_percent
  if (percent === null || percent === undefined) {
    return 'N/D'
  }

  return `${percent.toFixed(1)}%`
})

const databaseSizeAvailable = computed(() => {
  const size = storageSummary.value?.database_size_bytes
  return size !== null && size !== undefined && Number.isFinite(Number(size)) && Number(size) >= 0
})

const planReference = computed(() => {
  return storageSummary.value?.plan_reference ?? null
})

function csvEscape(value) {
  if (value === null || value === undefined) {
    return ''
  }

  const normalized = String(value).replace(/"/g, '""')

  if (/[",\n]/.test(normalized)) {
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

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || bytes === '') {
    return 'N/D'
  }

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
    username: apiUser.value,
    password: apiPass.value,
    ...options,
  })
}

async function cargarStorageSummary() {
  if (!conectado.value) {
    return
  }

  loadingStorageSummary.value = true

  try {
    const result = await requestAdmin('/admin/storage/summary')
    storageSummary.value = result.summary ?? null
  } catch (error) {
    notifyError(getErrorMessage(error))
  } finally {
    loadingStorageSummary.value = false
  }
}

async function conectarApi() {
  if (!puedeConectar.value) {
    authErrorMsg.value = 'Ingresa usuario y password de API.'
    notifyWarning(authErrorMsg.value)
    return
  }

  authErrorMsg.value = null
  conectando.value = true

  try {
    await requestAdmin('/admin/healthz')
    conectado.value = true
    await cargarStorageSummary()
    notifySuccess('Modulo de activaciones conectado a la API admin.')
  } catch (error) {
    conectado.value = false
    authErrorMsg.value = getErrorMessage(error)
    notifyError(authErrorMsg.value)
  } finally {
    conectando.value = false
  }
}

async function eliminarActivacion(activacion) {
  if (!conectado.value) {
    notifyWarning('Conecta la API admin para eliminar activaciones.')
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

    await cargarStorageSummary()
  } catch (error) {
    notifyError(getErrorMessage(error))
  } finally {
    deletingActivationId.value = null
  }
}

async function loadExcelJs() {
  if (!excelJsModulePromise) {
    excelJsModulePromise = import('exceljs')
  }

  return excelJsModulePromise
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

  URL.revokeObjectURL(objectUrl)
}

function getDatosParaExportar() {
  const hayFiltros =
    filtroPlaza.value || filtroDistrito.value || filtroImpulsador.value || filtroFecha.value

  return hayFiltros ? activacionesFiltradas.value : props.activaciones
}

const columnasExportacion = [
  ['#', (_row, index) => index + 1],
  ['Creado', (row) => row.created_at],
  ['Fecha', (row) => row.fecha_activacion],
  ['Impulsador', (row) => row.impulsador],
  ['Plaza', (row) => row.plaza],
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
  ['Foto URL', (row) => getFotoPublicUrl(row.foto_url)],
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
  csvLines.push(columnasExportacion.map(([header]) => csvEscape(header)).join(','))

  for (const [index, row] of datos.entries()) {
    const values = columnasExportacion.map(([, getValue]) =>
      csvEscape(getValue(row, index))
    )
    csvLines.push(values.join(','))
  }

  descargarArchivo({
    filename: 'activaciones.csv',
    content: `\uFEFF${csvLines.join('\n')}`,
    mimeType: 'text/csv;charset=utf-8;',
  })

  notifySuccess('CSV exportado correctamente.')
}

function getImageExtension(contentType) {
  if (!contentType) return null
  const lower = contentType.toLowerCase()

  if (lower.includes('png')) return 'png'
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpeg'

  return null
}

async function exportarAExcelConImagenes() {
  const datos = getDatosParaExportar()

  if (!datos.length) {
    notifyInfo('No hay datos para exportar con los filtros actuales.')
    return
  }

  exportandoExcel.value = true

  try {
    const { default: ExcelJS } = await loadExcelJs()
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Activaciones', {
      views: [{ state: 'frozen', ySplit: 1 }],
    })

    worksheet.columns = [
      { header: '#', key: 'numero', width: 7 },
      { header: 'Creado', key: 'creado', width: 26 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Impulsador', key: 'impulsador', width: 24 },
      { header: 'Plaza', key: 'plaza', width: 18 },
      { header: 'Distrito', key: 'distrito', width: 20 },
      { header: 'Nombres Cliente', key: 'nombres', width: 24 },
      { header: 'Apellidos Cliente', key: 'apellidos', width: 24 },
      { header: 'CI Cliente', key: 'ci', width: 14 },
      { header: 'Telefono Cliente', key: 'telefono', width: 16 },
      { header: 'Email Cliente', key: 'email', width: 28 },
      { header: 'Descargo App', key: 'descargo', width: 14 },
      { header: 'Registro', key: 'registro', width: 12 },
      { header: 'Cash In', key: 'cashIn', width: 10 },
      { header: 'Cash Out', key: 'cashOut', width: 10 },
      { header: 'P2P', key: 'p2p', width: 10 },
      { header: 'QR Fisico', key: 'qrFisico', width: 12 },
      { header: 'Respaldo', key: 'respaldo', width: 11 },
      { header: 'Hubo Error', key: 'huboError', width: 12 },
      { header: 'Descripcion Error', key: 'descripcionError', width: 30 },
      { header: 'Tipo Activacion', key: 'tipoActivacion', width: 20 },
      { header: 'Tipo Comercio', key: 'tipoComercio', width: 20 },
      { header: 'Tamano Tienda', key: 'tamanoTienda', width: 18 },
      { header: 'Foto', key: 'foto', width: 16 },
      { header: 'Latitud', key: 'latitud', width: 14 },
      { header: 'Longitud', key: 'longitud', width: 14 },
      { header: 'Usuario ID', key: 'usuarioId', width: 38 },
    ]

    const headerRow = worksheet.getRow(1)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF101E2E' },
      }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1E3B58' } },
        left: { style: 'thin', color: { argb: 'FF1E3B58' } },
        bottom: { style: 'thin', color: { argb: 'FF1E3B58' } },
        right: { style: 'thin', color: { argb: 'FF1E3B58' } },
      }
    })

    for (const [index, row] of datos.entries()) {
      worksheet.addRow({
        numero: index + 1,
        creado: row.created_at,
        fecha: row.fecha_activacion,
        impulsador: row.impulsador,
        plaza: row.plaza,
        distrito: row.zona_activacion,
        nombres: row.nombres_cliente,
        apellidos: row.apellidos_cliente,
        ci: row.ci_cliente,
        telefono: row.telefono_cliente,
        email: row.email_cliente,
        descargo: row.descargo_app ? 'Si' : 'No',
        registro: row.registro ? 'Si' : 'No',
        cashIn: row.cash_in ? 'Si' : 'No',
        cashOut: row.cash_out ? 'Si' : 'No',
        p2p: row.p2p ? 'Si' : 'No',
        qrFisico: row.qr_fisico ? 'Si' : 'No',
        respaldo: row.respaldo ? 'Si' : 'No',
        huboError: row.hubo_error ? 'Si' : 'No',
        descripcionError: row.descripcion_error,
        tipoActivacion: row.tipo_activacion,
        tipoComercio: row.tipo_comercio,
        tamanoTienda: row.tamano_tienda,
        foto: row.foto_url ? 'Imagen adjunta' : '',
        latitud: row.latitud,
        longitud: row.longitud,
        usuarioId: row.usuario_id,
      })
    }

    const fotoColumnIndex = worksheet.getColumn('foto').number

    for (const [index, row] of datos.entries()) {
      if (!row.foto_url) {
        continue
      }

      const fotoUrl = getFotoPublicUrl(row.foto_url)
      const rowNumber = index + 2

      try {
        const response = await fetch(fotoUrl)
        if (!response.ok) {
          worksheet.getCell(rowNumber, fotoColumnIndex).value = fotoUrl
          continue
        }

        const extension = getImageExtension(response.headers.get('content-type'))
        if (!extension) {
          worksheet.getCell(rowNumber, fotoColumnIndex).value = fotoUrl
          continue
        }

        const imageBuffer = await response.arrayBuffer()
        const imageId = workbook.addImage({
          buffer: imageBuffer,
          extension,
        })

        const excelRow = worksheet.getRow(rowNumber)
        if (!excelRow.height || excelRow.height < 52) {
          excelRow.height = 52
        }

        worksheet.addImage(imageId, {
          tl: { col: fotoColumnIndex - 1 + 0.1, row: rowNumber - 1 + 0.1 },
          ext: { width: 88, height: 56 },
          editAs: 'oneCell',
        })

        worksheet.getCell(rowNumber, fotoColumnIndex).value = ''
      } catch {
        worksheet.getCell(rowNumber, fotoColumnIndex).value = fotoUrl
      }
    }

    const workbookBuffer = await workbook.xlsx.writeBuffer()
    descargarArchivo({
      filename: 'activaciones_con_imagenes.xlsx',
      content: workbookBuffer,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    notifySuccess('Excel con imagenes exportado correctamente.')
  } catch (error) {
    console.error('Error al exportar excel:', error)
    notifyError('No se pudo generar el archivo Excel.')
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
        Filtra la base por fecha, impulsador, plaza o distrito y exporta los resultados.
      </p>
    </div>

    <div class="forms-grid">
      <div class="formulario-registro">
        <h3 class="subtitulo">Conexion API Admin</h3>
        <form class="formulario-campos" @submit.prevent="conectarApi">
          <input
            v-model="apiUser"
            placeholder="Usuario API"
            class="input-texto"
            @keydown.enter.prevent="conectarApi"
          />
          <input
            v-model="apiPass"
            type="password"
            placeholder="Password API"
            class="input-texto"
            @keydown.enter.prevent="conectarApi"
          />
          <button type="submit" class="boton boton-primario" :disabled="conectando || !puedeConectar">
            {{ conectando ? 'Conectando...' : 'Conectar para gestion segura' }}
          </button>
          <p v-if="authErrorMsg" class="mensaje-error">{{ authErrorMsg }}</p>
          <p v-else-if="conectado">Conectado a {{ apiBaseUrl }}</p>
        </form>
      </div>

      <div class="formulario-registro">
        <div class="toolbar-line">
          <h3 class="subtitulo subtitulo-inline">Capacidad de almacenamiento</h3>
          <button class="boton" :disabled="!conectado || loadingStorageSummary" @click="cargarStorageSummary">
            {{ loadingStorageSummary ? 'Actualizando...' : 'Actualizar' }}
          </button>
        </div>
        <div v-if="!conectado" class="panel-empty">
          Conecta la API admin para ver uso de almacenamiento y estimado disponible.
        </div>
        <div v-else-if="!storageSummary" class="panel-empty">
          No se pudo cargar el resumen de almacenamiento.
        </div>
        <div v-else class="capacity-grid">
          <div class="capacity-card">
            <p class="capacity-label">Fotos usadas</p>
            <p class="capacity-value">{{ formatBytes(storageSummary.storage_used_bytes) }}</p>
            <p class="capacity-detail">
              {{ storageUsagePercentLabel }} del limite · {{ storageSummary.storage_objects_count }} archivos
            </p>
          </div>
          <div class="capacity-card">
            <p class="capacity-label">Disponible (fotos)</p>
            <p class="capacity-value">{{ formatBytes(storageSummary.storage_remaining_bytes) }}</p>
            <p class="capacity-detail">
              de {{ formatBytes(storageSummary.storage_limit_bytes) }}
            </p>
          </div>
          <div v-if="databaseSizeAvailable" class="capacity-card">
            <p class="capacity-label">Base de datos</p>
            <p class="capacity-value">{{ formatBytes(storageSummary.database_size_bytes) }}</p>
            <p class="capacity-detail">
              {{ databaseUsagePercentLabel }} en uso · disponible {{ formatBytes(storageSummary.database_remaining_bytes) }}
            </p>
          </div>
          <div v-if="planReference" class="capacity-card">
            <p class="capacity-label">Plan</p>
            <p class="capacity-value">{{ planReference.name }}</p>
            <div class="capacity-chips">
              <span class="capacity-chip">API ilimitada</span>
              <span class="capacity-chip">MAU {{ formatNumber(planReference.monthly_active_users_limit) }}</span>
              <span class="capacity-chip">DB {{ formatBytes(planReference.database_limit_bytes) }}</span>
              <span class="capacity-chip">Storage {{ formatBytes(planReference.file_storage_limit_bytes) }}</span>
              <span class="capacity-chip">Egress {{ formatBytes(planReference.egress_limit_bytes) }}</span>
              <span class="capacity-chip">Cache {{ formatBytes(planReference.cached_egress_limit_bytes) }}</span>
              <span class="capacity-chip">RAM {{ planReference.shared_ram_mb }} MB</span>
              <span class="capacity-chip">{{ planReference.support }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="filtros filtros-grid filtros-activaciones">
      <label>
        <span class="field-label">Fecha</span>
        <input type="date" v-model="filtroFecha" class="input-texto" />
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
        <button @click="exportarACsv" class="boton-exportar">Exportar CSV</button>
        <button
          @click="exportarAExcelConImagenes"
          class="boton-exportar boton-exportar-excel"
          :disabled="exportandoExcel"
        >
          {{ exportandoExcel ? 'Generando Excel...' : 'Exportar Excel + Imagenes' }}
        </button>
      </div>
      <span class="meta-pill">{{ activacionesFiltradas.length }} visibles</span>
    </div>

    <p v-if="activacionesFiltradas.length === 0" class="panel-empty">
      No hay registros para los filtros seleccionados.
    </p>

    <div v-else class="table-wrap activaciones-table-wrap">
      <table class="tabla-activaciones">
        <thead>
          <tr>
            <th>#</th>
            <th>Creado</th>
            <th>Impulsador</th>
            <th>Plaza</th>
            <th>Distrito</th>
            <th>Fecha</th>
            <th>Nombres</th>
            <th>Apellidos</th>
            <th>CI</th>
            <th>Telefono</th>
            <th>Email</th>
            <th>Descargo App</th>
            <th>Registro</th>
            <th>Cash In</th>
            <th>Cash Out</th>
            <th>P2P</th>
            <th>QR Fisico</th>
            <th>Respaldo</th>
            <th>Error</th>
            <th>Descripcion Error</th>
            <th>Tipo Activacion</th>
            <th>Tipo Comercio</th>
            <th>Tamano Tienda</th>
            <th>Foto</th>
            <th>Latitud</th>
            <th>Longitud</th>
            <th>Usuario ID</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(activacion, index) in activacionesFiltradas" :key="getRowKey(activacion, index)">
            <td>{{ index + 1 }}</td>
            <td>{{ activacion.created_at }}</td>
            <td>{{ activacion.impulsador }}</td>
            <td>{{ activacion.plaza }}</td>
            <td>{{ activacion.zona_activacion }}</td>
            <td>{{ activacion.fecha_activacion }}</td>
            <td>{{ activacion.nombres_cliente }}</td>
            <td>{{ activacion.apellidos_cliente }}</td>
            <td>{{ activacion.ci_cliente }}</td>
            <td>{{ activacion.telefono_cliente }}</td>
            <td>{{ activacion.email_cliente }}</td>
            <td>{{ activacion.descargo_app ? 'Si' : 'No' }}</td>
            <td>{{ activacion.registro ? 'Si' : 'No' }}</td>
            <td>{{ activacion.cash_in ? 'Si' : 'No' }}</td>
            <td>{{ activacion.cash_out ? 'Si' : 'No' }}</td>
            <td>{{ activacion.p2p ? 'Si' : 'No' }}</td>
            <td>{{ activacion.qr_fisico ? 'Si' : 'No' }}</td>
            <td>{{ activacion.respaldo ? 'Si' : 'No' }}</td>
            <td>{{ activacion.hubo_error ? 'Si' : 'No' }}</td>
            <td>{{ activacion.descripcion_error }}</td>
            <td>{{ activacion.tipo_activacion }}</td>
            <td>{{ activacion.tipo_comercio }}</td>
            <td>{{ activacion.tamano_tienda }}</td>
            <td>
              <a
                v-if="activacion.foto_url"
                :href="getFotoPublicUrl(activacion.foto_url)"
                target="_blank"
                rel="noreferrer"
                class="link-foto"
              >
                Ver foto
              </a>
            </td>
            <td>{{ activacion.latitud }}</td>
            <td>{{ activacion.longitud }}</td>
            <td>{{ activacion.usuario_id }}</td>
            <td>
              <button
                class="boton boton-eliminar"
                :disabled="!conectado || deletingActivationId === activacion.id || !activacion.id"
                @click="eliminarActivacion(activacion)"
              >
                {{
                  deletingActivationId === activacion.id
                    ? 'Eliminando...'
                    : !activacion.id
                      ? 'Sin ID'
                      : 'Eliminar'
                }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
