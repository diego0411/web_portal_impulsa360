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
const { username: apiUser, password: apiPass, hasCredentials } = useAdminApiAuth()

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
  { title: 'Informacion del comercio o tienda', keys: ['nombre_comercio', 'comercio', 'cliente', 'tipo_comercio', 'tamano_tienda', 'rubro', 'comercio_fuera_mercado', 'plaza_temporal'] },
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
function cerrarDetalle() { activacionSeleccionada.value = null }

async function requestAdmin(path, options = {}) {
  return adminApiRequest({
    baseUrl: apiBaseUrl,
    path,
    username: apiUser.value,
    password: apiPass.value,
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
        creado: formatCreatedAtBolivia(row.created_at, { emptyValue: '' }),
        fecha: row.fecha_activacion,
        impulsador: row.impulsador,
        plaza: getCiudadActivacion(row),
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
        Filtra la base por rango de fechas, impulsador, plaza o distrito y exporta los resultados.
      </p>
    </div>
    <p v-if="!hasCredentials" class="capacity-detail">
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
        <button @click="exportarACsv" class="boton-exportar" :disabled="exportandoExcel || deletingActivationId">Exportar CSV</button>
        <button
          @click="exportarAExcelConImagenes"
          class="boton-exportar boton-exportar-excel"
          :disabled="exportandoExcel || deletingActivationId"
        >
          {{ exportandoExcel ? 'Generando Excel...' : 'Exportar Excel + Imagenes' }}
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
                <button class="boton boton-eliminar" :disabled="!hasCredentials || deletingActivationId === activacion.id || !activacion.id" @click.stop="eliminarActivacion(activacion)">{{ deletingActivationId === activacion.id ? 'Eliminando...' : !activacion.id ? 'Sin ID' : 'Eliminar' }}</button>
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
            <button type="button" class="detalle-close" aria-label="Cerrar detalle" @click="cerrarDetalle">×</button>
          </header>
          <div class="detalle-body">
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
