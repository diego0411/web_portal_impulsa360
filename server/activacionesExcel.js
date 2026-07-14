import ExcelJS from 'exceljs'

const PAGE_SIZE = 1000
const SIGNED_URL_BATCH_SIZE = 100
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60
const boliviaDateTimeFormatter = new Intl.DateTimeFormat('es-BO', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/La_Paz',
})

function getCiudad(row) {
  return row.ciudad_activacion ?? row.plaza ?? ''
}

function yesNo(value) {
  return value == null ? '' : value ? 'Si' : 'No'
}

function formatCreatedAt(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : boliviaDateTimeFormatter.format(date)
}

function getObjectPath(bucket, value) {
  if (!value) return ''
  let path = String(value)
  if (/^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname } catch { return '' }
  }
  path = path.split('?')[0].split('#')[0].replace(/^\/+/, '')
  path = path.replace(/^storage\/v1\/object\/(?:public|sign)\//, '')
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1)
  try { return decodeURIComponent(path) } catch { return path }
}

function applyFilters(query, filters) {
  if (filters.fechaDesde) query = query.gte('fecha_activacion', filters.fechaDesde)
  if (filters.fechaHasta) query = query.lte('fecha_activacion', filters.fechaHasta)
  return query
}

function matchesTextFilters(row, filters) {
  const includes = (value, search) => !search || String(value ?? '').toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))
  return includes(row.impulsador, filters.impulsador) &&
    includes(row.zona_activacion, filters.distrito) &&
    includes(getCiudad(row), filters.plaza)
}

async function fetchActivaciones(adminSupabase, filters, allowedUserIds) {
  if (allowedUserIds?.length === 0) return []
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = adminSupabase.from('activaciones').select('*').order('created_at', { ascending: false })
    query = applyFilters(query, filters)
    if (allowedUserIds) query = query.in('usuario_id', allowedUserIds)
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page.filter((row) => matchesTextFilters(row, filters)))
    if (page.length < PAGE_SIZE) return rows
  }
}

async function resolvePhotoLinks(adminSupabase, bucket, rows) {
  const values = [...new Set(rows.flatMap((row) => [row.foto_url, row.foto_cash_in]).filter(Boolean))]
  const pathsByValue = new Map(values.map((value) => [value, getObjectPath(bucket, value)]))
  if (!values.length) return new Map()
  const { data: bucketData, error: bucketError } = await adminSupabase.storage.getBucket(bucket)
  if (bucketError) throw bucketError

  const links = new Map()
  if (bucketData.public) {
    for (const [value, path] of pathsByValue) {
      if (!path) continue
      const { data } = adminSupabase.storage.from(bucket).getPublicUrl(path)
      if (data?.publicUrl) links.set(value, data.publicUrl)
    }
    return links
  }

  const entries = [...pathsByValue].filter(([, path]) => path)
  for (let index = 0; index < entries.length; index += SIGNED_URL_BATCH_SIZE) {
    const batch = entries.slice(index, index + SIGNED_URL_BATCH_SIZE)
    const { data, error } = await adminSupabase.storage
      .from(bucket)
      .createSignedUrls(batch.map(([, path]) => path), SIGNED_URL_EXPIRES_IN_SECONDS)
    if (error) throw error
    for (let itemIndex = 0; itemIndex < batch.length; itemIndex += 1) {
      const signedUrl = data?.[itemIndex]?.signedUrl
      if (signedUrl) links.set(batch[itemIndex][0], signedUrl)
    }
  }
  return links
}

function photoHyperlink(url) {
  return url ? { text: 'Ver imagen', hyperlink: url } : null
}

