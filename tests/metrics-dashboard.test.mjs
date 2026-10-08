import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { computed, ref, watch } from 'vue'
import { parse } from '@vue/compiler-sfc'
import { nombreLegiblePlaza, normalizarPlazaClave } from '../src/lib/plazas.js'
import { neutralizeSpreadsheetFormula } from '../src/lib/exportSafety.js'

// Ejecuta el setup real y sus computed; solo sustituye I/O y el montaje del DOM.
const source = readFileSync(new URL('../src/components/MetricsDashboard.vue', import.meta.url), 'utf8')
const setup = parse(source).descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
const actual = '10000000-0000-0000-0000-000000000001'
const anterior = '10000000-0000-0000-0000-000000000002'
const activador = '20000000-0000-0000-0000-000000000001'
const otro = '20000000-0000-0000-0000-000000000002'
const users = [{ usuario_id: activador, nombre: 'Persona de prueba', lider_id: actual, lider_nombre: 'Líder actual', rol: 'activador' }]
const rows = Array.from({ length: 5 }, (_, i) => ({
  id: `30000000-0000-0000-0000-00000000000${i + 1}`,
  usuario_id: activador, impulsador: 'Persona de prueba',
  lider_id_registro: i < 4 ? anterior : actual,
  lider_nombre_registro: i < 4 ? 'Líder anterior' : 'Líder actual',
  fecha_activacion: `2026-10-0${i + 1}`, plaza: 'La Paz', tipo_activacion: 'comercio',
}))

async function mount(authorizedRows = rows, catalog = users, catalogError = false) {
  let mounted, blob
  const deps = {
    computed, ref, watch, onMounted: (fn) => { mounted = fn },
    fetchAllActivaciones: async () => structuredClone(authorizedRows),
    portalRequest: async (path) => {
      assert.equal(path, '/portal/users')
      if (catalogError) throw new Error('Catálogo no disponible')
      return { users: structuredClone(catalog) }
    },
    nombreLegiblePlaza, normalizarPlazaClave, neutralizeSpreadsheetFormula,
    logClientError: () => {}, Blob,
    URL: { createObjectURL: (value) => { blob = value; return 'blob:test' }, revokeObjectURL: () => {} },
    document: { createElement: () => ({ click() {} }) },
  }
  const vm = new Function(...Object.keys(deps), `${setup}\nreturn { dashboard, opciones, filtroLider, filtroActivador, filtroDesde, filtroHasta, filtroPlaza, filtroTipo, filtroEquipo, rankingPaginado, rankingTotalPages, rankingSiguiente, porcentajeDelTotal, exportarDashboard, errorMsg };`)(...Object.values(deps))
  await mounted()
  return { ...vm, csv: async () => { blob = null; vm.exportarDashboard(); return blob ? await blob.text() : '' } }
}

async function assertCount(vm, expected) {
  assert.equal(vm.dashboard.value.kpis.total, expected)
  assert.equal(vm.dashboard.value.rows.length, expected)
  assert.equal(vm.dashboard.value.topActivadores.reduce((n, item) => n + item.value, 0), expected)
  const csv = await vm.csv()
  assert.equal(csv ? csv.trim().split('\n').length - 1 : 0, expected)
}

test('equipo actual incluye las cinco activaciones históricas en ranking, KPI y CSV', async () => {
  const vm = await mount()
  vm.filtroLider.value = `lid:${actual}`
  vm.filtroActivador.value = `uid:${activador}`
  await assertCount(vm, 5)
  assert.deepEqual(vm.dashboard.value.rows.map((r) => r.id), rows.map((r) => r.id))
  assert.equal(vm.dashboard.value.topActivadores[0].key, `uid:${activador}`)
  assert.equal(vm.dashboard.value.topLideres[0].value, 5)
  assert.deepEqual(vm.opciones.value.lideres.map((l) => l.key), [`lid:${actual}`])
  assert.deepEqual(vm.dashboard.value.rows, rows) // snapshots intactos
  vm.filtroLider.value = `lid:${anterior}`
  await assertCount(vm, 0)
})

test('mantiene filtros de fechas, plaza, tipo y activador sobre el mismo corte', async () => {
  const vm = await mount()
  vm.filtroLider.value = `lid:${actual}`
  vm.filtroActivador.value = `uid:${activador}`
  vm.filtroDesde.value = '2026-10-02'
  vm.filtroHasta.value = '2026-10-04'
  vm.filtroPlaza.value = 'pkey:lapaz'
  vm.filtroTipo.value = 'comercio'
  await assertCount(vm, 3)
  for (const [filter, value] of [[vm.filtroPlaza, 'pkey:oruro'], [vm.filtroTipo, 'otro'], [vm.filtroActivador, `uid:${otro}`]]) {
    const original = filter.value
    filter.value = value
    await assertCount(vm, 0)
    filter.value = original
  }
})

