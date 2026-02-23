import crypto from 'node:crypto'
import express from 'express'
import { createClient } from '@supabase/supabase-js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_BASIC_USER',
  'ADMIN_BASIC_PASS',
]
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
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

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(normalizeEmail(value))
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
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    next()
  })

  app.use(express.json())

  function requireAdminBasicAuth(req, res, next) {
    const parsed = parseBasicAuth(req.headers.authorization)

    if (!parsed) {
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

  app.use('/admin', requireAdminBasicAuth)

  app.get('/admin/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  app.get(
    '/admin/users',
    asyncRoute(async (_req, res) => {
      const { data, error } = await adminSupabase
        .from('activadores')
        .select('usuario_id, email, nombre, plaza')
        .order('nombre', { ascending: true })

      if (error) {
        jsonError(res, 500, error.message)
        return
      }

      res.json({ users: data ?? [] })
    })
  )

  app.post(
    '/admin/users',
    asyncRoute(async (req, res) => {
      const rawEmail = req.body?.email
      const rawPassword = req.body?.password
      const rawNombre = req.body?.nombre
      const rawPlaza = req.body?.plaza

      const email = normalizeEmail(rawEmail)
      const password = typeof rawPassword === 'string' ? rawPassword : ''
      const nombre = normalizeText(rawNombre)
      const plaza = normalizeNullableText(rawPlaza)

      if (!email || !password || !nombre) {
        jsonError(res, 400, 'email, password y nombre son obligatorios.')
        return
      }

      if (!isValidEmail(email)) {
        jsonError(res, 400, 'email invalido.')
        return
      }

      if (password.length < 6) {
        jsonError(res, 400, 'La contrasena debe tener al menos 6 caracteres.')
        return
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

      res.status(201).json({ user: insertedUser })
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

      const nombre = normalizeText(rawNombre)
      const plaza = normalizeNullableText(rawPlaza)
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

      if (password && password.length < 6) {
        jsonError(res, 400, 'La nueva contrasena debe tener al menos 6 caracteres.')
        return
      }

      const { data: previousRow, error: previousRowErr } = await adminSupabase
        .from('activadores')
        .select('nombre, plaza, email')
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

      const tableUpdatePayload = { nombre, plaza }
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
        await adminSupabase
          .from('activadores')
          .update({
            nombre: previousRow.nombre,
            plaza: previousRow.plaza,
            email: previousRow.email ?? null,
          })
          .eq('usuario_id', userId)

        jsonError(
          res,
          500,
          'No se pudo actualizar Auth. Se intento revertir el cambio en tabla para mantener consistencia.',
          updateAuthErr.message
        )
        return
      }

      res.json({
        ok: true,
        emailUpdated: emailChanged,
        passwordUpdated: Boolean(password),
      })
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

      const { data: notifications, error: notificationsErr } = await adminSupabase
        .from('notificaciones')
        .select('id, titulo, mensaje, alcance, usuario_objetivo_id, creado_por, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

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
          usuarioObjetivo: item.usuario_objetivo_id
            ? usersMap[item.usuario_objetivo_id] ?? {
                usuario_id: item.usuario_objetivo_id,
                nombre: null,
                email: null,
              }
            : null,
          creado_por: item.creado_por,
          created_at: item.created_at,
          destinatarios_total: stats.total,
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

      const title = normalizeText(rawTitle)
      const message = normalizeText(rawMessage)
      const scope = rawScope === 'user' ? 'user' : rawScope === 'all' ? 'all' : ''
      const targetUserId = normalizeText(rawTargetUserId)
      const createdBy = normalizeText(req.adminUser) || 'admin'

      if (title.length < 3 || title.length > 120) {
        jsonError(res, 400, 'El titulo debe tener entre 3 y 120 caracteres.')
        return
      }

      if (message.length < 3 || message.length > 2000) {
        jsonError(res, 400, 'El mensaje debe tener entre 3 y 2000 caracteres.')
        return
      }

      if (!scope) {
        jsonError(res, 400, 'alcance invalido. Usa "all" o "user".')
        return
      }

      let recipients = []

      if (scope === 'all') {
        const { data, error } = await adminSupabase
          .from('activadores')
          .select('usuario_id, nombre, email')
          .not('usuario_id', 'is', null)

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
        if (!targetUserId) {
          jsonError(res, 400, 'usuarioObjetivoId es obligatorio para alcance user.')
          return
        }

        const { data, error } = await adminSupabase
          .from('activadores')
          .select('usuario_id, nombre, email')
          .eq('usuario_id', targetUserId)
          .maybeSingle()

        if (error) {
          jsonError(res, 500, 'No se pudo validar el usuario objetivo.', error.message)
          return
        }

        if (!data?.usuario_id) {
          jsonError(res, 404, 'No se encontro el usuario objetivo.')
          return
        }

        recipients = [data]
      }

      if (!recipients.length) {
        jsonError(res, 400, 'No hay destinatarios disponibles para este envio.')
        return
      }

      const notificationPayload = {
        titulo: title,
        mensaje: message,
        alcance: scope,
        usuario_objetivo_id: scope === 'user' ? targetUserId : null,
        creado_por: createdBy,
      }

      const { data: insertedNotification, error: insertNotificationErr } = await adminSupabase
        .from('notificaciones')
        .insert(notificationPayload)
        .select('id, titulo, mensaje, alcance, usuario_objetivo_id, creado_por, created_at')
        .single()

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
          usuarioObjetivo:
            scope === 'user'
              ? {
                  usuario_id: targetUserId,
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
