<script setup>
import { computed, ref } from 'vue'
import { adminApiRequest } from '../lib/adminApiClient'
import { useAdminApiAuth } from '../lib/adminAuthStore'
import {
  notifyError,
  notifySuccess,
  notifyWarning,
  requestConfirmation,
} from '../lib/feedback'
import {
  containsNormalized,
  isValidEmail,
  normalizeEmail,
} from '../lib/textUtils'

const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(
  /\/$/,
  ''
)

const {
  username: apiUser,
  password: apiPass,
  hasCredentials: puedeConectar,
  setCredentials,
} = useAdminApiAuth()
const conectado = ref(false)
const conectando = ref(false)
const authErrorMsg = ref(null)

const usuarios = ref([])
const loading = ref(false)
const errorMsg = ref(null)
const filtroNombre = ref('')
const filtroEmail = ref('')
const filtroPlaza = ref('')

const email = ref('')
const password = ref('')
const nombre = ref('')
const plaza = ref('')

const editandoId = ref(null)
const nombreEdit = ref('')
const emailEdit = ref('')
const plazaEdit = ref('')
const passwordEdit = ref('')

const usuariosFiltrados = computed(() => {
  return usuarios.value.filter((usuario) => {
    const coincideNombre = containsNormalized(usuario.nombre, filtroNombre.value)
    const coincideEmail = containsNormalized(usuario.email, filtroEmail.value)
    const coincidePlaza = containsNormalized(usuario.plaza, filtroPlaza.value)

    return coincideNombre && coincideEmail && coincidePlaza
  })
})

const credencialesApi = computed(() => ({
  username: apiUser.value,
  password: apiPass.value,
}))

async function requestAdmin(path, options = {}) {
  return adminApiRequest({
    baseUrl: apiBaseUrl,
    path,
    username: credencialesApi.value.username,
    password: credencialesApi.value.password,
    ...options,
  })
}

function limpiarFormularioRegistro() {
  email.value = ''
  password.value = ''
  nombre.value = ''
  plaza.value = ''
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Se produjo un error inesperado.'
}

async function conectarApi() {
  if (!puedeConectar.value) {
    conectado.value = false
    authErrorMsg.value = 'Ingresa usuario y password de API.'
    notifyWarning(authErrorMsg.value)
    return
  }

  authErrorMsg.value = null
  conectando.value = true

  try {
    await requestAdmin('/admin/healthz')
    setCredentials(apiUser.value, apiPass.value)
    conectado.value = true
    await cargarUsuarios()
    notifySuccess('Conexion con API admin establecida.')
  } catch (error) {
    conectado.value = false
    authErrorMsg.value = getErrorMessage(error)
    notifyError(authErrorMsg.value)
  } finally {
    conectando.value = false
  }
}

async function cargarUsuarios() {
  if (!conectado.value) {
    return
  }

  loading.value = true
  errorMsg.value = null

  try {
    const result = await requestAdmin('/admin/users')
    usuarios.value = result.users ?? []
  } catch (error) {
    errorMsg.value = getErrorMessage(error)
    notifyError(errorMsg.value)
  } finally {
    loading.value = false
  }
}

async function registrarUsuario() {
  const emailNormalizado = normalizeEmail(email.value)
  const nombreNormalizado = nombre.value.trim()
  const plazaNormalizada = plaza.value.trim()

  if (!emailNormalizado || !password.value || !nombreNormalizado) {
    notifyWarning('Completa todos los campos obligatorios.')
    return
  }

  if (!isValidEmail(emailNormalizado)) {
    notifyWarning('Ingresa un correo valido.')
    return
  }

  if (password.value.length < 6) {
    notifyWarning('La contrasena debe tener al menos 6 caracteres.')
    return
  }

  try {
    await requestAdmin('/admin/users', {
      method: 'POST',
      body: {
        email: emailNormalizado,
        password: password.value,
        nombre: nombreNormalizado,
        plaza: plazaNormalizada,
      },
    })

    limpiarFormularioRegistro()
    await cargarUsuarios()
    notifySuccess('Usuario registrado correctamente.')
  } catch (error) {
    notifyError(getErrorMessage(error))
  }
}

