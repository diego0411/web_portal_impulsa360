<script setup>
import { computed, onMounted, ref } from 'vue'
import { adminApiRequest } from '../lib/adminApiClient'
import { useAuth } from '../lib/authStore'
import { notifyError, notifySuccess, notifyWarning, requestConfirmation } from '../lib/feedback'
import { deduplicarPlazasCatalogo } from '../lib/plazas'

const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')
const { session } = useAuth()
const catalogo = ref({ available: false, message: '', equipos: [], plazas: [], facturadores: [] })
const usuarios = ref([])
const loading = ref(false)
const procesando = ref(false)
const nuevo = ref({ numero: '', plaza_id: '', lider_id: '' })
const editandoId = ref(null)
const edicion = ref({})
const detalle = ref(null)

const lideres = computed(() => usuarios.value.filter((u) => rolesUsuario(u).includes('lider') && u.estado === 'activo'))
const plazasCatalogo = computed(() => deduplicarPlazasCatalogo(catalogo.value.plazas))
const usuariosPorId = computed(() => Object.fromEntries(usuarios.value.map((u) => [u.usuario_id, u])))
const plazasPorId = computed(() => Object.fromEntries(plazasCatalogo.value.map((p) => [p.id, p])))
const facturadoresPorId = computed(() => Object.fromEntries((catalogo.value.facturadores ?? []).map((f) => [f.id, f])))

function request(path, options = {}) {
  return adminApiRequest({ baseUrl: apiBaseUrl, path, token: session.value?.access_token, ...options })
}
function errorMessage(error) { return error instanceof Error ? error.message : 'Error inesperado.' }
function normalizarRol(value) { return String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() }
function rolesUsuario(usuario) { return Array.isArray(usuario?.roles) ? usuario.roles.map(normalizarRol) : [normalizarRol(usuario?.rol)] }
function liderNombre(id) { return id ? (usuariosPorId.value[id]?.nombre ?? 'Lider no disponible') : 'Sin lider' }
function facturadorNombre(id) { return id ? (facturadoresPorId.value[id]?.nombre ?? 'Facturador no disponible') : 'Sin facturador' }
function numeroEquipoValido(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0 }
function numeroDuplicado(value, exceptoId = null) {
  const numero = Number(value)
  return catalogo.value.equipos.some((team) => Number(team.numero) === numero && team.id !== exceptoId)
}

async function cargar() {
  loading.value = true
  try {
    const [teams, users] = await Promise.all([request('/admin/teams'), request('/admin/users')])
    catalogo.value = teams
    usuarios.value = users.users ?? []
  } catch (error) { notifyError(errorMessage(error)) }
  finally { loading.value = false }
}

async function crear() {
  if (!numeroEquipoValido(nuevo.value.numero)) {
    notifyWarning('Número de equipo es obligatorio.'); return
  }
  if (!nuevo.value.plaza_id) {
    notifyWarning('Plaza es obligatoria.'); return
  }
  if (numeroDuplicado(nuevo.value.numero)) {
    notifyWarning('Ya existe un equipo con ese número.'); return
  }
  procesando.value = true
  try {
    await request('/admin/teams', { method: 'POST', body: nuevo.value })
    nuevo.value = { numero: '', plaza_id: '', lider_id: '' }
    await cargar(); notifySuccess('Equipo creado correctamente.')
  } catch (error) { notifyError(errorMessage(error)) }
  finally { procesando.value = false }
}

function editar(team) {
  editandoId.value = team.id
  edicion.value = {
    numero: team.numero, nombre: team.nombre, plaza_id: team.plaza_id ?? '',
    lider_id: team.lider_actual_id ?? '', facturador_id: team.facturador_id ?? '', activo: team.activo,
  }
}
function cancelar() { editandoId.value = null; edicion.value = {} }
async function guardar(team) {
  if (!numeroEquipoValido(edicion.value.numero)) {
    notifyWarning('Número de equipo es obligatorio.'); return
  }
  if (!edicion.value.plaza_id) {
    notifyWarning('Plaza es obligatoria.'); return
  }
  if (numeroDuplicado(edicion.value.numero, team.id)) {
    notifyWarning('Ya existe un equipo con ese número.'); return
  }
  procesando.value = true
  try {
    await request(`/admin/teams/${team.id}`, { method: 'PATCH', body: edicion.value })
    cancelar(); await cargar(); notifySuccess('Equipo actualizado correctamente.')
  } catch (error) { notifyError(errorMessage(error)) }
  finally { procesando.value = false }
}
async function cambiarEstado(team) {
  procesando.value = true
  try {
    await request(`/admin/teams/${team.id}`, { method: 'PATCH', body: {
      numero: team.numero, nombre: team.nombre, plaza_id: team.plaza_id,
      facturador_id: team.facturador_id ?? null, lider_id: team.lider_actual_id, activo: !team.activo,
    } })
    await cargar(); notifySuccess(team.activo ? 'Equipo desactivado.' : 'Equipo activado.')
  } catch (error) { notifyError(errorMessage(error)) }
  finally { procesando.value = false }
}
async function verDetalle(team) {
  try {
    const result = await request(`/admin/teams/${team.id}`)
    detalle.value = { team, ...result }
  } catch (error) { notifyError(errorMessage(error)) }
}

