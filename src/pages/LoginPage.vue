<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signIn, useAuth } from '../lib/authStore'
const email = ref(''), password = ref(''), errorMsg = ref(''), submitting = ref(false)
const router = useRouter(), route = useRoute(), { accessError } = useAuth()
async function submit() { submitting.value = true; errorMsg.value = ''; try { await signIn(email.value.trim(), password.value); await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/activaciones') } catch (error) { errorMsg.value = error.message || 'No fue posible iniciar sesion.' } finally { submitting.value = false } }
</script>
<template><main class="login-page"><section class="login-card"><img src="/brand-mark.svg" alt="Impulsa 360" class="brand-mark"><p class="view-kicker">Portal operativo</p><h1>Iniciar sesión</h1><p>Acceso para administradores y líderes activos.</p><form @submit.prevent="submit"><label><span class="field-label">Correo</span><input v-model="email" type="email" class="input-texto" required></label><label><span class="field-label">Contraseña</span><input v-model="password" type="password" class="input-texto" required></label><p v-if="errorMsg || accessError" class="mensaje-error">{{ errorMsg || accessError }}</p><button class="boton boton-primario" :disabled="submitting">{{ submitting ? 'Ingresando...' : 'Ingresar' }}</button></form></section></main></template>
