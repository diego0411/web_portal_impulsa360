-- Diagnóstico únicamente. NO es una migración.
-- Ejecutar con acceso de lectura autorizado en el proyecto correcto.
-- No compartir datos de clientes, tokens ni URLs de fotos.
begin transaction isolation level repeatable read read only;

-- 1. Contrato desplegado: no asumir que los SQL locales ya se aplicaron.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('activaciones', 'activadores')
  and column_name in (
    'id', 'usuario_id', 'auth_user_id', 'activador_id', 'impulsador',
    'fecha_activacion', 'created_at', 'estado', 'rol', 'lider_id', 'equipo_id',
    'lider_id_registro', 'lider_nombre_registro', 'equipo_id_registro',
    'equipo_numero_registro', 'equipo_nombre_registro',
    'plaza_efectiva_id_registro', 'plaza_efectiva_registro',
    'ciudad_activacion', 'plaza', 'zona_activacion', 'tipo_activacion'
  )
order by table_name, ordinal_position;

select c.relname as tabla, c.relrowsecurity, c.relforcerowsecurity,
       k.conname, pg_get_constraintdef(k.oid) as definicion
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_constraint k on k.conrelid = c.oid
where n.nspname = 'public' and c.relname in ('activaciones', 'activadores')
order by c.relname, k.conname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('activaciones', 'activadores')
order by tablename, policyname;

-- Solo definiciones: NO llamar estos RPC ni cambiar su contrato compartido.
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef, pg_get_functiondef(p.oid) as definicion
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('control_activadores_jerarquia', 'control_activaciones_detalle');

-- 2. Sustituir NULL::uuid por el UUID HISTÓRICO de perfil de la líder.
-- Completar los cuatro IDs cuando se conozcan; opcionalmente el usuario_id
-- seleccionado en el ranking. Vacío NO significa que se comprobó ausencia.
-- Esta consulta devuelve únicamente candidatos de su equipo ACTUAL, igual
-- al endpoint del portal; no busca globalmente personas por nombre.
-- No aplicar fechas aún: interesa ver también las filas excluidas por filtros.
with parametros as (
  select null::uuid as lider_perfil_id,
         null::uuid as activador_seleccionado_id,
         array[]::uuid[] as cuatro_ids,
         'Liz Susana Rodríguez Guzmán'::text as nombre_visible
), lider as (
  select l.usuario_id
  from public.activadores l cross join parametros p
  where l.usuario_id = p.lider_perfil_id
    and l.rol = 'lider' and l.estado = 'activo'
), equipo_autorizado as (
  select a.* from public.activadores a
  join lider l on a.lider_id = l.usuario_id
), universo as (
  select ac.*, a.nombre as nombre_perfil, a.estado as estado_perfil,
         a.lider_id as lider_actual_id, a.equipo_id as equipo_actual_id,
         a.auth_user_id is null as sin_cuenta_auth,
         a.auth_user_id = a.usuario_id as auth_coincide_con_perfil
  from public.activaciones ac
  join equipo_autorizado a on a.usuario_id = ac.usuario_id
), candidatos as (
  select u.* from universo u cross join parametros p
  where u.id = any(p.cuatro_ids)
     or u.usuario_id = p.activador_seleccionado_id
     or position(lower(btrim(p.nombre_visible)) in lower(btrim(coalesce(u.impulsador, '')))) > 0
     or lower(btrim(u.nombre_perfil)) = lower(btrim(p.nombre_visible))
), evidencia as (
  select c.id, c.usuario_id, c.impulsador, c.nombre_perfil,
         c.estado_perfil, c.sin_cuenta_auth, c.auth_coincide_con_perfil,
         c.fecha_activacion, c.created_at,
         c.lider_actual_id, c.lider_id_registro, c.lider_nombre_registro,
         c.equipo_actual_id, c.equipo_id_registro,
         c.equipo_numero_registro, c.equipo_nombre_registro,
         c.plaza_efectiva_id_registro, c.plaza_efectiva_registro,
         c.ciudad_activacion, c.plaza, c.zona_activacion, c.tipo_activacion,
         'uid:' || lower(c.usuario_id::text) as clave_ranking_por_uuid,
         c.lider_id_registro = c.lider_actual_id as snapshot_coincide_lider_actual,
         count(*) over (partition by c.usuario_id) as filas_candidatas_mismo_uuid,
         (select jsonb_agg(jsonb_build_object(
            'equipo_id', h.equipo_id, 'inicio', h.inicio, 'fin', h.fin
          ) order by h.inicio)
          from public.activador_equipo_historial h
          where h.activador_id = c.usuario_id
         ) as historial_equipo_del_activador
  from candidatos c
)
select
  (select count(*) from equipo_autorizado) as integrantes_autorizados,
  (select count(*) from universo) as total_autorizado_sin_filtros,
  (select count(distinct id) from universo) as ids_unicos_autorizados,
  (select count(*) from candidatos) as candidatos_sin_filtros,
  (select count(distinct usuario_id) from candidatos) as identidades_candidatas,
  (select count(*) from candidatos c cross join parametros p
   where c.id = any(p.cuatro_ids)) as ids_reportados_encontrados_en_alcance,
  coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id)
            from evidencia e), '[]'::jsonb) as evidencia;

-- Comparar con las respuestas HTTP bajo la MISMA sesión y los filtros reales.
-- Los conteos anteriores son SIN filtros de pantalla: no son el valor final
-- del ranking. El informe explica cómo localizar la primera exclusión.
-- El SQL no simula una sesión de líder ni demuestra por sí solo RLS/HTTP.
rollback;
