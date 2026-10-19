import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACTIVATION_CATEGORIES,
  ACTIVATION_TYPES_BY_CATEGORY,
  activationBaseFor,
  activationClassificationUpdate,
  inferActivationCategory,
  isCreditosEligible,
  isGeneralCommerce,
  isRemesasEligible,
  normalizeActivationClassification,
  validateActivationClassification,
  validateActivationEdit,
  validateActivationTextLengths,
} from '../src/lib/activationEditing.js'

const commerce = {
  tipo_grupo: 'comercio', tipo_activacion: 'comercio', base_activacion: 'comercio',
  tamano_tienda: null, tipo_tienda: null, tipo_comercio: null,
  rubro_comercio: 'Comercio', rubro_comercio_otro: null, comercio_fuera_mercado: false,
}

test('convierte Comercio a Tienda de barrio y limpia solo campos incompatibles', () => {
  const result = normalizeActivationClassification({
    ...commerce, tipo_grupo: 'tienda_barrio', tipo_activacion: 'comercio', tamano_tienda: 'Pequeña',
  })
  assert.equal(validateActivationClassification(result, commerce), null)
  assert.equal(result.base_activacion, 'tienda_barrio')
  assert.equal(result.rubro_comercio, null)
  assert.equal(result.comercio_fuera_mercado, null)
})

test('convierte Tienda de barrio a Comercio sin mezclar tamaño', () => {
  const store = { tipo_grupo: 'tienda_barrio', tipo_activacion: 'reactivacion', tamano_tienda: 'Grande' }
  const result = normalizeActivationClassification({
    ...store, tipo_grupo: 'comercio', tipo_activacion: 'reactivacion_comercio',
    rubro_comercio: 'Servicio de Comida', comercio_fuera_mercado: true,
  })
  assert.equal(validateActivationClassification(result, store), null)
  assert.equal(result.base_activacion, 'comercio')
  assert.equal(result.tamano_tienda, null)
})

test('cambio a Transeúnte limpia datos de tienda y comercio', () => {
  const result = normalizeActivationClassification({
    ...commerce, tipo_grupo: 'transeunte', tipo_activacion: 'transeunte', tamano_tienda: 'Mediana',
  })
  assert.equal(validateActivationClassification(result, commerce), null)
  assert.equal(result.base_activacion, 'transeunte')
  assert.equal(result.tamano_tienda, null)
  assert.equal(result.rubro_comercio, null)
})

test('cambia subtipo dentro de la categoría y deriva base compatible', () => {
  const result = normalizeActivationClassification({ ...commerce, tipo_activacion: 'limbo' })
  assert.equal(validateActivationClassification(result, commerce), null)
  assert.equal(result.base_activacion, 'limbo')
  assert.equal(result.rubro_comercio, null)
})

test('precarga nomenclatura histórica sin sobrescribirla', () => {
  const historical = {
    tipo_grupo: 'Tiendas de Barrio', tipo_activacion: 'tipo_historico', tamano_tienda: 'P',
    tipo_comercio: 'clasificacion_anterior', rubro_comercio: 'Rubro anterior',
  }
  assert.equal(inferActivationCategory(historical), 'tienda_barrio')
  const form = { ...historical, tipo_grupo: inferActivationCategory(historical) }
  assert.equal(validateActivationClassification(form, historical), null)
  const normalized = normalizeActivationClassification(form, historical)
  assert.equal(normalized.tipo_activacion, 'tipo_historico')
  assert.equal(normalized.tamano_tienda, 'P')
  assert.equal(normalized.rubro_comercio, 'Rubro anterior')
})

test('la normalización no sincroniza tipo_tienda con tamano_tienda', () => {
  const divergente = {
    tipo_grupo: 'tienda_barrio', tipo_activacion: 'reactivacion',
    tipo_tienda: 'Mediana', tamano_tienda: 'Grande',
  }
  const normalized = normalizeActivationClassification(divergente, divergente)
  assert.equal(normalized.tipo_tienda, 'Mediana')
  assert.equal(normalized.tamano_tienda, 'Grande')

  const parcial = {
    tipo_grupo: 'tienda_barrio', tipo_activacion: 'comercio',
    tipo_tienda: null, tamano_tienda: 'Pequeña',
  }
  const normalizedParcial = normalizeActivationClassification(parcial, parcial)
  assert.equal(normalizedParcial.tipo_tienda, null)
  assert.equal(normalizedParcial.tamano_tienda, 'Pequeña')
})

test('rechaza guardado sin motivo', () => {
  assert.match(validateActivationEdit(commerce, '', commerce), /motivo de edicion es obligatorio/)
})

test('rechaza combinaciones inválidas nuevas', () => {
  assert.match(validateActivationClassification({
    tipo_grupo: 'tienda_barrio', tipo_activacion: 'reactivacion_comercio', tamano_tienda: 'Pequeña',
  }, commerce), /tipo de activación válido/)
  assert.match(validateActivationClassification({
    tipo_grupo: 'tienda_barrio', tipo_activacion: 'comercio', tamano_tienda: '',
  }, commerce), /tamaño de la tienda/)
})