function editarUsuario(usuario) {
  editandoId.value = usuario.usuario_id
  nombreEdit.value = usuario.nombre ?? ''
  emailEdit.value = usuario.email || ''
  plazaEdit.value = usuario.plaza || ''
  passwordEdit.value = ''
}

function cancelarEdicion() {
  editandoId.value = null
  nombreEdit.value = ''
  emailEdit.value = ''
  plazaEdit.value = ''
  passwordEdit.value = ''
}

async function guardarEdicion() {
  if (!editandoId.value) return

  const nombreNormalizado = nombreEdit.value.trim()
  const emailNormalizado = normalizeEmail(emailEdit.value)
  const plazaNormalizada = plazaEdit.value.trim()

  if (!nombreNormalizado) {
    notifyWarning('El nombre no puede estar vacio.')
    return
  }

  if (!emailNormalizado || !isValidEmail(emailNormalizado)) {
    notifyWarning('Ingresa un correo valido para guardar la edicion.')
    return
  }

  if (passwordEdit.value && passwordEdit.value.length < 6) {
    notifyWarning('La nueva contrasena debe tener al menos 6 caracteres.')
    return
  }

  const payload = {
    nombre: nombreNormalizado,
    email: emailNormalizado,
    plaza: plazaNormalizada,
  }

  if (passwordEdit.value) {
    payload.password = passwordEdit.value
  }

  try {
    await requestAdmin(`/admin/users/${editandoId.value}`, {
      method: 'PATCH',
      body: payload,
    })

    const actualizoContrasena = Boolean(passwordEdit.value)
    cancelarEdicion()

    await cargarUsuarios()
    notifySuccess(
      actualizoContrasena
        ? 'Usuario, correo y contrasena actualizados.'
        : 'Usuario y correo actualizados.'
    )
  } catch (error) {
    notifyError(getErrorMessage(error))
  }
}

async function confirmarUsuario(usuario) {
  try {
    await requestAdmin(`/admin/users/${usuario.usuario_id}`, {
      method: 'PATCH',
      body: {
        nombre: usuario.nombre ?? '',
        plaza: usuario.plaza?.trim() ?? '',
        emailConfirm: true,
      },
    })

    await cargarUsuarios()
    notifySuccess('Usuario confirmado.')
  } catch (error) {
    notifyError(getErrorMessage(error))
  }
}

async function eliminarUsuario(usuario) {
  const confirmacion = await requestConfirmation({
    title: 'Eliminar usuario',
    message: `Se eliminara el usuario ${usuario.nombre ?? ''} de forma permanente.`,
    confirmLabel: 'Eliminar',
    cancelLabel: 'Cancelar',
    tone: 'danger',
  })
  if (!confirmacion) return

  try {
    await requestAdmin(`/admin/users/${usuario.usuario_id}`, {
      method: 'DELETE',
    })

    await cargarUsuarios()
    notifySuccess('Usuario eliminado.')
  } catch (error) {
    notifyError(getErrorMessage(error))
  }
}
</script>

