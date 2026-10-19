import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const componentSource = readFileSync(new URL('../src/components/ActivacionesTable.vue', import.meta.url), 'utf8')
const serverSource = readFileSync(new URL('../server/app.js', import.meta.url), 'utf8')
const serverExcelSource = readFileSync(new URL('../server/activacionesExcel.js', import.meta.url), 'utf8')

const columnasCsv = componentSource.match(/const columnasExportacion = \[([\s\S]*?)\n\]/)?.[1] ?? ''
const columnasExcel = componentSource.match(/const columnasExcelPersonalizado = \[([\s\S]*?)\n\]/)?.[1] ?? ''
const seccionesDetalle = componentSource.match(/const seccionesDetalleConfig = \[([\s\S]*?)\n\]/)?.[1] ?? ''
const editableFields = serverSource.match(/const ACTIVATION_EDITABLE_FIELDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
const serverColumns = serverExcelSource.match(/worksheet\.columns = \[([\s\S]*?)\]\.map/)?.[1] ?? ''

test('CSV agrega Creditos y Remesas al final conservando columnas previas', () => {
  assert.match(columnasCsv, /\['Creditos',[\s\S]*\['Remesas'/)
  assert.ok(columnasCsv.indexOf("['Creditos'") > columnasCsv.indexOf("['Usuario ID'"))
  assert.match(columnasCsv, /\(row\) => \(row\.creditos \? 'Si' : 'No'\)/)
  assert.match(columnasCsv, /\(row\) => \(row\.remesas \? 'Si' : 'No'\)/)
})

test('Excel personalizado agrega Créditos y Remesas al final', () => {
  assert.match(columnasExcel, /\['Créditos',[\s\S]*\['Remesas'/)
  assert.ok(columnasExcel.indexOf("['Créditos'") > columnasExcel.indexOf("['Descripción del Error'"))
})

test('Excel del servidor agrega Creditos y Remesas', () => {
  assert.match(serverColumns, /\['Creditos', 'creditos', \d+\][\s\S]*\['Remesas', 'remesas', \d+\]/)
  assert.match(serverExcelSource, /creditos: row\.creditos \? 'Si' : 'No'/)
  assert.match(serverExcelSource, /remesas: row\.remesas \? 'Si' : 'No'/)
})

test('el detalle muestra creditos y remesas de forma explícita y sin duplicados', () => {
  assert.match(seccionesDetalle, /'creditos',\s*'remesas'/)
  assert.match(componentSource, /siempreVisibles\.has\(key\) \? row\[key\] === true/)
})

test('PATCH no permite editar creditos ni remesas', () => {
  assert.doesNotMatch(editableFields, /['"]creditos['"]|['"]remesas['"]/)
  assert.doesNotMatch(componentSource, /changes\[['"]creditos['"]\]|changes\[['"]remesas['"]\]/)
})
