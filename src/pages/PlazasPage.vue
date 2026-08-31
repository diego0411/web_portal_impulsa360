<script setup>
import Plazas from '../components/Plazas.vue'
</script>

<template>
  <section class="view-page">
    <header class="view-header">
      <p class="view-kicker">Organizacion</p>
      <h1 class="view-title">Plazas</h1>
      <p class="view-description">Administra el catálogo de plazas activas en el sistema.</p>
    </header>

    <div class="panel-card">
      <Plazas />
    </div>
  </section>
</template>