<template>
  <section class="view-page contenedor-usuarios">
    <header class="view-header">
      <p class="view-kicker">Control de Accesos</p>
      <h1 class="view-title">Gestion de Usuarios</h1>
      <p class="view-description">
        Administra el equipo operativo conectado a la base principal de activaciones.
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
        <h2 class="subtitulo">Registrar Usuario</h2>
        <form class="formulario-campos" @submit.prevent="registrarUsuario">
          <input
            v-model="email"
            type="email"
            placeholder="Correo electronico"
            class="input-texto"
            @keydown.enter.prevent="registrarUsuario"
          />
          <input
            v-model="password"
            type="password"
            placeholder="Contrasena"
            class="input-texto"
            @keydown.enter.prevent="registrarUsuario"
          />
          <input
            v-model="nombre"
            placeholder="Nombre completo"
            class="input-texto"
            @keydown.enter.prevent="registrarUsuario"
          />
          <input
            v-model="plaza"
            placeholder="Plaza (opcional)"
            class="input-texto"
            @keydown.enter.prevent="registrarUsuario"
          />
          <button type="submit" class="boton boton-primario">Registrar</button>
        </form>
      </div>
    </div>

    <div v-if="conectado" class="panel-card tabla-contenedor">
      <div class="toolbar-line">
        <h2 class="subtitulo subtitulo-inline">Usuarios Registrados</h2>
        <div class="toolbar-actions">
          <span class="meta-pill">{{ usuariosFiltrados.length }} visibles</span>
          <button @click="cargarUsuarios" class="boton">Recargar</button>
        </div>
      </div>

      <div class="filtros filtros-grid filtros-lista">
        <label>
          <span class="field-label">Nombre</span>
          <input
            v-model="filtroNombre"
            type="text"
            placeholder="Buscar por nombre"
            class="input-texto"
          />
        </label>
        <label>
          <span class="field-label">Email</span>
          <input
            v-model="filtroEmail"
            type="text"
            placeholder="Buscar por email"
            class="input-texto"
          />
        </label>
        <label>
          <span class="field-label">Plaza</span>
          <input
            v-model="filtroPlaza"
            type="text"
            placeholder="Buscar por plaza"
            class="input-texto"
          />
        </label>
      </div>

      <p v-if="loading">Cargando usuarios...</p>
      <p v-else-if="errorMsg" class="mensaje-error">{{ errorMsg }}</p>
      <p v-else-if="usuariosFiltrados.length === 0" class="panel-empty">
        No hay usuarios para los filtros seleccionados.
      </p>

      <div v-else class="table-wrap modulo-table-wrap">
        <table class="tabla-usuarios">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Plaza</th>
              <th>Nueva Contrasena</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="usuario in usuariosFiltrados" :key="usuario.usuario_id">
              <td>{{ usuario.usuario_id }}</td>
              <td>
                <div v-if="editandoId === usuario.usuario_id">
                  <input
                    v-model="nombreEdit"
                    class="input-editar"
                    @keydown.enter.prevent="guardarEdicion"
                  />
                </div>
                <div v-else>{{ usuario.nombre }}</div>
              </td>
              <td>
                <div v-if="editandoId === usuario.usuario_id">
                  <input
                    v-model="emailEdit"
                    type="email"
                    class="input-editar"
                    @keydown.enter.prevent="guardarEdicion"
                  />
                </div>
                <div v-else>{{ usuario.email }}</div>
              </td>
              <td>
                <div v-if="editandoId === usuario.usuario_id">
                  <input
                    v-model="plazaEdit"
                    class="input-editar"
                    @keydown.enter.prevent="guardarEdicion"
                  />
                </div>
                <div v-else>{{ usuario.plaza }}</div>
              </td>
              <td>
                <div v-if="editandoId === usuario.usuario_id">
                  <input
                    v-model="passwordEdit"
                    type="password"
                    class="input-editar"
                    placeholder="Opcional (min. 6)"
                    @keydown.enter.prevent="guardarEdicion"
                  />
                </div>
                <div v-else>-</div>
              </td>
              <td>
                <div v-if="editandoId === usuario.usuario_id" class="acciones">
                  <button @click="guardarEdicion" class="boton boton-guardar">Guardar</button>
                  <button @click="cancelarEdicion" class="boton boton-cancelar">Cancelar</button>
                </div>
                <div v-else class="acciones">
                  <button @click="editarUsuario(usuario)" class="boton boton-editar">Editar</button>
                  <button @click="confirmarUsuario(usuario)" class="boton">Confirmar</button>
                  <button @click="eliminarUsuario(usuario)" class="boton boton-eliminar">Eliminar</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
