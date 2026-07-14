<script setup>
import { computed, ref } from 'vue'
import { adminApiRequest } from '../lib/adminApiClient'
import { useAdminApiAuth } from '../lib/adminAuthStore'
import { notifyError, notifySuccess, notifyWarning, requestConfirmation } from '../lib/feedback'
import { containsNormalized, isValidEmail, normalizeEmail } from '../lib/textUtils'

const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')
const roles = ['activador', 'lider', 'administrador']
const estados = ['activo', 'inhabilitado']
const { username: apiUser, password: apiPass, hasCredentials: puedeConectar, setCredentials } = useAdminApiAuth()
const conectado = ref(false)
const conectando = ref(false)
const authErrorMsg = ref(null)
const usuarios = ref([])
const loading = ref(false)
const procesando = ref(false)
const errorMsg = ref(null)
const busqueda = ref('')
const filtroRol = ref('')
const filtroEstado = ref('')
const filtroPlaza = ref('')

const nuevo = ref({ email: '', password: '', nombre: '', plaza: '', rol: 'activador', estado: 'activo', lider_id: '', motivo_inhabilitacion: '' })
const editandoId = ref(null)
const edicion = ref({})
const modalInhabilitar = ref(false)
const usuarioAInhabilitar = ref(null)
const motivoInhabilitar = ref('')

const lideresActivos = computed(() => usuarios.value.filter((u) => (u.rol ?? 'activador') === 'lider' && (u.estado ?? 'activo') === 'activo'))
const plazas = computed(() => [...new Set(usuarios.value.map((u) => u.plaza).filter(Boolean))].sort((a, b) => a.localeCompare(b)))
const usuariosPorId = computed(() => Object.fromEntries(usuarios.value.map((u) => [u.usuario_id, u])))
const usuariosFiltrados = computed(() => usuarios.value.filter((u) => {
  const coincideBusqueda = containsNormalized(u.nombre, busqueda.value) || containsNormalized(u.email, busqueda.value)
  return coincideBusqueda && (!filtroRol.value || (u.rol ?? 'activador') === filtroRol.value) &&
    (!filtroEstado.value || (u.estado ?? 'activo') === filtroEstado.value) &&
    (!filtroPlaza.value || u.plaza === filtroPlaza.value)
}))

function requestAdmin(path, options = {}) {
  return adminApiRequest({ baseUrl: apiBaseUrl, path, username: apiUser.value, password: apiPass.value, ...options })
}
function getErrorMessage(error) { return error instanceof Error && error.message ? error.message : 'Se produjo un error inesperado.' }
function etiqueta(valor) { return valor ? valor.charAt(0).toUpperCase() + valor.slice(1) : 'Sin asignar' }
function nombreLider(usuario) { return usuario.lider_id ? (usuariosPorId.value[usuario.lider_id]?.nombre ?? 'Lider no disponible') : 'Sin asignar' }

