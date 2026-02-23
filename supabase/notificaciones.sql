-- Ejecutar en Supabase SQL Editor
-- Etapa 1: estructura de notificaciones internas

create extension if not exists pgcrypto;

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(trim(titulo)) between 3 and 120),
  mensaje text not null check (char_length(trim(mensaje)) between 3 and 2000),
  alcance text not null check (alcance in ('all', 'user')),
  usuario_objetivo_id uuid null,
  creado_por text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notificaciones_destinatarios (
  notificacion_id uuid not null references public.notificaciones(id) on delete cascade,
  usuario_id uuid not null,
  enviada_at timestamptz not null default now(),
  leida_at timestamptz null,
  primary key (notificacion_id, usuario_id)
);

-- Alineacion con app movil:
-- cada fila destinatario tiene un id estable para operaciones directas (marcar leida por id).
alter table public.notificaciones_destinatarios
  add column if not exists id uuid;

update public.notificaciones_destinatarios
set id = gen_random_uuid()
where id is null;

alter table public.notificaciones_destinatarios
  alter column id set default gen_random_uuid();

alter table public.notificaciones_destinatarios
  alter column id set not null;

create unique index if not exists idx_notificaciones_destinatarios_id
  on public.notificaciones_destinatarios (id);

create index if not exists idx_notificaciones_created_at
  on public.notificaciones (created_at desc);

create index if not exists idx_notificaciones_destinatarios_notificacion
  on public.notificaciones_destinatarios (notificacion_id);

create index if not exists idx_notificaciones_destinatarios_usuario
  on public.notificaciones_destinatarios (usuario_id);

-- Etapa 2: RLS para consumo desde app movil (usuarios autenticados)
-- El backend admin usa service_role y no depende de estas policies.

alter table public.notificaciones enable row level security;
alter table public.notificaciones_destinatarios enable row level security;

drop policy if exists notif_dest_select_own on public.notificaciones_destinatarios;
create policy notif_dest_select_own
  on public.notificaciones_destinatarios
  for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists notif_dest_update_own on public.notificaciones_destinatarios;
create policy notif_dest_update_own
  on public.notificaciones_destinatarios
  for update
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

drop policy if exists notif_select_linked on public.notificaciones;
create policy notif_select_linked
  on public.notificaciones
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.notificaciones_destinatarios nd
      where nd.notificacion_id = public.notificaciones.id
        and nd.usuario_id = auth.uid()
    )
  );
