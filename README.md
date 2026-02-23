# Monitoreo Activaciones

Dashboard web para consultar activaciones, impulsadores, metricas y administrar usuarios de manera segura.

## Stack

- Vue 3 + Vite
- Supabase (anon key en frontend)
- API admin en Node/Express (service role solo en backend)

## Requisitos

- Node.js 20+
- npm 10+

## Configuracion

1. Crea un archivo `.env` en la raiz tomando como base `.env.example`.
2. Completa las variables de frontend y backend.

Variables frontend (Vite):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ADMIN_API_URL` (recomendado `/api` para Vercel full-stack)
- `VITE_STORAGE_BUCKET_ACTIVACIONES` (opcional, por defecto `fotos-activaciones`)

Variables backend (API admin):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_BASIC_USER`
- `ADMIN_BASIC_PASS`
- `ADMIN_API_PORT` (opcional, por defecto `8787`)
- `ADMIN_API_CORS_ORIGIN` (opcional, por defecto `http://localhost:5173,http://localhost:5174`)

## Instalacion

```bash
npm ci
```

## Ejecutar en desarrollo

Terminal 1 (frontend):

```bash
npm run dev
```

Terminal 2 (API admin):

```bash
npm run dev:api
```

Notas para desarrollo local:

- Si `VITE_ADMIN_API_URL=/api`, Vite redirige automaticamente `/api/*` hacia `http://localhost:8787/*`.
- Si prefieres evitar proxy, puedes usar `VITE_ADMIN_API_URL=http://localhost:8787`.

## Build

```bash
npm run build
```

## Seguridad aplicada

- Se elimino `service_role` del frontend.
- La gestion de usuarios ahora usa una API backend.
- Las operaciones de usuarios en backend incluyen rollback de compensacion cuando falla la segunda etapa.
- La exportacion de activaciones incluye CSV y Excel (`exceljs`) con insercion de imagenes cuando hay foto disponible.

## Endpoints API admin

- `GET /healthz`
- `GET /admin/healthz` (requiere Basic Auth)
- `GET /admin/users` (requiere Basic Auth)
- `POST /admin/users` (requiere Basic Auth)
- `PATCH /admin/users/:userId` (requiere Basic Auth, acepta `email` y `password` opcionales)
- `DELETE /admin/users/:userId` (requiere Basic Auth)
- `GET /admin/notifications` (requiere Basic Auth)
- `POST /admin/notifications` (requiere Basic Auth)

En Vercel (API serverless) se exponen con prefijo `/api`:

- `GET /api/healthz`
- `GET /api/admin/healthz`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:userId`
- `DELETE /api/admin/users/:userId`
- `GET /api/admin/notifications`
- `POST /api/admin/notifications`

## Modulo de Notificaciones Internas

- Ruta web: `/notificaciones`
- Funcionalidad:
  - Envio a todos los usuarios.
  - Envio a usuario especifico.
  - Historial de envios con total/leidas/pendientes.

## Supabase por Etapas

### Etapa 1 (obligatoria ahora)

1. Abre `SQL Editor` en Supabase.
2. Ejecuta el contenido de `supabase/notificaciones.sql`.
3. Verifica que existan tablas:
   - `public.notificaciones`
   - `public.notificaciones_destinatarios`
4. Verifica rapidamente que la estructura responde:

```sql
select count(*) as total_notificaciones from public.notificaciones;
select count(*) as total_destinatarios from public.notificaciones_destinatarios;
```

5. Verifica alineacion con movil (`id` por destinatario):

```sql
select id, notificacion_id, usuario_id, leida_at
from public.notificaciones_destinatarios
limit 5;
```

### Etapa 1.1 (validacion funcional web)

1. En la web, entra a `/notificaciones`.
2. Conecta API admin con Basic Auth.
3. Envia una notificacion de prueba a `Todos`.
4. Confirma en SQL:

```sql
select id, titulo, alcance, created_at
from public.notificaciones
order by created_at desc
limit 5;
```

### Etapa 2 (para app movil)

El mismo SQL ya incluye politicas RLS para que cada usuario autenticado vea solo sus notificaciones y pueda marcar sus lecturas.
No requiere cambios extra de backend para el modulo web.

## Despliegue en Vercel (Frontend + API)

1. Importa este repositorio en Vercel.
2. Framework preset: `Vite`.
3. Define variables de entorno en Vercel (Production/Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_API_URL=/api`
   - `VITE_STORAGE_BUCKET_ACTIVACIONES` (opcional)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_BASIC_USER`
   - `ADMIN_BASIC_PASS`
   - `ADMIN_API_CORS_ORIGIN` (ej: `https://tu-dominio.com,https://*.vercel.app`)
4. Deploy.

Con eso no necesitas ejecutar la API en terminal para crear/editar/eliminar usuarios.

## Nota de routing SPA en Vercel

- El frontend usa `createWebHistory(import.meta.env.BASE_URL)` en `src/router.js`.
- El fallback SPA esta configurado en `vercel.json` para reenviar rutas frontend a `index.html`.
- `/api/*` queda excluido del fallback, por lo que sigue llegando a Vercel Functions.

## Nota de despliegue

No expongas `SUPABASE_SERVICE_ROLE_KEY` en cliente ni en repositorios publicos.
