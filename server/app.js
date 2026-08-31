import crypto from 'node:crypto'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { generateActivacionesExcel } from './activacionesExcel.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ACTIVATION_EDITABLE_FIELDS = new Set([
  'nombres_cliente',
  'nombre_comercio',
  'comercio',
  'cliente',
  'telefono_cliente',
  'email_cliente',
  'plaza',
  'ciudad_activacion',
  'tipo_activacion',
  'resultado',
  'estado',
  'observaciones',
  'tipo_tienda',
  'rubro_comercio',
  'rubro_comercio_otro',
  'comercio_fuera_mercado',
  'tipo_error',
  'descripcion_error',
  'es_plaza_temporal',
  'plaza_temporal',
])
const ALLOWED_STORE_SIZES = new Set(['Pequeña', 'Mediana', 'Grande'])
const ALLOWED_USER_ROLES = new Set(['activador', 'lider', 'facturador', 'administrador'])
const ALLOWED_USER_STATES = new Set(['activo', 'inhabilitado'])
const ALLOWED_TEMPORARY_ZONE_TYPES = new Set(['universidad', 'feria', 'evento', 'campana', 'punto_temporal'])
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_BASIC_USER',
  'ADMIN_BASIC_PASS',
]
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  /* Bloque desplazado accidentalmente; se conserva comentado hasta retirarlo del diff.
    try {
      // Realizar conteos separados por tabla/columna
      const equiposRes = await adminSupabase.from('equipos').select('id', { count: 'exact', head: true }).eq('plaza_id', plazaId)
      const activadoresPlazaIdRes = await adminSupabase.from('activadores').select('usuario_id', { count: 'exact', head: true }).eq('plaza_id', plazaId)
      const activadoresPlazaBaseRes = await adminSupabase.from('activadores').select('plaza_base', { count: 'exact', head: true }).eq('plaza_base', plazaId)
      const activacionesPlazaIdRes = await adminSupabase.from('activaciones').select('id', { count: 'exact', head: true }).eq('plaza_id_registro', plazaId)
      const activacionesPlazaBaseIdRes = await adminSupabase.from('activaciones').select('id', { count: 'exact', head: true }).eq('plaza_base_id_registro', plazaId)
      const activacionesPlazaEfectivaIdRes = await adminSupabase.from('activaciones').select('id', { count: 'exact', head: true }).eq('plaza_efectiva_id_registro', plazaId)
      const temporalesRes = await adminSupabase.from('activador_plaza_temporal').select('id', { count: 'exact', head: true }).eq('plaza_temporal_id', plazaId)

      const relations = []

      if (equiposRes.error) relations.push({ table: 'equipos', column: 'plaza_id', error: true })
      else if ((equiposRes.count ?? 0) > 0) relations.push({ table: 'equipos', column: 'plaza_id', count: equiposRes.count ?? 0 })

      if (activadoresPlazaIdRes.error) relations.push({ table: 'activadores', column: 'plaza_id', error: true })
      else if ((activadoresPlazaIdRes.count ?? 0) > 0) relations.push({ table: 'activadores', column: 'plaza_id', count: activadoresPlazaIdRes.count ?? 0 })

      // Detectar si plaza_base almacena UUID o texto sin exponer datos
      let plazaBaseType = 'unknown'
      try {
        const sampleValues = await adminSupabase.from('activadores').select('plaza_base').not('plaza_base', 'is', null).limit(10)
        const values = (sampleValues.data ?? []).map((r) => r.plaza_base).filter(Boolean)
        const uuidLike = values.some((v) => typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v))
        plazaBaseType = uuidLike ? 'uuid' : 'text'
      } catch (_e) {
        plazaBaseType = 'unknown'
      }

      if (activadoresPlazaBaseRes.error) relations.push({ table: 'activadores', column: 'plaza_base', error: true })
      else if (plazaBaseType === 'uuid') {
        if ((activadoresPlazaBaseRes.count ?? 0) > 0) relations.push({ table: 'activadores', column: 'plaza_base', count: activadoresPlazaBaseRes.count ?? 0 })
      } else if (plazaBaseType === 'text') {
        // Si plaza_base es texto, no tratarla como FK a plaza.id; omitir la relación
      } else {
        // tipo desconocido: conservadormente marcar como posible error
        if ((activadoresPlazaBaseRes.count ?? 0) > 0) relations.push({ table: 'activadores', column: 'plaza_base', error: true })
      }

      if (activacionesPlazaIdRes.error) relations.push({ table: 'activaciones', column: 'plaza_id_registro', error: true })
      else if ((activacionesPlazaIdRes.count ?? 0) > 0) relations.push({ table: 'activaciones', column: 'plaza_id_registro', count: activacionesPlazaIdRes.count ?? 0 })

      if (activacionesPlazaBaseIdRes.error) relations.push({ table: 'activaciones', column: 'plaza_base_id_registro', error: true })
      else if ((activacionesPlazaBaseIdRes.count ?? 0) > 0) relations.push({ table: 'activaciones', column: 'plaza_base_id_registro', count: activacionesPlazaBaseIdRes.count ?? 0 })

      if (activacionesPlazaEfectivaIdRes.error) relations.push({ table: 'activaciones', column: 'plaza_efectiva_id_registro', error: true })
      else if ((activacionesPlazaEfectivaIdRes.count ?? 0) > 0) relations.push({ table: 'activaciones', column: 'plaza_efectiva_id_registro', count: activacionesPlazaEfectivaIdRes.count ?? 0 })

      if (temporalesRes.error) relations.push({ table: 'activador_plaza_temporal', column: 'plaza_temporal_id', error: true })
      else if ((temporalesRes.count ?? 0) > 0) relations.push({ table: 'activador_plaza_temporal', column: 'plaza_temporal_id', count: temporalesRes.count ?? 0 })

      if (relations.length > 0) {
        res.status(409).json({ ok: false, deleted: false, message: 'No se puede eliminar la plaza porque tiene información relacionada.', relations })
        return
      }

      // No se encontraron relaciones: permitir eliminación física
      const { error: delErr } = await adminSupabase.from('plazas').delete().eq('id', plazaId)
      if (delErr) { jsonError(res, 500, 'No se pudo eliminar la plaza.', delErr.message); return }
      res.json({ ok: true, deleted: true, message: 'Plaza eliminada correctamente.' })
    } catch (err) {
      jsonError(res, 500, 'Error verificando relaciones de plaza.', err?.message ?? String(err))
    }
  }

  */
]
const MB = 1024 * 1024
const GB = 1024 * MB
const SUPABASE_FREE_PLAN_REFERENCE = Object.freeze({
  name: 'Supabase Free',
  api_requests: 'Unlimited API requests',
  monthly_active_users_limit: 50000,
  database_limit_bytes: 500 * MB,
  shared_ram_mb: 500,
  cpu_tier: 'shared',
  egress_limit_bytes: 5 * GB,
  cached_egress_limit_bytes: 5 * GB,
  file_storage_limit_bytes: 1 * GB,
  support: 'Community support',
})
const INTERNAL_TEAM_NAME = 'Equipo administrativo'

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeOrganizationName(value) {
  return normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(normalizeEmail(value))
}

function isStrongPassword(value) {
  return typeof value === 'string' && value.length >= 10 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value)
}

function isMissingOrganizationSchema(error) {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? '').toLowerCase()
  return ['42P01', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code) ||
    message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find the table')
}

export function resolvePort(rawValue) {
  const parsedPort = Number(rawValue ?? 8787)
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    return 8787
  }
  return parsedPort
}

function assertRequiredEnv(env) {
  for (const envName of REQUIRED_ENV) {
    if (!env[envName]) {
      throw new Error(`Falta variable de entorno requerida: ${envName}`)
    }
  }
}

function buildAllowedOrigins(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return DEFAULT_ALLOWED_ORIGINS
  }

  return rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildOriginMatcher(pattern) {
  if (pattern === '*') {
    return () => true
  }

  if (!pattern.includes('*')) {
    return (origin) => origin === pattern
  }

  const regexPattern = `^${escapeRegex(pattern).replace(/\\\*/g, '.*')}$`
  const matcherRegex = new RegExp(regexPattern)
  return (origin) => matcherRegex.test(origin)
}

function headerFirstValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }

  if (typeof value === 'string') {
    return value.split(',')[0].trim()
  }

  return ''
}

function getRequestOrigin(req) {
  const forwardedProto = headerFirstValue(req.headers['x-forwarded-proto'])
  const forwardedHost = headerFirstValue(req.headers['x-forwarded-host'])
  const host = forwardedHost || headerFirstValue(req.headers.host)

  if (!host) {
    return null
  }

  const protocol = forwardedProto || req.protocol || 'http'
  return `${protocol}://${host}`
}

function isOriginAllowed(origin, req, allowedOriginMatchers) {
  if (!origin) {
    return true
  }

  if (allowedOriginMatchers.some((matcher) => matcher(origin))) {
    return true
  }

  const requestOrigin = getRequestOrigin(req)
  return Boolean(requestOrigin && requestOrigin === origin)
}

function jsonError(res, statusCode, message, details) {
  const payload = { error: message }
  if (details) {
    payload.details = details
  }
  res.status(statusCode).json(payload)
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}

function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) {
    return null
  }

  try {
    const base64Payload = header.slice('Basic '.length)
    const decoded = Buffer.from(base64Payload, 'base64').toString('utf8')
    const separatorIndex = decoded.indexOf(':')

    if (separatorIndex < 0) {
      return null
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    }
  } catch {
    return null
  }
}

function parseLimit(value, { fallback = 50, min = 1, max = 200 } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10)

  if (!Number.isInteger(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, parsed))
}

function parseOptionalMegabytes(rawValue) {
  const parsed = Number.parseFloat(String(rawValue ?? ''))

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.round(parsed * 1024 * 1024)
}

function resolveActivacionesBucket(env) {
  const adminBucket = normalizeText(env.ADMIN_STORAGE_BUCKET_ACTIVACIONES)
  if (adminBucket) {
    return adminBucket
  }

  const frontendBucket = normalizeText(env.VITE_STORAGE_BUCKET_ACTIVACIONES)
  if (frontendBucket) {
    return frontendBucket
  }

  return 'fotos-activaciones'
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function resolveStorageObjectPathFromFotoUrl(fotoUrl, bucketName) {
  const normalized = normalizeText(fotoUrl)
  if (!normalized) {
    return null
  }

  let path = normalized

  if (/^https?:\/\//i.test(path)) {
    try {
      const parsedUrl = new URL(path)
      path = parsedUrl.pathname ?? ''
    } catch {
      return null
    }
  }

  path = path.split('?')[0]?.split('#')[0] ?? ''
  path = path.replace(/^\/+/, '')

  if (!path) {
    return null
  }

  const publicPrefix = `storage/v1/object/public/${bucketName}/`
  const signPrefix = `storage/v1/object/sign/${bucketName}/`

  if (path.startsWith(publicPrefix)) {
    return decodeURIComponentSafe(path.slice(publicPrefix.length)).replace(/^\/+/, '')
  }

  if (path.startsWith(signPrefix)) {
    return decodeURIComponentSafe(path.slice(signPrefix.length)).replace(/^\/+/, '')
  }

  const genericPublicPrefix = 'storage/v1/object/public/'
  if (path.startsWith(genericPublicPrefix)) {
    const afterPrefix = path.slice(genericPublicPrefix.length)
    if (!afterPrefix.startsWith(`${bucketName}/`)) {
      return null
    }

    return decodeURIComponentSafe(afterPrefix.slice(bucketName.length + 1)).replace(/^\/+/, '')
  }

  const genericSignPrefix = 'storage/v1/object/sign/'
  if (path.startsWith(genericSignPrefix)) {
    const afterPrefix = path.slice(genericSignPrefix.length)
    if (!afterPrefix.startsWith(`${bucketName}/`)) {
      return null
    }

    return decodeURIComponentSafe(afterPrefix.slice(bucketName.length + 1)).replace(/^\/+/, '')
  }

  if (path.startsWith(`${bucketName}/`)) {
    return decodeURIComponentSafe(path.slice(bucketName.length + 1)).replace(/^\/+/, '')
  }

  return decodeURIComponentSafe(path).replace(/^\/+/, '')
}

async function calculateBucketUsageBytes(adminSupabase, bucketName) {
  const directoriesQueue = ['']
  const visitedDirectories = new Set()
  let totalBytes = 0
  let totalObjects = 0

  while (directoriesQueue.length > 0) {
    const currentDirectory = directoriesQueue.shift() ?? ''

    if (visitedDirectories.has(currentDirectory)) {
      continue
    }

    visitedDirectories.add(currentDirectory)

    let offset = 0
    const limit = 1000

    while (true) {
      const { data, error } = await adminSupabase.storage.from(bucketName).list(currentDirectory, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })

      if (error) {
        throw new Error(error.message)
      }

      if (!data?.length) {
        break
      }

      for (const item of data) {
        const name = normalizeText(item?.name)
        if (!name) {
          continue
        }

        const isDirectory = item?.id == null && !item?.metadata
        if (isDirectory) {
          const nextDirectory = currentDirectory ? `${currentDirectory}/${name}` : name
          if (!visitedDirectories.has(nextDirectory)) {
            directoriesQueue.push(nextDirectory)
          }
          continue
        }

        if (name === '.emptyFolderPlaceholder') {
          continue
        }

        totalObjects += 1

        const sizeCandidate =
          item?.metadata?.size ??
          item?.metadata?.contentLength ??
          item?.metadata?.content_length
        const size = Number(sizeCandidate)

        if (Number.isFinite(size) && size > 0) {
          totalBytes += size
        }
      }

      if (data.length < limit) {
        break
      }

      offset += limit
    }
  }

  return {
    totalBytes,
    totalObjects,
  }
}

