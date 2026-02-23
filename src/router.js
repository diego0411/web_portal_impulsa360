import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/activaciones' },
  {
    path: '/activaciones',
    component: () => import('./pages/ActivacionesPage.vue'),
  },
  {
    path: '/impulsadores',
    component: () => import('./pages/ImpulsadoresPage.vue'),
  },
  {
    path: '/metricas',
    component: () => import('./components/MetricsDashboard.vue'),
  },
  {
    path: '/usuarios',
    component: () => import('./components/Usuarios.vue'),
  },
  {
    path: '/notificaciones',
    component: () => import('./components/Notificaciones.vue'),
  },
  {
    path: '/capacidad',
    component: () => import('./components/Capacidad.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