test('el payload persistente excluye la categoría derivada tipo_grupo', () => {
  const normalized = normalizeActivationClassification(commerce, commerce)
  const update = activationClassificationUpdate(normalized)
  assert.equal(Object.hasOwn(update, 'tipo_grupo'), false)
  assert.equal(update.tipo_activacion, 'comercio')
  assert.equal(update.base_activacion, 'comercio')
})

const clienteAntiguo = {
  tipo_activacion: 'cliente_antiguo', base_activacion: 'cliente_antiguo',
  tamano_tienda: null, tipo_tienda: null, tipo_comercio: null,
  rubro_comercio: null, rubro_comercio_otro: null, comercio_fuera_mercado: null,
  telefono_cliente: '70000000',
}

test('cliente antiguo es la cuarta categoría con su tipo', () => {
  assert.deepEqual(
    ACTIVATION_CATEGORIES.map((categoria) => categoria.key),
    ['comercio', 'tienda_barrio', 'transeunte', 'cliente_antiguo'],
  )
  assert.equal(ACTIVATION_TYPES_BY_CATEGORY.cliente_antiguo.some((tipo) => tipo.key === 'cliente_antiguo'), true)
})

test('reconoce cliente antiguo por tipo_activacion y por base_activacion', () => {
  assert.equal(inferActivationCategory({ tipo_activacion: 'cliente_antiguo' }), 'cliente_antiguo')
  assert.equal(inferActivationCategory({ base_activacion: 'cliente_antiguo' }), 'cliente_antiguo')
  assert.equal(inferActivationCategory({ tipo_grupo: 'Cliente Antiguo' }), 'cliente_antiguo')
  assert.equal(activationBaseFor('cliente_antiguo', 'cliente_antiguo'), 'cliente_antiguo')
  assert.equal(isGeneralCommerce('cliente_antiguo', 'cliente_antiguo'), false)
})

test('permite editar cliente antiguo sin errores de clasificación', () => {
  const form = {
    ...clienteAntiguo,
    tipo_grupo: inferActivationCategory(clienteAntiguo),
    telefono_cliente: '71111111',
  }
  assert.equal(validateActivationEdit(form, 'Actualiza telefono', clienteAntiguo), null)
})

test('editar otros campos no altera tipo_activacion ni base_activacion', () => {
  const form = {
    ...clienteAntiguo,
    tipo_grupo: inferActivationCategory(clienteAntiguo),
    telefono_cliente: '72222222',
  }
  const normalized = normalizeActivationClassification(form, clienteAntiguo)
  assert.equal(normalized.tipo_activacion, 'cliente_antiguo')
  assert.equal(normalized.base_activacion, 'cliente_antiguo')
})

test('preserva un tipo histórico dentro de cliente antiguo', () => {
  const historical = { ...clienteAntiguo, tipo_activacion: 'tipo_historico' }
  const form = { ...historical, tipo_grupo: inferActivationCategory(historical) }
  assert.equal(inferActivationCategory(historical), 'cliente_antiguo')
  assert.equal(validateActivationClassification(form, historical), null)
  assert.equal(normalizeActivationClassification(form, historical).tipo_activacion, 'tipo_historico')
})

test('D1: permite editar un tipo histórico desconocido sin cambiar su clasificación', () => {
  const historical = { tipo_activacion: 'tipo_desconocido', base_activacion: null, telefono_cliente: '70000000' }
  const form = {
    ...historical,
    tipo_grupo: inferActivationCategory(historical),
    tamano_tienda: null,
    telefono_cliente: '71111111',
  }
  assert.equal(inferActivationCategory(historical), '')
  assert.equal(validateActivationEdit(form, 'Actualiza telefono', historical), null)
  const normalized = normalizeActivationClassification(form, historical)
  assert.equal(normalized.tipo_activacion, 'tipo_desconocido')
  assert.equal(normalized.base_activacion, '')
})

test('D1: rechaza cambios explícitos a clasificaciones inválidas', () => {
  const historical = { tipo_activacion: 'tipo_desconocido', base_activacion: null }
  assert.match(
    validateActivationClassification({ ...historical, tipo_grupo: 'inexistente', tipo_activacion: 'tipo_desconocido' }, historical),
    /categoría válida/,
  )
  assert.match(
    validateActivationClassification({ ...historical, tipo_grupo: '', tipo_activacion: 'otro_tipo' }, historical),
    /categoría válida|tipo de activación válido/,
  )
  assert.match(
    validateActivationClassification({ tipo_grupo: 'tienda_barrio', tipo_activacion: 'reactivacion_comercio', tamano_tienda: 'Pequeña' }, commerce),
    /tipo de activación válido/,
  )
})

test('D2: permite guardar comercio histórico con comercio_fuera_mercado=null sin cambios', () => {
  const historical = {
    tipo_activacion: 'comercio', base_activacion: 'comercio',
    rubro_comercio: 'Comercio', comercio_fuera_mercado: null,
  }
  const form = { ...historical, tipo_grupo: 'comercio', telefono_cliente: '70000000' }
  assert.equal(validateActivationEdit(form, 'Actualiza telefono', historical), null)
})

