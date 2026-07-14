<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchAllActivaciones } from '../lib/activacionesService'
import MetricsHeatMap from './MetricsHeatMap.vue'

const activaciones = ref([])
const loading = ref(true)
const errorMsg = ref(null)
const filtroDesde = ref('')
const filtroHasta = ref('')
const filtroPlaza = ref('')
const filtroActivador = ref('')
const filtroTipo = ref('')
const filtroLider = ref('')
const filtroEquipo = ref('')
const filtroFacturador = ref('')
const numberFormatter = new Intl.NumberFormat('es-BO')
const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
const todayKey = `${todayParts.year}-${todayParts.month}-${todayParts.day}`
const monthKey = `${todayParts.year}-${todayParts.month}`
const todayDate = new Date(`${todayKey}T12:00:00Z`)
const weekStartDate = new Date(todayDate)
weekStartDate.setUTCDate(todayDate.getUTCDate() - ((todayDate.getUTCDay() + 6) % 7))
const weekStartKey = weekStartDate.toISOString().slice(0, 10)

onMounted(async () => {
  loading.value = true
  errorMsg.value = null
  try { activaciones.value = await fetchAllActivaciones() }
  catch (error) { console.error('Error al cargar metricas:', error); errorMsg.value = 'No fue posible obtener las activaciones.' }
  finally { loading.value = false }
})

function texto(value) { return typeof value === 'string' ? value.trim() : '' }
function normalizado(value) { return texto(value).toLocaleLowerCase('es') }
function fechaRegistro(item) { return (texto(item.fecha_activacion) || texto(item.created_at)).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '' }
function plazaRegistro(item) { return texto(item.plaza_efectiva_registro) || texto(item.ciudad_activacion) || texto(item.plaza) || 'Sin plaza' }
function liderRegistro(item) { return texto(item.lider_nombre_registro) || texto(item.lider_nombre) || texto(item.lider) || texto(item.nombre_lider) || '' }
function equipoRegistro(item) { return texto(item.equipo_nombre_registro) || (item.equipo_numero_registro ? `Equipo #${item.equipo_numero_registro}` : 'Sin equipo') }
function facturadorRegistro(item) { return texto(item.facturador_nombre_registro) || 'Sin facturador' }
function formatNumber(value) { return numberFormatter.format(Number(value) || 0) }
function formatDate(value) { const [year, month, day] = String(value || '').split('-'); return year && month && day ? `${day}/${month}/${year}` : 'Sin fecha' }
function sumar(map, key) { const label = texto(key) || 'Sin especificar'; map.set(label, (map.get(label) ?? 0) + 1) }
function ranking(map, limit = Infinity) { return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).slice(0, limit).map(([label, value]) => ({ label, value })) }

const opciones = computed(() => {
  const plazas = new Set(), activadores = new Set(), tipos = new Set(), lideres = new Set(), equipos = new Set(), facturadores = new Set()
  for (const item of activaciones.value) {
    plazas.add(plazaRegistro(item))
    if (texto(item.impulsador)) activadores.add(texto(item.impulsador))
    if (texto(item.tipo_activacion)) tipos.add(texto(item.tipo_activacion))
    if (liderRegistro(item)) lideres.add(liderRegistro(item))
    equipos.add(equipoRegistro(item)); facturadores.add(facturadorRegistro(item))
  }
  const ordenar = (values) => [...values].sort((a, b) => a.localeCompare(b, 'es'))
  return { plazas: ordenar(plazas), activadores: ordenar(activadores), tipos: ordenar(tipos), lideres: ordenar(lideres), equipos: ordenar(equipos), facturadores: ordenar(facturadores) }
})

