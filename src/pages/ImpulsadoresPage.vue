<script setup>
import ImpulsadoresList from '../components/ImpulsadoresList.vue'
</script>

<template>
  <section class="view-page">
    <header class="view-header">
      <p class="view-kicker">Equipo de Campo</p>
      <h1 class="view-title">Impulsadores</h1>
      <p class="view-description">
        Directorio operativo de usuarios vinculados al sistema de activaciones.
      </p>
    </header>

    <div class="panel-card">
      <ImpulsadoresList />
    </div>
  </section>
</template>