async function conectarApi() {
  if (!puedeConectar.value) { notifyWarning('Ingresa usuario y password de API.'); return }
  conectando.value = true
  authErrorMsg.value = null
  try {
    await requestAdmin('/admin/healthz')
    setCredentials(apiUser.value, apiPass.value)
    conectado.value = true
    await cargarUsuarios()
    notifySuccess('Conexion con API admin establecida.')
  } catch (error) { conectado.value = false; authErrorMsg.value = getErrorMessage(error); notifyError(authErrorMsg.value) }
  finally { conectando.value = false }
}
async function cargarUsuarios() {
  if (!conectado.value) return
  loading.value = true; errorMsg.value = null
  try { const result = await requestAdmin('/admin/users'); usuarios.value = result.users ?? [] }
  catch (error) { errorMsg.value = getErrorMessage(error); notifyError(errorMsg.value) }
  finally { loading.value = false }
}
function validarFormulario(form, esEdicion = false) {
  if (!form.nombre?.trim() || !normalizeEmail(form.email) || (!esEdicion && !form.password)) return 'Completa todos los campos obligatorios.'
  if (!isValidEmail(normalizeEmail(form.email))) return 'Ingresa un correo valido.'
  if (form.password && form.password.length < 6) return 'La contrasena debe tener al menos 6 caracteres.'
  if (form.estado === 'inhabilitado' && !form.motivo_inhabilitacion?.trim()) return 'Ingresa el motivo de inhabilitacion.'
  return null
}
function payloadUsuario(form) {
  return {
    email: normalizeEmail(form.email), nombre: form.nombre.trim(), plaza: form.plaza?.trim() ?? '',
    rol: form.rol, estado: form.estado, lider_id: form.rol === 'activador' ? form.lider_id || null : null,
    motivo_inhabilitacion: form.estado === 'inhabilitado' ? form.motivo_inhabilitacion.trim() : null,
  }
}
async function registrarUsuario() {
  const mensaje = validarFormulario(nuevo.value)
  if (mensaje) { notifyWarning(mensaje); return }
  procesando.value = true
  try {
    await requestAdmin('/admin/users', { method: 'POST', body: { ...payloadUsuario(nuevo.value), password: nuevo.value.password } })
    nuevo.value = { email: '', password: '', nombre: '', plaza: '', rol: 'activador', estado: 'activo', lider_id: '', motivo_inhabilitacion: '' }
    await cargarUsuarios(); notifySuccess('Usuario registrado correctamente.')
  } catch (error) { notifyError(getErrorMessage(error)) }
  finally { procesando.value = false }
}
function editarUsuario(usuario) {
  editandoId.value = usuario.usuario_id
  edicion.value = { nombre: usuario.nombre ?? '', email: usuario.email ?? '', plaza: usuario.plaza ?? '', password: '', rol: usuario.rol ?? 'activador', estado: usuario.estado ?? 'activo', lider_id: usuario.lider_id ?? '', motivo_inhabilitacion: usuario.motivo_inhabilitacion ?? '' }
}
function cancelarEdicion() { editandoId.value = null; edicion.value = {} }
async function guardarEdicion() {
  const mensaje = validarFormulario(edicion.value, true)
  if (mensaje) { notifyWarning(mensaje); return }
  procesando.value = true
  const payload = payloadUsuario(edicion.value)
  if (edicion.value.password) payload.password = edicion.value.password
  try {
    await requestAdmin(`/admin/users/${editandoId.value}`, { method: 'PATCH', body: payload })
    cancelarEdicion(); await cargarUsuarios(); notifySuccess('Usuario actualizado correctamente.')
  } catch (error) { notifyError(getErrorMessage(error)) }
  finally { procesando.value = false }
}
function abrirInhabilitacion(usuario) { usuarioAInhabilitar.value = usuario; motivoInhabilitar.value = ''; modalInhabilitar.value = true }
function cerrarInhabilitacion() { if (!procesando.value) { modalInhabilitar.value = false; usuarioAInhabilitar.value = null; motivoInhabilitar.value = '' } }
async function confirmarInhabilitacion() {
  const motivo = motivoInhabilitar.value.trim()
  if (!motivo) { notifyWarning('El motivo de inhabilitacion es obligatorio.'); return }
  procesando.value = true
  try {
    await requestAdmin(`/admin/users/${usuarioAInhabilitar.value.usuario_id}/status`, { method: 'PATCH', body: { estado: 'inhabilitado', motivo_inhabilitacion: motivo } })
    modalInhabilitar.value = false; usuarioAInhabilitar.value = null; motivoInhabilitar.value = ''
    await cargarUsuarios(); notifySuccess('Usuario inhabilitado correctamente.')
  } catch (error) { notifyError(getErrorMessage(error)) }
  finally { procesando.value = false }
}
async function activarUsuario(usuario) {
  const aceptado = await requestConfirmation({ title: 'Activar usuario', message: `Se activara a ${usuario.nombre ?? 'este usuario'}.`, confirmLabel: 'Activar' })
  if (!aceptado) return
  procesando.value = true
  try {
    await requestAdmin(`/admin/users/${usuario.usuario_id}/status`, { method: 'PATCH', body: { estado: 'activo' } })
    await cargarUsuarios(); notifySuccess('Usuario activado correctamente.')
  } catch (error) { notifyError(getErrorMessage(error)) }
  finally { procesando.value = false }
}
</script>

