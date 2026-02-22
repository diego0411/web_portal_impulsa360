<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchAllActivaciones } from '../lib/activacionesService'

const activaciones = ref([])
const loading = ref(true)
const errorMsg = ref(null)

const filtroFecha = ref('')
const filtroImpulsador = ref('')
const filtroPlaza = ref('')
const filtroDistrito = ref('')
const filtroTipo = ref('')

const estadoConfig = [
  { key: 'descargo_app', label: 'Descarga App' },
  { key: 'registro', label: 'Registro' },
  { key: 'cash_in', label: 'Cash In' },
  { key: 'cash_out', label: 'Cash Out' },
  { key: 'p2p', label: 'P2P' },
  { key: 'qr_fisico', label: 'QR Fisico' },
  { key: 'respaldo', label: 'Respaldo' },
  { key: 'hubo_error', label: 'Error Reportado' },
]

const embudoConfig = [
  { key: 'descargo_app', label: '1. Descarga App' },
  { key: 'registro', label: '2. Registro' },
  { key: 'cash_in', label: '3. Cash In' },
  { key: 'cash_out', label: '4. Cash Out' },
  { key: 'p2p', label: '5. P2P' },
  { key: 'qr_fisico', label: '6. QR Fisico' },
  { key: 'respaldo', label: '7. Respaldo' },
]

const plazaPalette = [
  '#1769ff',
  '#0fa968',
  '#ff8a00',
  '#0f4ecc',
  '#2d9bd8',
  '#8c57d1',
  '#b44f87',
  '#3f7f5f',
]

const numberFormatter = new Intl.NumberFormat('es-BO')
const percentFormatter = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

onMounted(async () => {
  loading.value = true
  errorMsg.value = null

  try {
    activaciones.value = await fetchAllActivaciones({
      columns:
        'id,fecha_activacion,impulsador,plaza,zona_activacion,tipo_activacion,descargo_app,registro,cash_in,cash_out,p2p,qr_fisico,respaldo,hubo_error',
    })
  } catch (error) {
    console.error('Error al cargar datos:', error)
    errorMsg.value = 'Error al obtener activaciones.'
  } finally {
    loading.value = false
  }
})

function ordenarTexto(a, b) {
  return a.localeCompare(b, 'es', { sensitivity: 'base' })
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0)
}

function formatPercent(value) {
  const safe = Number.isFinite(value) ? value : 0
  return `${percentFormatter.format(safe)}%`
}

function formatFecha(value) {
  if (!value || typeof value !== 'string') {
    return '-'
  }

  const parts = value.split('-')
  if (parts.length !== 3) {
    return value
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function normalizarTexto(value) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function withAlpha(hexColor, alpha = 'A6') {
  if (/^#[0-9a-fA-F]{6}$/.test(hexColor)) {
    return `${hexColor}${alpha}`
  }
  return hexColor
}

function rankingPorCampo(field, limit = 5) {
  const conteo = {}

  for (const activacion of activacionesFiltradas.value) {
    const raw = activacion[field]
    const label = typeof raw === 'string' ? raw.trim() : ''
    if (!label) continue
    conteo[label] = (conteo[label] || 0) + 1
  }

  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, conteoCampo]) => ({
      label,
      conteo: conteoCampo,
      porcentaje: totalActivaciones.value
        ? (conteoCampo / totalActivaciones.value) * 100
        : 0,
    }))
}

function limpiarFiltros() {
  filtroFecha.value = ''
  filtroImpulsador.value = ''
  filtroPlaza.value = ''
  filtroDistrito.value = ''
  filtroTipo.value = ''
}

const plazasDisponibles = computed(() => {
  return [...new Set(activaciones.value.map((item) => item.plaza).filter(Boolean))].sort(
    ordenarTexto
  )
})

const distritosDisponibles = computed(() => {
  return [
    ...new Set(activaciones.value.map((item) => item.zona_activacion).filter(Boolean)),
  ].sort(ordenarTexto)
})