async function eliminarEquipo(team) {
  const ok = await requestConfirmation({ title: `Eliminar equipo #${team.numero}`, message: '¿Está seguro de que desea eliminar definitivamente este registro? Esta acción no se puede deshacer.', confirmLabel: 'Eliminar definitivamente', cancelLabel: 'Cancelar', tone: 'danger' })
  if (!ok) return
  procesando.value = true
  try {
    const result = await request(`/admin/teams/${team.id}`, { method: 'DELETE' })
    await cargar()
    notifySuccess(result.message ?? (result.deleted ? 'Equipo eliminado.' : 'Equipo inactivado.'))
  } catch (error) { notifyError(error?.status === 409 ? (error.message && !error.message.startsWith('Error HTTP') ? error.message : 'No se puede eliminar este registro porque tiene información relacionada. Puede deshabilitarlo para conservar el historial.') : errorMessage(error)) }
  finally { procesando.value = false }
}

onMounted(cargar)
</script>

<template>
  <section class="view-page">
    <header class="view-header"><p class="view-kicker">Organizacion</p><h1 class="view-title">Equipos</h1><p class="view-description">Gestiona equipos estables, responsables e historial de liderazgo.</p></header>
    <p v-if="catalogo.message" class="panel-empty">{{ catalogo.message }}</p>
    <div v-if="catalogo.available" class="forms-grid">
      <div class="formulario-registro"><h2 class="subtitulo">Crear equipo</h2><form class="formulario-campos" @submit.prevent="crear">
        <input v-model.number="nuevo.numero" type="number" min="1" step="1" class="input-texto" placeholder="Número de equipo">
        <select v-model="nuevo.plaza_id" class="input-texto"><option value="">Plaza</option><option v-for="item in plazasCatalogo" :key="item.id" :value="item.id">{{ item.nombre }}</option></select>
        <select v-model="nuevo.lider_id" class="input-texto"><option value="">Sin lider</option><option v-for="item in lideres" :key="item.usuario_id" :value="item.usuario_id">{{ item.nombre }}</option></select>
        <button class="boton boton-primario" :disabled="procesando">Crear equipo</button>
      </form></div>
    </div>
    <p v-if="loading">Cargando equipos...</p>
    <div v-else-if="catalogo.available" class="panel-card tabla-contenedor">
      <div class="toolbar-line"><h2 class="subtitulo subtitulo-inline">Equipos registrados</h2><span class="meta-pill">{{ catalogo.equipos.length }}</span></div>
      <div class="table-wrap modulo-table-wrap"><table><thead><tr><th>Número</th><th>Plaza</th><th>Líder actual</th><th>Facturador</th><th>Integrantes</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        <tr v-for="team in catalogo.equipos" :key="team.id">
          <template v-if="editandoId === team.id">
            <td><input v-model.number="edicion.numero" type="number" min="1" step="1" class="input-editar"></td>
            <td><select v-model="edicion.plaza_id" class="input-editar"><option value="">Plaza</option><option v-for="item in plazasCatalogo" :key="item.id" :value="item.id">{{ item.nombre }}</option></select></td>
            <td><select v-model="edicion.lider_id" class="input-editar"><option value="">Sin lider</option><option v-for="item in lideres" :key="item.usuario_id" :value="item.usuario_id">{{ item.nombre }}</option></select></td>
            <td><select v-model="edicion.facturador_id" class="input-editar"><option value="">Sin facturador</option><option v-for="item in catalogo.facturadores" :key="item.id" :value="item.id">{{ item.nombre }}</option></select></td>
            <td>{{ team.integrantes }}</td><td><select v-model="edicion.activo" class="input-editar"><option :value="true">Activo</option><option :value="false">Inactivo</option></select></td>
            <td><button class="boton boton-guardar" :disabled="procesando" @click="guardar(team)">Guardar</button><button class="boton boton-cancelar" @click="cancelar">Cancelar</button></td>
          </template>
          <template v-else>
            <td>#{{ team.numero }}</td><td>{{ plazasPorId[team.plaza_id]?.nombre ?? '-' }}</td><td>{{ liderNombre(team.lider_actual_id) }}</td><td>{{ facturadorNombre(team.facturador_id) }}</td><td>{{ team.integrantes }}</td>
            <td><span class="scope-pill" :class="team.activo ? 'scope-pill-all' : 'scope-pill-user'">{{ team.activo ? 'Activo' : 'Inactivo' }}</span></td>
            <td><button class="boton" @click="verDetalle(team)">Ver</button><button class="boton boton-editar" @click="editar(team)">Editar</button><button class="boton" :disabled="procesando" @click="cambiarEstado(team)">{{ team.activo ? 'Desactivar' : 'Activar' }}</button><button class="boton boton-eliminar" :disabled="procesando" @click="eliminarEquipo(team)">Eliminar</button></td>
          </template>
        </tr>
      </tbody></table></div>
    </div>
    <teleport to="body"><div v-if="detalle" class="confirm-overlay" @click.self="detalle = null"><section class="confirm-modal" role="dialog" aria-modal="true"><h3 class="confirm-title">Equipo #{{ detalle.team.numero }}</h3>
      <h4>Integrantes</h4><p v-if="!detalle.integrantes?.length" class="panel-empty">Sin integrantes.</p><ul v-else><li v-for="item in detalle.integrantes" :key="item.usuario_id">{{ item.nombre }} — {{ item.estado }}</li></ul>
      <h4>Historial de líderes</h4><p v-if="!detalle.historial?.length" class="panel-empty">Sin historial.</p><ul v-else><li v-for="item in detalle.historial" :key="item.id">{{ liderNombre(item.lider_id) }} — {{ new Date(item.inicio).toLocaleString() }} a {{ item.fin ? new Date(item.fin).toLocaleString() : 'vigente' }}</li></ul>
      <div class="confirm-actions"><button class="boton" @click="detalle = null">Cerrar</button></div>
    </section></div></teleport>
  </section>
</template>
