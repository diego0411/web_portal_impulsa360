alter table public.equipos
  alter column facturador_id drop not null;

drop index if exists public.ux_equipos_fallback_facturador_plaza;

create unique index if not exists ux_equipos_fallback_facturador_plaza
  on public.equipos(plaza_id)
  where nombre = 'Equipo sin asignar' and facturador_id is null;

drop function if exists public.actualizar_equipo_organizacion(uuid,text,uuid,uuid,boolean,timestamptz,text);

create or replace function public.actualizar_equipo_organizacion(
  p_equipo_id uuid,
  p_numero bigint,
  p_nombre text,
  p_facturador_id uuid,
  p_lider_id uuid,
  p_activo boolean,
  p_inicio timestamptz default now(),
  p_motivo text default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare v_equipo public.equipos%rowtype; v_lider_final uuid;
begin
  select * into v_equipo from public.equipos where id = p_equipo_id for update;
  if v_equipo.id is null then raise exception 'El equipo no existe'; end if;
  if p_numero is null or p_numero <= 0 then raise exception 'El numero de equipo es obligatorio'; end if;
  if nullif(btrim(p_nombre), '') is null then raise exception 'El nombre es obligatorio'; end if;
  if exists (
    select 1 from public.equipos where id <> p_equipo_id and numero = p_numero
  ) then raise exception 'Ya existe un equipo con ese numero'; end if;
  if p_facturador_id is not null and not exists (
    select 1 from public.facturadores where id = p_facturador_id and activo
  ) then
    raise exception 'El facturador no existe o esta inactivo';
  end if;
  v_lider_final := case when p_activo then p_lider_id else null end;
  if v_lider_final is not null and not exists (
    select 1
    from public.activadores a
    join public.activador_roles ar on ar.usuario_id = a.usuario_id and ar.rol = 'lider'
    where a.usuario_id = v_lider_final and a.estado = 'activo'
  ) then raise exception 'El lider no existe o esta inactivo'; end if;
  if v_lider_final is not null and exists (
    select 1 from public.equipos
    where id <> p_equipo_id and activo and lider_actual_id = v_lider_final and plaza_id = v_equipo.plaza_id
  ) then raise exception 'El lider ya dirige un equipo activo en esta plaza'; end if;

  if v_equipo.lider_actual_id is distinct from v_lider_final or v_equipo.activo is distinct from p_activo then
    update public.equipo_lider_historial set fin = p_inicio
    where equipo_id = p_equipo_id and fin is null and inicio < p_inicio;
  end if;
  update public.equipos set numero = p_numero, nombre = btrim(p_nombre),
    facturador_id = coalesce(p_facturador_id, v_equipo.facturador_id),
    lider_actual_id = v_lider_final, activo = p_activo
  where id = p_equipo_id;
  if v_lider_final is not null and v_equipo.lider_actual_id is distinct from v_lider_final then
    insert into public.equipo_lider_historial(equipo_id,plaza_id,lider_id,inicio,autorizado_por,motivo)
    values (p_equipo_id,v_equipo.plaza_id,v_lider_final,p_inicio,auth.uid(),p_motivo);
  end if;
  update public.activadores a set lider_id = v_lider_final
  where a.equipo_id = p_equipo_id
    and exists (
      select 1 from public.activador_roles ar
      where ar.usuario_id = a.usuario_id and ar.rol = 'activador'
    );
end;
$$;

revoke all on function public.actualizar_equipo_organizacion(uuid,bigint,text,uuid,uuid,boolean,timestamptz,text) from public, anon, authenticated;
grant execute on function public.actualizar_equipo_organizacion(uuid,bigint,text,uuid,uuid,boolean,timestamptz,text) to service_role;
