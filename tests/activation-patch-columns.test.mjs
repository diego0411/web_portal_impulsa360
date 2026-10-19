import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const serverSource = readFileSync(new URL('../server/app.js', import.meta.url), 'utf8')
const componentSource = readFileSync(new URL('../src/components/ActivacionesTable.vue', import.meta.url), 'utf8')

test('PATCH permite observaciones, creditos y remesas pero no tipo_grupo', () => {
  const allowlist = serverSource.match(/const ACTIVATION_EDITABLE_FIELDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
  const changesBuilder = componentSource.match(/function construirCambiosEdicion\(\) \{([\s\S]*?)\n\}/)?.[1] ?? ''

  assert.match(allowlist, /['"]observaciones['"]/)
  assert.match(allowlist, /['"]creditos['"]/)
  assert.match(allowlist, /['"]remesas['"]/)
  assert.doesNotMatch(allowlist, /['"]tipo_grupo['"]/)
  assert.match(changesBuilder, /observaciones/)
  assert.match(changesBuilder, /'creditos', 'remesas'/)
  assert.doesNotMatch(changesBuilder, /changes\[.*tipo_grupo|tipo_grupo\s*:/)
})

test('la categoría se transporta solo como metadato de validación', () => {
  assert.match(componentSource, /categoriaActivacion:\s*formularioEdicion\.value\.tipo_grupo/)
  assert.match(serverSource, /const activationCategory = normalizeText\(req\.body\?\.categoriaActivacion\)/)
})

test('construirCambiosEdicion normaliza el snapshot inicial para no enviar clasificación ajena', () => {
  const changesBuilder = componentSource.match(/function construirCambiosEdicion\(\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(changesBuilder, /const form = normalizeActivationClassification\(formularioEdicion\.value, activacionSeleccionada\.value\)/)
  assert.match(changesBuilder, /const initial = normalizeActivationClassification\(formularioEdicionInicial\.value, activacionSeleccionada\.value\)/)
})

test('identidad y nombre comercial usan columnas independientes', () => {
  assert.match(componentSource, /const nombreComercialKey = computed/)
  assert.match(componentSource, /\['nombre_comercio', 'comercio', 'cliente'\]/)
  assert.doesNotMatch(componentSource, /\['nombre_comercio', 'comercio', 'cliente', 'nombres_cliente'\]/)
  assert.match(componentSource, /nombres_cliente: row\.nombres_cliente \?\? ''/)
  assert.match(componentSource, /apellidos_cliente: row\.apellidos_cliente \?\? ''/)
  assert.match(componentSource, /ci_cliente: row\.ci_cliente \?\? ''/)
  assert.match(componentSource, /v-model="formularioEdicion\.nombre_comercial"/)
  assert.match(componentSource, /v-model="formularioEdicion\.nombres_cliente"/)
  assert.match(componentSource, /v-model="formularioEdicion\.apellidos_cliente"/)
  assert.match(componentSource, /v-model="formularioEdicion\.ci_cliente"/)
  assert.doesNotMatch(componentSource, /v-model="formularioEdicion\.nombre"/)
  assert.match(componentSource, /setIfChanged\(nombreComercialKey\.value, form\.nombre_comercial\)/)
  assert.match(componentSource, /setIfChanged\('nombres_cliente', form\.nombres_cliente\)/)
})

test('nombres, apellidos y CI son editables e inicializados con null/valores reales', () => {
  const allowlist = serverSource.match(/const ACTIVATION_EDITABLE_FIELDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
  assert.match(allowlist, /['"]nombres_cliente['"]/)
  assert.match(allowlist, /['"]apellidos_cliente['"]/)
  assert.match(allowlist, /['"]ci_cliente['"]/)
  assert.match(componentSource, /apellidos_cliente: row\.apellidos_cliente \?\? ''/)
  assert.match(componentSource, /ci_cliente: row\.ci_cliente \?\? ''/)
  assert.match(componentSource, /formularioEdicion\.apellidos_cliente/)
  assert.match(componentSource, /formularioEdicion\.ci_cliente/)
})

test('el diff solo agrega al PATCH los campos modificados', () => {
  const changesBuilder = componentSource.match(/function construirCambiosEdicion\(\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(changesBuilder, /const changes = \{\}/)
  assert.match(changesBuilder, /if \(value !== initial\[key\]\) changes\[key\] = value/)
  assert.match(changesBuilder, /setIfChanged\('apellidos_cliente'/)
  assert.match(changesBuilder, /setIfChanged\('ci_cliente'/)
})

test('tipo_tienda solo se sincroniza y envía si cambió el tamaño', () => {
  const changesBuilder = componentSource.match(/function construirCambiosEdicion\(\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(changesBuilder, /const sizeChanged = form\.tamano_tienda !== initial\.tamano_tienda/)
  assert.match(changesBuilder, /form\.tipo_grupo === 'tienda_barrio' && sizeChanged/)
  assert.match(changesBuilder, /if \(!sizeChanged\) \{[\s\S]*?delete changes\.tipo_tienda[\s\S]*?delete changes\.tamano_tienda/)
})

test('el PATCH usa la validación de clasificación corregida', () => {
  assert.match(serverSource, /import \{[\s\S]*?validateActivationClassification,?[\s\S]*?\} from '\.\.\/src\/lib\/activationEditing\.js'/)
  assert.match(serverSource, /Object\.assign\(updatePayload, activationClassificationUpdate\(normalizedClassification\)\)/)
})
