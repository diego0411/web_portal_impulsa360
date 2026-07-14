<script setup>
import { computed, onMounted, ref } from 'vue'
import { portalRequest } from '../lib/activacionesService'
import { supabase } from '../lib/supabaseClient'
import { AUTH_ENABLED } from '../lib/featureFlags'
import { containsNormalized } from '../lib/textUtils'

const impulsadores = ref([])
const loading = ref(true)
const errorMsg = ref(null)
const filtroNombre = ref('')
const filtroEmail = ref('')
const filtroPlaza = ref('')

function nombreLider(impulsador) {
  if (!impulsador.lider_id) return '-'
  return impulsador.lider_nombre || impulsadores.value.find((item) => item.usuario_id === impulsador.lider_id)?.nombre || 'No disponible'
}

const impulsadoresFiltrados = computed(() => {
  return impulsadores.value.filter((impulsador) => {
    const coincideNombre = containsNormalized(impulsador.nombre, filtroNombre.value)
    const coincideEmail = containsNormalized(impulsador.email, filtroEmail.value)
    const coincidePlaza = containsNormalized(impulsador.plaza, filtroPlaza.value)

    return coincideNombre && coincideEmail && coincidePlaza
  })
})

onMounted(async () => {
  loading.value = true
  errorMsg.value = null

  try {
    if (AUTH_ENABLED) {
      const data = await portalRequest('/portal/users')
      impulsadores.value = data.users ?? []
    } else {
      const { data, error } = await supabase.from('activadores').select('usuario_id,nombre,email,plaza,rol,estado,lider_id').order('nombre')
      if (error) throw error
      impulsadores.value = data ?? []
    }
  } catch (error) {
    console.error('Error al cargar impulsadores:', error)
    errorMsg.value = 'Error al obtener los impulsadores.'
  }

  loading.value = false
})
</script>

<template>
  <div class="contenedor-impulsadores section-block">
    <div class="section-head">
      <h2 class="section-title">Lista de Impulsadores Registrados</h2>
      <p class="section-caption">Usuarios disponibles para la operacion en campo.</p>
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

    <div class="toolbar-line">
      <span class="meta-pill">{{ impulsadoresFiltrados.length }} visibles</span>
    </div>

    <p v-if="loading">Cargando...</p>
    <p v-else-if="errorMsg" class="mensaje-error">{{ errorMsg }}</p>
    <p v-else-if="impulsadoresFiltrados.length === 0" class="panel-empty">
      No hay impulsadores para los filtros seleccionados.
    </p>

    <div v-else class="table-wrap modulo-table-wrap">
      <table class="tabla-impulsadores">
        <thead>
          <tr>
            <th>#</th>
            <th>Nombre</th>
            <th>Email</th>
            <th>Plaza</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Lider</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(impulsador, index) in impulsadoresFiltrados"
            :key="impulsador.usuario_id"
          >
            <td>{{ index + 1 }}</td>
            <td>{{ impulsador.nombre }}</td>
            <td>{{ impulsador.email }}</td>
            <td>{{ impulsador.plaza }}</td>
            <td>{{ impulsador.rol || '-' }}</td>
            <td><span class="scope-pill" :class="impulsador.estado === 'inhabilitado' ? 'scope-pill-user' : 'scope-pill-all'">{{ impulsador.estado || 'Sin estado' }}</span></td>
            <td>{{ nombreLider(impulsador) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