const dashboard = computed(() => {
  const rows = [], points = []
  const maps = { dia: new Map(), plaza: new Map(), activador: new Map(), tipo: new Map(), lider: new Map() }
  const kpis = { total: 0, hoy: 0, semana: 0, mes: 0, cashIn: 0, errores: 0, tiendas: 0, comercios: 0 }
  const activadorQuery = normalizado(filtroActivador.value)
  const teamStats = new Map()
  for (const item of activaciones.value) {
    const fecha = fechaRegistro(item), plaza = plazaRegistro(item)
    const activador = texto(item.impulsador) || 'Sin activador'
    const tipo = texto(item.tipo_activacion) || 'Sin especificar'
    const lider = liderRegistro(item)
    const equipo = equipoRegistro(item), facturador = facturadorRegistro(item)
    if (filtroDesde.value && (!fecha || fecha < filtroDesde.value)) continue
    if (filtroHasta.value && (!fecha || fecha > filtroHasta.value)) continue
    if (filtroPlaza.value && plaza !== filtroPlaza.value) continue
    if (activadorQuery && !normalizado(activador).includes(activadorQuery)) continue
    if (filtroTipo.value && tipo !== filtroTipo.value) continue
    if (filtroLider.value && lider !== filtroLider.value) continue
    if (filtroEquipo.value && equipo !== filtroEquipo.value) continue
    if (filtroFacturador.value && facturador !== filtroFacturador.value) continue
    rows.push(item)
    kpis.total += 1
    if (fecha === todayKey) kpis.hoy += 1
    if (fecha >= weekStartKey && fecha <= todayKey) kpis.semana += 1
    if (fecha.startsWith(monthKey)) kpis.mes += 1
    if (item.cash_in === true) kpis.cashIn += 1
    if (item.hubo_error === true) kpis.errores += 1
    const clasificacion = `${normalizado(item.tipo_activacion)} ${normalizado(item.tipo_comercio)}`
    if (clasificacion.includes('tienda') && clasificacion.includes('barrio')) kpis.tiendas += 1
    if (clasificacion.includes('comercio')) kpis.comercios += 1
    sumar(maps.dia, fecha || 'Sin fecha'); sumar(maps.plaza, plaza); sumar(maps.activador, activador); sumar(maps.tipo, tipo)
    if (lider) sumar(maps.lider, lider)
    const team = teamStats.get(equipo) ?? { nombre: equipo, total: 0, errores: 0, integrantes: new Set() }
    team.total += 1; if (item.hubo_error === true) team.errores += 1; team.integrantes.add(activador); teamStats.set(equipo, team)
    const hasCoordinates = item.latitud !== null && item.latitud !== undefined && item.latitud !== '' && item.longitud !== null && item.longitud !== undefined && item.longitud !== ''
    const lat = Number(item.latitud), lng = Number(item.longitud)
    if (hasCoordinates && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) points.push({ lat, lng, label: `${activador} · ${plaza}` })
  }
  const porEquipo = [...teamStats.values()].map((team) => ({
    nombre: team.nombre, total: team.total, integrantes: team.integrantes.size,
    promedio: team.integrantes.size ? team.total / team.integrantes.size : 0,
    errores: team.errores, cumplimiento: team.total ? ((team.total - team.errores) / team.total) * 100 : 0,
  })).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
  return { rows, points, kpis, porEquipo, porDia: ranking(maps.dia).sort((a, b) => a.label.localeCompare(b.label)), porPlaza: ranking(maps.plaza), topActivadores: ranking(maps.activador, 10), porTipo: ranking(maps.tipo), topLideres: ranking(maps.lider, 10) }
})