async function estimateDatabaseUsageFromActivaciones(
  adminSupabase,
  {
    activacionesCount = 0,
    databaseLimitBytes = null,
    sampleLimit = 240,
    overheadFactor = 1.34,
  } = {}
) {
  const normalizedCount = Number(activacionesCount)
  if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
    return {
      sample_size: 0,
      overhead_factor: overheadFactor,
      per_activation_estimated_bytes: 0,
      estimated_database_used_bytes: 0,
      estimated_database_remaining_bytes:
        databaseLimitBytes == null ? null : Math.max(0, databaseLimitBytes),
      estimated_database_usage_percent: databaseLimitBytes == null ? null : 0,
      estimated_activaciones_capacity_total: null,
      estimated_activaciones_capacity_remaining: null,
    }
  }

  const safeSampleLimit = Math.max(40, Math.min(500, Number(sampleLimit) || 240))
  const { data: sampleRows, error: sampleErr } = await adminSupabase
    .from('activaciones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(safeSampleLimit)

  if (sampleErr) {
    throw new Error(sampleErr.message)
  }

  const rows = sampleRows ?? []
  if (!rows.length) {
    return {
      sample_size: 0,
      overhead_factor: overheadFactor,
      per_activation_estimated_bytes: 0,
      estimated_database_used_bytes: 0,
      estimated_database_remaining_bytes:
        databaseLimitBytes == null ? null : Math.max(0, databaseLimitBytes),
      estimated_database_usage_percent: databaseLimitBytes == null ? null : 0,
      estimated_activaciones_capacity_total: null,
      estimated_activaciones_capacity_remaining: null,
    }
  }

  const totalJsonPayloadBytes = rows.reduce((accumulator, row) => {
    try {
      return accumulator + Buffer.byteLength(JSON.stringify(row), 'utf8')
    } catch {
      return accumulator
    }
  }, 0)

  const averageJsonPayloadBytes = totalJsonPayloadBytes / rows.length
  const perActivationEstimatedBytes = Math.max(1, Math.round(averageJsonPayloadBytes * overheadFactor))
  const estimatedDatabaseUsedBytes = Math.round(perActivationEstimatedBytes * normalizedCount)
  const estimatedDatabaseRemainingBytes =
    databaseLimitBytes == null
      ? null
      : Math.max(0, Math.round(databaseLimitBytes - estimatedDatabaseUsedBytes))
  const estimatedDatabaseUsagePercent =
    databaseLimitBytes == null || databaseLimitBytes <= 0
      ? null
      : Number(((estimatedDatabaseUsedBytes / databaseLimitBytes) * 100).toFixed(2))
  const estimatedActivacionesCapacityTotal =
    databaseLimitBytes == null || databaseLimitBytes <= 0
      ? null
      : Math.max(0, Math.floor(databaseLimitBytes / perActivationEstimatedBytes))
  const estimatedActivacionesCapacityRemaining =
    estimatedActivacionesCapacityTotal == null
      ? null
      : Math.max(0, estimatedActivacionesCapacityTotal - normalizedCount)

  return {
    sample_size: rows.length,
    overhead_factor: overheadFactor,
    per_activation_estimated_bytes: perActivationEstimatedBytes,
    estimated_database_used_bytes: estimatedDatabaseUsedBytes,
    estimated_database_remaining_bytes: estimatedDatabaseRemainingBytes,
    estimated_database_usage_percent: estimatedDatabaseUsagePercent,
    estimated_activaciones_capacity_total: estimatedActivacionesCapacityTotal,
    estimated_activaciones_capacity_remaining: estimatedActivacionesCapacityRemaining,
  }
}

function estimateCombinedActivationCapacity({
  activacionesCount = 0,
  activacionesWithPhotoCount = 0,
  storageObjectsCount = 0,
  storageUsedBytes = null,
  storageRemainingBytes = null,
  databaseRemainingBytes = null,
  perActivationDatabaseBytes = null,
} = {}) {
  const normalizedActivacionesCount = Math.max(0, Number(activacionesCount) || 0)
  const normalizedActivacionesWithPhotoCount = Math.max(0, Number(activacionesWithPhotoCount) || 0)
  const normalizedStorageObjectsCount = Math.max(0, Number(storageObjectsCount) || 0)
  const normalizedStorageUsedBytes = Number.isFinite(Number(storageUsedBytes))
    ? Math.max(0, Number(storageUsedBytes))
    : null
  const normalizedStorageRemainingBytes = Number.isFinite(Number(storageRemainingBytes))
    ? Math.max(0, Number(storageRemainingBytes))
    : null
  const normalizedDatabaseRemainingBytes = Number.isFinite(Number(databaseRemainingBytes))
    ? Math.max(0, Number(databaseRemainingBytes))
    : null
  const normalizedPerActivationDatabaseBytes =
    Number.isFinite(Number(perActivationDatabaseBytes)) && Number(perActivationDatabaseBytes) > 0
      ? Math.round(Number(perActivationDatabaseBytes))
      : null

  const photoSampleCount =
    normalizedActivacionesWithPhotoCount > 0
      ? normalizedActivacionesWithPhotoCount
      : normalizedStorageObjectsCount > 0
        ? normalizedStorageObjectsCount
        : 0

  const averagePhotoBytes =
    normalizedStorageUsedBytes != null && photoSampleCount > 0
      ? Math.max(1, Math.round(normalizedStorageUsedBytes / photoSampleCount))
      : null

  const remainingByDatabase =
    normalizedDatabaseRemainingBytes != null && normalizedPerActivationDatabaseBytes != null
      ? Math.max(0, Math.floor(normalizedDatabaseRemainingBytes / normalizedPerActivationDatabaseBytes))
      : null
  const remainingByStorage =
    normalizedStorageRemainingBytes != null && averagePhotoBytes != null
      ? Math.max(0, Math.floor(normalizedStorageRemainingBytes / averagePhotoBytes))
      : null

  const estimatedRemaining =
    remainingByDatabase != null && remainingByStorage != null
      ? Math.min(remainingByDatabase, remainingByStorage)
      : remainingByDatabase ?? remainingByStorage

  const limitingFactor =
    remainingByDatabase != null && remainingByStorage != null
      ? remainingByStorage <= remainingByDatabase
        ? 'storage'
        : 'database'
      : remainingByStorage != null
        ? 'storage'
        : remainingByDatabase != null
          ? 'database'
          : null

  const unavailableReasons = []
  if (averagePhotoBytes == null) {
    unavailableReasons.push('Sin muestra de fotos para calcular promedio.')
  }
  if (normalizedPerActivationDatabaseBytes == null) {
    unavailableReasons.push('Sin muestra suficiente para calcular peso de activacion en base de datos.')
  }

  const estimatedTotal =
    estimatedRemaining == null ? null : Math.max(normalizedActivacionesCount, normalizedActivacionesCount + estimatedRemaining)
  const perActivationTotalEstimatedBytes =
    normalizedPerActivationDatabaseBytes != null && averagePhotoBytes != null
      ? normalizedPerActivationDatabaseBytes + averagePhotoBytes
      : null
  const photoCoveragePercent =
    normalizedActivacionesCount > 0
      ? Number(
          (
            (Math.min(normalizedActivacionesWithPhotoCount, normalizedActivacionesCount) /
              normalizedActivacionesCount) *
            100
          ).toFixed(2)
        )
      : null

  return {
    one_photo_per_activation_assumed: true,
    activaciones_with_photo_count: normalizedActivacionesWithPhotoCount,
    photo_coverage_percent: photoCoveragePercent,
    sample_photos_count: photoSampleCount,
    average_photo_bytes: averagePhotoBytes,
    per_activation_database_estimated_bytes: normalizedPerActivationDatabaseBytes,
    per_activation_total_estimated_bytes: perActivationTotalEstimatedBytes,
    estimated_activaciones_with_photo_total: estimatedTotal,
    estimated_activaciones_with_photo_remaining: estimatedRemaining,
    estimated_remaining_by_database: remainingByDatabase,
    estimated_remaining_by_storage: remainingByStorage,
    limiting_factor: limitingFactor,
    unavailable_reason: unavailableReasons.length ? unavailableReasons.join(' ') : null,
  }
}

