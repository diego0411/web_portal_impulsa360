export const ACTIVATION_CATEGORIES = [
  { key: 'comercio', label: 'Comercio' },
  { key: 'tienda_barrio', label: 'Tienda de barrio' },
  { key: 'transeunte', label: 'Transeúnte' },
  { key: 'cliente_antiguo', label: 'Cliente antiguo' },
]

export const ACTIVATION_TYPES_BY_CATEGORY = {
  tienda_barrio: [
    { key: 'comercio', label: 'Comercio' },
    { key: 'no_habilitado', label: 'No habilitado' },
    { key: 'reactivacion', label: 'Reactivación' },
    { key: 'config_cuenta', label: 'Configuración de cuenta' },
    { key: 'reimpresion_qr', label: 'Reimpresión QR' },
  ],
  comercio: [
    { key: 'comercio', label: 'Comercio' },
    { key: 'reactivacion_comercio', label: 'Reactivación Comercio' },
    { key: 'limbo', label: 'Limbo (Configuración de Cuenta)' },
    { key: 'no_habilitado', label: 'No habilitado' },
    { key: 'reimpresion_qr', label: 'Reimpresión QR' },
  ],
  transeunte: [
    { key: 'transeunte', label: 'Transeúnte' },
    { key: 'reactivacion_transeunte', label: 'Reactivación Transeúnte' },
  ],
  cliente_antiguo: [
    { key: 'cliente_antiguo', label: 'Cliente antiguo' },
  ],
}

export const STORE_SIZES = ['Pequeña', 'Mediana', 'Grande']
export const COMMERCE_CATEGORIES = [
  'Comercio',
  'Servicios Profesionales',
  'Servicio de Comida',
  'Servicio de Transporte',
  'Manufactura Artesanal',
  'Ambulantes',
  'Servicios Personales',
  'Reparación de Vehículos',
  'Otro',
]
export const ACTIVATION_ERROR_TYPES = ['Conectividad', 'Aplicación', 'Registro', 'Cash-In', 'Otro']
export const ACTIVATION_TEXT_LIMITS = {
  nombres_cliente: 150,
  apellidos_cliente: 150,
  ci_cliente: 30,
}

export function validateActivationTextLengths(values = {}) {
  for (const [key, max] of Object.entries(ACTIVATION_TEXT_LIMITS)) {
    const value = values[key]
    if (value !== null && value !== undefined && String(value).trim().length > max) {
      const label = key === 'ci_cliente' ? 'La cédula de identidad'
        : key === 'apellidos_cliente' ? 'Los apellidos' : 'Los nombres'
      return `${label} no puede superar ${max} caracteres.`
    }
  }
  return null
}

const normalizeKey = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\s-]+/g, '_')

export function inferActivationCategory(row = {}) {
  const explicit = normalizeKey(row.tipo_grupo)
  if (['comercio', 'tienda_barrio', 'transeunte', 'cliente_antiguo'].includes(explicit)) return explicit
  if (['tienda', 'tiendas_barrio', 'tiendas_de_barrio'].includes(explicit)) return 'tienda_barrio'

  const base = normalizeKey(row.base_activacion)
  if (['comercio', 'tienda_barrio', 'transeunte', 'cliente_antiguo'].includes(base)) return base
  if (row.tamano_tienda || row.tipo_tienda) return 'tienda_barrio'

  const type = normalizeKey(row.tipo_activacion)
  if (type === 'cliente_antiguo') return 'cliente_antiguo'
  if (['transeunte', 'reactivacion_transeunte'].includes(type)) return 'transeunte'
  if (type === 'config_cuenta') return 'tienda_barrio'
  if (['comercio', 'reactivacion_comercio', 'limbo'].includes(type) ||
    row.tipo_comercio || row.rubro_comercio || row.rubro_comercio_otro || row.comercio_fuera_mercado != null) {
    return 'comercio'
  }
  return ''
}

export function activationBaseFor(category, activationType) {
  if (category === 'tienda_barrio') return 'tienda_barrio'
  if (category === 'transeunte') return 'transeunte'
  if (category === 'cliente_antiguo') return 'cliente_antiguo'
  if (category !== 'comercio') return ''
  if (['comercio', 'reactivacion_comercio'].includes(activationType)) return 'comercio'
  if (activationType === 'limbo') return 'limbo'
  return 'none'
}

export function isGeneralCommerce(category, activationType) {
  return category === 'comercio' && ['comercio', 'reactivacion_comercio'].includes(activationType)
}

export function isCreditosEligible(values = {}) {
  const type = normalizeKey(values.tipo_activacion)
  return type === 'cliente_antiguo' || type === 'reimpresion_qr' || /^reactivacion/.test(type)
}

