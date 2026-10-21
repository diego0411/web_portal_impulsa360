import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const serverSource = readFileSync(new URL('../server/app.js', import.meta.url), 'utf8')

function portalActivationsHandler(source) {
  const inicio = source.indexOf("app.get('/portal/activations',")
  assert.ok(inicio >= 0, 'no se encontro GET /portal/activations')
  const fin = source.indexOf("app.get('/portal/activations/export-excel'", inicio)
  assert.ok(fin > inicio, 'no se encontro el fin del handler /portal/activations')
  return source.slice(inicio, fin)
}

test('GET /portal/activations ordena por created_at DESC con id ASC como desempate estable', () => {
  const handler = portalActivationsHandler(serverSource)
  const ordenFecha = handler.indexOf(".order('created_at', { ascending: false })")
  const ordenId = handler.indexOf(".order('id', { ascending: true })")
  const rango = handler.indexOf('.range(from, to)')
  assert.ok(ordenFecha >= 0, 'falta order created_at DESC')
  assert.ok(ordenId >= 0, 'falta order id ASC como desempate')
  assert.ok(ordenFecha < ordenId, 'el desempate por id debe ir despues del orden por created_at')
  assert.ok(ordenId < rango, 'ambos order deben aplicarse antes de range (OFFSET)')
})

test('el contrato de paginacion from/to de fetchAllActivaciones se conserva', () => {
  const handler = portalActivationsHandler(serverSource)
  assert.match(handler, /req\.query\.from/)
  assert.match(handler, /req\.query\.to/)
  assert.match(handler, /Math\.min\(from \+ 999/)
  assert.match(handler, /\.range\(from, to\)/)
  assert.doesNotMatch(handler, /limit|offset/, 'la paginacion sigue siendo por range, no por limit/offset manuales')
})

function ordenarActivaciones(rows) {
  return [...rows].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
    if (a.id !== b.id) return a.id < b.id ? -1 : 1
    return 0
  })
}

test('registros con created_at identico entre paginas no se omiten ni se duplican', () => {
  const mismoInstante = '2026-10-01T10:00:00+00:00'
  const filas = [
    { id: 'a', created_at: mismoInstante },
    { id: 'b', created_at: mismoInstante },
    { id: 'c', created_at: mismoInstante },
    { id: 'd', created_at: mismoInstante },
    { id: 'e', created_at: '2026-10-02T09:00:00+00:00' },
    { id: 'f', created_at: '2026-09-30T08:00:00+00:00' },
  ]
  const pageSize = 3
  const ordenado = ordenarActivaciones(filas)
  const pagina1 = ordenado.slice(0, pageSize)
  const pagina2 = ordenado.slice(pageSize, pageSize * 2)

  const idsConcatenados = [...pagina1, ...pagina2].map((row) => row.id)
  assert.deepEqual(idsConcatenados, ['e', 'a', 'b', 'c', 'd', 'f'])
  assert.equal(new Set(idsConcatenados).size, filas.length, 'sin duplicados ni omisiones entre paginas')

  const ties = ordenado.filter((row) => row.created_at === mismoInstante).map((row) => row.id)
  assert.deepEqual(ties, ['a', 'b', 'c', 'd'], 'los empates se resuelven por id ASC')

  const otroPlano = ordenarActivaciones([...filas].reverse())
  assert.deepEqual(otroPlano.map((row) => row.id), ordenado.map((row) => row.id),
    'el orden total es deterministico aunque la base devuelva los empates en otro orden')
})