<template>
  <section class="view-page contenedor-usuarios">
    <header class="view-header">
      <p class="view-kicker">Control de Accesos</p><h1 class="view-title">Gestion de Usuarios</h1>
      <p class="view-description">Administra el equipo operativo conectado a la base principal de activaciones.</p>
      <div class="meta-row"><span class="meta-pill" :class="{ 'meta-pill-ok': conectado }">{{ conectado ? 'API conectada' : 'API desconectada' }}</span></div>
    </header>
    <div class="forms-grid">
      <div class="formulario-registro">
        <h2 class="subtitulo">Conexion API Admin</h2>
        <form class="formulario-campos" @submit.prevent="conectarApi">
          <input v-model="apiUser" placeholder="Usuario API" class="input-texto"><input v-model="apiPass" type="password" placeholder="Password API" class="input-texto">
          <button type="submit" class="boton boton-primario" :disabled="conectando || !puedeConectar">{{ conectando ? 'Conectando...' : 'Conectar' }}</button>
          <p v-if="authErrorMsg" class="mensaje-error">{{ authErrorMsg }}</p><p v-else-if="conectado">Conectado a {{ apiBaseUrl }}</p>
        </form>
      </div>
      <div v-if="conectado" class="formulario-registro">
        <h2 class="subtitulo">Registrar Usuario</h2>
        <form class="formulario-campos" @submit.prevent="registrarUsuario">
          <input v-model="nuevo.email" type="email" placeholder="Correo electronico" class="input-texto"><input v-model="nuevo.password" type="password" placeholder="Contrasena" class="input-texto">
          <input v-model="nuevo.nombre" placeholder="Nombre completo" class="input-texto"><input v-model="nuevo.plaza" placeholder="Plaza (opcional)" class="input-texto">
          <select v-model="nuevo.rol" class="input-texto"><option v-for="rol in roles" :key="rol" :value="rol">{{ etiqueta(rol) }}</option></select>
          <select v-model="nuevo.estado" class="input-texto"><option v-for="estado in estados" :key="estado" :value="estado">{{ etiqueta(estado) }}</option></select>
          <select v-if="nuevo.rol === 'activador'" v-model="nuevo.lider_id" class="input-texto"><option value="">Sin lider</option><option v-for="lider in lideresActivos" :key="lider.usuario_id" :value="lider.usuario_id">{{ lider.nombre }}</option></select>
          <textarea v-if="nuevo.estado === 'inhabilitado'" v-model="nuevo.motivo_inhabilitacion" class="input-texto" placeholder="Motivo de inhabilitacion"></textarea>
          <button type="submit" class="boton boton-primario" :disabled="procesando">{{ procesando ? 'Guardando...' : 'Registrar' }}</button>
        </form>
      </div>
    </div>
    <div v-if="conectado" class="panel-card tabla-contenedor">
      <div class="toolbar-line"><h2 class="subtitulo subtitulo-inline">Usuarios Registrados</h2><div class="toolbar-actions"><span class="meta-pill">{{ usuariosFiltrados.length }} visibles</span><button class="boton" :disabled="loading || procesando" @click="cargarUsuarios">Recargar</button></div></div>
      <div class="filtros filtros-grid filtros-usuarios">
        <label><span class="field-label">Nombre o correo</span><input v-model="busqueda" class="input-texto" placeholder="Buscar usuario"></label>
        <label><span class="field-label">Rol</span><select v-model="filtroRol" class="input-texto"><option value="">Todos</option><option v-for="rol in roles" :key="rol" :value="rol">{{ etiqueta(rol) }}</option></select></label>
        <label><span class="field-label">Estado</span><select v-model="filtroEstado" class="input-texto"><option value="">Todos</option><option v-for="estado in estados" :key="estado" :value="estado">{{ etiqueta(estado) }}</option></select></label>
        <label><span class="field-label">Plaza</span><select v-model="filtroPlaza" class="input-texto"><option value="">Todas</option><option v-for="item in plazas" :key="item" :value="item">{{ item }}</option></select></label>
      </div>
      <p v-if="loading">Cargando usuarios...</p><p v-else-if="errorMsg" class="mensaje-error">{{ errorMsg }}</p><p v-else-if="!usuariosFiltrados.length" class="panel-empty">No hay usuarios para los filtros seleccionados.</p>
      <div v-else class="table-wrap modulo-table-wrap"><table class="tabla-usuarios"><thead><tr><th>Nombre</th><th>Correo</th><th>Plaza</th><th>Rol</th><th>Estado</th><th>Lider</th><th>Nueva contrasena</th><th>Acciones</th></tr></thead><tbody>
        <tr v-for="usuario in usuariosFiltrados" :key="usuario.usuario_id">
          <template v-if="editandoId === usuario.usuario_id">
            <td><input v-model="edicion.nombre" class="input-editar"></td><td><input v-model="edicion.email" type="email" class="input-editar"></td><td><input v-model="edicion.plaza" class="input-editar"></td>
            <td><select v-model="edicion.rol" class="input-editar"><option v-for="rol in roles" :key="rol" :value="rol">{{ etiqueta(rol) }}</option></select></td>
            <td><select v-model="edicion.estado" class="input-editar"><option v-for="estado in estados" :key="estado" :value="estado">{{ etiqueta(estado) }}</option></select><textarea v-if="edicion.estado === 'inhabilitado'" v-model="edicion.motivo_inhabilitacion" class="input-editar" placeholder="Motivo obligatorio"></textarea></td>
            <td><select v-if="edicion.rol === 'activador'" v-model="edicion.lider_id" class="input-editar"><option value="">Sin lider</option><option v-for="lider in lideresActivos" :key="lider.usuario_id" :value="lider.usuario_id">{{ lider.nombre }}</option></select><span v-else>Sin asignar</span></td>
            <td><input v-model="edicion.password" type="password" class="input-editar" placeholder="Opcional (min. 6)"></td><td><div class="acciones"><button class="boton boton-guardar" :disabled="procesando" @click="guardarEdicion">Guardar</button><button class="boton boton-cancelar" :disabled="procesando" @click="cancelarEdicion">Cancelar</button></div></td>
          </template>
          <template v-else>
            <td>{{ usuario.nombre || 'Sin nombre' }}</td><td>{{ usuario.email || 'Sin correo' }}</td><td>{{ usuario.plaza || 'Sin plaza' }}</td><td>{{ etiqueta(usuario.rol ?? 'activador') }}</td>
            <td><span class="estado-etiqueta" :class="`estado-${usuario.estado ?? 'activo'}`">{{ etiqueta(usuario.estado ?? 'activo') }}</span></td><td>{{ nombreLider(usuario) }}</td><td>-</td>
            <td><div class="acciones"><button class="boton boton-editar" :disabled="procesando" @click="editarUsuario(usuario)">Editar</button><button v-if="(usuario.estado ?? 'activo') === 'activo'" class="boton boton-eliminar" :disabled="procesando" @click="abrirInhabilitacion(usuario)">Inhabilitar</button><button v-else class="boton boton-guardar" :disabled="procesando" @click="activarUsuario(usuario)">Activar</button></div></td>
          </template>
        </tr>
      </tbody></table></div>
    </div>
    <teleport to="body"><div v-if="modalInhabilitar" class="confirm-overlay" @click.self="cerrarInhabilitacion"><section class="confirm-modal" role="dialog" aria-modal="true" aria-label="Inhabilitar usuario"><h3 class="confirm-title">Inhabilitar usuario</h3><p class="confirm-message">Indica por que se inhabilitara a {{ usuarioAInhabilitar?.nombre ?? 'este usuario' }}.</p><textarea v-model="motivoInhabilitar" class="input-texto" placeholder="Motivo obligatorio" rows="4"></textarea><div class="confirm-actions"><button class="boton boton-cancelar" :disabled="procesando" @click="cerrarInhabilitacion">Cancelar</button><button class="boton boton-eliminar" :disabled="procesando || !motivoInhabilitar.trim()" @click="confirmarInhabilitacion">{{ procesando ? 'Guardando...' : 'Inhabilitar' }}</button></div></section></div></teleport>
  </section>
</template>
