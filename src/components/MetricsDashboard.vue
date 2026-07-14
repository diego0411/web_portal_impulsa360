<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchAllActivaciones } from '../lib/activacionesService'

const activaciones = ref([])
const loading = ref(true)
const errorMsg = ref(null)
const filtroDesde = ref('')
const filtroHasta = ref('')
const filtroPlaza = ref('')
const filtroActivador = ref('')
const filtroTipo = ref('')
const filtroLider = ref('')
const selectedKpi = ref('total')
const numberFormatter = new Intl.NumberFormat('es-BO')
const nowParts = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
)
const todayKey = `${nowParts.year}-${nowParts.month}-${nowParts.day}`
const currentMonthKey = `${nowParts.year}-${nowParts.month}`

onMounted(async () => {
  loading.value = true
  errorMsg.value = null
  try {
    activaciones.value = await fetchAllActivaciones()
  } catch (error) {
    console.error('Error al cargar metricas:', error)
    errorMsg.value = 'No fue posible obtener las activaciones.'
  } finally {
    loading.value = false
  }
})

function texto(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizado(value) {
  return texto(value).toLocaleLowerCase('es')
}

function fechaRegistro(item) {
  const value = texto(item.fecha_activacion) || texto(item.created_at)
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
}

function horaRegistro(item) {
  if (!item.created_at) return 'Sin hora'
  const date = new Date(item.created_at)
  if (Number.isNaN(date.getTime())) return 'Sin hora'
  return `${new Intl.DateTimeFormat('es-BO', { hour: '2-digit', hour12: false, timeZone: 'America/La_Paz' }).format(date)}:00`
}

function plazaRegistro(item) {
  return texto(item.ciudad_activacion) || texto(item.plaza) || 'Sin plaza'
}

function liderRegistro(item) {
  return texto(item.lider_nombre) || texto(item.lider) || texto(item.nombre_lider) || ''
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0)
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function sumar(map, key) {
  const label = texto(key) || 'Sin especificar'
  map.set(label, (map.get(label) ?? 0) + 1)
}

function ranking(map, limit = Infinity) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))
}

const opciones = computed(() => {
  const plazas = new Set()
  const activadores = new Set()
  const tipos = new Set()
  const lideres = new Set()
  for (const item of activaciones.value) {
    plazas.add(plazaRegistro(item))
    if (texto(item.impulsador)) activadores.add(texto(item.impulsador))
    if (texto(item.tipo_activacion)) tipos.add(texto(item.tipo_activacion))
    if (liderRegistro(item)) lideres.add(liderRegistro(item))
  }
  const ordenar = (values) => [...values].sort((a, b) => a.localeCompare(b, 'es'))
  return { plazas: ordenar(plazas), activadores: ordenar(activadores), tipos: ordenar(tipos), lideres: ordenar(lideres) }
})

const dashboard = computed(() => {
  const rows = []
  const kpis = { total: 0, hoy: 0, mes: 0, cashIn: 0, errores: 0, plazasTemporales: 0 }
  const activadorQuery = normalizado(filtroActivador.value)

  for (const item of activaciones.value) {
    const fecha = fechaRegistro(item)
    const plaza = plazaRegistro(item)
    const activador = texto(item.impulsador) || 'Sin activador'
    const tipo = texto(item.tipo_activacion) || 'Sin especificar'
    const lider = liderRegistro(item)
    if (filtroDesde.value && (!fecha || fecha < filtroDesde.value)) continue
    if (filtroHasta.value && (!fecha || fecha > filtroHasta.value)) continue
    if (filtroPlaza.value && plaza !== filtroPlaza.value) continue
    if (activadorQuery && !normalizado(activador).includes(activadorQuery)) continue
    if (filtroTipo.value && tipo !== filtroTipo.value) continue
    if (filtroLider.value && lider !== filtroLider.value) continue

    rows.push(item)
    kpis.total += 1
    if (fecha === todayKey) kpis.hoy += 1
    if (fecha.startsWith(currentMonthKey)) kpis.mes += 1
    if (item.cash_in === true) kpis.cashIn += 1
    if (item.hubo_error === true) {
      kpis.errores += 1
    }
    if (item.es_plaza_temporal === true) kpis.plazasTemporales += 1
  }

  return { rows, kpis }
})

