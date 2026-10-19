import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const serverSource = readFileSync(new URL('../server/app.js', import.meta.url), 'utf8')
const componentSource = readFileSync(new URL('../src/components/ActivacionesTable.vue', import.meta.url), 'utf8')

test('PATCH no permite ni persiste columnas inexistentes', () => {
  const allowlist = serverSource.match(/const ACTIVATION_EDITABLE_FIELDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
  const changesBuilder = componentSource.match(/function construirCambiosEdicion\(\) \{([\s\S]*?)\n\}/)?.[1] ?? ''

  assert.doesNotMatch(allowlist, /['"]observaciones['"]|['"]tipo_grupo['"]/) 
  assert.doesNotMatch(changesBuilder, /observaciones|changes\[.*tipo_grupo|tipo_grupo\s*:/)
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

test('el PATCH usa la validación de clasificación corregida', () => {
  assert.match(serverSource, /import \{[\s\S]*?validateActivationClassification,?[\s\S]*?\} from '\.\.\/src\/lib\/activationEditing\.js'/)
  assert.match(serverSource, /Object\.assign\(updatePayload, activationClassificationUpdate\(normalizedClassification\)\)/)
})