export function isRemesasEligible(values = {}) {
  const category = values.tipo_grupo ?? inferActivationCategory(values)
  const type = normalizeKey(values.tipo_activacion)
  return (category === 'comercio' && type === 'comercio') ||
    (category === 'transeunte' && type === 'transeunte')
}

export function normalizeActivationClassification(values = {}, original = {}) {
  const category = values.tipo_grupo
  const activationType = values.tipo_activacion
  const knownType = ACTIVATION_TYPES_BY_CATEGORY[category]?.some((item) => item.key === activationType)
  const preservesHistoricalType = category === inferActivationCategory(original) &&
    activationType === original.tipo_activacion
  const normalized = {
    ...values,
    base_activacion: activationBaseFor(category, activationType),
    es_reactivacion: /^reactivacion/.test(activationType),
  }

  if (category !== 'tienda_barrio') {
    normalized.tamano_tienda = null
    normalized.tipo_tienda = null
  }
  if (!isGeneralCommerce(category, activationType) && (knownType || !preservesHistoricalType)) {
    normalized.tipo_comercio = null
    normalized.rubro_comercio = null
    normalized.rubro_comercio_otro = null
    normalized.comercio_fuera_mercado = null
  }
  return normalized
}

export function validateActivationClassification(values = {}, original = {}) {
  const category = values.tipo_grupo
  const activationType = values.tipo_activacion
  const originalCategory = inferActivationCategory(original)
  const preservesHistoricalType = category === originalCategory && activationType === original.tipo_activacion
  if (!ACTIVATION_TYPES_BY_CATEGORY[category] && !preservesHistoricalType) return 'Selecciona una categoría válida.'
  if (!preservesHistoricalType && !(ACTIVATION_TYPES_BY_CATEGORY[category] ?? []).some((item) => item.key === activationType)) {
    return 'Selecciona un tipo de activación válido para la categoría.'
  }
  const originalStoreSize = original.tamano_tienda ?? original.tipo_tienda
  const preservesHistoricalStoreSize = category === originalCategory && values.tamano_tienda === originalStoreSize
  if (category === 'tienda_barrio' && !STORE_SIZES.includes(values.tamano_tienda) && !preservesHistoricalStoreSize) {
    return 'Selecciona el tamaño de la tienda.'
  }
  if (isGeneralCommerce(category, activationType)) {
    const preservesHistoricalCommerceCategory = category === originalCategory &&
      values.rubro_comercio === original.rubro_comercio
    if (!COMMERCE_CATEGORIES.includes(values.rubro_comercio) && !preservesHistoricalCommerceCategory) {
      return 'Selecciona el rubro del comercio.'
    }
    if (values.rubro_comercio === 'Otro' && !String(values.rubro_comercio_otro ?? '').trim()) {
      return 'Especifica el otro rubro del comercio.'
    }
    const preservesHistoricalOutsideMarket = (values.comercio_fuera_mercado ?? null) === (original.comercio_fuera_mercado ?? null)
    if (typeof values.comercio_fuera_mercado !== 'boolean' && !preservesHistoricalOutsideMarket) {
      return 'Indica si el comercio está fuera del mercado.'
    }
  }
  const typeChanged = category !== originalCategory || activationType !== original.tipo_activacion
  const creditosBecomesTrue = values.creditos === true && original.creditos !== true
  if (values.creditos === true && !isCreditosEligible(values) && (creditosBecomesTrue || typeChanged)) {
    return 'Créditos no aplica al tipo de activación seleccionado.'
  }
  const remesasBecomesTrue = values.remesas === true && original.remesas !== true
  if (values.remesas === true && !isRemesasEligible(values) && (remesasBecomesTrue || typeChanged)) {
    return 'Remesas no aplica al tipo de activación seleccionado.'
  }
  return null
}

export function validateActivationEdit(values = {}, editReason = '', original = {}) {
  if (!String(editReason).trim()) return 'El motivo de edicion es obligatorio.'
  return validateActivationClassification(values, original)
}

export function activationClassificationUpdate(values = {}) {
  return {
    tipo_activacion: values.tipo_activacion,
    base_activacion: values.base_activacion,
    es_reactivacion: values.es_reactivacion,
    tamano_tienda: values.tamano_tienda,
    tipo_tienda: values.tipo_tienda,
    tipo_comercio: values.tipo_comercio,
    rubro_comercio: values.rubro_comercio,
    rubro_comercio_otro: values.rubro_comercio_otro,
    comercio_fuera_mercado: values.comercio_fuera_mercado,
  }
}
