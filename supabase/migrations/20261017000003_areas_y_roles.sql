-- =====================================================================
-- SERVITECAS · 0003 · EQUIPO CON PERMISOS POR ÁREA (desde el inicio, no al final)
--
--   ÁREAS (lista cerrada, fn_areas; idéntica a AREAS en src/lib/areas.ts, una prueba las compara):
--     recepcion   registrar vehículos, abrir órdenes y ver todas las órdenes
--     patio       trabajar los vehículos: estados, fotos, hallazgos y mensajes con el cliente
--     clientes    ver los clientes y cargarlos desde un archivo
--     catalogo    la lista de hallazgos del taller
--     resumen     el resumen de hallazgos autorizados y tiempos
--     equipo      invitar personas y asignarles roles
--     ajustes     los datos del taller (nombre, WhatsApp, dirección)
--
--   ROLES: cada taller tiene los suyos y decide qué áreas abre cada uno (al crearse trae Jefe de patio y
--   Recepción). Una persona puede tener VARIOS roles y ve la suma de sus áreas. Sin roles, no entra a ninguna.
--   El dueño tiene todas las áreas siempre (no se le puede quitar nada).
--
--   El candado está en la base, no en los botones:
--     · Escrituras: cada función pide su área con requerir_area(...), nunca solo requerir_taller().
--     · Lecturas: las funciones de lectura piden su área; las tablas sensibles usan tiene_area(...) en su RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Áreas
-- ---------------------------------------------------------------------
create or replace function public.fn_areas()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$ select array['recepcion', 'patio', 'clientes', 'catalogo', 'resumen', 'equipo', 'ajustes']::text[] $$;

-- Para los mensajes: "No tienes permiso para <esto>."
create or replace function public.fn_texto_area(p_area text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_area
           when 'recepcion' then 'registrar vehículos'
           when 'patio' then 'trabajar los vehículos del patio'
           when 'clientes' then 'manejar los clientes'
           when 'catalogo' then 'cambiar la lista de hallazgos'
           when 'resumen' then 'ver el resumen'
           when 'equipo' then 'manejar el equipo'
           when 'ajustes' then 'cambiar los datos del taller'
           else 'hacer esto'
         end
$$;

-- ---------------------------------------------------------------------
-- 2. Roles del taller y roles de cada persona
-- ---------------------------------------------------------------------
create table if not exists public.roles_equipo (
  id             uuid primary key default gen_random_uuid(),
  taller_id      uuid not null references public.talleres(id),
  nombre         text not null check (length(btrim(nombre)) between 1 and 30),
  areas          text[] not null default '{}' check (areas <@ public.fn_areas()),
  orden          integer not null default 0,
  activo         boolean not null default true,      -- quitar un rol = activo false (no se borra)
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (taller_id, id)
);
create unique index if not exists ux_roles_equipo_nombre on public.roles_equipo (taller_id, lower(nombre)) where activo;
comment on table public.roles_equipo is 'Roles del equipo de cada taller (Jefe de patio, Recepción…) y qué áreas abre cada uno.';

create table if not exists public.perfil_roles (
  taller_id      uuid not null references public.talleres(id),
  user_id        uuid not null,
  rol_id         uuid not null,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (user_id, rol_id),
  foreign key (taller_id, user_id) references public.perfiles (taller_id, user_id) on delete cascade,
  foreign key (taller_id, rol_id)  references public.roles_equipo (taller_id, id)
);
create index if not exists idx_perfil_roles_taller on public.perfil_roles (taller_id, rol_id);
comment on table public.perfil_roles is 'Qué roles tiene cada persona del equipo (puede tener varios).';

alter table public.roles_equipo enable row level security;
alter table public.perfil_roles enable row level security;

drop policy if exists roles_equipo_select on public.roles_equipo;
create policy roles_equipo_select on public.roles_equipo
  for select to authenticated using (taller_id = (select public.mi_taller()));

drop policy if exists perfil_roles_select on public.perfil_roles;
create policy perfil_roles_select on public.perfil_roles
  for select to authenticated using (taller_id = (select public.mi_taller()));

grant select on public.roles_equipo, public.perfil_roles to authenticated;

-- Los roles con los que arranca un taller (solo si todavía no tiene ninguno).
create or replace function public.fn_roles_iniciales(p_taller uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.roles_equipo (taller_id, nombre, areas, orden)
  select p_taller, r.nombre, r.areas, r.orden
    from (values ('Jefe de patio', array['recepcion', 'patio', 'clientes']::text[], 1),
                 ('Recepción', array['recepcion', 'clientes']::text[], 2)) as r(nombre, areas, orden)
   where not exists (select 1 from public.roles_equipo where taller_id = p_taller)
$$;

create or replace function public.fn_roles_de_taller_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_roles_iniciales(new.id);
  return new;
end $$;

drop trigger if exists trg_roles_iniciales on public.talleres;
create trigger trg_roles_iniciales
  after insert on public.talleres
  for each row execute function public.fn_roles_de_taller_nuevo();

-- ---------------------------------------------------------------------
-- 3. ¿Qué áreas abre cada quien?
-- ---------------------------------------------------------------------
-- El dueño todas; el resto, la suma de las de sus roles activos (en el orden de fn_areas).
-- null = no pertenece a ningún taller.
create or replace function public.fn_areas_de(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when p.rol = 'dueno' then public.fn_areas()
           else (select coalesce(array_agg(s.area order by array_position(public.fn_areas(), s.area)), '{}'::text[])
                   from (select distinct unnest(r.areas) as area
                           from public.perfil_roles pr
                           join public.roles_equipo r on r.taller_id = pr.taller_id and r.id = pr.rol_id and r.activo
                          where pr.taller_id = p.taller_id and pr.user_id = p.user_id) s)
         end
    from public.perfiles p
   where p.user_id = p_user
$$;

create or replace function public.mis_areas()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.fn_areas_de(auth.uid()) $$;

-- ¿La sesión abre ALGUNA de estas áreas? La usan las políticas de lectura y las lecturas que esconden datos.
create or replace function public.tiene_area(variadic p_areas text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce(public.fn_areas_de(auth.uid()) && p_areas, false) $$;

-- Para las funciones de escritura: el taller del usuario, si abre ALGUNA de las áreas; si no, un error claro.
create or replace function public.requerir_area(variadic p_areas text[])
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v uuid := public.requerir_taller();
begin
  if not coalesce(public.fn_areas_de(auth.uid()) && p_areas, false) then
    raise exception 'No tienes permiso para %. Pídeselo al dueño.', public.fn_texto_area(p_areas[1]) using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 4. Contexto: el taller, las áreas y los roles de quien entra (la app arma barra y pantallas con esto)
-- ---------------------------------------------------------------------
create or replace function public.obtener_contexto()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'taller', (select jsonb_build_object('id', t.id, 'nombre', t.nombre, 'slug', t.slug, 'es_demo', t.es_demo,
                                         'whatsapp', t.whatsapp, 'direccion', t.direccion)
                 from public.talleres t limit 1),
    'perfil', (select jsonb_build_object(
                        'nombre', p.nombre, 'rol', p.rol,
                        'areas', to_jsonb(public.mis_areas()),
                        'roles', coalesce((select jsonb_agg(r.nombre order by r.orden, r.nombre)
                                             from public.perfil_roles pr
                                             join public.roles_equipo r on r.id = pr.rol_id and r.activo
                                            where pr.user_id = p.user_id), '[]'::jsonb))
                 from public.perfiles p where p.user_id = auth.uid())
  )
$$;

select public.fn_aplicar_permisos();
