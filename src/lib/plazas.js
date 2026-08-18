const PLAZA_CANONICAS = new Map([
  ['lapaz', 'La Paz'],
  ['elalto', 'El Alto'],
  ['santacruz', 'Santa Cruz de la Sierra'],
  ['santacruzdelasierra', 'Santa Cruz de la Sierra'],
  ['cochabamba', 'Cochabamba'],
  ['oruro', 'Oruro'],
  ['potosi', 'Potosi'],
  ['tarija', 'Tarija'],
  ['chuquisaca', 'Chuquisaca'],
  ['sucre', 'Sucre'],
  ['beni', 'Beni'],
  ['trinidad', 'Trinidad'],
  ['pando', 'Pando'],
  ['cobija', 'Cobija'],
])

export function normalizarPlazaClave(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, '')
}

function titleCase(value) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLocaleLowerCase('es')
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('es'))
}

export function nombreLegiblePlaza(value) {
  const key = normalizarPlazaClave(value)
  return PLAZA_CANONICAS.get(key) ?? titleCase(value)
}

export function mismaPlaza(a, b) {
  return normalizarPlazaClave(a) === normalizarPlazaClave(b)
}

export function deduplicarPlazas(values) {
  const map = new Map()
  for (const value of values) {
    if (!value) continue
    const key = normalizarPlazaClave(value)
    if (!key || map.has(key)) continue
    map.set(key, { key, value, nombre: nombreLegiblePlaza(value) })
  }
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function deduplicarPlazasCatalogo(plazas) {
  const byKey = new Map()
  for (const plaza of plazas ?? []) {
    if (!plaza?.id && !plaza?.nombre) continue
    const sourceName = plaza.nombre_normalizado || plaza.codigo || plaza.nombre || plaza.id
    const key = normalizarPlazaClave(sourceName)
    if (!key) continue
    const item = { ...plaza, nombre: nombreLegiblePlaza(plaza.nombre || sourceName) }
    const current = byKey.get(key)
    const currentRaw = String(current?.nombre ?? '')
    const itemRaw = String(plaza.nombre ?? '')
    const itemLooksCanonical = itemRaw && !/[_-]/.test(itemRaw)
    const currentLooksCanonical = currentRaw && !/[_-]/.test(currentRaw)
    if (!current || (item.activa && !current.activa) || (itemLooksCanonical && !currentLooksCanonical)) {
      byKey.set(key, item)
    }
  }
  return [...byKey.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
