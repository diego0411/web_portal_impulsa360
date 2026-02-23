<script setup>
import { computed, ref } from 'vue'
import { adminApiRequest } from '../lib/adminApiClient'
import { notifyError, notifySuccess, notifyWarning } from '../lib/feedback'
import { containsNormalized } from '../lib/textUtils'

const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')

const apiUser = ref('')
const apiPass = ref('')
const conectado = ref(false)
const conectando = ref(false)
const authErrorMsg = ref(null)

const usuarios = ref([])
const notificaciones = ref([])
const cargandoNotificaciones = ref(false)
const errorNotificaciones = ref(null)
const enviando = ref(false)

const titulo = ref('')
const mensaje = ref('')
const alcance = ref('all')
const usuarioObjetivoId = ref('')

const filtroTexto = ref('')
const filtroAlcance = ref('')

const formatDateTime = new Intl.DateTimeFormat('es-BO', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const puedeConectar = computed(() => {
  return Boolean(apiUser.value.trim() && apiPass.value)
})

const usuariosOrdenados = computed(() => {
  return [...usuarios.value].sort((a, b) => {
    const left = (a.nombre || a.email || '').toLowerCase()
    const right = (b.nombre || b.email || '').toLowerCase()
    return left.localeCompare(right, 'es', { sensitivity: 'base' })
  })
})

const notificacionesFiltradas = computed(() => {
  return notificaciones.value.filter((item) => {
    const targetLabel = item.usuarioObjetivo
      ? `${item.usuarioObjetivo.nombre || ''} ${item.usuarioObjetivo.email || ''}`
      : 'todos'

    const coincideTexto =
      containsNormalized(item.titulo, filtroTexto.value) ||
      containsNormalized(item.mensaje, filtroTexto.value) ||
      containsNormalized(item.creado_por, filtroTexto.value) ||
      containsNormalized(targetLabel, filtroTexto.value)

    const coincideAlcance = !filtroAlcance.value || item.alcance === filtroAlcance.value

    return coincideTexto && coincideAlcance
  })
})

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Se produjo un error inesperado.'
}

function getTargetLabel(item) {
  if (item.alcance === 'all') {
    return 'Todos'
  }

  if (!item.usuarioObjetivo) {
    return 'Usuario especifico'
  }

  return item.usuarioObjetivo.nombre || item.usuarioObjetivo.email || item.usuarioObjetivo.usuario_id
}

function getMessagePreview(text) {
  const normalized = typeof text === 'string' ? text.trim() : ''
  if (normalized.length <= 110) {
    return normalized
  }

  return `${normalized.slice(0, 107)}...`
}

function formatCreatedAt(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return formatDateTime.format(date)
}

function resetForm() {
  titulo.value = ''
  mensaje.value = ''
  alcance.value = 'all'
  usuarioObjetivoId.value = ''
}

async function requestAdmin(path, options = {}) {
  return adminApiRequest({
    baseUrl: apiBaseUrl,
    path,
    username: apiUser.value,
    password: apiPass.value,
    ...options,
  })
}

async function cargarUsuarios() {
  const result = await requestAdmin('/admin/users')
  usuarios.value = result.users ?? []
}

async function cargarNotificaciones() {
  if (!conectado.value) {
    return
  }

  cargandoNotificaciones.value = true
  errorNotificaciones.value = null

  try {
    const result = await requestAdmin('/admin/notifications?limit=120')
    notificaciones.value = result.notifications ?? []
  } catch (error) {
    errorNotificaciones.value = getErrorMessage(error)
    notifyError(errorNotificaciones.value)
  } finally {
    cargandoNotificaciones.value = false
  }
}

async function conectarApi() {
  if (!puedeConectar.value) {
    authErrorMsg.value = 'Ingresa usuario y password de API.'
    notifyWarning(authErrorMsg.value)
    return
  }

  authErrorMsg.value = null
  conectando.value = true

  try {
    await requestAdmin('/admin/healthz')
    conectado.value = true
    await Promise.all([cargarUsuarios(), cargarNotificaciones()])
    notifySuccess('Modulo de notificaciones conectado a la API.')
  } catch (error) {
    conectado.value = false
    authErrorMsg.value = getErrorMessage(error)
    notifyError(authErrorMsg.value)
  } finally {
    conectando.value = false
  }
}