const tiposDisponibles = computed(() => {
  return [
    ...new Set(activaciones.value.map((item) => item.tipo_activacion).filter(Boolean)),
  ].sort(ordenarTexto)
})

const activacionesFiltradas = computed(() => {
  const queryImpulsador = normalizarTexto(filtroImpulsador.value.trim())

  return activaciones.value.filter((activacion) => {
    const coincideFecha =
      !filtroFecha.value || activacion.fecha_activacion === filtroFecha.value
    const coincideImpulsador =
      !queryImpulsador ||
      normalizarTexto(activacion.impulsador).includes(queryImpulsador)
    const coincidePlaza = !filtroPlaza.value || activacion.plaza === filtroPlaza.value
    const coincideDistrito =
      !filtroDistrito.value || activacion.zona_activacion === filtroDistrito.value
    const coincideTipo =
      !filtroTipo.value || activacion.tipo_activacion === filtroTipo.value

    return (
      coincideFecha &&
      coincideImpulsador &&
      coincidePlaza &&
      coincideDistrito &&
      coincideTipo
    )
  })
})

const totalActivaciones = computed(() => activacionesFiltradas.value.length)

const hayFiltrosActivos = computed(() => {
  return Boolean(
    filtroFecha.value ||
      filtroImpulsador.value ||
      filtroPlaza.value ||
      filtroDistrito.value ||
      filtroTipo.value
  )
})

const rangoFechas = computed(() => {
  const fechas = activacionesFiltradas.value
    .map((item) => item.fecha_activacion)
    .filter(Boolean)
    .sort()

  if (!fechas.length) {
    return 'Sin datos'
  }

  const inicio = fechas[0]
  const fin = fechas[fechas.length - 1]
  return inicio === fin ? formatFecha(inicio) : `${formatFecha(inicio)} - ${formatFecha(fin)}`
})

const metricasEstado = computed(() => {
  const total = totalActivaciones.value

  return estadoConfig.map((estado) => {
    const conteo = activacionesFiltradas.value.filter((item) => item[estado.key] === true).length
    return {
      ...estado,
      conteo,
      porcentaje: total ? (conteo / total) * 100 : 0,
    }
  })
})

const metricasEstadoMap = computed(() => {
  return Object.fromEntries(metricasEstado.value.map((item) => [item.key, item]))
})

const impulsadoresActivos = computed(() => {
  return new Set(
    activacionesFiltradas.value.map((item) => item.impulsador).filter(Boolean)
  ).size
})

const plazasActivas = computed(() => {
  return new Set(activacionesFiltradas.value.map((item) => item.plaza).filter(Boolean)).size
})

const distritosActivos = computed(() => {
  return new Set(
    activacionesFiltradas.value.map((item) => item.zona_activacion).filter(Boolean)
  ).size
})

const tarjetasResumen = computed(() => {
  const registro = metricasEstadoMap.value.registro ?? { conteo: 0, porcentaje: 0 }
  const errores = metricasEstadoMap.value.hubo_error ?? { conteo: 0, porcentaje: 0 }
  const cashIn = metricasEstadoMap.value.cash_in ?? { conteo: 0, porcentaje: 0 }
  const conversionRegistroCashIn = registro.conteo
    ? (cashIn.conteo / registro.conteo) * 100
    : 0

  return [
    {
      key: 'activaciones',
      label: 'Activaciones',
      value: formatNumber(totalActivaciones.value),
      note: `Rango: ${rangoFechas.value}`,
    },
    {
      key: 'impulsadores',
      label: 'Impulsadores Activos',
      value: formatNumber(impulsadoresActivos.value),
      note: 'Con al menos una activacion',
    },
    {
      key: 'plazas',
      label: 'Plazas Activas',
      value: formatNumber(plazasActivas.value),
      note: 'Cobertura operativa actual',
    },
    {
      key: 'distritos',
      label: 'Distritos Activos',
      value: formatNumber(distritosActivos.value),
      note: 'Zonas con actividad',
    },
    {
      key: 'registro',
      label: 'Tasa de Registro',
      value: formatPercent(registro.porcentaje),
      note: `${formatNumber(registro.conteo)} comercios registrados`,
    },
    {
      key: 'conversion',
      label: 'Registro -> Cash In',
      value: formatPercent(conversionRegistroCashIn),
      note: `${formatNumber(cashIn.conteo)} con cash in`,
    },
    {
      key: 'errores',
      label: 'Tasa de Error',
      value: formatPercent(errores.porcentaje),
      note: `${formatNumber(errores.conteo)} casos con error`,
    },
  ]
})