const tarjetas = computed(() => [
  { key: 'total', label: 'Total de activaciones', value: dashboard.value.kpis.total, note: 'Registros en el corte actual' },
  { key: 'hoy', label: 'Activaciones de hoy', value: dashboard.value.kpis.hoy, note: formatDate(todayKey) },
  { key: 'mes', label: 'Activaciones del mes', value: dashboard.value.kpis.mes, note: `Mes ${nowParts.month}/${nowParts.year}` },
  { key: 'cash_in', label: 'Con Cash-In', value: dashboard.value.kpis.cashIn, note: 'Cash-In completado' },
  { key: 'errores', label: 'Registros con error', value: dashboard.value.kpis.errores, note: 'Incidencias reportadas' },
  { key: 'plazas_temporales', label: 'Plazas temporales', value: dashboard.value.kpis.plazasTemporales, note: 'Marcadas como temporales' },
])

const graficosSeleccionados = computed(() => {
  const maps = {}
  const map = (key) => maps[key] ?? (maps[key] = new Map())
  const selected = selectedKpi.value
  for (const item of dashboard.value.rows) {
    const fecha = fechaRegistro(item)
    const plaza = plazaRegistro(item)
    const activador = texto(item.impulsador) || 'Sin activador'
    const tipo = texto(item.tipo_activacion) || 'Sin especificar'
    let include = selected === 'total'
    if (selected === 'hoy') include = fecha === todayKey
    if (selected === 'mes') include = fecha.startsWith(currentMonthKey)
    if (selected === 'cash_in') include = item.cash_in === true
    if (selected === 'errores') include = item.hubo_error === true
    if (selected === 'plazas_temporales') include = item.es_plaza_temporal === true

    if (selected === 'cash_in') sumar(map('cashStatus'), item.cash_in === true ? 'Con Cash-In' : 'Sin Cash-In')
    if (!include) continue
    sumar(map('dia'), fecha || 'Sin fecha')
    sumar(map('plaza'), plaza)
    sumar(map('activador'), activador)
    sumar(map('tipo'), tipo)
    if (selected === 'hoy') sumar(map('hora'), horaRegistro(item))
    if (selected === 'errores') sumar(map('errorTipo'), texto(item.tipo_error) || 'Sin tipo')
    if (selected === 'plazas_temporales') sumar(map('plazaTemporal'), texto(item.plaza_temporal) || plaza)
  }

  const chronological = (key) => ranking(map(key)).sort((a, b) => a.label.localeCompare(b.label))
  const common = {
    plaza: { title: 'Activaciones por plaza', subtitle: 'Distribucion territorial.', values: ranking(map('plaza')), tone: 'soft' },
    activador: { title: selected === 'total' ? 'Top 10 activadores' : 'Activadores relacionados', subtitle: 'Participacion por activador.', values: ranking(map('activador'), 10) },
  }
  const configs = {
    total: [
      { title: 'Activaciones por dia', subtitle: 'Evolucion del volumen filtrado.', values: chronological('dia'), dateLabels: true, wide: true },
      common.plaza,
      { title: 'Tipos de activacion', subtitle: 'Composicion del trabajo.', values: ranking(map('tipo')), tone: 'soft' },
      common.activador,
    ],
    hoy: [
      { title: 'Activaciones de hoy por hora', subtitle: 'Distribucion horaria en Bolivia.', values: chronological('hora'), wide: true },
      common.plaza, common.activador,
    ],
    mes: [
      { title: 'Tendencia diaria del mes', subtitle: 'Actividad del mes calendario actual.', values: chronological('dia'), dateLabels: true, wide: true },
      common.plaza, common.activador,
    ],
    cash_in: [
      { title: 'Con y sin Cash-In', subtitle: 'Comparacion del corte filtrado.', values: ranking(map('cashStatus')), wide: true },
      { title: 'Evolucion de Cash-In', subtitle: 'Activaciones con Cash-In por dia.', values: chronological('dia'), dateLabels: true },
      common.plaza, common.activador,
    ],
    errores: [
      { title: 'Errores por tipo', subtitle: 'Clasificacion de incidencias.', values: ranking(map('errorTipo')), tone: 'danger', wide: true },
      { title: 'Errores por dia', subtitle: 'Evolucion de incidencias.', values: chronological('dia'), dateLabels: true, tone: 'danger' },
      common.plaza, common.activador,
    ],
    plazas_temporales: [
      { title: 'Tendencia de plazas temporales', subtitle: 'Registros temporales por dia.', values: chronological('dia'), dateLabels: true, wide: true },
      { title: 'Plazas temporales mas usadas', subtitle: 'Frecuencia declarada.', values: ranking(map('plazaTemporal')), tone: 'soft' },
      common.activador,
    ],
  }
  return (configs[selected] ?? []).filter((chart) => chart.values.length)
})

const hayFiltros = computed(() => Boolean(filtroDesde.value || filtroHasta.value || filtroPlaza.value || filtroActivador.value || filtroTipo.value || filtroLider.value))

