<script setup>
import { computed, onMounted, ref } from 'vue'
import { adminApiRequest } from '../lib/adminApiClient'
import { useAuth } from '../lib/authStore'
import { notifyError, notifySuccess, notifyWarning } from '../lib/feedback'

const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')
const { session } = useAuth()
const catalogo = ref({ available: false, message: '', equipos: [], plazas: [], facturadores: [] })
const usuarios = ref([])
const loading = ref(false)
const procesando = ref(false)
const nuevo = ref({ plaza_id: '', facturador_id: '', lider_id: '' })
const editandoId = ref(null)
const edicion = ref({})
const detalle = ref(null)

const lideres = computed(() => usuarios.value.filter((u) => u.rol === 'lider' && u.estado === 'activo'))
const usuariosPorId = computed(() => Object.fromEntries(usuarios.value.map((u) => [u.usuario_id, u])))
const plazasPorId = computed(() => Object.fromEntries(catalogo.value.plazas.map((p) => [p.id, p])))
const facturadoresPorId = computed(() => Object.fromEntries(catalogo.value.facturadores.map((f) => [f.id, f])))

function request(path, options = {}) {
  return adminApiRequest({ baseUrl: apiBaseUrl, path, token: session.value?.access_token, ...options })
}
function errorMessage(error) { return error instanceof Error ? error.message : 'Error inesperado.' }
function liderNombre(id) { return id ? (usuariosPorId.value[id]?.nombre ?? 'Lider no disponible') : 'Sin lider' }

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
  if (!nuevo.value.plaza_id || !nuevo.value.facturador_id) {
    notifyWarning('Plaza y facturador son obligatorios.'); return
  }
  procesando.value = true
  try {
    await request('/admin/teams', { method: 'POST', body: nuevo.value })
    nuevo.value = { plaza_id: '', facturador_id: '', lider_id: '' }
    await cargar(); notifySuccess('Equipo creado correctamente.')
  } catch (error) { notifyError(errorMessage(error)) }
  finally { procesando.value = false }
}

function editar(team) {
  editandoId.value = team.id
  edicion.value = { nombre: team.nombre, facturador_id: team.facturador_id, lider_id: team.lider_actual_id ?? '', activo: team.activo }
}
function cancelar() { editandoId.value = null; edicion.value = {} }
async function guardar(team) {
  if (!edicion.value.facturador_id) { notifyWarning('Facturador es obligatorio.'); return }
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
      nombre: team.nombre, facturador_id: team.facturador_id,
      lider_id: team.lider_actual_id, activo: !team.activo,
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

onMounted(cargar)
</script>

<template>
  <section class="view-page">
    <header class="view-header"><p class="view-kicker">Organizacion</p><h1 class="view-title">Equipos</h1><p class="view-description">Gestiona equipos estables, responsables e historial de liderazgo.</p></header>
    <p v-if="catalogo.message" class="panel-empty">{{ catalogo.message }}</p>
    <div v-if="catalogo.available" class="forms-grid">
      <div class="formulario-registro"><h2 class="subtitulo">Crear equipo</h2><form class="formulario-campos" @submit.prevent="crear">
        <select v-model="nuevo.plaza_id" class="input-texto"><option value="">Plaza</option><option v-for="item in catalogo.plazas" :key="item.id" :value="item.id">{{ item.nombre }}</option></select>
        <select v-model="nuevo.facturador_id" class="input-texto"><option value="">Facturador</option><option v-for="item in catalogo.facturadores" :key="item.id" :value="item.id">{{ item.nombre }}</option></select>
        <select v-model="nuevo.lider_id" class="input-texto"><option value="">Sin lider</option><option v-for="item in lideres" :key="item.usuario_id" :value="item.usuario_id">{{ item.nombre }}</option></select>
        <button class="boton boton-primario" :disabled="procesando">Crear equipo</button>
      </form></div>
    </div>
    <p v-if="loading">Cargando equipos...</p>
    <div v-else-if="catalogo.available" class="panel-card tabla-contenedor">
      <div class="toolbar-line"><h2 class="subtitulo subtitulo-inline">Equipos registrados</h2><span class="meta-pill">{{ catalogo.equipos.length }}</span></div>
      <div class="table-wrap modulo-table-wrap"><table><thead><tr><th>Número</th><th>Plaza</th><th>Facturador</th><th>Líder actual</th><th>Integrantes</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        <tr v-for="team in catalogo.equipos" :key="team.id">
          <template v-if="editandoId === team.id">
            <td>#{{ team.numero }}</td><td>{{ plazasPorId[team.plaza_id]?.nombre ?? '-' }}</td>
            <td><select v-model="edicion.facturador_id" class="input-editar"><option v-for="item in catalogo.facturadores" :key="item.id" :value="item.id">{{ item.nombre }}</option></select></td>
            <td><select v-model="edicion.lider_id" class="input-editar"><option value="">Sin lider</option><option v-for="item in lideres" :key="item.usuario_id" :value="item.usuario_id">{{ item.nombre }}</option></select></td>
            <td>{{ team.integrantes }}</td><td><select v-model="edicion.activo" class="input-editar"><option :value="true">Activo</option><option :value="false">Inactivo</option></select></td>
            <td><button class="boton boton-guardar" :disabled="procesando" @click="guardar(team)">Guardar</button><button class="boton boton-cancelar" @click="cancelar">Cancelar</button></td>
          </template>
          <template v-else>
            <td>#{{ team.numero }}</td><td>{{ plazasPorId[team.plaza_id]?.nombre ?? '-' }}</td><td>{{ facturadoresPorId[team.facturador_id]?.nombre ?? '-' }}</td><td>{{ liderNombre(team.lider_actual_id) }}</td><td>{{ team.integrantes }}</td>
            <td><span class="scope-pill" :class="team.activo ? 'scope-pill-all' : 'scope-pill-user'">{{ team.activo ? 'Activo' : 'Inactivo' }}</span></td>
            <td><button class="boton" @click="verDetalle(team)">Ver</button><button class="boton boton-editar" @click="editar(team)">Editar</button><button class="boton" :disabled="procesando" @click="cambiarEstado(team)">{{ team.activo ? 'Desactivar' : 'Activar' }}</button></td>
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