const embudoOperacional = computed(() => {
  const total = totalActivaciones.value
  let pasoAnterior = total

  return embudoConfig.map((paso, index) => {
    const etapasRequeridas = embudoConfig.slice(0, index + 1).map((item) => item.key)
    const conteo = activacionesFiltradas.value.filter((item) =>
      etapasRequeridas.every((key) => item[key] === true)
    ).length

    const porcentajeTotal = total ? (conteo / total) * 100 : 0
    const porcentajePasoAnterior = pasoAnterior ? (conteo / pasoAnterior) * 100 : 0
    pasoAnterior = conteo

    return {
      ...paso,
      conteo,
      porcentajeTotal,
      porcentajePasoAnterior,
    }
  })
})

const plazaDistritoRanking = computed(() => {
  const map = {}

  for (const activacion of activacionesFiltradas.value) {
    const plaza =
      typeof activacion.plaza === 'string' && activacion.plaza.trim()
        ? activacion.plaza.trim()
        : 'Sin Plaza'
    const distrito =
      typeof activacion.zona_activacion === 'string' && activacion.zona_activacion.trim()
        ? activacion.zona_activacion.trim()
        : 'Sin Distrito'

    if (!map[plaza]) {
      map[plaza] = { total: 0, distritos: {} }
    }

    map[plaza].total += 1
    map[plaza].distritos[distrito] = (map[plaza].distritos[distrito] || 0) + 1
  }

  return Object.entries(map)
    .map(([plaza, payload]) => ({
      plaza,
      total: payload.total,
      distritos: Object.entries(payload.distritos)
        .map(([distrito, conteo]) => ({ distrito, conteo }))
        .sort((a, b) => b.conteo - a.conteo),
    }))
    .sort((a, b) => b.total - a.total)
})

const plazaDistritoGrafico = computed(() => {
  const plazas = plazaDistritoRanking.value
  const total = totalActivaciones.value
  const maxValor = Math.max(1, ...plazas.map((item) => item.total))

  const plazasColor = plazas.map((item, index) => ({
    name: item.plaza,
    total: item.total,
    color: plazaPalette[index % plazaPalette.length],
  }))

  const rows = []

  plazas.forEach((plaza, plazaIndex) => {
    const color = plazasColor[plazaIndex].color
    const porcentajeSobreTotal = total ? (plaza.total / total) * 100 : 0

    rows.push({
      id: `plaza-${plazaIndex}`,
      type: 'plaza',
      groupStart: plazaIndex > 0,
      label: plaza.plaza,
      plaza: plaza.plaza,
      color,
      barColor: color,
      ratio: Math.max(8, (plaza.total / maxValor) * 100),
      valueText: `${formatNumber(plaza.total)} (${formatPercent(porcentajeSobreTotal)})`,
      valueDetail: `${formatNumber(plaza.total)} activaciones de ${plaza.plaza}`,
    })

    plaza.distritos.forEach((distrito, distritoIndex) => {
      const porcentajeSobrePlaza = plaza.total ? (distrito.conteo / plaza.total) * 100 : 0

      rows.push({
        id: `plaza-${plazaIndex}-dist-${distritoIndex}`,
        type: 'distrito',
        groupStart: false,
        label: distrito.distrito,
        plaza: plaza.plaza,
        color,
        barColor: withAlpha(color, '9E'),
        ratio: Math.max(3, (distrito.conteo / maxValor) * 100),
        valueText: `${formatNumber(distrito.conteo)} (${formatPercent(porcentajeSobrePlaza)})`,
        valueDetail: `${formatNumber(distrito.conteo)} activaciones de ${distrito.distrito}`,
      })
    })
  })

  return {
    plazas: plazasColor,
    rows,
  }
})

