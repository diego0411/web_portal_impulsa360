<script setup>
import { useRoute, useRouter } from 'vue-router'
import FeedbackCenter from './components/FeedbackCenter.vue'
import { signOut, useAuth } from './lib/authStore'
const route = useRoute(), router = useRouter(), { profile, loading, isAdmin } = useAuth()
async function logout() { await signOut(); await router.replace('/login') }
</script>
<template>
  <div v-if="loading" class="auth-loading">Validando sesión...</div>
  <router-view v-else-if="route.meta.public" />
  <div v-else-if="profile" class="app-shell"><header class="topbar"><div class="brand-block"><img src="/brand-mark.svg" alt="Impulsa 360" class="brand-mark"><div><p class="brand-kicker">Plataforma Operativa</p><p class="brand-title">Impulsa 360<span class="brand-dot">.</span></p></div></div><nav class="main-nav"><router-link to="/activaciones">Activaciones</router-link><router-link to="/impulsadores">Impulsadores</router-link><router-link to="/metricas">Métricas</router-link><template v-if="isAdmin"><router-link to="/usuarios">Usuarios</router-link><router-link to="/notificaciones">Notificaciones</router-link><router-link to="/capacidad">Capacidad</router-link></template></nav><div class="session-user"><span>{{ profile.nombre || profile.email }}</span><small>{{ profile.rol }}</small><button class="boton" @click="logout">Cerrar sesión</button></div></header><main class="content-shell"><router-view /></main></div>
  <FeedbackCenter />
</template>
