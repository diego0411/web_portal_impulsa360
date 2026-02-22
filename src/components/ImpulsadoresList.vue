<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabaseClient'
import { containsNormalized } from '../lib/textUtils'

const impulsadores = ref([])
const loading = ref(true)
const errorMsg = ref(null)
const filtroNombre = ref('')
const filtroEmail = ref('')
const filtroPlaza = ref('')

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

  const { data, error } = await supabase
    .from('activadores')
    .select('usuario_id, nombre, email, plaza')
    .order('nombre', { ascending: true })

  if (error) {
    console.error('Error al cargar impulsadores:', error)
    errorMsg.value = 'Error al obtener los impulsadores.'
  } else {
    impulsadores.value = data ?? []
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
            <th>Usuario ID</th>
            <th>Nombre</th>
            <th>Email</th>
            <th>Plaza</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(impulsador, index) in impulsadoresFiltrados"
            :key="impulsador.usuario_id"
          >
            <td>{{ index + 1 }}</td>
            <td>{{ impulsador.usuario_id }}</td>
            <td>{{ impulsador.nombre }}</td>
            <td>{{ impulsador.email }}</td>
            <td>{{ impulsador.plaza }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