const topActivadores = computed(() => rankingPorCampo('impulsador', 5))
const topTipos = computed(() => rankingPorCampo('tipo_activacion', 5))

const hallazgos = computed(() => {
  if (!totalActivaciones.value) {
    return []
  }

  const registro = metricasEstadoMap.value.registro?.porcentaje ?? 0
  const errores = metricasEstadoMap.value.hubo_error?.porcentaje ?? 0
  const cashIn = metricasEstadoMap.value.cash_in?.porcentaje ?? 0
  const respaldo = metricasEstadoMap.value.respaldo?.porcentaje ?? 0
  const liderPlaza = plazaDistritoRanking.value[0]
  const liderImpulsador = topActivadores.value[0]

  const data = []

  data.push(
    registro < 50
      ? {
          tone: 'warn',
          title: 'Registro por debajo de objetivo',
          detail: `La tasa de registro actual es ${formatPercent(registro)}.`,
        }
      : {
          tone: 'ok',
          title: 'Registro en buen nivel',
          detail: `La tasa de registro se mantiene en ${formatPercent(registro)}.`,
        }
  )

  data.push(
    errores > 12
      ? {
          tone: 'alert',
          title: 'Incidencia de errores alta',
          detail: `Los errores representan ${formatPercent(errores)} del total.`,
        }
      : {
          tone: 'ok',
          title: 'Error operativo controlado',
          detail: `La tasa de error se mantiene en ${formatPercent(errores)}.`,
        }
  )

  data.push(
    cashIn < 35
      ? {
          tone: 'warn',
          title: 'Conversion a Cash In baja',
          detail: `Solo ${formatPercent(cashIn)} llega a cash in.`,
        }
      : {
          tone: 'info',
          title: 'Buen avance a Cash In',
          detail: `${formatPercent(cashIn)} de activaciones completa cash in.`,
        }
  )

  data.push(
    respaldo < 40
      ? {
          tone: 'warn',
          title: 'Uso de respaldo mejorable',
          detail: `El respaldo esta activo en ${formatPercent(respaldo)} de casos.`,
        }
      : {
          tone: 'info',
          title: 'Respaldo con traccion',
          detail: `${formatPercent(respaldo)} incluye respaldo operativo.`,
        }
  )

  if (liderPlaza) {
    data.push({
      tone: 'info',
      title: `Plaza lider: ${liderPlaza.plaza}`,
      detail: `${formatNumber(liderPlaza.total)} activaciones (${formatPercent((liderPlaza.total / totalActivaciones.value) * 100)} del total).`,
    })
  }

  if (liderImpulsador) {
    data.push({
      tone: 'info',
      title: `Impulsador con mayor carga: ${liderImpulsador.label}`,
      detail: `${formatNumber(liderImpulsador.conteo)} activaciones (${formatPercent(liderImpulsador.porcentaje)}).`,
    })
  }

  return data.slice(0, 6)
})
</script>

