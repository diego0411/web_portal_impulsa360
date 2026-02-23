<script setup>
import FeedbackCenter from './components/FeedbackCenter.vue'
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-block">
        <img src="/brand-mark.svg" alt="Impulsa 360" class="brand-mark" />
        <div>
          <p class="brand-kicker">Plataforma Operativa</p>
          <p class="brand-title">Impulsa 360<span class="brand-dot">.</span></p>
          <p class="brand-subtitle">Monitoreo de activaciones con enfoque Ruta Urbana</p>
        </div>
      </div>

      <nav class="main-nav">
        <router-link to="/activaciones">Activaciones</router-link>
        <router-link to="/impulsadores">Impulsadores</router-link>
        <router-link to="/metricas">Metricas</router-link>
        <router-link to="/usuarios">Usuarios</router-link>
        <router-link to="/notificaciones">Notificaciones</router-link>
      </nav>
    </header>

    <main class="content-shell">
      <router-view />
    </main>

    <FeedbackCenter />
  </div>
</template>