test('no agrega registros desde el catálogo; conserva alcance global y UUID con nombres iguales', async () => {
  const catalog = [...users, { usuario_id: otro, nombre: 'Persona de prueba', lider_id: anterior, lider_nombre: 'Otra líder', rol: 'activador' }]
  const leader = await mount(rows, catalog)
  await assertCount(leader, 5) // el catálogo nunca agrega activaciones
  const admin = await mount([...rows, { ...rows[0], id: '40000000-0000-0000-0000-000000000001', usuario_id: otro }], catalog)
  await assertCount(admin, 6)
  assert.equal(admin.dashboard.value.topActivadores.length, 2)
  assert.equal(new Set(admin.dashboard.value.topActivadores.map((r) => r.key)).size, 2)
  admin.filtroLider.value = `lid:${actual}`
  await assertCount(admin, 5)
  admin.filtroLider.value = `lid:${anterior}`
  await assertCount(admin, 1)
  admin.filtroLider.value = ''
  await assertCount(admin, 6)
})

test('un fallo del catálogo no publica métricas de líder incompletas', async () => {
  const vm = await mount(rows, users, true)
  assert.ok(vm.errorMsg.value)
  await assertCount(vm, 0)
})

test('equipo combina integrantes autorizados con 0, 1 y varias activaciones sin cambiar totales', async () => {
  const equipo = '50000000-0000-0000-0000-000000000001'
  const otroEquipo = '50000000-0000-0000-0000-000000000002'
  const cero = '20000000-0000-0000-0000-000000000003'
  const catalog = [
    { ...users[0], equipo_id: equipo, nombre: 'Zulma' },
    { ...users[0], usuario_id: otro, equipo_id: equipo, nombre: 'Berta' },
    { ...users[0], usuario_id: cero, equipo_id: equipo, nombre: 'Ana' },
    { ...users[0], usuario_id: 'fuera', equipo_id: otroEquipo, nombre: 'Fuera' },
    { ...users[0], usuario_id: 'no-activador', equipo_id: equipo, rol: 'lider' },
  ]
  const records = [
    ...rows.slice(0, 3).map((r) => ({ ...r, equipo_id_registro: equipo })),
    { ...rows[3], usuario_id: otro, equipo_id_registro: equipo },
  ]
  const vm = await mount(records, catalog)
  const baselineKpis = { ...vm.dashboard.value.kpis }
  const baselineRanking = structuredClone(vm.dashboard.value.topActivadores)
  const baselineCsv = await vm.csv()
  vm.filtroEquipo.value = `id:${equipo}`
  assert.deepEqual(vm.dashboard.value.topActivadores.map((r) => [r.key, r.value]), [
    [`uid:${activador}`, 3], [`uid:${otro}`, 1], [`uid:${cero}`, 0],
  ])
  assert.equal(parseFloat(vm.porcentajeDelTotal(0)), 0)
  assert.deepEqual(vm.dashboard.value.kpis, baselineKpis)
  assert.equal(await vm.csv(), baselineCsv)
  assert.ok(vm.opciones.value.activadores.some((a) => a.key === `uid:${cero}`))
  vm.filtroActivador.value = `uid:${cero}`
  await assertCount(vm, 0)
  assert.equal(vm.dashboard.value.topActivadores.length, 1)
  vm.filtroActivador.value = 'uid:fuera'
  assert.equal(vm.dashboard.value.topActivadores.length, 0)
  vm.filtroActivador.value = ''
  vm.filtroDesde.value = '2027-01-01'
  await assertCount(vm, 0)
  assert.deepEqual(vm.dashboard.value.topActivadores.map((r) => r.label), ['Ana', 'Berta', 'Zulma'])
  assert.equal(vm.porcentajeDelTotal(0), '0%')
  vm.filtroDesde.value = ''
  vm.filtroLider.value = `lid:${anterior}`
  assert.equal(vm.dashboard.value.topActivadores.length, 0)
  vm.filtroLider.value = ''
  vm.filtroEquipo.value = ''
  assert.deepEqual(vm.dashboard.value.topActivadores, baselineRanking)
  assert.deepEqual(vm.dashboard.value.kpis, baselineKpis)
  const restricted = await mount(records, catalog.slice(0, 3))
  restricted.filtroEquipo.value = `id:${otroEquipo}`
  assert.equal(restricted.dashboard.value.topActivadores.length, 0)
  assert.ok(!restricted.opciones.value.equipos.some((e) => e.key === `id:${otroEquipo}`))

  // Equipo sin ninguna activación, homónimos y paginación conservada.
  const emptyTeam = await mount([], Array.from({ length: 11 }, (_, i) => ({
    ...catalog[0], usuario_id: `60000000-0000-0000-0000-${String(i).padStart(12, '0')}`, nombre: 'Homónimo',
  })))
  assert.ok(emptyTeam.opciones.value.equipos.some((e) => e.key === `id:${equipo}`))
  assert.equal(emptyTeam.dashboard.value.topActivadores.length, 0)
  emptyTeam.filtroEquipo.value = `id:${equipo}`
  await assertCount(emptyTeam, 0)
  assert.equal(emptyTeam.dashboard.value.topActivadores.length, 11)
  assert.equal(emptyTeam.rankingTotalPages.value, 2)
  assert.equal(emptyTeam.rankingPaginado.value.length, 10)
  emptyTeam.rankingSiguiente()
  assert.equal(emptyTeam.rankingPaginado.value.length, 1)
})
