import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'
import { initializeAuth } from './lib/authStore'
import { AUTH_ENABLED } from './lib/featureFlags'

const mountApp = () => createApp(App).use(router).mount('#app')
if (AUTH_ENABLED) initializeAuth().then(mountApp)
else mountApp()