<template>
  <section class="view-page contenedor-metricas">
    <header class="view-header">
      <p class="view-kicker">Inteligencia Operativa</p>
      <h1 class="view-title">Metricas de Activaciones</h1>
      <p class="view-description">
        Vista ejecutiva para medir conversion, calidad de ejecucion y concentracion operativa.
      </p>
      <div class="meta-row">
        <span class="meta-pill">
          {{ loading ? 'Sincronizando...' : `${totalActivaciones} activaciones filtradas` }}
        </span>
        <span v-if="!loading" class="meta-pill">Rango: {{ rangoFechas }}</span>
      </div>
    </header>

    <div class="panel-card metrics-panel">
      <div class="toolbar-line">
        <h2 class="subtitulo subtitulo-inline">Vista Ejecutiva</h2>
        <div class="toolbar-actions">
          <span class="meta-pill">{{ formatNumber(activaciones.length) }} totales</span>
          <button class="boton" :disabled="!hayFiltrosActivos" @click="limpiarFiltros">
            Limpiar filtros
          </button>
        </div>
      </div>

      <div class="filtros filtros-grid filtros-metricas">
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
          <select v-model="filtroPlaza" class="input-texto">
            <option value="">Todas</option>
            <option v-for="plaza in plazasDisponibles" :key="plaza" :value="plaza">
              {{ plaza }}
            </option>
          </select>
        </label>
        <label>
          <span class="field-label">Distrito</span>
          <select v-model="filtroDistrito" class="input-texto">
            <option value="">Todos</option>
            <option v-for="distrito in distritosDisponibles" :key="distrito" :value="distrito">
              {{ distrito }}
            </option>
          </select>
        </label>
        <label>
          <span class="field-label">Tipo Activacion</span>
          <select v-model="filtroTipo" class="input-texto">
            <option value="">Todos</option>
            <option v-for="tipo in tiposDisponibles" :key="tipo" :value="tipo">
              {{ tipo }}
            </option>
          </select>
        </label>
      </div>

      <p v-if="loading">Cargando datos...</p>
      <p v-else-if="errorMsg" class="mensaje-error">{{ errorMsg }}</p>
      <p v-else-if="totalActivaciones === 0" class="panel-empty">
        No hay datos para los filtros seleccionados.
      </p>

      <div v-else class="metrics-dashboard">
        <div class="kpi-grid">
          <article v-for="card in tarjetasResumen" :key="card.key" class="kpi-card">
            <p class="kpi-label">{{ card.label }}</p>
            <p class="kpi-value">{{ card.value }}</p>
            <p class="kpi-note">{{ card.note }}</p>
          </article>
        </div>

        <div class="metrics-columns">
          <article class="analytics-card">
            <h3 class="analytics-title">Embudo Operacional</h3>
            <p class="analytics-subtitle">
              Conversion secuencial considerando todos los pasos previos.
            </p>

            <div class="metric-list">
              <div v-for="paso in embudoOperacional" :key="paso.key" class="metric-row">
                <div class="metric-row-head">
                  <strong>{{ paso.label }}</strong>
                  <span>{{ formatNumber(paso.conteo) }} | {{ formatPercent(paso.porcentajeTotal) }}</span>
                </div>
                <div class="metric-track">
                  <div class="metric-fill" :style="{ width: `${paso.porcentajeTotal}%` }"></div>
                </div>
                <p class="metric-row-meta">
                  Desde etapa anterior: {{ formatPercent(paso.porcentajePasoAnterior) }}
                </p>
              </div>
            </div>
          </article>

          <article class="analytics-card">
            <h3 class="analytics-title">Estado de Ejecucion</h3>
            <p class="analytics-subtitle">Participacion de cada indicador sobre el total filtrado.</p>

            <div class="metric-list">
              <div v-for="item in metricasEstado" :key="item.key" class="metric-row">
                <div class="metric-row-head">
                  <strong>{{ item.label }}</strong>
                  <span>{{ formatNumber(item.conteo) }} | {{ formatPercent(item.porcentaje) }}</span>
                </div>
                <div class="metric-track">
                  <div
                    class="metric-fill"
                    :class="{
                      'metric-fill-danger': item.key === 'hubo_error',
                      'metric-fill-soft': item.key === 'respaldo',
                    }"
                    :style="{ width: `${item.porcentaje}%` }"
                  ></div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div class="metrics-columns">
          <article class="analytics-card">
            <h3 class="analytics-title">Top Activadores</h3>
            <div v-if="topActivadores.length" class="ranking-list">
              <div v-for="item in topActivadores" :key="item.label" class="ranking-row">
                <div class="ranking-head">
                  <strong>{{ item.label }}</strong>
                  <span>{{ formatNumber(item.conteo) }} | {{ formatPercent(item.porcentaje) }}</span>
                </div>
                <div class="metric-track">
                  <div class="metric-fill" :style="{ width: `${item.porcentaje}%` }"></div>
                </div>
              </div>
            </div>
            <p v-else class="analytics-empty">Sin datos en este corte.</p>
          </article>

          <article class="analytics-card">
            <h3 class="analytics-title">Tipos de Activacion</h3>
            <div v-if="topTipos.length" class="ranking-list">
              <div v-for="item in topTipos" :key="item.label" class="ranking-row">
                <div class="ranking-head">
                  <strong>{{ item.label }}</strong>
                  <span>{{ formatNumber(item.conteo) }} | {{ formatPercent(item.porcentaje) }}</span>
                </div>
                <div class="metric-track">
                  <div class="metric-fill metric-fill-soft" :style="{ width: `${item.porcentaje}%` }"></div>
                </div>
              </div>
            </div>
            <p v-else class="analytics-empty">Sin datos en este corte.</p>
          </article>
        </div>

        <article class="analytics-card analytics-card-wide">
          <div class="toolbar-line">
            <h3 class="analytics-title">Plazas y Distritos (Grafico Unico)</h3>
            <span class="meta-pill">
              {{ plazaDistritoGrafico.plazas.length }} plazas ·
              {{ formatNumber(distritosActivos) }} distritos
            </span>
          </div>
          <p class="analytics-subtitle">
            Cada grupo inicia con su plaza y debajo aparecen sus distritos. El color identifica la
            plaza a la que pertenece cada distrito.
          </p>

          <div v-if="plazaDistritoGrafico.rows.length" class="hierarchy-chart">
            <div class="hierarchy-legend">
              <span
                v-for="plaza in plazaDistritoGrafico.plazas"
                :key="`legend-${plaza.name}`"
                class="hierarchy-legend-item"
              >
                <span
                  class="hierarchy-legend-dot"
                  :style="{ backgroundColor: plaza.color }"
                ></span>
                <span>{{ plaza.name }} ({{ formatNumber(plaza.total) }})</span>
              </span>
            </div>

            <div class="hierarchy-header">
              <span>Estructura</span>
              <span>Volumen Relativo</span>
              <span>Valor</span>
            </div>

            <div class="hierarchy-body">
              <div
                v-for="row in plazaDistritoGrafico.rows"
                :key="row.id"
                class="hierarchy-row"
                :class="{
                  'hierarchy-row-plaza': row.type === 'plaza',
                  'hierarchy-row-distrito': row.type === 'distrito',
                  'hierarchy-row-group-start': row.groupStart,
                }"
              >
                <div class="hierarchy-label">
                  <span
                    class="hierarchy-color"
                    :style="{ backgroundColor: row.color }"
                  ></span>
                  <span class="hierarchy-main" :title="row.label">{{ row.label }}</span>
                  <span
                    v-if="row.type === 'distrito'"
                    class="hierarchy-parent"
                    :title="row.plaza"
                  >
                    {{ row.plaza }}
                  </span>
                </div>

                <div class="hierarchy-track">
                  <div
                    class="hierarchy-bar"
                    :style="{ width: `${row.ratio}%`, backgroundColor: row.barColor }"
                  ></div>
                </div>

                <div class="hierarchy-value" :title="row.valueDetail">
                  {{ row.valueText }}
                </div>
              </div>
            </div>
          </div>

          <p v-else class="analytics-empty">Sin datos para plazas y distritos.</p>
        </article>

        <article class="analytics-card analytics-card-wide">
          <h3 class="analytics-title">Hallazgos Automaticos</h3>
          <p class="analytics-subtitle">Lectura rapida para decisiones de coordinacion.</p>
          <div class="insights-grid">
            <article
              v-for="hallazgo in hallazgos"
              :key="hallazgo.title"
              class="insight-card"
              :class="`insight-${hallazgo.tone}`"
            >
              <p class="insight-title">{{ hallazgo.title }}</p>
              <p class="insight-text">{{ hallazgo.detail }}</p>
            </article>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