export async function generateActivacionesExcel({ adminSupabase, bucket, filters, allowedUserIds }) {
  const rows = await fetchActivaciones(adminSupabase, filters, allowedUserIds)
  const photoLinks = await resolvePhotoLinks(adminSupabase, bucket, rows)
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Activaciones', { views: [{ state: 'frozen', ySplit: 2 }] })
  worksheet.columns = [
    ['#', 'numero', 7], ['Creado', 'creado', 26], ['Fecha', 'fecha', 14],
    ['Impulsador', 'impulsador', 24], ['Plaza', 'plaza', 18], ['Distrito', 'distrito', 20],
    ['Nombres Cliente', 'nombres', 24], ['Apellidos Cliente', 'apellidos', 24],
    ['CI Cliente', 'ci', 14], ['Telefono Cliente', 'telefono', 16], ['Email Cliente', 'email', 28],
    ['Descargo App', 'descargo', 14], ['Registro', 'registro', 12], ['Cash In', 'cashIn', 10],
    ['Cash Out', 'cashOut', 10], ['P2P', 'p2p', 10], ['QR Fisico', 'qrFisico', 12],
    ['Respaldo', 'respaldo', 11], ['Hubo Error', 'huboError', 12],
    ['Descripcion Error', 'descripcionError', 30], ['Tipo Activacion', 'tipoActivacion', 20],
    ['Tipo Comercio', 'tipoComercio', 20], ['Tamano Tienda', 'tamanoTienda', 18],
    ['Tipo Tienda', 'tipoTienda', 18], ['Rubro Comercio', 'rubroComercio', 20],
    ['Otro Rubro', 'otroRubro', 20], ['Fuera de Mercado', 'fueraMercado', 18],
    ['Tipo Error', 'tipoError', 20], ['Observaciones', 'observaciones', 30],
    ['Es Plaza Temporal', 'esPlazaTemporal', 18], ['Plaza Temporal', 'plazaTemporal', 20],
    ['Foto', 'foto', 28], ['Foto Cash-In', 'fotoCashIn', 28],
    ['Latitud', 'latitud', 14], ['Longitud', 'longitud', 14], ['Usuario ID', 'usuarioId', 38],
  ].map(([header, key, width]) => ({ header, key, width }))

  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF101E2E' } }
  })
  worksheet.insertRow(1, ['Exportación con enlaces v2'])
  worksheet.mergeCells(1, 1, 1, worksheet.columnCount)
  const versionCell = worksheet.getCell('A1')
  versionCell.font = { bold: true, color: { argb: 'FF0563C1' } }
  versionCell.alignment = { horizontal: 'center' }

  rows.forEach((row, index) => worksheet.addRow({
    numero: index + 1, creado: formatCreatedAt(row.created_at), fecha: row.fecha_activacion,
    impulsador: row.impulsador, plaza: getCiudad(row), distrito: row.zona_activacion,
    nombres: row.nombres_cliente, apellidos: row.apellidos_cliente, ci: row.ci_cliente,
    telefono: row.telefono_cliente, email: row.email_cliente, descargo: yesNo(row.descargo_app),
    registro: yesNo(row.registro), cashIn: yesNo(row.cash_in), cashOut: yesNo(row.cash_out),
    p2p: yesNo(row.p2p), qrFisico: yesNo(row.qr_fisico), respaldo: yesNo(row.respaldo),
    huboError: yesNo(row.hubo_error), descripcionError: row.descripcion_error,
    tipoActivacion: row.tipo_activacion, tipoComercio: row.tipo_comercio,
    tamanoTienda: row.tamano_tienda, tipoTienda: row.tipo_tienda,
    rubroComercio: row.rubro_comercio, otroRubro: row.rubro_comercio_otro,
    fueraMercado: yesNo(row.comercio_fuera_mercado), tipoError: row.tipo_error,
    observaciones: row.observaciones, esPlazaTemporal: yesNo(row.es_plaza_temporal),
    plazaTemporal: row.plaza_temporal,
    foto: photoHyperlink(photoLinks.get(row.foto_url)),
    fotoCashIn: photoHyperlink(photoLinks.get(row.foto_cash_in)),
    latitud: row.latitud, longitud: row.longitud, usuarioId: row.usuario_id,
  }))

  for (const key of ['foto', 'fotoCashIn']) {
    worksheet.getColumn(key).eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber > 2 && cell.value?.hyperlink) {
        cell.font = { color: { argb: 'FF0563C1' }, underline: true }
      }
    })
  }

  return { buffer: await workbook.xlsx.writeBuffer(), rowCount: rows.length }
}