function limpiarFiltros() {
  filtroDesde.value = ''
  filtroHasta.value = ''
  filtroPlaza.value = ''
  filtroActivador.value = ''
  filtroTipo.value = ''
  filtroLider.value = ''
}

function anchoBarra(value, values) {
  const max = Math.max(1, ...values.map((item) => item.value))
  return `${Math.max(3, (value / max) * 100)}%`
}
</script>

<template>
  <section class="view-page contenedor-metricas">
    <header class="view-header">
      <p class="view-kicker">Inteligencia Operativa</p>
      <h1 class="view-title">Dashboard de Activaciones</h1>
      <p class="view-description">Consulta volumen, cobertura, desempeño comercial e incidencias desde una sola vista.</p>
      <div class="meta-row"><span class="meta-pill">{{ loading ? 'Sincronizando...' : `${formatNumber(dashboard.kpis.total)} activaciones filtradas` }}</span></div>
    </header>

    <div class="panel-card metrics-panel">
      <div class="toolbar-line">
        <div><h2 class="subtitulo subtitulo-inline">Dashboard v2</h2><p class="section-caption">Todos los indicadores responden al mismo conjunto de filtros.</p></div>
        <div class="toolbar-actions"><span class="meta-pill">{{ formatNumber(activaciones.length) }} totales</span><button class="boton" :disabled="!hayFiltros" @click="limpiarFiltros">Limpiar filtros</button></div>
      </div>

      <div class="filtros filtros-grid filtros-metricas-v2">
        <label><span class="field-label">Fecha desde</span><input v-model="filtroDesde" type="date" class="input-texto"></label>
        <label><span class="field-label">Fecha hasta</span><input v-model="filtroHasta" type="date" class="input-texto"></label>
        <label><span class="field-label">Plaza</span><select v-model="filtroPlaza" class="input-texto"><option value="">Todas</option><option v-for="plaza in opciones.plazas" :key="plaza">{{ plaza }}</option></select></label>
        <label><span class="field-label">Activador</span><input v-model="filtroActivador" class="input-texto" list="activadores-dashboard" placeholder="Buscar activador"><datalist id="activadores-dashboard"><option v-for="item in opciones.activadores" :key="item" :value="item"></option></datalist></label>
        <label><span class="field-label">Tipo de activacion</span><select v-model="filtroTipo" class="input-texto"><option value="">Todos</option><option v-for="tipo in opciones.tipos" :key="tipo">{{ tipo }}</option></select></label>
        <label v-if="opciones.lideres.length"><span class="field-label">Lider</span><select v-model="filtroLider" class="input-texto"><option value="">Todos</option><option v-for="lider in opciones.lideres" :key="lider">{{ lider }}</option></select></label>
      </div>

      <p v-if="loading" class="panel-empty">Cargando indicadores...</p>
      <p v-else-if="errorMsg" class="mensaje-error">{{ errorMsg }}</p>
      <p v-else-if="!dashboard.rows.length" class="panel-empty">No hay activaciones para los filtros seleccionados.</p>

      <div v-else class="metrics-dashboard">
        <div class="kpi-grid kpi-grid-v2">
          <button v-for="card in tarjetas" :key="card.key" type="button" class="kpi-card kpi-card-button" :class="{ 'kpi-card-active': selectedKpi === card.key }" :aria-pressed="selectedKpi === card.key" :title="`${card.label}: ${formatNumber(card.value)}. ${card.note}`" @click="selectedKpi = card.key"><span class="kpi-label">{{ card.label }}</span><strong class="kpi-value">{{ formatNumber(card.value) }}</strong><span class="kpi-note">{{ card.note }}</span></button>
        </div>

        <div v-if="graficosSeleccionados.length" class="dashboard-charts-grid">
          <article v-for="chart in graficosSeleccionados" :key="chart.title" class="analytics-card" :class="{ 'chart-card-wide': chart.wide }"><h3 class="analytics-title">{{ chart.title }}</h3><p class="analytics-subtitle">{{ chart.subtitle }}</p><div class="dashboard-bars"><div v-for="item in chart.values" :key="item.label" class="dashboard-bar-row" :title="`${chart.dateLabels ? formatDate(item.label) : item.label}: ${formatNumber(item.value)}`"><span>{{ chart.dateLabels ? formatDate(item.label) : item.label }}</span><div class="metric-track"><div class="metric-fill" :class="{ 'metric-fill-soft': chart.tone === 'soft', 'metric-fill-danger': chart.tone === 'danger' }" :style="{ width: anchoBarra(item.value, chart.values) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article>
        </div>
        <p v-else class="panel-empty">No hay datos para los graficos de este indicador con los filtros actuales.</p>
      </div>
    </div>
  </section>
</template>