async function enviarNotificacion() {
  if (!conectado.value || enviando.value) {
    return
  }

  const tituloNormalizado = titulo.value.trim()
  const mensajeNormalizado = mensaje.value.trim()

  if (tituloNormalizado.length < 3) {
    notifyWarning('El titulo debe tener al menos 3 caracteres.')
    return
  }

  if (mensajeNormalizado.length < 3) {
    notifyWarning('El mensaje debe tener al menos 3 caracteres.')
    return
  }

  if (alcance.value === 'user' && !usuarioObjetivoId.value) {
    notifyWarning('Selecciona el usuario objetivo para el envio especifico.')
    return
  }

  enviando.value = true

  try {
    const payload = {
      titulo: tituloNormalizado,
      mensaje: mensajeNormalizado,
      alcance: alcance.value,
      usuarioObjetivoId: alcance.value === 'user' ? usuarioObjetivoId.value : null,
    }

    const result = await requestAdmin('/admin/notifications', {
      method: 'POST',
      body: payload,
    })

    const enviados = result?.notification?.destinatarios_total ?? 0
    resetForm()
    await cargarNotificaciones()
    notifySuccess(`Notificacion enviada. Destinatarios: ${enviados}.`)
  } catch (error) {
    notifyError(getErrorMessage(error))
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <section class="view-page">
    <header class="view-header">
      <p class="view-kicker">Comunicacion Operativa</p>
      <h1 class="view-title">Notificaciones Internas</h1>
      <p class="view-description">
        Envia comunicados internos a todos los usuarios o a un usuario especifico y revisa el
        estado de lectura.
      </p>
      <div class="meta-row">
        <span class="meta-pill" :class="{ 'meta-pill-ok': conectado }">
          {{ conectado ? 'API conectada' : 'API desconectada' }}
        </span>
      </div>
    </header>

    <div class="forms-grid">
      <div class="formulario-registro">
        <h2 class="subtitulo">Conexion API Admin</h2>
        <form class="formulario-campos" @submit.prevent="conectarApi">
          <input
            v-model="apiUser"
            placeholder="Usuario API"
            class="input-texto"
            @keydown.enter.prevent="conectarApi"
          />
          <input
            v-model="apiPass"
            type="password"
            placeholder="Password API"
            class="input-texto"
            @keydown.enter.prevent="conectarApi"
          />
          <button
            type="submit"
            class="boton boton-primario"
            :disabled="conectando || !puedeConectar"
          >
            {{ conectando ? 'Conectando...' : 'Conectar' }}
          </button>
          <p v-if="authErrorMsg" class="mensaje-error">{{ authErrorMsg }}</p>
          <p v-else-if="conectado">Conectado a {{ apiBaseUrl }}</p>
        </form>
      </div>

      <div v-if="conectado" class="formulario-registro">
        <h2 class="subtitulo">Nuevo Envio</h2>
        <form class="formulario-campos" @submit.prevent="enviarNotificacion">
          <label>
            <span class="field-label">Titulo</span>
            <input
              v-model="titulo"
              class="input-texto"
              type="text"
              maxlength="120"
              placeholder="Ej: Recordatorio de corte diario"
              @keydown.enter.prevent="enviarNotificacion"
            />
          </label>

          <label>
            <span class="field-label">Mensaje</span>
            <textarea
              v-model="mensaje"
              class="textarea-texto"
              rows="4"
              maxlength="2000"
              placeholder="Escribe el contenido de la notificacion..."
            />
          </label>

          <label>
            <span class="field-label">Alcance</span>
            <select v-model="alcance" class="input-texto">
              <option value="all">Todos</option>
              <option value="user">Usuario especifico</option>
            </select>
          </label>

          <label v-if="alcance === 'user'">
            <span class="field-label">Usuario objetivo</span>
            <select v-model="usuarioObjetivoId" class="input-texto">
              <option value="">Selecciona un usuario</option>
              <option
                v-for="usuario in usuariosOrdenados"
                :key="usuario.usuario_id"
                :value="usuario.usuario_id"
              >
                {{ usuario.nombre || usuario.email }} · {{ usuario.email }}
              </option>
            </select>
          </label>

          <button
            type="submit"
            class="boton boton-primario"
            :disabled="enviando"
          >
            {{ enviando ? 'Enviando...' : 'Enviar Notificacion' }}
          </button>
        </form>
      </div>
    </div>

    <div v-if="conectado" class="panel-card">
      <div class="toolbar-line">
        <h2 class="subtitulo subtitulo-inline">Historial de Envios</h2>
        <div class="toolbar-actions">
          <span class="meta-pill">{{ notificacionesFiltradas.length }} visibles</span>
          <button @click="cargarNotificaciones" class="boton">Recargar</button>
        </div>
      </div>

      <div class="filtros filtros-grid filtros-lista">
        <label>
          <span class="field-label">Buscar</span>
          <input
            v-model="filtroTexto"
            type="text"
            placeholder="Titulo, mensaje, usuario o creador"
            class="input-texto"
          />
        </label>
        <label>
          <span class="field-label">Alcance</span>
          <select v-model="filtroAlcance" class="input-texto">
            <option value="">Todos</option>
            <option value="all">Todos</option>
            <option value="user">Usuario especifico</option>
          </select>
        </label>
      </div>

      <p v-if="cargandoNotificaciones">Cargando historial...</p>
      <p v-else-if="errorNotificaciones" class="mensaje-error">{{ errorNotificaciones }}</p>
      <p v-else-if="notificacionesFiltradas.length === 0" class="panel-empty">
        No hay notificaciones para los filtros seleccionados.
      </p>

      <div v-else class="table-wrap modulo-table-wrap">
        <table class="tabla-usuarios">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Titulo</th>
              <th>Mensaje</th>
              <th>Alcance</th>
              <th>Destino</th>
              <th>Enviadas</th>
              <th>Leidas</th>
              <th>Pendientes</th>
              <th>Creado por</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in notificacionesFiltradas" :key="item.id">
              <td>{{ formatCreatedAt(item.created_at) }}</td>
              <td>{{ item.titulo }}</td>
              <td :title="item.mensaje">{{ getMessagePreview(item.mensaje) }}</td>
              <td>
                <span class="scope-pill" :class="item.alcance === 'all' ? 'scope-pill-all' : 'scope-pill-user'">
                  {{ item.alcance === 'all' ? 'Todos' : 'Usuario' }}
                </span>
              </td>
              <td :title="item.usuarioObjetivo?.email || ''">{{ getTargetLabel(item) }}</td>
              <td>{{ item.destinatarios_total }}</td>
              <td>{{ item.destinatarios_leidos }}</td>
              <td>{{ item.destinatarios_pendientes }}</td>
              <td>{{ item.creado_por }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
