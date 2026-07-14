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
const numberFormatter = new Intl.NumberFormat('es-BO')

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
  const porDia = new Map()
  const porPlaza = new Map()
  const porActivador = new Map()
  const porTipo = new Map()
  const erroresPorTipo = new Map()
  const kpis = { total: 0, tiendasBarrio: 0, comercios: 0, cashIn: 0, errores: 0, plazasTemporales: 0 }
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
    const clasificacion = `${normalizado(item.tipo_activacion)} ${normalizado(item.tipo_comercio)}`
    if (clasificacion.includes('tienda') && clasificacion.includes('barrio')) kpis.tiendasBarrio += 1
    if (clasificacion.includes('comercio')) kpis.comercios += 1
    if (item.cash_in === true) kpis.cashIn += 1
    if (item.hubo_error === true) {
      kpis.errores += 1
      sumar(erroresPorTipo, texto(item.tipo_error) || 'Sin tipo')
    }
    if (item.es_plaza_temporal === true) kpis.plazasTemporales += 1
    sumar(porDia, fecha || 'Sin fecha')
    sumar(porPlaza, plaza)
    sumar(porActivador, activador)
    sumar(porTipo, tipo)
  }

  return {
    rows,
    kpis,
    porDia: ranking(porDia).sort((a, b) => a.label.localeCompare(b.label)),
    porPlaza: ranking(porPlaza),
    porActivador: ranking(porActivador, 10),
    porTipo: ranking(porTipo),
    erroresPorTipo: ranking(erroresPorTipo),
  }
})

const tarjetas = computed(() => [
  { key: 'total', label: 'Total de activaciones', value: dashboard.value.kpis.total, note: 'Registros en el corte actual' },
  { key: 'tiendas', label: 'Tiendas de barrio', value: dashboard.value.kpis.tiendasBarrio, note: 'Identificadas en los datos' },
  { key: 'comercios', label: 'Comercios', value: dashboard.value.kpis.comercios, note: 'Activaciones comerciales' },
  { key: 'cash-in', label: 'Con Cash-In', value: dashboard.value.kpis.cashIn, note: 'Cash-In completado' },
  { key: 'errores', label: 'Registros con error', value: dashboard.value.kpis.errores, note: 'Incidencias reportadas' },
  { key: 'temporales', label: 'Plazas temporales', value: dashboard.value.kpis.plazasTemporales, note: 'Marcadas como temporales' },
])

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
          <article v-for="card in tarjetas" :key="card.key" class="kpi-card" :title="card.note"><p class="kpi-label">{{ card.label }}</p><p class="kpi-value">{{ formatNumber(card.value) }}</p><p class="kpi-note">{{ card.note }}</p></article>
        </div>

        <div class="dashboard-charts-grid">
          <article class="analytics-card chart-card-wide"><h3 class="analytics-title">Activaciones por dia</h3><p class="analytics-subtitle">Evolucion cronologica del volumen filtrado.</p><div class="dashboard-bars"><div v-for="item in dashboard.porDia" :key="item.label" class="dashboard-bar-row" :title="`${formatDate(item.label)}: ${formatNumber(item.value)} activaciones`"><span>{{ formatDate(item.label) }}</span><div class="metric-track"><div class="metric-fill" :style="{ width: anchoBarra(item.value, dashboard.porDia) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article>

          <article class="analytics-card"><h3 class="analytics-title">Activaciones por plaza</h3><p class="analytics-subtitle">Distribucion de cobertura.</p><div class="dashboard-bars"><div v-for="item in dashboard.porPlaza" :key="item.label" class="dashboard-bar-row" :title="`${item.label}: ${formatNumber(item.value)}`"><span>{{ item.label }}</span><div class="metric-track"><div class="metric-fill metric-fill-soft" :style="{ width: anchoBarra(item.value, dashboard.porPlaza) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article>

          <article class="analytics-card"><h3 class="analytics-title">Top 10 activadores</h3><p class="analytics-subtitle">Mayor cantidad de registros.</p><div class="dashboard-bars"><div v-for="item in dashboard.porActivador" :key="item.label" class="dashboard-bar-row" :title="`${item.label}: ${formatNumber(item.value)}`"><span>{{ item.label }}</span><div class="metric-track"><div class="metric-fill" :style="{ width: anchoBarra(item.value, dashboard.porActivador) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article>

          <article class="analytics-card"><h3 class="analytics-title">Tipos de activacion</h3><p class="analytics-subtitle">Composicion del trabajo realizado.</p><div class="dashboard-bars"><div v-for="item in dashboard.porTipo" :key="item.label" class="dashboard-bar-row" :title="`${item.label}: ${formatNumber(item.value)}`"><span>{{ item.label }}</span><div class="metric-track"><div class="metric-fill metric-fill-soft" :style="{ width: anchoBarra(item.value, dashboard.porTipo) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article>

          <article class="analytics-card"><h3 class="analytics-title">Errores por tipo</h3><p class="analytics-subtitle">Incidencias agrupadas por clasificacion.</p><div v-if="dashboard.erroresPorTipo.length" class="dashboard-bars"><div v-for="item in dashboard.erroresPorTipo" :key="item.label" class="dashboard-bar-row" :title="`${item.label}: ${formatNumber(item.value)}`"><span>{{ item.label }}</span><div class="metric-track"><div class="metric-fill metric-fill-danger" :style="{ width: anchoBarra(item.value, dashboard.erroresPorTipo) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div><p v-else class="analytics-empty">No hay errores en el corte actual.</p></article>
        </div>
      </div>
    </div>
  </section>
</template>
