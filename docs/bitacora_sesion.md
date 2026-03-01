# Bitacora de sesion (continuidad)

Fecha de referencia: 2026-03-01
Proyecto: `Monitoreo-Activaciones-main`
Rama actual: `main`

## Estado actual
- Repositorio limpio (sin cambios pendientes locales al cierre de esta bitacora).
- Ultimo commit en `main`: `6bdf643`
- Remote: `origin https://github.com/diego0411/web_portal_impulsa360.git`

## Cambios recientes importantes
- `6bdf643` `feat: format created_at in Bolivia timezone including exports`
  - `created_at` en hora boliviana (`America/La_Paz`) en tabla y exportaciones CSV/Excel.
- `fcabfc2` `feat: show ciudad_activacion in activaciones plaza column`
  - Columna Plaza en activaciones usa `ciudad_activacion` (con fallback).
- `8ab8acb` `feat: add date range filter for activaciones`
  - Filtro de fechas por rango (`desde` / `hasta`) inclusivo.
- `3d703e5` `feat: refine admin UX and add capacity estimations`
  - Seccion de capacidad dedicada.
  - Estimaciones de base de datos y activaciones restantes.
  - Reuso de credenciales admin entre modulos.
- `a461910` `style(activaciones): simplify and polish capacity cards, hide unavailable db data`
- `d244359` `feat(capacity): integrate supabase free plan defaults and plan reference in activaciones`
- `85b9ff3` `feat(activaciones): add secure delete with photo cleanup and storage capacity summary`

## Funcionalidades clave ya implementadas
- Eliminacion de activaciones con intento de borrado de foto en Storage.
- Modulo de notificaciones web alineado con app movil (tablas `notificaciones` y `notificaciones_destinatarios`).
- Indicadores de capacidad:
  - Uso Storage.
  - Uso/estimacion DB.
  - Activaciones restantes estimadas.
  - Activaciones restantes con foto (estimado combinado).
  - Tamano promedio de foto.
- Filtro de activaciones por rango de fechas.
- Hora boliviana en `created_at` en UI y exportaciones.

## SQL aplicado / referencia
- Archivo: `supabase/notificaciones.sql`
- Incluye:
  - Creacion de tablas de notificaciones.
  - Columna `id` en `notificaciones_destinatarios`.
  - Indices.
  - Politicas RLS para consumo de app movil.

## Comandos utiles para retomar
- Frontend local:
```bash
npm run dev
```
- API admin local:
```bash
npm run dev:api
```
- Build de validacion:
```bash
npm run build
```

## Nota de continuidad (tema GPS La Paz / El Alto)
- El ajuste de precision de ciudad debe implementarse en app movil (captura GPS), no en este repo web.
- Prompt de implementacion ya definido:
  - Usar geocerca (La Paz / El Alto), alta precision y fallback de geocoder.
  - Restriccion: sin cambios de esquema de DB (sin columnas nuevas).

## Proximo paso sugerido al volver
1. Verificar despliegue en Vercel del ultimo commit `6bdf643`.
2. Probar exportacion CSV/Excel y confirmar hora boliviana en `created_at`.
3. Continuar con mejora GPS en la app movil usando el prompt preparado.
