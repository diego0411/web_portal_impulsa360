<script setup>
import { ref, onMounted } from 'vue'
import { adminApiRequest } from '../lib/adminApiClient'
import { useAuth } from '../lib/authStore'
import { notifyError, notifySuccess, notifyWarning, requestConfirmation } from '../lib/feedback'

const apiBaseUrl = (import.meta.env.VITE_ADMIN_API_URL ?? '/api').replace(/\/$/, '')
const { session } = useAuth()
const plazas = ref([])
const loading = ref(false)
const procesando = ref(false)
const nuevo = ref({ nombre: '' })
const editandoId = ref(null)
const edicion = ref({})
const eliminandoId = ref(null)

function request(path, options = {}) {
  return adminApiRequest({ baseUrl: apiBaseUrl, path, token: session.value?.access_token, ...options })
}

function errorMessage(error) { return error instanceof Error ? error.message : 'Error inesperado.' }

async function cargar() {
  loading.value = true
  try {
    const result = await request('/admin/plazas')
    plazas.value = result.plazas ?? []
  } catch (error) { notifyError(errorMessage(error)) }
  finally { loading.value = false }
}

async function crear() {
  if (!nuevo.value.nombre.trim()) { notifyWarning('Nombre de plaza es obligatorio.'); return }
  procesando.value = true
  try {
    await request('/admin/plazas', { method: 'POST', body: { nombre: nuevo.value.nombre.trim() } })
    nuevo.value = { nombre: '' }
    await cargar(); notifySuccess('Plaza creada correctamente.')
  } catch (error) { notifyError(errorMessage(error)) }
  finally { procesando.value = false }
}

function editar(plaza) {
  editandoId.value = plaza.id
  edicion.value = { nombre: plaza.nombre, activa: plaza.activa }
}
function cancelar() { editandoId.value = null; edicion.value = {} }
async function guardar(plaza) {
  if (!edicion.value.nombre || typeof edicion.value.activa !== 'boolean') { notifyWarning('Nombre y estado son obligatorios.'); return }
  procesando.value = true
  try {
    await request(`/admin/plazas/${plaza.id}`, { method: 'PATCH', body: { nombre: edicion.value.nombre, activa: edicion.value.activa } })
    cancelar(); await cargar(); notifySuccess('Plaza actualizada correctamente.')
  } catch (error) { notifyError(errorMessage(error)) }
  finally { procesando.value = false }
}

async function cambiarEstado(plaza) {
  procesando.value = true
  try {
    await request(`/admin/plazas/${plaza.id}`, { method: 'PATCH', body: { activa: !plaza.activa } })
    await cargar(); notifySuccess(plaza.activa ? 'Plaza desactivada.' : 'Plaza activada.')
  } catch (error) { notifyError(errorMessage(error)) }
  finally { procesando.value = false }
}

async function eliminarPlaza(plaza) {
  const confirm = await requestConfirmation({ title: 'Eliminar plaza', message: '¿Está seguro de que desea eliminar definitivamente este registro? Esta acción no se puede deshacer.', confirmLabel: 'Eliminar definitivamente', cancelLabel: 'Cancelar', tone: 'danger' })
  if (!confirm) return
  eliminandoId.value = plaza.id
  procesando.value = true
  try {
    const result = await request(`/admin/plazas/${plaza.id}`, { method: 'DELETE' })
    await cargar();
    notifySuccess(result.message ?? 'Operación realizada.')
  } catch (error) { notifyError(errorMessage(error)) }
  finally { procesando.value = false; eliminandoId.value = null }
}

onMounted(cargar)
</script>

<template>
  <section class="view-page">
    <header class="view-header"><p class="view-kicker">Organizacion</p><h1 class="view-title">Plazas</h1><p class="view-description">Gestiona el catálogo de plazas del sistema.</p></header>
    <div class="forms-grid">
      <div class="formulario-registro"><h2 class="subtitulo">Crear plaza</h2><form class="formulario-campos" @submit.prevent="crear">
        <input v-model="nuevo.nombre" placeholder="Nombre de plaza" class="input-texto">
        <button class="boton boton-primario" :disabled="procesando">Crear plaza</button>
      </form></div>
    </div>

    <p v-if="loading">Cargando plazas...</p>
    <div v-else class="panel-card tabla-contenedor">
      <div class="toolbar-line"><h2 class="subtitulo subtitulo-inline">Plazas</h2><span class="meta-pill">{{ plazas.length }}</span></div>
      <div class="table-wrap modulo-table-wrap"><table><thead><tr><th>Nombre</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        <tr v-for="plaza in plazas" :key="plaza.id">
          <template v-if="editandoId === plaza.id">
            <td><input v-model="edicion.nombre" class="input-editar"></td>
            <td><select v-model="edicion.activa" class="input-editar"><option :value="true">Activa</option><option :value="false">Inactiva</option></select></td>
            <td><button class="boton boton-guardar" :disabled="procesando" @click="guardar(plaza)">Guardar</button><button class="boton boton-cancelar" @click="cancelar">Cancelar</button></td>
          </template>
          <template v-else>
            <td>{{ plaza.nombre }}</td>
            <td><span class="scope-pill" :class="plaza.activa ? 'scope-pill-all' : 'scope-pill-user'">{{ plaza.activa ? 'Activa' : 'Inactiva' }}</span></td>
            <td>
              <button class="boton boton-editar" @click="editar(plaza)">Editar</button>
              <button class="boton" :disabled="procesando" @click="cambiarEstado(plaza)">{{ plaza.activa ? 'Desactivar' : 'Activar' }}</button>
              <button class="boton boton-eliminar" :disabled="procesando || eliminandoId===plaza.id" @click="eliminarPlaza(plaza)">{{ eliminandoId===plaza.id ? 'Procesando...' : 'Eliminar' }}</button>
            </td>
          </template>
        </tr>
      </tbody></table></div>
    </div>
  </section>
</template>
