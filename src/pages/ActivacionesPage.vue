<script setup>
import { onMounted, ref } from 'vue'
import ActivacionesTable from '../components/ActivacionesTable.vue'
import { fetchAllActivaciones } from '../lib/activacionesService'

const activaciones = ref([])
const loading = ref(true)
const errorMsg = ref(null)

onMounted(async () => {
  loading.value = true
  errorMsg.value = null

  try {
    activaciones.value = await fetchAllActivaciones()
  } catch (error) {
    console.error('Error al obtener activaciones:', error)
    errorMsg.value = 'Error al obtener activaciones.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="view-page">
    <header class="view-header">
      <p class="view-kicker">Field Command</p>
      <h1 class="view-title">Control de Activaciones</h1>
      <p class="view-description">
        Monitorea registros en tiempo real, filtra por plaza e impulsador y exporta cortes operativos.
      </p>
      <div class="meta-row">
        <span class="meta-pill">
          {{ loading ? 'Sincronizando...' : `${activaciones.length} registros cargados` }}
        </span>
      </div>
    </header>

    <div class="panel-card">
      <p v-if="loading">Cargando datos...</p>
      <p v-else-if="errorMsg" class="mensaje-error">{{ errorMsg }}</p>
      <ActivacionesTable v-else :activaciones="activaciones" />
    </div>
  </section>
</template>