const tarjetas = computed(() => [
  { key: 'total', icon: '◎', label: 'Total', value: dashboard.value.kpis.total, note: 'Activaciones filtradas' },
  { key: 'hoy', icon: '◷', label: 'Hoy', value: dashboard.value.kpis.hoy, note: 'Registradas hoy' },
  { key: 'semana', icon: '▦', label: 'Semana', value: dashboard.value.kpis.semana, note: 'Desde el lunes' },
  { key: 'mes', icon: '□', label: 'Mes', value: dashboard.value.kpis.mes, note: 'Mes calendario' },
  { key: 'cash', icon: '↗', label: 'Cash-In', value: dashboard.value.kpis.cashIn, note: 'Cash-In completado' },
  { key: 'errores', icon: '!', label: 'Errores', value: dashboard.value.kpis.errores, note: 'Incidencias reportadas' },
  { key: 'tiendas', icon: '⌂', label: 'Tiendas', value: dashboard.value.kpis.tiendas, note: 'Tiendas de barrio' },
  { key: 'comercios', icon: '◇', label: 'Comercios', value: dashboard.value.kpis.comercios, note: 'Actividad comercial' },
])
const hayFiltros = computed(() => Boolean(filtroDesde.value || filtroHasta.value || filtroPlaza.value || filtroActivador.value || filtroTipo.value || filtroLider.value || filtroEquipo.value || filtroFacturador.value))
function limpiarFiltros() { filtroDesde.value = ''; filtroHasta.value = ''; filtroPlaza.value = ''; filtroActivador.value = ''; filtroTipo.value = ''; filtroLider.value = ''; filtroEquipo.value = ''; filtroFacturador.value = '' }
function anchoBarra(value, values) { const max = Math.max(1, ...values.map((item) => item.value)); return `${Math.max(3, (value / max) * 100)}%` }
function exportarDashboard() {
  if (!dashboard.value.rows.length) return
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const data = dashboard.value.rows.map((item) => [fechaRegistro(item), texto(item.impulsador), plazaRegistro(item), texto(item.tipo_activacion), item.cash_in === true ? 'Si' : 'No', item.hubo_error === true ? 'Si' : 'No'].map(escape).join(','))
  const blob = new Blob([`\uFEFF${[['Fecha', 'Activador', 'Plaza', 'Tipo', 'Cash-In', 'Error'].map(escape).join(','), ...data].join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'dashboard-activaciones.csv'; link.click(); URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="view-page metrics-saas">
    <header class="metrics-saas-header"><div class="metrics-heading"><p class="view-kicker">Inteligencia Operativa</p><h1 class="view-title">Dashboard de Activaciones</h1><p class="view-description">Una vista clara del volumen, cobertura y desempeño del equipo en campo.</p></div><button class="boton boton-primario" :disabled="loading || !dashboard.rows.length" @click="exportarDashboard">Exportar</button></header>
    <section class="metrics-filter-card"><div class="metrics-filter-head"><div><h2>Filtros</h2><p>{{ formatNumber(dashboard.rows.length) }} de {{ formatNumber(activaciones.length) }} registros</p></div><button class="boton" :disabled="!hayFiltros" @click="limpiarFiltros">Limpiar</button></div><div class="filtros metrics-filter-grid">
      <label><span class="field-label">Fecha desde</span><input v-model="filtroDesde" type="date" class="input-texto"></label><label><span class="field-label">Fecha hasta</span><input v-model="filtroHasta" type="date" class="input-texto"></label>
      <label><span class="field-label">Plaza</span><select v-model="filtroPlaza" class="input-texto"><option value="">Todas</option><option v-for="plaza in opciones.plazas" :key="plaza">{{ plaza }}</option></select></label>
      <label><span class="field-label">Activador</span><input v-model="filtroActivador" class="input-texto" list="activadores-dashboard" placeholder="Buscar"><datalist id="activadores-dashboard"><option v-for="item in opciones.activadores" :key="item" :value="item"></option></datalist></label>
      <label><span class="field-label">Equipo</span><select v-model="filtroEquipo" class="input-texto"><option value="">Todos</option><option v-for="item in opciones.equipos" :key="item">{{ item }}</option></select></label>
      <label><span class="field-label">Facturador</span><select v-model="filtroFacturador" class="input-texto"><option value="">Todos</option><option v-for="item in opciones.facturadores" :key="item">{{ item }}</option></select></label>
      <label><span class="field-label">Tipo</span><select v-model="filtroTipo" class="input-texto"><option value="">Todos</option><option v-for="tipo in opciones.tipos" :key="tipo">{{ tipo }}</option></select></label>
      <label v-if="opciones.lideres.length"><span class="field-label">Líder</span><select v-model="filtroLider" class="input-texto"><option value="">Todos</option><option v-for="lider in opciones.lideres" :key="lider">{{ lider }}</option></select></label>
    </div></section>
    <p v-if="loading" class="panel-empty">Cargando indicadores...</p><p v-else-if="errorMsg" class="mensaje-error">{{ errorMsg }}</p><p v-else-if="!dashboard.rows.length" class="panel-empty">No hay activaciones para los filtros seleccionados.</p>
    <div v-else class="metrics-saas-content">
      <section class="metrics-kpi-grid"><article v-for="card in tarjetas" :key="card.key" class="metrics-kpi-card"><span class="metrics-kpi-icon">{{ card.icon }}</span><div><p class="metrics-kpi-label">{{ card.label }}</p><p class="metrics-kpi-value">{{ formatNumber(card.value) }}</p><p class="metrics-kpi-note">{{ card.note }}</p></div></article></section>
      <section class="metrics-chart-grid"><article class="metrics-chart-card"><h3>Activaciones por día</h3><p>Evolución del periodo filtrado.</p><div class="dashboard-bars"><div v-for="item in dashboard.porDia" :key="item.label" class="dashboard-bar-row" :title="`${formatDate(item.label)}: ${formatNumber(item.value)}`"><span>{{ formatDate(item.label) }}</span><div class="metric-track"><div class="metric-fill" :style="{ width: anchoBarra(item.value, dashboard.porDia) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article><article class="metrics-chart-card"><h3>Activaciones por plaza</h3><p>Distribución territorial.</p><div class="dashboard-bars"><div v-for="item in dashboard.porPlaza" :key="item.label" class="dashboard-bar-row"><span :title="item.label">{{ item.label }}</span><div class="metric-track"><div class="metric-fill metric-fill-soft" :style="{ width: anchoBarra(item.value, dashboard.porPlaza) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article></section>
      <section class="metrics-chart-grid"><article class="metrics-chart-card"><h3>Top Activadores</h3><p>Mayor volumen de registros.</p><div class="dashboard-bars"><div v-for="item in dashboard.topActivadores" :key="item.label" class="dashboard-bar-row"><span :title="item.label">{{ item.label }}</span><div class="metric-track"><div class="metric-fill" :style="{ width: anchoBarra(item.value, dashboard.topActivadores) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article><article class="metrics-chart-card"><h3>Tipos de Activación</h3><p>Composición del trabajo realizado.</p><div class="dashboard-bars"><div v-for="item in dashboard.porTipo" :key="item.label" class="dashboard-bar-row"><span :title="item.label">{{ item.label }}</span><div class="metric-track"><div class="metric-fill metric-fill-soft" :style="{ width: anchoBarra(item.value, dashboard.porTipo) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article></section>
      <article class="metrics-chart-card metrics-map-card"><div class="metrics-card-heading"><div><h3>Mapa de calor</h3><p>Concentración geográfica de activaciones.</p></div><span class="meta-pill">{{ formatNumber(dashboard.points.length) }} puntos</span></div><MetricsHeatMap v-if="dashboard.points.length" :points="dashboard.points" /><p v-else class="panel-empty">No hay coordenadas válidas para este corte.</p></article>
      <section class="metrics-chart-grid"><article class="metrics-chart-card"><h3>Top Líderes</h3><p>Actividad asociada a líderes disponibles.</p><div v-if="dashboard.topLideres.length" class="dashboard-bars"><div v-for="item in dashboard.topLideres" :key="item.label" class="dashboard-bar-row"><span :title="item.label">{{ item.label }}</span><div class="metric-track"><div class="metric-fill" :style="{ width: anchoBarra(item.value, dashboard.topLideres) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div><p v-else class="analytics-empty">Sin líderes resolubles en los datos actuales.</p></article><article class="metrics-chart-card"><h3>Top Plazas</h3><p>Plazas con mayor actividad.</p><div class="dashboard-bars"><div v-for="item in dashboard.porPlaza.slice(0, 10)" :key="item.label" class="dashboard-bar-row"><span :title="item.label">{{ item.label }}</span><div class="metric-track"><div class="metric-fill metric-fill-soft" :style="{ width: anchoBarra(item.value, dashboard.porPlaza.slice(0, 10)) }"></div></div><strong>{{ formatNumber(item.value) }}</strong></div></div></article></section>
      <article class="metrics-chart-card"><h3>Rendimiento por equipo</h3><p>Cumplimiento representa activaciones sin error sobre el total registrado.</p><div class="table-wrap"><table class="tabla-activaciones"><thead><tr><th>Equipo</th><th>Total</th><th>Integrantes</th><th>Promedio</th><th>Cumplimiento</th><th>Errores</th></tr></thead><tbody><tr v-for="team in dashboard.porEquipo" :key="team.nombre"><td>{{ team.nombre }}</td><td>{{ formatNumber(team.total) }}</td><td>{{ formatNumber(team.integrantes) }}</td><td>{{ team.promedio.toFixed(1) }}</td><td>{{ team.cumplimiento.toFixed(1) }}%</td><td>{{ formatNumber(team.errores) }}</td></tr></tbody></table></div></article>
    </div>
  </section>
</template>