export function createAdminApiApp({ env = process.env } = {}) {
  assertRequiredEnv(env)

  const allowedOrigins = buildAllowedOrigins(env.ADMIN_API_CORS_ORIGIN)
  const allowedOriginMatchers = allowedOrigins.map(buildOriginMatcher)
  const activacionesBucket = resolveActivacionesBucket(env)
  const configuredStorageLimitBytes = parseOptionalMegabytes(env.ADMIN_STORAGE_LIMIT_MB)
  const configuredDatabaseLimitBytes = parseOptionalMegabytes(env.ADMIN_DATABASE_LIMIT_MB)
  const storageLimitBytes =
    configuredStorageLimitBytes ?? SUPABASE_FREE_PLAN_REFERENCE.file_storage_limit_bytes
  const databaseLimitBytes =
    configuredDatabaseLimitBytes ?? SUPABASE_FREE_PLAN_REFERENCE.database_limit_bytes
  const storageLimitSource =
    configuredStorageLimitBytes == null ? 'supabase_free_default' : 'env_admin_storage_limit_mb'
  const databaseLimitSource =
    configuredDatabaseLimitBytes == null ? 'supabase_free_default' : 'env_admin_database_limit_mb'
  const adminSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  async function enrichUsersWithOrganization(users) {
    if (!users.length) return users
    const teamIds = [...new Set(users.map((user) => user.equipo_id).filter(Boolean))]
    const userIds = users.map((user) => user.usuario_id).filter(Boolean)
    if (!teamIds.length && !userIds.length) return users

    try {
      const now = new Date().toISOString()
      let [{ data: teams, error: teamsError }, { data: temporaryPlazas, error: temporaryError }] =
        await Promise.all([
          teamIds.length
            ? adminSupabase.from('equipos').select('id,numero,nombre,facturador_id,lider_actual_id,plaza_id').in('id', teamIds)
            : Promise.resolve({ data: [], error: null }),
          userIds.length
            ? adminSupabase.from('activador_plaza_temporal')
              .select('activador_id,plaza_temporal,inicio,fin,motivo,autorizado_por,tipo_zona,ciudad_plaza,activo')
              .in('activador_id', userIds).lte('inicio', now).gte('fin', now).eq('activo', true).is('cancelado_at', null)
            : Promise.resolve({ data: [], error: null }),
        ])
      if (teamsError && teamIds.length) {
        const legacyTeams = await adminSupabase.from('equipos')
          .select('id,numero,nombre,facturador_id,lider_actual_id').in('id', teamIds)
        teams = legacyTeams.data
        teamsError = legacyTeams.error
      }
      if (teamsError || temporaryError) return users

      let { data: ledTeams, error: ledTeamsError } = userIds.length
        ? await adminSupabase.from('equipos')
          .select('id,numero,nombre,facturador_id,lider_actual_id,plaza_id,activo').in('lider_actual_id', userIds)
        : { data: [], error: null }
      if (ledTeamsError && userIds.length) {
        const legacyLedTeams = await adminSupabase.from('equipos')
          .select('id,numero,nombre,facturador_id,lider_actual_id,activo').in('lider_actual_id', userIds)
        ledTeams = legacyLedTeams.data
        ledTeamsError = legacyLedTeams.error
      }
      if (ledTeamsError) return users
      teams = [...new Map([...(teams ?? []), ...(ledTeams ?? [])].map((team) => [team.id, team])).values()]

      const facturadorIds = [...new Set((teams ?? []).map((team) => team.facturador_id).filter(Boolean))]
      const plazaIds = [...new Set((teams ?? []).map((team) => team.plaza_id).filter(Boolean))]
      const leaderIds = [...new Set((teams ?? []).map((team) => team.lider_actual_id).filter(Boolean))]
      const [{ data: billers, error: billersError }, { data: plazas, error: plazasError }, { data: leaders, error: leadersError }] = await Promise.all([
        facturadorIds.length
          ? adminSupabase.from('facturadores').select('id,codigo,nombre').in('id', facturadorIds)
          : Promise.resolve({ data: [], error: null }),
        plazaIds.length
          ? adminSupabase.from('plazas').select('id,nombre').in('id', plazaIds)
          : Promise.resolve({ data: [], error: null }),
        leaderIds.length
          ? adminSupabase.from('activadores').select('usuario_id,nombre').in('usuario_id', leaderIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (billersError || plazasError || leadersError) return users

      const teamsById = new Map((teams ?? []).map((team) => [team.id, team]))
      const billersById = new Map((billers ?? []).map((biller) => [biller.id, biller]))
      const plazasById = new Map((plazas ?? []).map((plaza) => [plaza.id, plaza]))
      const leadersById = new Map((leaders ?? []).map((leader) => [leader.usuario_id, leader]))
      const temporaryByUser = new Map((temporaryPlazas ?? []).map((item) => [item.activador_id, item]))
      return users.map((user) => {
        const team = teamsById.get(user.equipo_id)
        const biller = billersById.get(team?.facturador_id)
        const temporary = temporaryByUser.get(user.usuario_id)
        const teamPlaza = plazasById.get(team?.plaza_id)
        const assignedTeams = (teams ?? []).filter((item) => item.lider_actual_id === user.usuario_id)
        const assignedBiller = billersById.get(assignedTeams[0]?.facturador_id)
        return {
          ...user,
          plaza_base: user.plaza_base ?? user.plaza ?? null,
          plaza_efectiva: temporary?.plaza_temporal ?? user.plaza_base ?? user.plaza ?? null,
          plaza_temporal_activa: Boolean(temporary),
          plaza_temporal_vigente: temporary ?? null,
          plaza_id: team?.plaza_id ?? null,
          plaza_nombre: teamPlaza?.nombre ?? user.plaza_base ?? user.plaza ?? null,
          equipo_numero: team?.numero ?? null,
          equipo_nombre: team?.nombre ?? null,
          equipos_asignados: assignedTeams.map((item) => ({
            id: item.id,
            numero: item.numero,
            nombre: item.nombre,
            plaza: plazasById.get(item.plaza_id)?.nombre ?? null,
            facturador: billersById.get(item.facturador_id)?.nombre ?? null,
            activo: item.activo,
          })),
          lider_id: team?.lider_actual_id ?? user.lider_id ?? null,
          lider_nombre: leadersById.get(team?.lider_actual_id ?? user.lider_id)?.nombre ?? null,
          facturador_id: biller?.id ?? assignedBiller?.id ?? null,
          facturador_codigo: biller?.codigo ?? assignedBiller?.codigo ?? null,
          facturador_nombre: biller?.nombre ?? assignedBiller?.nombre ?? null,
        }
      })
    } catch {
      // Compatibilidad mientras la migracion organizacional aun no fue aplicada.
      return users
    }
  }

  async function resolveTeamIdForLeader(leaderId, plaza) {
    try {
      const normalizedPlaza = normalizeOrganizationName(plaza)
      if (!normalizedPlaza) return null
      const { data: plazaRow, error: plazaError } = await adminSupabase.from('plazas')
        .select('id').eq('nombre_normalizado', normalizedPlaza).maybeSingle()
      if (plazaError) {
        let legacyQuery = adminSupabase.from('equipos').select('id').eq('activo', true)
        legacyQuery = leaderId
          ? legacyQuery.eq('lider_actual_id', leaderId)
          : legacyQuery.eq('nombre', 'Equipo sin asignar')
        const { data: legacyTeam, error: legacyError } = await legacyQuery.order('numero').limit(1).maybeSingle()
        return legacyError ? null : legacyTeam?.id ?? null
      }
      if (!plazaRow) return null
      let query = adminSupabase.from('equipos').select('id').eq('activo', true).eq('plaza_id', plazaRow.id)
      query = leaderId ? query.eq('lider_actual_id', leaderId) : query.eq('nombre', 'Equipo sin asignar')
      const { data, error } = await query.order('numero').limit(1).maybeSingle()
      return error ? null : data?.id ?? null
    } catch {
      return null
    }
  }

  async function resolveOrCreatePlaza(nombre) {
    const normalized = normalizeOrganizationName(nombre)
    if (!normalized) return null
    const { data: existing, error: readError } = await adminSupabase.from('plazas')
      .select('id').eq('nombre_normalizado', normalized).maybeSingle()
    if (!readError && existing) return existing.id
    if (readError) return null
    const { data: created, error: createError } = await adminSupabase.from('plazas')
      .insert({ nombre: normalizeText(nombre), nombre_normalizado: normalized })
      .select('id').single()
    if (!createError) return created.id
    const { data: concurrent } = await adminSupabase.from('plazas')
      .select('id').eq('nombre_normalizado', normalized).maybeSingle()
    return concurrent?.id ?? null
  }

  async function loadOrganizationOptions() {
    const [plazasResult, teamsResult, billersResult] = await Promise.all([
      adminSupabase.from('plazas').select('id,nombre,nombre_normalizado,activa').eq('activa', true).order('nombre'),
      adminSupabase.from('equipos').select('id,numero,nombre,facturador_id,plaza_id,lider_actual_id,activo').order('numero'),
      adminSupabase.from('facturadores').select('id,codigo,nombre,activo').eq('activo', true).order('nombre'),
    ])
    const firstError = plazasResult.error || teamsResult.error || billersResult.error
    if (firstError) {
      if (isMissingOrganizationSchema(firstError)) {
        return { available: false, message: 'El modelo organizacional aun no esta habilitado; se mantiene el esquema anterior.', plazas: [], equipos: [], facturadores: [] }
      }
      throw firstError
    }
    return {
      available: true,
      message: null,
      plazas: plazasResult.data ?? [],
      equipos: teamsResult.data ?? [],
      facturadores: billersResult.data ?? [],
    }
  }

  async function syncLeaderTeams(leaderId, teamIds) {
    const normalizedIds = [...new Set((teamIds ?? []).map(normalizeText).filter(Boolean))]
    const { error } = await adminSupabase.rpc('asignar_equipos_lider', {
      p_lider_id: leaderId,
      p_equipo_ids: normalizedIds,
      p_inicio: new Date().toISOString(),
      p_motivo: 'Actualizacion administrativa de usuario',
    })
    if (error) {
      if (isMissingOrganizationSchema(error)) return { available: false }
      throw error
    }
    return { available: true }
  }

  const app = express()
  app.set('trust proxy', true)

  app.use((req, res, next) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : ''

    if (origin && !isOriginAllowed(origin, req, allowedOriginMatchers)) {
      jsonError(res, 403, `Origin no permitido: ${origin}`)
      return
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
      res.setHeader('Access-Control-Expose-Headers', 'X-Export-Row-Count,X-Export-Images,X-Export-Version')
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    next()
  })

  app.use(express.json())

  async function resolvePortalUser(req) {
    const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
    if (!authorization.startsWith('Bearer ')) return null
    const { data: authData, error: authError } = await adminSupabase.auth.getUser(authorization.slice(7))
    if (authError || !authData.user) return null
    const { data: profile } = await adminSupabase.from('activadores').select('usuario_id,nombre,email,rol,estado,lider_id,puede_activar').eq('usuario_id', authData.user.id).maybeSingle()
    if (!profile || profile.estado !== 'activo' || !['administrador', 'lider'].includes(profile.rol)) return null
    return profile
  }

  async function requirePortalAuth(req, res, next) {
    const profile = await resolvePortalUser(req)
    if (!profile) { jsonError(res, 401, 'Sesion invalida o usuario sin permisos.'); return }
    req.portalUser = profile
    next()
  }

  async function requireAdminBasicAuth(req, res, next) {
    const parsed = parseBasicAuth(req.headers.authorization)
    if (!parsed) {
      const profile = await resolvePortalUser(req)
      if (profile?.rol === 'administrador') { req.portalUser = profile; next(); return }
      if (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')) {
        jsonError(res, 403, 'Se requiere un administrador activo.')
        return
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="admin-api"')
      jsonError(res, 401, 'Credenciales requeridas.')
      return
    }

    const isValidUser = timingSafeEqualText(parsed.username, env.ADMIN_BASIC_USER)
    const isValidPass = timingSafeEqualText(parsed.password, env.ADMIN_BASIC_PASS)

    if (!isValidUser || !isValidPass) {
      jsonError(res, 401, 'Credenciales invalidas.')
      return
    }

    req.adminUser = parsed.username
    next()
  }

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/portal', requirePortalAuth)
  app.get('/portal/me', (req, res) => res.json({ profile: req.portalUser }))
  app.get('/portal/users', asyncRoute(async (req, res) => {
    let query = adminSupabase.from('activadores').select('*').order('nombre')
    if (req.portalUser.rol === 'lider') query = query.eq('lider_id', req.portalUser.usuario_id)
    const { data, error } = await query
    if (error) { jsonError(res, 500, 'No se pudo obtener usuarios.', error.message); return }
    const users = data ?? []
    const leaderIds = [...new Set(users.map((item) => item.lider_id).filter(Boolean))]
    let leaderNames = new Map()
    if (leaderIds.length) {
      const { data: leaders, error: leadersError } = await adminSupabase
        .from('activadores')
        .select('usuario_id,nombre')
        .in('usuario_id', leaderIds)
      if (leadersError) { jsonError(res, 500, 'No se pudo resolver los lideres.', leadersError.message); return }
      leaderNames = new Map((leaders ?? []).map((leader) => [leader.usuario_id, leader.nombre]))
    }
    const resolvedUsers = users.map((item) => ({ ...item, lider_nombre: leaderNames.get(item.lider_id) ?? null }))
    res.json({ users: await enrichUsersWithOrganization(resolvedUsers) })
  }))
  app.get('/portal/activations', asyncRoute(async (req, res) => {
    const from = Math.max(0, Number.parseInt(String(req.query.from ?? '0'), 10) || 0)
    const to = Math.min(from + 999, Math.max(from, Number.parseInt(String(req.query.to ?? from + 999), 10) || from + 999))
    let query = adminSupabase.from('activaciones').select('*').order('created_at', { ascending: false })
    if (req.portalUser.rol === 'lider') {
      const { data: team, error: teamError } = await adminSupabase.from('activadores').select('usuario_id').eq('lider_id', req.portalUser.usuario_id)
      if (teamError) { jsonError(res, 500, 'No se pudo resolver el equipo.', teamError.message); return }
      const ids = (team ?? []).map((item) => item.usuario_id).filter(Boolean)
      if (!ids.length) { res.json({ activations: [] }); return }
      query = query.in('usuario_id', ids)
    }
    const { data, error } = await query.range(from, to)
    if (error) { jsonError(res, 500, 'No se pudo obtener activaciones.', error.message); return }
    res.json({ activations: data ?? [] })
  }))
  app.get('/portal/activations/export-excel', asyncRoute(async (req, res) => {
    let allowedUserIds = null
    if (req.portalUser.rol === 'lider') {
      const { data: team, error: teamError } = await adminSupabase
        .from('activadores')
        .select('usuario_id')
        .eq('lider_id', req.portalUser.usuario_id)
      if (teamError) {
        jsonError(res, 500, 'No se pudo resolver el equipo.', teamError.message)
        return
      }
      allowedUserIds = (team ?? []).map((item) => item.usuario_id).filter(Boolean)
    }

    const filters = {
      plaza: normalizeText(req.query.plaza),
      distrito: normalizeText(req.query.distrito),
      impulsador: normalizeText(req.query.impulsador),
      fechaDesde: normalizeText(req.query.fechaDesde),
      fechaHasta: normalizeText(req.query.fechaHasta),
    }
    const result = await generateActivacionesExcel({
      adminSupabase,
      bucket: activacionesBucket,
      filters,
      allowedUserIds,
    })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="activaciones.xlsx"')
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('CDN-Cache-Control', 'no-store')
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store')
    res.setHeader('X-Export-Row-Count', String(result.rowCount))
    res.setHeader('X-Export-Images', 'links')
    res.setHeader('X-Export-Version', 'links-v2')
    res.send(Buffer.from(result.buffer))
  }))

  app.use('/admin', requireAdminBasicAuth)

  app.get('/admin/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  app.get(
    '/admin/users',
    asyncRoute(async (_req, res) => {
      const { data, error } = await adminSupabase
        .from('activadores')
        .select('*')
        .order('nombre', { ascending: true })

      if (error) {
        jsonError(res, 500, error.message)
        return
      }

      res.json({ users: await enrichUsersWithOrganization(data ?? []) })
    })
  )

  app.post(
    '/admin/users',
    asyncRoute(async (req, res) => {
      const rawEmail = req.body?.email
      const rawPassword = req.body?.password
      const requestedTeamId = normalizeNullableText(req.body?.equipo_id)
      const requestedBillerId = normalizeNullableText(req.body?.facturador_id)
      const requestedTeamIds = Array.isArray(req.body?.equipo_ids) ? req.body.equipo_ids : []
      const rawNombre = req.body?.nombre
      const rawPlaza = req.body?.plaza
      const rol = normalizeText(req.body?.rol) || 'activador'
      const estado = normalizeText(req.body?.estado) || 'activo'
      const puedeActivar = rol === 'lider' && req.body?.puede_activar === true
      let liderId = rol === 'activador' ? normalizeNullableText(req.body?.lider_id) : null
      const motivoInhabilitacion = normalizeNullableText(req.body?.motivo_inhabilitacion)

      const email = normalizeEmail(rawEmail)
      const password = typeof rawPassword === 'string' ? rawPassword : ''
      const nombre = normalizeText(rawNombre)
      let plaza = normalizeNullableText(rawPlaza)
      let teamId = null
      let teamPlazaId = null

      if (rol === 'activador') {
        const options = await loadOrganizationOptions()
        if (options.available) {
          const selectedTeam = options.equipos.find((team) => team.id === requestedTeamId && team.activo)
          const selectedPlaza = options.plazas.find((item) => item.id === selectedTeam?.plaza_id)
          if (!selectedTeam || !selectedPlaza) {
            jsonError(res, 400, 'La plaza base y un equipo activo son obligatorios para el activador.')
            return
          }
          teamId = selectedTeam.id
          teamPlazaId = selectedTeam.plaza_id
          liderId = selectedTeam.lider_actual_id ?? null
          plaza = selectedPlaza.nombre
        }
      }
      if (rol === 'activador' && !teamId) teamId = await resolveTeamIdForLeader(liderId, plaza)

      let leaderOrganizationAvailable = false
      if (rol === 'lider') {
        const options = await loadOrganizationOptions()
        leaderOrganizationAvailable = options.available
        if (options.available) {
          if (!requestedBillerId || !requestedTeamIds.length) {
            jsonError(res, 400, 'El facturador y al menos un equipo son obligatorios para un lider.')
            return
          }
          const selectedTeams = options.equipos.filter((team) => requestedTeamIds.includes(team.id))
          if (selectedTeams.length !== new Set(requestedTeamIds).size) {
            jsonError(res, 400, 'Uno o mas equipos seleccionados no existen o estan inactivos.')
            return
          }
          if (requestedBillerId && selectedTeams.some((team) => team.facturador_id !== requestedBillerId)) {
            jsonError(res, 400, 'Todos los equipos deben pertenecer al facturador seleccionado.')
            return
          }
          if (new Set(selectedTeams.map((team) => team.plaza_id)).size !== selectedTeams.length) {
            jsonError(res, 409, 'Un lider no puede tener dos equipos activos en la misma plaza.')
            return
          }
        }
      }

      if (!email || !password || !nombre) {
        jsonError(res, 400, 'email, password y nombre son obligatorios.')
        return
      }

      if (!isValidEmail(email)) {
        jsonError(res, 400, 'email invalido.')
        return
      }

      if (!isStrongPassword(password)) {
        jsonError(res, 400, 'La contrasena debe tener al menos 10 caracteres, mayuscula, minuscula, numero y simbolo.')
        return
      }

      if (!ALLOWED_USER_ROLES.has(rol) || !ALLOWED_USER_STATES.has(estado)) {
        jsonError(res, 400, 'rol o estado invalido.')
        return
      }

      if (estado === 'inhabilitado' && !motivoInhabilitacion) {
        jsonError(res, 400, 'El motivo de inhabilitacion es obligatorio.')
        return
      }

      if (liderId) {
        const { data: leader, error: leaderErr } = await adminSupabase.from('activadores')
          .select('usuario_id').eq('usuario_id', liderId).eq('rol', 'lider').eq('estado', 'activo').maybeSingle()
        if (leaderErr || !leader) {
          jsonError(res, 400, 'lider_id debe corresponder a un lider activo.', leaderErr?.message)
          return
        }
      }

      const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, plaza },
      })

      if (createErr || !created?.user) {
        jsonError(res, 400, createErr?.message ?? 'No se pudo crear el usuario en Auth.')
        return
      }

      const insertedUser = {
        usuario_id: created.user.id,
        email,
        nombre,
        plaza,
        rol,
        estado,
        puede_activar: puedeActivar,
        lider_id: liderId,
        inhabilitado_at: estado === 'inhabilitado' ? new Date().toISOString() : null,
        motivo_inhabilitacion: estado === 'inhabilitado' ? motivoInhabilitacion : null,
      }
      if (teamId) {
        insertedUser.equipo_id = teamId
        insertedUser.plaza_base = plaza
        if (teamPlazaId) {
          insertedUser.plaza_id = teamPlazaId
          insertedUser.organizacion_pendiente = false
        }
      }

      const { error: insertErr } = await adminSupabase.from('activadores').insert(insertedUser)

      if (insertErr) {
        await adminSupabase.auth.admin.deleteUser(created.user.id)
        jsonError(
          res,
          500,
          'No se pudo guardar el usuario en activadores. Se revirtio la creacion en Auth automaticamente.',
          insertErr.message
        )
        return
      }

      if (rol === 'lider' && leaderOrganizationAvailable) {
        try {
          await syncLeaderTeams(created.user.id, requestedTeamIds)
        } catch (error) {
          await adminSupabase.from('activadores').delete().eq('usuario_id', created.user.id)
          await adminSupabase.auth.admin.deleteUser(created.user.id)
          jsonError(res, 409, 'No se pudieron asignar los equipos al lider.', error?.message)
          return
        }
      }

      res.status(201).json({ user: insertedUser })
    })
  )

  app.post(
    '/admin/users/:userId/reset-password',
    asyncRoute(async (req, res) => {
      const userId = normalizeText(req.params?.userId)
      const password = typeof req.body?.password === 'string' ? req.body.password : ''

      if (!userId) {
        jsonError(res, 400, 'Parametro userId requerido.')
        return
      }
      if (!isStrongPassword(password)) {
        jsonError(res, 400, 'La contrasena debe tener al menos 10 caracteres, mayuscula, minuscula, numero y simbolo.')
        return
      }

      const { data: existingAuthUser, error: getUserError } = await adminSupabase.auth.admin.getUserById(userId)
      if (getUserError || !existingAuthUser?.user) {
        jsonError(res, 404, 'No se encontro el usuario solicitado.')
        return
      }

      const { error: updatePasswordError } = await adminSupabase.auth.admin.updateUserById(userId, { password })
      if (updatePasswordError) {
        jsonError(res, 500, 'No se pudo restablecer la contrasena.')
        return
      }

      res.json({ ok: true })
    })
  )

  app.get(
    '/admin/organization-options',
    asyncRoute(async (_req, res) => {
      try {
        res.json(await loadOrganizationOptions())
      } catch (error) {
        jsonError(res, 500, 'No se pudo cargar la estructura organizacional.', error?.message)
      }
    })
  )

  app.get('/admin/teams', asyncRoute(async (_req, res) => {
    const options = await loadOrganizationOptions()
    if (!options.available) { res.json(options); return }
    const { data: members, error } = await adminSupabase.from('activadores')
      .select('usuario_id,equipo_id').eq('rol', 'activador')
    if (error && !isMissingOrganizationSchema(error)) {
      jsonError(res, 500, 'No se pudo contar los integrantes.', error.message)
      return
    }
    const memberCount = new Map()
    for (const member of members ?? []) memberCount.set(member.equipo_id, (memberCount.get(member.equipo_id) ?? 0) + 1)
    res.json({ ...options, equipos: options.equipos.map((team) => ({ ...team, integrantes: memberCount.get(team.id) ?? 0 })) })
  }))

  app.get('/admin/teams/:teamId', asyncRoute(async (req, res) => {
    const teamId = normalizeText(req.params.teamId)
    const [{ data: members, error: membersError }, { data: history, error: historyError }] = await Promise.all([
      adminSupabase.from('activadores').select('usuario_id,nombre,email,estado,plaza,plaza_base').eq('equipo_id', teamId).eq('rol', 'activador').order('nombre'),
      adminSupabase.from('equipo_lider_historial').select('id,lider_id,inicio,fin,motivo').eq('equipo_id', teamId).order('inicio', { ascending: false }),
    ])
    const schemaError = membersError || historyError
    if (schemaError) {
      if (isMissingOrganizationSchema(schemaError)) {
        res.json({ available: false, message: 'El detalle de equipos estara disponible despues de habilitar el modelo organizacional.', integrantes: [], historial: [] })
        return
      }
      jsonError(res, 500, 'No se pudo cargar el detalle del equipo.', schemaError.message)
      return
    }
    res.json({ available: true, integrantes: members ?? [], historial: history ?? [] })
  }))

  app.post('/admin/teams', asyncRoute(async (req, res) => {
    const nombre = normalizeText(req.body?.nombre) || INTERNAL_TEAM_NAME
    const plazaId = normalizeNullableText(req.body?.plaza_id)
    const facturadorId = normalizeNullableText(req.body?.facturador_id)
    const liderId = normalizeNullableText(req.body?.lider_id)
    if (!plazaId || !facturadorId) {
      jsonError(res, 400, 'Plaza y facturador son obligatorios.')
      return
    }
    if (liderId) {
      const { data: conflict, error: conflictError } = await adminSupabase.from('equipos')
        .select('id').eq('lider_actual_id', liderId).eq('plaza_id', plazaId).eq('activo', true).limit(1)
      if (conflictError && isMissingOrganizationSchema(conflictError)) {
        jsonError(res, 409, 'La gestion de equipos estara disponible cuando se habilite el modelo organizacional.')
        return
      }
      if (conflictError) { jsonError(res, 500, 'No se pudo validar el equipo.', conflictError.message); return }
      if (conflict?.length) { jsonError(res, 409, 'El lider ya dirige un equipo activo en esta plaza.'); return }
    }
    const { data: team, error } = await adminSupabase.from('equipos').insert({
      nombre, plaza_id: plazaId, facturador_id: facturadorId, lider_actual_id: null, activo: true,
    }).select('*').single()
    if (error) {
      if (isMissingOrganizationSchema(error)) { jsonError(res, 409, 'La gestion de equipos estara disponible cuando se habilite el modelo organizacional.'); return }
      jsonError(res, 500, 'No se pudo crear el equipo.', error.message); return
    }
    if (liderId) {
      const { error: leaderError } = await adminSupabase.rpc('asignar_lider_equipo', { p_equipo_id: team.id, p_lider_id: liderId, p_motivo: 'Creacion administrativa de equipo' })
      if (leaderError) {
        await adminSupabase.from('equipos').delete().eq('id', team.id)
        jsonError(res, 409, 'No se pudo asignar el lider.', leaderError.message)
        return
      }
    }
    res.status(201).json({ team: { ...team, lider_actual_id: liderId } })
  }))

  app.patch('/admin/teams/:teamId', asyncRoute(async (req, res) => {
    const teamId = normalizeText(req.params.teamId)
    const nombre = normalizeText(req.body?.nombre)
    const facturadorId = normalizeNullableText(req.body?.facturador_id)
    const liderId = normalizeNullableText(req.body?.lider_id)
    const activo = req.body?.activo
    if (!teamId || !nombre || !facturadorId || typeof activo !== 'boolean') {
      jsonError(res, 400, 'Facturador y estado son obligatorios.')
      return
    }
    const { error } = await adminSupabase.rpc('actualizar_equipo_organizacion', {
      p_equipo_id: teamId, p_nombre: nombre, p_facturador_id: facturadorId,
      p_lider_id: liderId, p_activo: activo, p_inicio: new Date().toISOString(),
      p_motivo: 'Edicion administrativa de equipo',
    })
    if (error) {
      if (isMissingOrganizationSchema(error)) { jsonError(res, 409, 'La gestion de equipos estara disponible cuando se habilite el modelo organizacional.'); return }
      jsonError(res, error.code === '23P01' || error.code === '23505' ? 409 : 500, 'No se pudo actualizar el equipo.', error.message)
      return
    }
    res.json({ ok: true })
  }))

  app.delete('/admin/plazas/:plazaId', asyncRoute(async (req, res) => {
    const plazaId = normalizeText(req.params.plazaId)
    if (!plazaId) { jsonError(res, 400, 'Parametro plazaId requerido.'); return }

    const { data: plaza, error: plazaErr } = await adminSupabase.from('plazas').select('*').eq('id', plazaId).maybeSingle()
    if (plazaErr) { jsonError(res, 500, 'No se pudo leer la plaza.', plazaErr.message); return }
    if (!plaza) { jsonError(res, 404, 'Plaza no encontrada.'); return }

    try {
      const relationChecks = await Promise.all([
        adminSupabase.from('equipos').select('id', { count: 'exact', head: true }).eq('plaza_id', plazaId),
        adminSupabase.from('activadores').select('usuario_id', { count: 'exact', head: true }).eq('plaza_id', plazaId),
        adminSupabase.from('activaciones').select('id', { count: 'exact', head: true }).eq('plaza_id_registro', plazaId),
        adminSupabase.from('activaciones').select('id', { count: 'exact', head: true }).eq('plaza_base_id_registro', plazaId),
        adminSupabase.from('activaciones').select('id', { count: 'exact', head: true }).eq('plaza_efectiva_id_registro', plazaId),
        adminSupabase.from('activador_plaza_temporal').select('id', { count: 'exact', head: true }).eq('plaza_temporal_id', plazaId),
      ])

      const failedCheck = relationChecks.find(({ error }) => error)
      if (failedCheck) {
        const err = failedCheck.error
        jsonError(res, 500, 'No se pudo verificar relaciones de la plaza.', err?.message)
        return
      }

      const hasRelations = relationChecks.some(({ count }) => (count ?? 0) > 0)

      if (hasRelations) {
        res.status(409).json({ ok: false, deleted: false, message: 'No se puede eliminar la plaza porque tiene información relacionada. Puedes desactivarla.' })
        return
      }

      const { error: delErr } = await adminSupabase.from('plazas').delete().eq('id', plazaId)
      if (delErr) { jsonError(res, 500, 'No se pudo eliminar la plaza.', delErr.message); return }
      res.json({ ok: true, deleted: true, message: 'Plaza eliminada correctamente.' })
    } catch (err) {
      jsonError(res, 500, 'Error verificando relaciones de plaza.', err?.message ?? String(err))
    }
  }))

  app.delete('/admin/teams/:teamId', asyncRoute(async (req, res) => {
    const teamId = normalizeText(req.params.teamId)
    if (!teamId) { jsonError(res, 400, 'Parametro teamId requerido.'); return }

    const { data: team, error: teamError } = await adminSupabase.from('equipos').select('*').eq('id', teamId).maybeSingle()
    if (teamError) { jsonError(res, 500, 'No se pudo leer el equipo.', teamError.message); return }
    if (!team) { jsonError(res, 404, 'Equipo no encontrado.'); return }

    if (team.activo === false) {
      res.json({ ok: true, deleted: false, message: 'El equipo ya se encontraba inactivo.' })
      return
    }

    // Siempre realizar baja lógica: inactivar el equipo para preservar historial y relaciones
    const { error: updateErr } = await adminSupabase.from('equipos').update({ activo: false }).eq('id', teamId)
    if (updateErr) { jsonError(res, 500, 'No se pudo inactivar el equipo.', updateErr.message); return }
    res.json({ ok: true, deleted: false, message: 'Equipo inactivado.' })
  }))

  // Plazas: listar, crear, editar (activar/desactivar)
  app.get('/admin/plazas', asyncRoute(async (_req, res) => {
    const { data, error } = await adminSupabase.from('plazas').select('id,nombre,nombre_normalizado,activa').order('nombre')
    if (error) {
      if (isMissingOrganizationSchema(error)) { jsonError(res, 409, 'El modelo organizacional no esta habilitado.', error.message); return }
      jsonError(res, 500, 'No se pudo obtener las plazas.', error.message); return
    }
    res.json({ plazas: data ?? [] })
  }))

  app.post('/admin/plazas', asyncRoute(async (req, res) => {
    const nombre = normalizeText(req.body?.nombre)
    if (!nombre) { jsonError(res, 400, 'Nombre de plaza requerido.'); return }
    const nombre_normalizado = normalizeOrganizationName(nombre)
    try {
      const { data: existing, error: existingErr } = await adminSupabase.from('plazas').select('id').eq('nombre_normalizado', nombre_normalizado).maybeSingle()
      if (existingErr) { throw existingErr }
      if (existing) { jsonError(res, 409, 'Ya existe una plaza con ese nombre.'); return }
      const { data: created, error: createErr } = await adminSupabase.from('plazas').insert({ nombre, nombre_normalizado }).select('*').single()
      if (createErr) { throw createErr }
      res.status(201).json({ plaza: created })
    } catch (err) {
      if (isMissingOrganizationSchema(err)) { jsonError(res, 409, 'El modelo organizacional no esta habilitado.', err.message); return }
      jsonError(res, 500, 'No se pudo crear la plaza.', err.message)
    }
  }))

  app.patch('/admin/plazas/:plazaId', asyncRoute(async (req, res) => {
    const plazaId = normalizeText(req.params.plazaId)
    if (!plazaId) { jsonError(res, 400, 'Parametro plazaId requerido.'); return }
    const nombre = normalizeNullableText(req.body?.nombre)
    const activa = req.body?.activa
    const updates = {}
    if (nombre != null) updates.nombre = nombre
    if (typeof activa === 'boolean') updates.activa = activa
    if (Object.keys(updates).length === 0) { jsonError(res, 400, 'Nada que actualizar.'); return }
    if (updates.nombre) updates.nombre_normalizado = normalizeOrganizationName(updates.nombre)
    const { error } = await adminSupabase.from('plazas').update(updates).eq('id', plazaId)
    if (error) { jsonError(res, 500, 'No se pudo actualizar la plaza.', error.message); return }
    res.json({ ok: true })
    return

    // Verificar relaciones reales antes de eliminar físicamente
    try {
      const [
        { data: equipos, error: equiposErr },
        { data: activadoresRows, error: activadoresErr },
        { data: activacionesRows, error: activacionesErr },
        { data: temporales, error: temporalesErr }
      ] = await Promise.all([
        adminSupabase.from('equipos').select('id').eq('plaza_id', plazaId).limit(1),
        adminSupabase.from('activadores').select('usuario_id').or(`plaza_id.eq.${plazaId},plaza_base.eq.${plazaId}`).limit(1),
        adminSupabase.from('activaciones').select('id').or(`plaza_id_registro.eq.${plazaId},plaza_base_id_registro.eq.${plazaId},plaza_efectiva_id_registro.eq.${plazaId}`).limit(1),
        adminSupabase.from('activador_plaza_temporal').select('id').eq('plaza_temporal_id', plazaId).limit(1),
      ])

      if (equiposErr || activadoresErr || activacionesErr || temporalesErr) {
        const err = equiposErr || activadoresErr || activacionesErr || temporalesErr
        if (isMissingOrganizationSchema(err)) {
          // No podemos verificar relaciones correctamente: bloquear eliminación y pedir desactivación
          res.status(409).json({ ok: false, deleted: false, message: 'No se puede eliminar la plaza porque tiene información relacionada. Puedes desactivarla.' })
          return
        }
        jsonError(res, 500, 'No se pudo verificar relaciones de la plaza.', err.message); return
      }

      const hasRelations = (equipos ?? []).length > 0 || (activadoresRows ?? []).length > 0 || (activacionesRows ?? []).length > 0 || (temporales ?? []).length > 0

      if (hasRelations) {
        // Si existe cualquier relación o histórico, bloquear eliminación física
        res.status(409).json({ ok: false, deleted: false, message: 'No se puede eliminar la plaza porque tiene información relacionada. Puedes desactivarla.' })
        return
      }

      // Sin relaciones: eliminar físicamente
      const { error: delErr } = await adminSupabase.from('plazas').delete().eq('id', plazaId)
      if (delErr) { jsonError(res, 500, 'No se pudo eliminar la plaza.', delErr.message); return }
      res.json({ ok: true, deleted: true, message: 'Plaza eliminada correctamente.' })

    } catch (err) {
      jsonError(res, 500, 'Error verificando relaciones de plaza.', err?.message ?? String(err))
    }
    if (!plazaId) { jsonError(res, 400, 'Parametro plazaId requerido.'); return }

    const { data: plaza, error: plazaErr } = await adminSupabase.from('plazas').select('*').eq('id', plazaId).maybeSingle()
    if (plazaErr) { jsonError(res, 500, 'No se pudo leer la plaza.', plazaErr.message); return }
    if (!plaza) { jsonError(res, 404, 'Plaza no encontrada.'); return }
    if (plaza.activa === false) {
      res.json({ ok: true, deleted: false, message: 'La plaza ya se encontraba inactiva.' })
      return
    }

    // Siempre realizar baja lógica: inactivar la plaza para preservar historial y relaciones
    const { error: updateErr } = await adminSupabase.from('plazas').update({ activa: false }).eq('id', plazaId)
    if (updateErr) { jsonError(res, 500, 'No se pudo inactivar la plaza.', updateErr.message); return }
    res.json({ ok: true, deleted: false, message: 'Plaza inactivada correctamente.' })
  }))

  app.post(
    '/admin/users/:userId/temporary-plaza',
    asyncRoute(async (req, res) => {
      const userId = normalizeText(req.params?.userId)
      const plazaTemporal = normalizeText(req.body?.plaza_temporal)
      const inicio = new Date(req.body?.inicio)
      const fin = new Date(req.body?.fin)
      const motivo = normalizeText(req.body?.motivo)
      const tipoZona = normalizeText(req.body?.tipo_zona) || 'punto_temporal'
      const ciudadPlaza = normalizeNullableText(req.body?.ciudad_plaza)
      const activo = req.body?.activo !== false
      const authorizedBy = req.portalUser?.usuario_id
      if (!userId || !plazaTemporal || !motivo || Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin <= inicio) {
        jsonError(res, 400, 'activador, plaza temporal, inicio, fin y motivo validos son obligatorios.')
        return
      }
      if (!ALLOWED_TEMPORARY_ZONE_TYPES.has(tipoZona)) {
        jsonError(res, 400, 'tipo_zona invalido.')
        return
      }

      if (!authorizedBy) {
        jsonError(res, 400, 'La asignacion temporal requiere una sesion administrativa identificable.')
        return
      }
      const { data: user, error: userError } = await adminSupabase.from('activadores')
        .select('usuario_id,rol,estado').eq('usuario_id', userId).maybeSingle()
      if (userError || !user || user.rol !== 'activador' || user.estado !== 'activo') {
        jsonError(res, 400, 'La plaza temporal solo puede asignarse a un activador activo.', userError?.message)
        return
      }
      const temporaryPlazaId = await resolveOrCreatePlaza(plazaTemporal)
      const temporaryPayload = {
        activador_id: userId,
        plaza_temporal: plazaTemporal,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
        motivo,
        tipo_zona: tipoZona,
        ciudad_plaza: ciudadPlaza,
        activo,
        autorizado_por: authorizedBy,
      }
      if (temporaryPlazaId) temporaryPayload.plaza_temporal_id = temporaryPlazaId
      const { data, error } = await adminSupabase.from('activador_plaza_temporal')
        .insert(temporaryPayload).select('*').single()
      if (error) {
        if (isMissingOrganizationSchema(error)) {
          jsonError(res, 409, 'La plaza temporal estara disponible cuando se habilite el modelo organizacional.')
          return
        }
        jsonError(res, error.code === '23P01' ? 409 : 500,
          error.code === '23P01' ? 'El periodo se solapa con otra plaza temporal.' : 'No se pudo asignar la plaza temporal.', error.message)
        return
      }
      res.status(201).json({ assignment: data })
    })
  )

  app.delete(
    '/admin/users/:userId/temporary-plaza',
    asyncRoute(async (req, res) => {
      const now = new Date().toISOString()
      const authorizedBy = req.portalUser?.usuario_id
      if (!authorizedBy) {
        jsonError(res, 400, 'La cancelacion requiere una sesion administrativa identificable.')
        return
      }
      const { error } = await adminSupabase.from('activador_plaza_temporal').update({
        cancelado_at: now,
        cancelado_por: authorizedBy,
      }).eq('activador_id', req.params.userId).is('cancelado_at', null).lte('inicio', now).gte('fin', now)
      if (error) {
        if (isMissingOrganizationSchema(error)) {
          jsonError(res, 409, 'No hay una asignacion temporal administrable en el esquema actual.')
          return
        }
        jsonError(res, 500, 'No se pudo cancelar la plaza temporal.', error.message)
        return
      }
      res.json({ ok: true })
    })
  )

  app.patch(
    '/admin/users/:userId',
    asyncRoute(async (req, res) => {
      const { userId } = req.params

      const rawNombre = req.body?.nombre
      const rawPlaza = req.body?.plaza
      const rawEmail = req.body?.email
      const rawEmailConfirm = req.body?.emailConfirm
      const rawPassword = req.body?.password
      const requestedTeamId = normalizeNullableText(req.body?.equipo_id)
      const requestedBillerId = normalizeNullableText(req.body?.facturador_id)
      const requestedTeamIds = Array.isArray(req.body?.equipo_ids) ? req.body.equipo_ids : []
      const requestedRol = normalizeText(req.body?.rol)
      const requestedEstado = normalizeText(req.body?.estado)

      const nombre = normalizeText(rawNombre)
      let plaza = normalizeNullableText(rawPlaza)
      const shouldUpdateEmail = typeof rawEmail === 'string'
      const email = shouldUpdateEmail ? normalizeEmail(rawEmail) : null
      const emailConfirm = rawEmailConfirm === true
      const password = typeof rawPassword === 'string' ? rawPassword : ''

      if (!nombre) {
        jsonError(res, 400, 'nombre es obligatorio.')
        return
      }

      if (shouldUpdateEmail && !email) {
        jsonError(res, 400, 'email es obligatorio cuando se desea actualizar.')
        return
      }

      if (shouldUpdateEmail && !isValidEmail(email)) {
        jsonError(res, 400, 'email invalido.')
        return
      }

      if (password && !isStrongPassword(password)) {
        jsonError(res, 400, 'La contrasena debe tener al menos 10 caracteres, mayuscula, minuscula, numero y simbolo.')
        return
      }

      if ((requestedRol && !ALLOWED_USER_ROLES.has(requestedRol)) ||
        (requestedEstado && !ALLOWED_USER_STATES.has(requestedEstado))) {
        jsonError(res, 400, 'rol o estado invalido.')
        return
      }

      const { data: previousRow, error: previousRowErr } = await adminSupabase
        .from('activadores')
        .select('*')
        .eq('usuario_id', userId)
        .maybeSingle()

      if (previousRowErr) {
        jsonError(res, 500, previousRowErr.message)
        return
      }

      if (!previousRow) {
        jsonError(res, 404, 'No se encontro el usuario en la tabla activadores.')
        return
      }

      const previousEmail = normalizeEmail(previousRow.email) || null
      const emailChanged = shouldUpdateEmail && email !== previousEmail

      const rol = requestedRol || previousRow.rol || 'activador'
      const estado = requestedEstado || previousRow.estado || 'activo'
      const puedeActivar = rol === 'lider' && (
        req.body?.puede_activar === undefined
          ? previousRow.puede_activar === true
          : req.body.puede_activar === true
      )
      let liderId = rol === 'activador'
        ? (req.body?.lider_id === undefined ? previousRow.lider_id : normalizeNullableText(req.body.lider_id))
        : null
      const motivoInhabilitacion = req.body?.motivo_inhabilitacion === undefined
        ? normalizeNullableText(previousRow.motivo_inhabilitacion)
        : normalizeNullableText(req.body.motivo_inhabilitacion)

      if (estado === 'inhabilitado' && !motivoInhabilitacion) {
        jsonError(res, 400, 'El motivo de inhabilitacion es obligatorio.')
        return
      }

      let teamId = null
      let teamPlazaId = null
      if (rol === 'activador') {
        const options = await loadOrganizationOptions()
        if (options.available) {
          const selectedTeam = options.equipos.find((team) => team.id === requestedTeamId && team.activo)
          const selectedPlaza = options.plazas.find((item) => item.id === selectedTeam?.plaza_id)
          if (!selectedTeam || !selectedPlaza) {
            jsonError(res, 400, 'La plaza base y un equipo activo son obligatorios para el activador.')
            return
          }
          teamId = selectedTeam.id
          teamPlazaId = selectedTeam.plaza_id
          liderId = selectedTeam.lider_actual_id ?? null
          plaza = selectedPlaza.nombre
        }
      }

      if (liderId && !teamId) {
        const { data: leader, error: leaderErr } = await adminSupabase
          .from('activadores')
          .select('usuario_id')
          .eq('usuario_id', liderId)
          .eq('rol', 'lider')
          .eq('estado', 'activo')
          .maybeSingle()
        if (leaderErr || !leader) {
          jsonError(res, 400, 'lider_id debe corresponder a un lider activo.', leaderErr?.message)
          return
        }
      }

      let leaderOrganizationAvailable = false
      const shouldSyncLeaderTeams = rol === 'lider' || previousRow.rol === 'lider'
      if (shouldSyncLeaderTeams) {
        const options = await loadOrganizationOptions()
        leaderOrganizationAvailable = options.available
        if (options.available) {
          const effectiveTeamIds = rol === 'lider' ? requestedTeamIds : []
          if (rol === 'lider' && (!requestedBillerId || !effectiveTeamIds.length)) {
            jsonError(res, 400, 'El facturador y al menos un equipo son obligatorios para un lider.')
            return
          }
          const selectedTeams = options.equipos.filter((team) => effectiveTeamIds.includes(team.id))
          if (selectedTeams.length !== new Set(effectiveTeamIds).size ||
            (requestedBillerId && selectedTeams.some((team) => team.facturador_id !== requestedBillerId)) ||
            new Set(selectedTeams.map((team) => team.plaza_id)).size !== selectedTeams.length) {
            jsonError(res, 409, 'La asignacion de equipos del lider no es valida.')
            return
          }
        }
      }

      const tableUpdatePayload = {
        nombre,
        plaza,
        rol,
        estado,
        puede_activar: puedeActivar,
        lider_id: liderId,
        inhabilitado_at: estado === 'inhabilitado'
          ? previousRow.inhabilitado_at || new Date().toISOString()
          : null,
        motivo_inhabilitacion: estado === 'inhabilitado' ? motivoInhabilitacion : null,
      }
      if (rol === 'activador' && !teamId) teamId = await resolveTeamIdForLeader(liderId, plaza)
      if (teamId) {
        tableUpdatePayload.equipo_id = teamId
        tableUpdatePayload.plaza_base = plaza
        if (teamPlazaId) {
          tableUpdatePayload.plaza_id = teamPlazaId
          tableUpdatePayload.organizacion_pendiente = false
        }
      }
      if (rol !== 'activador' && Object.prototype.hasOwnProperty.call(previousRow, 'equipo_id')) {
        tableUpdatePayload.equipo_id = null
        if (Object.prototype.hasOwnProperty.call(previousRow, 'plaza_id')) tableUpdatePayload.plaza_id = null
        if (Object.prototype.hasOwnProperty.call(previousRow, 'organizacion_pendiente')) tableUpdatePayload.organizacion_pendiente = false
      }
      if (shouldUpdateEmail) {
        tableUpdatePayload.email = email
      }

      const { error: updateTableErr } = await adminSupabase
        .from('activadores')
        .update(tableUpdatePayload)
        .eq('usuario_id', userId)

      if (updateTableErr) {
        jsonError(res, 500, updateTableErr.message)
        return
      }

      const authUpdatePayload = {
        user_metadata: { nombre, plaza },
      }

      if (emailConfirm) {
        authUpdatePayload.email_confirm = true
      }

      if (password) {
        authUpdatePayload.password = password
      }

      if (emailChanged) {
        authUpdatePayload.email = email
        if (!emailConfirm) {
          authUpdatePayload.email_confirm = true
        }
      }

      const { error: updateAuthErr } = await adminSupabase.auth.admin.updateUserById(
        userId,
        authUpdatePayload
      )

      if (updateAuthErr) {
        const rollbackPayload = {
            nombre: previousRow.nombre,
            plaza: previousRow.plaza,
            email: previousRow.email ?? null,
            rol: previousRow.rol,
            estado: previousRow.estado,
            puede_activar: previousRow.puede_activar,
            lider_id: previousRow.lider_id,
            inhabilitado_at: previousRow.inhabilitado_at,
            motivo_inhabilitacion: previousRow.motivo_inhabilitacion,
          }
        if (Object.prototype.hasOwnProperty.call(previousRow, 'equipo_id')) rollbackPayload.equipo_id = previousRow.equipo_id
        if (Object.prototype.hasOwnProperty.call(previousRow, 'plaza_base')) rollbackPayload.plaza_base = previousRow.plaza_base
        if (Object.prototype.hasOwnProperty.call(previousRow, 'plaza_id')) rollbackPayload.plaza_id = previousRow.plaza_id
        if (Object.prototype.hasOwnProperty.call(previousRow, 'organizacion_pendiente')) rollbackPayload.organizacion_pendiente = previousRow.organizacion_pendiente
        await adminSupabase
          .from('activadores')
          .update(rollbackPayload)
          .eq('usuario_id', userId)

        jsonError(
          res,
          500,
          'No se pudo actualizar Auth. Se intento revertir el cambio en tabla para mantener consistencia.',
          updateAuthErr.message
        )
        return
      }

      if (shouldSyncLeaderTeams) {
        try {
          if (leaderOrganizationAvailable) {
            await syncLeaderTeams(userId, rol === 'lider' ? requestedTeamIds : [])
          }
        } catch (error) {
          jsonError(res, 409, 'El usuario se actualizo, pero no se pudieron actualizar sus equipos.', error?.message)
          return
        }
      }

      res.json({
        ok: true,
        emailUpdated: emailChanged,
        passwordUpdated: Boolean(password),
      })
    })
  )

  app.patch(
    '/admin/users/:userId/status',
    asyncRoute(async (req, res) => {
      const { userId } = req.params
      const estado = normalizeText(req.body?.estado)
      const motivo = normalizeNullableText(req.body?.motivo_inhabilitacion)

      if (!ALLOWED_USER_STATES.has(estado)) {
        jsonError(res, 400, 'estado invalido.')
        return
      }
      if (estado === 'inhabilitado' && !motivo) {
        jsonError(res, 400, 'El motivo de inhabilitacion es obligatorio.')
        return
      }

      const payload = {
        estado,
        inhabilitado_at: estado === 'inhabilitado' ? new Date().toISOString() : null,
        motivo_inhabilitacion: estado === 'inhabilitado' ? motivo : null,
      }
      const { data, error } = await adminSupabase
        .from('activadores')
        .update(payload)
        .eq('usuario_id', userId)
        .select('usuario_id')

      if (error) {
        jsonError(res, 500, 'No se pudo cambiar el estado del usuario.', error.message)
        return
      }
      if (!data?.length) {
        jsonError(res, 404, 'No se encontro el usuario en activadores.')
        return
      }
      res.json({ ok: true, ...payload })
    })
  )

  app.patch(
    '/admin/activaciones/:activacionId',
    asyncRoute(async (req, res) => {
      const activacionId = normalizeText(req.params?.activacionId)
      const editReason = normalizeText(req.body?.motivoEdicion)
      const changes = req.body?.changes
      const unexpectedBodyFields = Object.keys(req.body ?? {}).filter(
        (key) => !['changes', 'motivoEdicion'].includes(key)
      )

      if (!activacionId) {
        jsonError(res, 400, 'Parametro activacionId requerido.')
        return
      }
      if (!editReason) {
        jsonError(res, 400, 'El motivo de edicion es obligatorio.')
        return
      }
      if (unexpectedBodyFields.length) {
        jsonError(res, 400, `Campos de solicitud no permitidos: ${unexpectedBodyFields.join(', ')}.`)
        return
      }
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        jsonError(res, 400, 'changes debe ser un objeto con los campos a modificar.')
        return
      }

      const changeKeys = Object.keys(changes)
      const forbiddenFields = changeKeys.filter((key) => !ACTIVATION_EDITABLE_FIELDS.has(key))
      if (forbiddenFields.length) {
        jsonError(res, 400, `Campos no permitidos: ${forbiddenFields.join(', ')}.`)
        return
      }
      if (!changeKeys.length) {
        jsonError(res, 400, 'No se enviaron cambios para guardar.')
        return
      }

      const updatePayload = {}
      for (const key of changeKeys) {
        if (['comercio_fuera_mercado', 'es_plaza_temporal'].includes(key)) {
          if (typeof changes[key] !== 'boolean') {
            jsonError(res, 400, `${key} debe ser booleano.`)
            return
          }
          updatePayload[key] = changes[key]
        } else {
          updatePayload[key] = normalizeNullableText(changes[key])
        }
      }

      if (updatePayload.email_cliente && !isValidEmail(updatePayload.email_cliente)) {
        jsonError(res, 400, 'El correo del cliente no es valido.')
        return
      }
      if (updatePayload.telefono_cliente && !/^\+?[0-9\s()\-]{6,20}$/.test(updatePayload.telefono_cliente)) {
        jsonError(res, 400, 'El telefono no tiene un formato valido.')
        return
      }
      if (updatePayload.tipo_tienda && !ALLOWED_STORE_SIZES.has(updatePayload.tipo_tienda)) {
        jsonError(res, 400, 'tipo_tienda debe ser Pequeña, Mediana o Grande.')
        return
      }

      const { data: existingRow, error: existingErr } = await adminSupabase
        .from('activaciones')
        .select('*')
        .eq('id', activacionId)
        .maybeSingle()
      if (existingErr) {
        jsonError(res, 500, 'No se pudo leer la activacion.', existingErr.message)
        return
      }
      if (!existingRow?.id) {
        jsonError(res, 404, 'No se encontro la activacion indicada.')
        return
      }

      const actualUpdatePayload = Object.fromEntries(
        Object.entries(updatePayload).filter(([key, value]) => {
          const previousValue = existingRow[key] === '' ? null : existingRow[key]
          return previousValue !== value
        })
      )
      const actualChangeKeys = Object.keys(actualUpdatePayload)
      if (!actualChangeKeys.length) {
        jsonError(res, 400, 'No hay cambios nuevos para guardar.')
        return
      }

      const mergedRow = { ...existingRow, ...actualUpdatePayload }
      if (mergedRow.es_plaza_temporal === true && !normalizeText(mergedRow.plaza_temporal)) {
        jsonError(res, 400, 'plaza_temporal es obligatoria para una plaza temporal.')
        return
      }
      if (normalizeText(mergedRow.rubro_comercio).toLowerCase() === 'otro' &&
        !normalizeText(mergedRow.rubro_comercio_otro)) {
        jsonError(res, 400, 'rubro_comercio_otro es obligatorio cuando el rubro es Otro.')
        return
      }

      const { data: updatedRow, error: updateErr } = await adminSupabase
        .from('activaciones')
        .update(actualUpdatePayload)
        .eq('id', activacionId)
        .select('*')
        .maybeSingle()
      if (updateErr) {
        jsonError(res, 500, 'No se pudo actualizar la activacion.', updateErr.message)
        return
      }
      if (!updatedRow?.id) {
        jsonError(res, 404, 'No se encontro la activacion al guardar los cambios.')
        return
      }

      console.info('[admin-api] Activacion editada', {
        activacionId,
        camposModificados: actualChangeKeys,
        motivoEdicion: editReason,
        fecha: new Date().toISOString(),
      })
      res.json({ activation: updatedRow })
    })
  )

  app.delete(
    '/admin/users/:userId',
    asyncRoute(async (req, res) => {
      const { userId } = req.params

      const { data: existingRow, error: existingErr } = await adminSupabase
        .from('activadores')
        .select('usuario_id, email, nombre, plaza')
        .eq('usuario_id', userId)
        .maybeSingle()

      if (existingErr) {
        jsonError(res, 500, existingErr.message)
        return
      }

      const { data: deletedRows, error: deleteTableErr } = await adminSupabase
        .from('activadores')
        .delete()
        .eq('usuario_id', userId)
        .select('usuario_id')

      if (deleteTableErr) {
        jsonError(res, 500, deleteTableErr.message)
        return
      }

      const tableRecordDeleted = Array.isArray(deletedRows) && deletedRows.length > 0
      const { error: deleteAuthErr } = await adminSupabase.auth.admin.deleteUser(userId)

      if (deleteAuthErr) {
        if (existingRow && tableRecordDeleted) {
          await adminSupabase.from('activadores').upsert(existingRow)
        }

        jsonError(
          res,
          500,
          'No se pudo borrar en Auth. Se intento restaurar el registro de tabla para evitar inconsistencia.',
          deleteAuthErr.message
        )
        return
      }

      res.json({ ok: true, tableRecordDeleted })
    })
  )

  app.get(
    '/admin/storage/summary',
    asyncRoute(async (_req, res) => {
      const { count: activacionesCount, error: activacionesCountErr } = await adminSupabase
        .from('activaciones')
        .select('id', { count: 'exact', head: true })

      if (activacionesCountErr) {
        jsonError(res, 500, 'No se pudo obtener conteo de activaciones.', activacionesCountErr.message)
        return
      }

      const { count: activacionesWithPhotoCount, error: activacionesWithPhotoCountErr } =
        await adminSupabase
          .from('activaciones')
          .select('id', { count: 'exact', head: true })
          .not('foto_url', 'is', null)
          .neq('foto_url', '')

      if (activacionesWithPhotoCountErr) {
        jsonError(
          res,
          500,
          'No se pudo obtener conteo de activaciones con foto.',
          activacionesWithPhotoCountErr.message
        )
        return
      }

      let bucketUsage = null
      try {
        bucketUsage = await calculateBucketUsageBytes(adminSupabase, activacionesBucket)
      } catch (error) {
        jsonError(
          res,
          500,
          'No se pudo calcular uso del bucket de fotos.',
          error instanceof Error ? error.message : undefined
        )
        return
      }

      let databaseSizeBytes = null
      let databaseSizeUnavailableReason = null

      const { data: databaseSizeData, error: databaseSizeErr } = await adminSupabase.rpc(
        'get_database_size_bytes'
      )

      if (databaseSizeErr) {
        databaseSizeUnavailableReason = databaseSizeErr.message
      } else if (typeof databaseSizeData === 'number') {
        databaseSizeBytes = databaseSizeData
      } else if (typeof databaseSizeData === 'string') {
        const parsedSize = Number(databaseSizeData)
        if (Number.isFinite(parsedSize) && parsedSize >= 0) {
          databaseSizeBytes = parsedSize
        }
      } else if (databaseSizeData && typeof databaseSizeData === 'object') {
        const candidate =
          databaseSizeData.get_database_size_bytes ??
          databaseSizeData.database_size_bytes ??
          databaseSizeData.size_bytes ??
          null
        const parsedSize = Number(candidate)
        if (Number.isFinite(parsedSize) && parsedSize >= 0) {
          databaseSizeBytes = parsedSize
        }
      }

      let estimatedDatabase = null
      let estimationUnavailableReason = null
      try {
        estimatedDatabase = await estimateDatabaseUsageFromActivaciones(adminSupabase, {
          activacionesCount: activacionesCount ?? 0,
          databaseLimitBytes,
        })
      } catch (error) {
        estimationUnavailableReason = error instanceof Error ? error.message : null
      }

      const storageRemainingBytes =
        storageLimitBytes == null ? null : Math.max(0, storageLimitBytes - bucketUsage.totalBytes)
      const storageUsagePercent =
        storageLimitBytes == null || storageLimitBytes <= 0
          ? null
          : Number(((bucketUsage.totalBytes / storageLimitBytes) * 100).toFixed(2))

      const effectiveDatabaseUsedBytes =
        databaseSizeBytes ?? estimatedDatabase?.estimated_database_used_bytes ?? null
      const databaseRemainingBytes =
        databaseLimitBytes == null || effectiveDatabaseUsedBytes == null
          ? null
          : Math.max(0, databaseLimitBytes - effectiveDatabaseUsedBytes)
      const databaseUsagePercent =
        databaseLimitBytes == null || databaseLimitBytes <= 0 || effectiveDatabaseUsedBytes == null
          ? null
          : Number(((effectiveDatabaseUsedBytes / databaseLimitBytes) * 100).toFixed(2))

      const perActivationDatabaseBytes =
        estimatedDatabase?.per_activation_estimated_bytes > 0
          ? estimatedDatabase.per_activation_estimated_bytes
          : Number(activacionesCount ?? 0) > 0 && effectiveDatabaseUsedBytes != null
            ? Math.max(1, Math.round(effectiveDatabaseUsedBytes / Number(activacionesCount ?? 0)))
            : null

      const combinedCapacityEstimation = estimateCombinedActivationCapacity({
        activacionesCount: activacionesCount ?? 0,
        activacionesWithPhotoCount: activacionesWithPhotoCount ?? 0,
        storageObjectsCount: bucketUsage.totalObjects,
        storageUsedBytes: bucketUsage.totalBytes,
        storageRemainingBytes,
        databaseRemainingBytes,
        perActivationDatabaseBytes,
      })

      res.json({
        summary: {
          bucket: activacionesBucket,
          activaciones_count: activacionesCount ?? 0,
          activaciones_with_photo_count: activacionesWithPhotoCount ?? 0,
          storage_objects_count: bucketUsage.totalObjects,
          storage_used_bytes: bucketUsage.totalBytes,
          storage_limit_bytes: storageLimitBytes,
          storage_limit_source: storageLimitSource,
          storage_remaining_bytes: storageRemainingBytes,
          storage_usage_percent: storageUsagePercent,
          database_size_bytes: databaseSizeBytes,
          database_used_effective_bytes: effectiveDatabaseUsedBytes,
          database_limit_bytes: databaseLimitBytes,
          database_limit_source: databaseLimitSource,
          database_remaining_bytes: databaseRemainingBytes,
          database_usage_percent: databaseUsagePercent,
          database_size_source:
            databaseSizeBytes == null
              ? estimatedDatabase
                ? 'estimate:activaciones_avg_row'
                : null
              : 'rpc:get_database_size_bytes',
          database_size_unavailable_reason:
            databaseSizeBytes == null ? databaseSizeUnavailableReason : null,
          database_estimation: estimatedDatabase,
          database_estimation_unavailable_reason:
            estimatedDatabase == null ? estimationUnavailableReason : null,
          combined_capacity_estimation: combinedCapacityEstimation,
          plan_reference: SUPABASE_FREE_PLAN_REFERENCE,
        },
      })
    })
  )

  app.delete(
    '/admin/activaciones/:activacionId',
    asyncRoute(async (req, res) => {
      const activacionId = normalizeText(req.params?.activacionId)
      if (!activacionId) {
        jsonError(res, 400, 'Parametro activacionId requerido.')
        return
      }

      const { data: existingRow, error: existingRowErr } = await adminSupabase
        .from('activaciones')
        .select('id, foto_url')
        .eq('id', activacionId)
        .maybeSingle()

      if (existingRowErr) {
        jsonError(res, 500, 'No se pudo leer la activacion.', existingRowErr.message)
        return
      }

      if (!existingRow?.id) {
        jsonError(res, 404, 'No se encontro la activacion indicada.')
        return
      }

      const storageObjectPath = resolveStorageObjectPathFromFotoUrl(
        existingRow.foto_url,
        activacionesBucket
      )

      const { data: deletedRows, error: deleteActivationErr } = await adminSupabase
        .from('activaciones')
        .delete()
        .eq('id', activacionId)
        .select('id')

      if (deleteActivationErr) {
        jsonError(res, 500, 'No se pudo eliminar la activacion.', deleteActivationErr.message)
        return
      }

      const deletedActivation = Array.isArray(deletedRows) && deletedRows.length > 0
      if (!deletedActivation) {
        jsonError(res, 404, 'No se encontro la activacion indicada para eliminar.')
        return
      }

      const photoDelete = {
        attempted: Boolean(storageObjectPath),
        ok: true,
        bucket: activacionesBucket,
        object_path: storageObjectPath ?? null,
        message: storageObjectPath
          ? 'Foto eliminada correctamente.'
          : 'La activacion no tenia foto asociada.',
      }

      if (storageObjectPath) {
        const { error: removePhotoErr } = await adminSupabase.storage
          .from(activacionesBucket)
          .remove([storageObjectPath])

        if (removePhotoErr) {
          photoDelete.ok = false
          photoDelete.message = removePhotoErr.message
        }
      }

      if (!photoDelete.ok) {
        res.json({
          ok: true,
          warning:
            'La activacion se elimino, pero no fue posible borrar la foto del almacenamiento.',
          deleted_activation: true,
          photoDelete,
        })
        return
      }

      res.json({
        ok: true,
        deleted_activation: true,
        photoDelete,
      })
    })
  )

  app.get(
    '/admin/notifications',
    asyncRoute(async (req, res) => {
      const limit = parseLimit(req.query?.limit, { fallback: 60, min: 1, max: 300 })

      let { data: notifications, error: notificationsErr } = await adminSupabase
        .from('notificaciones')
        .select('id, titulo, mensaje, alcance, usuario_objetivo_id, tipo_audiencia, rol_objetivo, destinatarios_total, creado_por, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (notificationsErr && isMissingOrganizationSchema(notificationsErr)) {
        const legacyResult = await adminSupabase.from('notificaciones')
          .select('id, titulo, mensaje, alcance, usuario_objetivo_id, creado_por, created_at')
          .order('created_at', { ascending: false }).limit(limit)
        notifications = legacyResult.data
        notificationsErr = legacyResult.error
      }

      if (notificationsErr) {
        jsonError(
          res,
          500,
          'No se pudo obtener historial de notificaciones.',
          notificationsErr.message
        )
        return
      }

      if (!notifications?.length) {
        res.json({ notifications: [] })
        return
      }

      const notificationIds = notifications.map((item) => item.id)
      const userTargetIds = [
        ...new Set(notifications.map((item) => item.usuario_objetivo_id).filter(Boolean)),
      ]

      const [{ data: recipientsRows, error: recipientsErr }, { data: usersRows, error: usersErr }] =
        await Promise.all([
          adminSupabase
            .from('notificaciones_destinatarios')
            .select('notificacion_id, leida_at')
            .in('notificacion_id', notificationIds),
          userTargetIds.length
            ? adminSupabase
                .from('activadores')
                .select('usuario_id, nombre, email')
                .in('usuario_id', userTargetIds)
            : Promise.resolve({ data: [], error: null }),
        ])

      if (recipientsErr) {
        jsonError(
          res,
          500,
          'No se pudo obtener estado de destinatarios.',
          recipientsErr.message
        )
        return
      }

      if (usersErr) {
        jsonError(
          res,
          500,
          'No se pudo obtener detalle de usuarios objetivo.',
          usersErr.message
        )
        return
      }

      const statsMap = {}
      for (const row of recipientsRows ?? []) {
        if (!statsMap[row.notificacion_id]) {
          statsMap[row.notificacion_id] = { total: 0, read: 0 }
        }
        statsMap[row.notificacion_id].total += 1
        if (row.leida_at) {
          statsMap[row.notificacion_id].read += 1
        }
      }

      const usersMap = Object.fromEntries(
        (usersRows ?? []).map((item) => [
          item.usuario_id,
          {
            usuario_id: item.usuario_id,
            nombre: item.nombre ?? null,
            email: item.email ?? null,
          },
        ])
      )

      const payload = notifications.map((item) => {
        const stats = statsMap[item.id] ?? { total: 0, read: 0 }
        return {
          id: item.id,
          titulo: item.titulo,
          mensaje: item.mensaje,
          alcance: item.alcance,
          tipo_audiencia: item.tipo_audiencia ?? (item.alcance === 'user' ? 'users' : 'all'),
          rol_objetivo: item.rol_objetivo ?? null,
          usuarioObjetivo: item.usuario_objetivo_id
            ? usersMap[item.usuario_objetivo_id] ?? {
                usuario_id: item.usuario_objetivo_id,
                nombre: null,
                email: null,
              }
            : null,
          creado_por: item.creado_por,
          created_at: item.created_at,
          destinatarios_total: item.destinatarios_total ?? stats.total,
          destinatarios_leidos: stats.read,
          destinatarios_pendientes: Math.max(0, stats.total - stats.read),
        }
      })

      res.json({ notifications: payload })
    })
  )

  app.post(
    '/admin/notifications',
    asyncRoute(async (req, res) => {
      const rawTitle = req.body?.titulo
      const rawMessage = req.body?.mensaje
      const rawScope = req.body?.alcance
      const rawTargetUserId = req.body?.usuarioObjetivoId
      const rawAudience = req.body?.tipoAudiencia
      const targetRole = normalizeText(req.body?.rolObjetivo)
      const requestedUserIds = Array.isArray(req.body?.usuarioObjetivoIds)
        ? req.body.usuarioObjetivoIds.map(normalizeText).filter(Boolean)
        : []

      const title = normalizeText(rawTitle)
      const message = normalizeText(rawMessage)
      const audience = ['all', 'role', 'users'].includes(rawAudience)
        ? rawAudience
        : rawScope === 'user' ? 'users' : rawScope === 'all' ? 'all' : ''
      const scope = audience === 'users' ? 'user' : 'all'
      const targetUserId = normalizeText(rawTargetUserId)
      const specificUserIds = [...new Set([...requestedUserIds, ...(targetUserId ? [targetUserId] : [])])]
      const createdBy = normalizeText(req.portalUser?.email) || normalizeText(req.adminUser) || 'admin'

      if (title.length < 3 || title.length > 120) {
        jsonError(res, 400, 'El titulo debe tener entre 3 y 120 caracteres.')
        return
      }

      if (message.length < 3 || message.length > 2000) {
        jsonError(res, 400, 'El mensaje debe tener entre 3 y 2000 caracteres.')
        return
      }

      if (!audience) {
        jsonError(res, 400, 'Tipo de audiencia invalido.')
        return
      }
      if (audience === 'role' && !['activador', 'lider', 'facturador'].includes(targetRole)) {
        jsonError(res, 400, 'rolObjetivo invalido.')
        return
      }
      if (audience === 'users' && (!specificUserIds.length || specificUserIds.length > 500)) {
        jsonError(res, 400, 'Selecciona entre 1 y 500 usuarios especificos.')
        return
      }

      let recipients = []

      if (audience === 'all' || audience === 'role') {
        let recipientsQuery = adminSupabase.from('activadores')
          .select('usuario_id, nombre, email, rol').eq('estado', 'activo').not('usuario_id', 'is', null)
        if (audience === 'role') recipientsQuery = recipientsQuery.eq('rol', targetRole)
        const { data, error } = await recipientsQuery

        if (error) {
          jsonError(res, 500, 'No se pudo obtener lista de destinatarios.', error.message)
          return
        }

        const dedupedRecipients = new Map()
        for (const item of data ?? []) {
          if (item?.usuario_id && !dedupedRecipients.has(item.usuario_id)) {
            dedupedRecipients.set(item.usuario_id, item)
          }
        }

        recipients = [...dedupedRecipients.values()]
      } else {
        const { data, error } = await adminSupabase
          .from('activadores')
          .select('usuario_id, nombre, email, rol')
          .in('usuario_id', specificUserIds)
          .eq('estado', 'activo')

        if (error) {
          jsonError(res, 500, 'No se pudo validar el usuario objetivo.', error.message)
          return
        }

        recipients = [...new Map((data ?? []).filter((item) => item?.usuario_id).map((item) => [item.usuario_id, item])).values()]
      }

      if (!recipients.length) {
        jsonError(res, 400, 'No hay destinatarios disponibles para este envio.')
        return
      }

      const notificationPayload = {
        titulo: title,
        mensaje: message,
        alcance: scope,
        usuario_objetivo_id: audience === 'users' && specificUserIds.length === 1 ? specificUserIds[0] : null,
        tipo_audiencia: audience,
        rol_objetivo: audience === 'role' ? targetRole : null,
        destinatarios_total: recipients.length,
        creado_por: createdBy,
      }

      let { data: insertedNotification, error: insertNotificationErr } = await adminSupabase
        .from('notificaciones')
        .insert(notificationPayload)
        .select('id, titulo, mensaje, alcance, usuario_objetivo_id, tipo_audiencia, rol_objetivo, destinatarios_total, creado_por, created_at')
        .single()

      if (insertNotificationErr && isMissingOrganizationSchema(insertNotificationErr)) {
        const legacyPayload = {
          titulo: title, mensaje: message, alcance: scope,
          usuario_objetivo_id: audience === 'users' && specificUserIds.length === 1 ? specificUserIds[0] : null,
          creado_por: createdBy,
        }
        const legacyInsert = await adminSupabase.from('notificaciones').insert(legacyPayload)
          .select('id, titulo, mensaje, alcance, usuario_objetivo_id, creado_por, created_at').single()
        insertedNotification = legacyInsert.data
        insertNotificationErr = legacyInsert.error
      }

      if (insertNotificationErr || !insertedNotification?.id) {
        jsonError(
          res,
          500,
          'No se pudo registrar la notificacion.',
          insertNotificationErr?.message
        )
        return
      }

      const recipientsPayload = recipients.map((item) => ({
        notificacion_id: insertedNotification.id,
        usuario_id: item.usuario_id,
      }))

      const { error: insertRecipientsErr } = await adminSupabase
        .from('notificaciones_destinatarios')
        .insert(recipientsPayload)

      if (insertRecipientsErr) {
        await adminSupabase
          .from('notificaciones')
          .delete()
          .eq('id', insertedNotification.id)

        jsonError(
          res,
          500,
          'No se pudo registrar destinatarios de la notificacion.',
          insertRecipientsErr.message
        )
        return
      }

      res.status(201).json({
        notification: {
          id: insertedNotification.id,
          titulo: insertedNotification.titulo,
          mensaje: insertedNotification.mensaje,
          alcance: insertedNotification.alcance,
          tipo_audiencia: audience,
          rol_objetivo: audience === 'role' ? targetRole : null,
          usuarioObjetivo:
            audience === 'users' && specificUserIds.length === 1
              ? {
                  usuario_id: specificUserIds[0],
                  nombre: recipients[0]?.nombre ?? null,
                  email: recipients[0]?.email ?? null,
                }
              : null,
          creado_por: insertedNotification.creado_por,
          created_at: insertedNotification.created_at,
          destinatarios_total: recipientsPayload.length,
          destinatarios_leidos: 0,
          destinatarios_pendientes: recipientsPayload.length,
        },
      })
    })
  )

  app.use((error, _req, res, _next) => {
    console.error('[admin-api] Error no controlado:', error)

    if (res.headersSent) {
      return
    }

    jsonError(res, 500, 'Error interno del servidor.')
  })

  return app
}