test('D2: mantiene la exigencia de booleano ante cambios explícitos', () => {
  const historical = {
    tipo_activacion: 'comercio', base_activacion: 'comercio',
    rubro_comercio: 'Comercio', comercio_fuera_mercado: true,
  }
  assert.match(
    validateActivationClassification({ ...historical, tipo_grupo: 'comercio', comercio_fuera_mercado: null }, historical),
    /fuera del mercado/,
  )
})

test('créditos aplica a reactivaciones, reimpresión QR y cliente antiguo', () => {
  assert.equal(isCreditosEligible({ tipo_activacion: 'reactivacion' }), true)
  assert.equal(isCreditosEligible({ tipo_activacion: 'reactivacion_comercio' }), true)
  assert.equal(isCreditosEligible({ tipo_activacion: 'reactivacion_transeunte' }), true)
  assert.equal(isCreditosEligible({ tipo_activacion: 'reimpresion_qr' }), true)
  assert.equal(isCreditosEligible({ tipo_activacion: 'cliente_antiguo' }), true)
  assert.equal(isCreditosEligible({ tipo_grupo: 'comercio', tipo_activacion: 'comercio' }), false)
  assert.equal(isCreditosEligible({ tipo_grupo: 'transeunte', tipo_activacion: 'transeunte' }), false)
})

test('remesas aplica solo a comercio nuevo y transeúnte nuevo', () => {
  assert.equal(isRemesasEligible({ tipo_grupo: 'comercio', tipo_activacion: 'comercio' }), true)
  assert.equal(isRemesasEligible({ tipo_grupo: 'transeunte', tipo_activacion: 'transeunte' }), true)
  assert.equal(isRemesasEligible({ tipo_grupo: 'tienda_barrio', tipo_activacion: 'comercio' }), false)
  assert.equal(isRemesasEligible({ tipo_grupo: 'comercio', tipo_activacion: 'reactivacion_comercio' }), false)
  assert.equal(isRemesasEligible({ tipo_grupo: 'cliente_antiguo', tipo_activacion: 'cliente_antiguo' }), false)
})

test('rechaza créditos/remesas true cuando el tipo no es elegible', () => {
  assert.match(
    validateActivationClassification({
      tipo_grupo: 'comercio', tipo_activacion: 'comercio',
      rubro_comercio: 'Comercio', comercio_fuera_mercado: false, creditos: true,
    }, commerce),
    /Créditos no aplica/,
  )
  assert.match(
    validateActivationClassification({
      tipo_grupo: 'tienda_barrio', tipo_activacion: 'comercio', tamano_tienda: 'Pequeña', remesas: true,
    }, commerce),
    /Remesas no aplica/,
  )
  assert.equal(validateActivationClassification({
    tipo_grupo: 'transeunte', tipo_activacion: 'transeunte', remesas: true,
  }, commerce), null)
})

test('valida longitudes de nombres, apellidos y CI sin romper null o vacíos', () => {
  assert.equal(validateActivationTextLengths({ nombres_cliente: null, apellidos_cliente: '', ci_cliente: undefined }), null)
  assert.equal(validateActivationTextLengths({ nombres_cliente: 'Ana', apellidos_cliente: 'Pérez', ci_cliente: '1234567' }), null)
  assert.match(validateActivationTextLengths({ nombres_cliente: 'x'.repeat(151) }), /nombres/)
  assert.match(validateActivationTextLengths({ apellidos_cliente: 'x'.repeat(151) }), /apellidos/)
  assert.match(validateActivationTextLengths({ ci_cliente: 'x'.repeat(31) }), /cédula/)
})

test('preserva créditos históricos aunque el tipo ya no sea elegible', () => {
  const legacy = {
    tipo_grupo: 'comercio', tipo_activacion: 'comercio',
    rubro_comercio: 'Comercio', comercio_fuera_mercado: false, creditos: true,
  }
  const editOnly = { ...legacy, telefono_cliente: '71111111' }
  assert.equal(validateActivationEdit(editOnly, 'Actualiza telefono', legacy), null)
  assert.match(
    validateActivationEdit({ ...legacy, tipo_grupo: 'transeunte', tipo_activacion: 'transeunte' }, 'Cambia tipo', legacy),
    /Créditos no aplica/,
  )
})

test('editar otros campos preserva creditos/remesas y no los limpia al cambiar tipo', () => {
  const base = {
    tipo_grupo: 'comercio', tipo_activacion: 'reactivacion_comercio',
    rubro_comercio: 'Comercio', comercio_fuera_mercado: false, creditos: true, remesas: false,
  }
  const editOnly = { ...base, telefono_cliente: '71111111' }
  assert.equal(validateActivationEdit(editOnly, 'Actualiza telefono', base), null)
  assert.equal(normalizeActivationClassification(editOnly, base).creditos, true)
  assert.equal(normalizeActivationClassification({ ...base, tipo_grupo: 'transeunte', tipo_activacion: 'transeunte' }, base).creditos, true)
})
