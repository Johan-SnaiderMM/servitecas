-- =====================================================================
-- SERVITECAS · ESQUEMA COMPLETO (generado con `npm run esquema`; NO editar a mano)
-- Es la unión de supabase/migrations/*.sql en orden. Pégalo completo en Supabase > SQL Editor.
-- =====================================================================

-- >>>>>>>>>> 20261017000001_base.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0001 · BASE: permisos de funciones, fechas de Bogotá, bloqueo de borrado y salud
--
-- Reglas de diseño (SPEC.md §7):
--  * MULTI-TALLER desde la primera tabla de negocio (Fase 1): toda tabla lleva taller_id NOT NULL y RLS.
--    Las llaves foráneas son COMPUESTAS (taller_id, id): ninguna fila puede apuntar a datos de otro taller,
--    ni siquiera por un error de código.
--  * DINERO en pesos colombianos ENTEROS (integer). Nunca numeric/float.
--  * ANULAR con motivo en vez de borrar; created_at y registrado_por en todo lo que se registra.
--  * Zona horaria del negocio: America/Bogota (Colombia no tiene horario de verano).
--  * El cliente nunca escribe tablas: todo pasa por funciones RPC security definer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Permisos de funciones
--
-- Supabase le da EXECUTE a anon y authenticated sobre toda función nueva. Aquí se cierra:
--   * anon (sin sesión): ejecuta SOLO las funciones publico_* (lo que ve el cliente del taller por su enlace).
--   * authenticated: ejecuta la API del personal (todo lo que NO empiece por fn_ ni requerir_).
--   * fn_* y requerir_*: internas; solo las llaman otras funciones (security definer).
--
-- fn_aplicar_permisos() es idempotente: CORRERLA AL FINAL DE CADA MIGRACIÓN que agregue funciones.
-- (Una prueba verifica esta regla sobre los archivos de migración y otra sobre la base real.)
-- ---------------------------------------------------------------------
create or replace function public.fn_aplicar_permisos()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma, p.proname as nombre
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
    if r.nombre not like 'fn\_%' and r.nombre not like 'requerir\_%' then
      execute format('grant execute on function %s to authenticated', r.firma);
    end if;
    -- API pública (clientes del taller sin cuenta): únicamente las funciones publico_*
    if r.nombre like 'publico\_%' then
      execute format('grant execute on function %s to anon', r.firma);
    end if;
  end loop;
end $$;

-- Lo que se cree después no hereda acceso abierto (ni tablas ni funciones).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- 2. Funciones de fecha (zona horaria de Colombia)
-- ---------------------------------------------------------------------
create or replace function public.fecha_bogota(p timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$ select (p at time zone 'America/Bogota')::date $$;

create or replace function public.hoy_bogota()
returns date
language sql
stable
set search_path = public
as $$ select public.fecha_bogota(now()) $$;

-- ---------------------------------------------------------------------
-- 3. Anular en vez de borrar: DELETE bloqueado en las tablas de negocio (incluso para el dueño de la base).
-- Única excepción: el reinicio de la demo (Fase 7) activa app.reiniciando_demo durante su transacción.
-- Uso en una migración posterior:
--   create trigger trg_bloquear_borrado before delete on public.<tabla>
--     for each row execute function public.fn_bloquear_borrado();
-- ---------------------------------------------------------------------
create or replace function public.fn_bloquear_borrado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.reiniciando_demo', true), '') = 'on' then
    return old;
  end if;
  raise exception 'No se puede borrar %: se anula con motivo.', tg_table_name using errcode = '42501';
end $$;

-- ---------------------------------------------------------------------
-- 4. Salud: la portada y un monitor externo preguntan si la base responde. No expone ningún dato.
-- security definer: anon no ejecuta hoy_bogota() por su cuenta (solo publico_*).
-- ---------------------------------------------------------------------
create or replace function public.publico_salud()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select jsonb_build_object('ok', true, 'hoy', public.hoy_bogota()) $$;

select public.fn_aplicar_permisos();

-- >>>>>>>>>> 20261017000002_talleres.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0002 · TALLERES (inquilinos), PERFILES y SEGURIDAD BASE
--
-- Modelo:
--   * Cada usuario pertenece a UN taller (tabla perfiles). mi_taller() lo resuelve.
--   * SELECT: una política por tabla -> taller_id = mi_taller().
--   * ESCRITURA: anon/authenticated NO tienen INSERT/UPDATE/DELETE sobre ninguna tabla. Todo se escribe por
--     funciones RPC (security definer) que validan el taller y el área (0003).
--   * Las tablas que lleguen después llevan taller_id NOT NULL y llaves foráneas compuestas (taller_id, id).
-- =====================================================================

-- Texto de una sola línea: sin espacios repetidos ni a los lados.
create or replace function public.fn_limpiar_texto(p_texto text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')) $$;

-- ---------------------------------------------------------------------
-- 1. Talleres y perfiles
-- ---------------------------------------------------------------------
create table if not exists public.talleres (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(btrim(nombre)) between 1 and 60),
  -- Nombre corto para direcciones con la marca del taller. Lo llena un trigger si viene vacío.
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
  -- WhatsApp del taller en E.164 (+573001234567): lo ve el cliente en su enlace.
  whatsapp   text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  direccion  text check (direccion is null or length(btrim(direccion)) between 1 and 120),
  es_demo    boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists ux_talleres_slug on public.talleres (slug);
comment on table  public.talleres is 'Un taller (serviteca) = un inquilino. Todo lo demás cuelga de aquí.';
comment on column public.talleres.es_demo is 'true = datos ficticios; solo estos permiten reiniciar la demo.';

-- Un usuario pertenece a UN taller. Sus permisos salen de rol + roles_equipo (0003), no del JWT.
create table if not exists public.perfiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  taller_id  uuid not null references public.talleres(id),
  rol        text not null default 'equipo' check (rol in ('dueno', 'equipo')),
  nombre     text not null check (length(btrim(nombre)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (taller_id, user_id)
);
create index if not exists idx_perfiles_taller on public.perfiles (taller_id);

alter table public.talleres enable row level security;
alter table public.perfiles enable row level security;

-- ---------------------------------------------------------------------
-- 2. Slug: "Llantas y Servicios Demo" -> "llantas-y-servicios-demo"
-- ---------------------------------------------------------------------
create or replace function public.fn_slug(p_texto text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(nullif(
    trim(both '-' from left(
      regexp_replace(
        lower(translate(coalesce(p_texto, ''),
                        'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ',
                        'AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun')),
        '[^a-z0-9]+', '-', 'g'),
      40)),
    ''), 'taller')
$$;

-- Slug libre: si ya existe (o es una palabra reservada de la app) agrega -2, -3…
-- security definer: ve TODOS los talleres para no repetir.
create or replace function public.fn_slug_unico(p_texto text, p_excluir uuid default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base text := public.fn_slug(p_texto);
  v text;
  n int := 1;
  v_reservados constant text[] := array[
    'www', 'app', 'admin', 'api', 'soporte', 'demo', 'entrar', 'unirme', 'salir', 'legal', 'privacidad', 'o',
    'inicio', 'ordenes', 'patio', 'clientes', 'equipo', 'mas', 'resumen', 'catalogo', 'taller', 'talleres'];
begin
  if length(v_base) < 3 then
    v_base := left(v_base, 20) || '-taller';
  end if;
  v := v_base;
  while v = any (v_reservados)
     or exists (select 1 from public.talleres t where t.slug = v and t.id is distinct from p_excluir)
  loop
    n := n + 1;
    v := trim(both '-' from left(v_base, 40 - length(n::text) - 1)) || '-' || n;
  end loop;
  return v;
end $$;

-- Cualquier taller nuevo (alta real, demo, pruebas) nace con su slug.
create or replace function public.fn_taller_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.fn_slug_unico(new.nombre, new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_taller_slug on public.talleres;
create trigger trg_taller_slug
  before insert on public.talleres
  for each row execute function public.fn_taller_slug();
-- (NOT NULL y el check de slug se verifican DESPUÉS del trigger BEFORE: insertar sin slug es legal.)

-- ---------------------------------------------------------------------
-- 3. ¿De qué taller es la sesión? (security definer: leen perfiles saltándose su RLS, sin recursión)
-- ---------------------------------------------------------------------
create or replace function public.mi_taller()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select taller_id from public.perfiles where user_id = auth.uid() $$;

create or replace function public.es_dueno()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce((select rol = 'dueno' from public.perfiles where user_id = auth.uid()), false) $$;

-- Para las funciones de escritura: falla con un mensaje claro si el usuario no tiene taller.
create or replace function public.requerir_taller()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v uuid := public.mi_taller();
begin
  if v is null then
    raise exception 'Tu usuario no tiene un taller asignado.' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function public.requerir_dueno()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v uuid := public.requerir_taller();
begin
  if not public.es_dueno() then
    raise exception 'Solo el dueño puede hacer esto.' using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 4. Lectura: cada quien ve solo su taller. Nada para anónimos. Nadie escribe directo.
-- ---------------------------------------------------------------------
drop policy if exists talleres_select on public.talleres;
create policy talleres_select on public.talleres
  for select to authenticated using (id = (select public.mi_taller()));

drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select to authenticated using (taller_id = (select public.mi_taller()));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.talleres, public.perfiles to authenticated;

select public.fn_aplicar_permisos();

-- >>>>>>>>>> 20261017000003_areas_y_roles.sql >>>>>>>>>>
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

-- >>>>>>>>>> 20261017000004_alta_taller.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0004 · DAR DE ALTA un taller DE VERDAD, con su dueño
--
-- No hay registro abierto: la cuenta del dueño la crea quien administra, a mano y sin service_role.
--   1. Supabase → Authentication → Users → Add user: el correo del dueño y una contraseña temporal, con
--      "Auto Confirm User".
--   2. SQL Editor:  select public.fn_crear_taller('correo@del-dueno.com', 'Nombre del taller', 'Nombre del dueño');
--   3. Se le entrega al dueño su correo y la contraseña temporal: entra en /entrar.
--
-- El taller nace vacío, con los roles de siempre (Jefe de patio y Recepción). fn_* = nadie la llama desde la app.
-- =====================================================================

create or replace function public.fn_crear_taller(p_correo text, p_nombre text, p_dueno text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_nombre text := public.fn_limpiar_texto(p_nombre);
  v_dueno  text := public.fn_limpiar_texto(p_dueno);
  v_user   uuid;
  v_taller uuid;
  v_slug   text;
begin
  if length(v_nombre) = 0 or length(v_nombre) > 60 then
    raise exception 'Escribe el nombre del taller (máximo 60 caracteres).';
  end if;
  if length(v_dueno) = 0 or length(v_dueno) > 40 then
    raise exception 'Escribe el nombre del dueño (máximo 40 caracteres).';
  end if;

  select id into v_user from auth.users where lower(email) = v_correo;
  if v_user is null then
    raise exception 'No existe el usuario %. Créalo primero en Authentication > Users (con "Auto Confirm User").', v_correo;
  end if;
  if exists (select 1 from public.perfiles where user_id = v_user) then
    raise exception 'El usuario % ya tiene un taller.', v_correo;
  end if;

  insert into public.talleres (nombre, es_demo)
  values (v_nombre, false)
  returning id, slug into v_taller, v_slug;
  insert into public.perfiles (user_id, taller_id, rol, nombre) values (v_user, v_taller, 'dueno', v_dueno);

  return jsonb_build_object('taller_id', v_taller, 'nombre', v_nombre, 'dueno', v_dueno, 'slug', v_slug);
end $$;

select public.fn_aplicar_permisos();

-- >>>>>>>>>> 20261017000005_equipo.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0005 · EL EQUIPO ENTRA CON UN CÓDIGO (SPEC F1)
--
--   1. INVITACIÓN: quien administra el equipo (área "equipo") escribe el nombre de la persona y le elige roles. La
--      base le da un código de 8 letras y números (sin 0/O/1/I, para que no se confundan) que sirve UNA vez y por
--      3 días. En el celular de esa persona se abre /unirme (con el enlace o escribiendo el código): la app abre una
--      sesión anónima de Supabase en ese celular y canjea el código, que crea su perfil en el taller con esos roles.
--      Sin correo ni contraseña. El código se guarda tal cual (para volver a mostrarlo mientras esté vigente); nadie
--      lee la tabla directamente: solo listar_equipo, para quien administra el equipo.
--   2. QUITAR DEL EQUIPO: esa persona pierde el acceso al instante (su perfil y sus roles se van).
--   3. SIN ESCALAR PERMISOS: nadie le da a otro más áreas de las que ya tiene. Quien administra el equipo solo
--      asigna roles cuyas áreas ya abre, y no toca a quien tiene más poder que él. El dueño lo abre todo.
--
-- Topes pensados para una serviteca grande: 60 personas en el equipo y 20 invitaciones sin usar a la vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Invitaciones
-- ---------------------------------------------------------------------
create table if not exists public.invitaciones (
  id             uuid primary key default gen_random_uuid(),
  taller_id      uuid not null references public.talleres(id),
  codigo         text not null check (codigo ~ '^[A-HJ-NP-Z2-9]{8}$'),
  nombre         text not null check (length(btrim(nombre)) between 1 and 40),
  roles          uuid[] not null default '{}',      -- ids de roles_equipo de este taller (se revisan al canjear)
  expira_at      timestamptz not null,
  usada_at       timestamptz,
  usada_por      uuid references auth.users(id) on delete set null,
  anulada_at     timestamptz,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (taller_id, id),
  constraint ux_invitaciones_codigo unique (codigo)
);
create index if not exists idx_invitaciones_taller on public.invitaciones (taller_id, created_at);
comment on table public.invitaciones is 'Códigos para que una persona entre al equipo desde su celular (un uso, 3 días).';

alter table public.invitaciones enable row level security;
-- Sin políticas y sin privilegios: el código es una llave. Solo las funciones de abajo la leen.

-- 8 caracteres de 32 posibles (2^40 combinaciones), con bytes aleatorios de un uuid v4 (los que no llevan la
-- versión ni la variante).
create or replace function public.fn_codigo_invitacion()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes  bytea := uuid_send(gen_random_uuid());
  v_codigo text := '';
  i        integer;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    v_codigo := v_codigo || substr(v_letras, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_codigo;
end $$;

-- Roles activos del taller a partir de un arreglo jsonb de ids. Si alguno no existe (o es de otro taller), error.
create or replace function public.fn_roles_validos(p_taller uuid, p_roles jsonb)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles uuid[];
begin
  if p_roles is null or jsonb_typeof(p_roles) <> 'array' then
    raise exception 'Elige los roles de esta persona.';
  end if;
  begin
    select coalesce(array_agg(distinct x.valor::uuid), '{}'::uuid[]) into v_roles
      from jsonb_array_elements_text(p_roles) as x(valor);
  exception when invalid_text_representation then
    raise exception 'El rol no existe.' using errcode = 'P0002';
  end;
  if (select count(*) from public.roles_equipo
       where taller_id = p_taller and activo and id = any (v_roles)) <> cardinality(v_roles) then
    raise exception 'El rol no existe.' using errcode = 'P0002';
  end if;
  return v_roles;
end $$;

-- Nadie da más áreas de las que tiene: las áreas de esos roles deben estar TODAS entre las de quien llama.
create or replace function public.fn_exigir_roles_asignables(p_taller uuid, p_roles uuid[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedidas text[];
begin
  select coalesce(array_agg(distinct a), '{}'::text[]) into v_pedidas
    from public.roles_equipo r, unnest(r.areas) a
   where r.taller_id = p_taller and r.id = any (p_roles);
  if not (v_pedidas <@ coalesce(public.fn_areas_de(auth.uid()), '{}'::text[])) then
    raise exception 'No puedes dar permisos que tú no tienes.' using errcode = '42501';
  end if;
end $$;

-- ¿Las áreas de esa persona caben entre las de quien llama? (para no tocar a alguien con más poder)
create or replace function public.fn_exigir_poder_sobre(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (coalesce(public.fn_areas_de(p_user), '{}'::text[]) <@ coalesce(public.fn_areas_de(auth.uid()), '{}'::text[])) then
    raise exception 'No puedes cambiar a alguien con más permisos que tú.' using errcode = '42501';
  end if;
end $$;

-- Invita a alguien: nombre y roles. Devuelve el código y hasta cuándo sirve.
create or replace function public.crear_invitacion(p_nombre text, p_roles jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('equipo');
  v_nombre text := left(public.fn_limpiar_texto(p_nombre), 40);
  v_roles  uuid[];
  v_codigo text;
  v_id     uuid;
  v_expira timestamptz := now() + interval '72 hours';
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre de la persona.';
  end if;
  v_roles := public.fn_roles_validos(v_taller, p_roles);
  if cardinality(v_roles) = 0 then
    raise exception 'Elige al menos un rol: sin roles no podría hacer nada.';
  end if;
  perform public.fn_exigir_roles_asignables(v_taller, v_roles);

  if (select count(*) from public.perfiles where taller_id = v_taller) >= 60 then
    raise exception 'El equipo ya tiene 60 personas. Quita a alguien que ya no trabaje en el taller.';
  end if;
  if (select count(*) from public.invitaciones
       where taller_id = v_taller and usada_at is null and anulada_at is null and expira_at > now()) >= 20 then
    raise exception 'Hay muchas invitaciones sin usar. Anula alguna antes de crear otra.';
  end if;

  -- Limpieza oportunista: lo que ya no sirve y tiene más de 30 días.
  delete from public.invitaciones
   where taller_id = v_taller and created_at < now() - interval '30 days'
     and (usada_at is not null or anulada_at is not null or expira_at < now());

  loop
    v_codigo := public.fn_codigo_invitacion();
    exit when not exists (select 1 from public.invitaciones where codigo = v_codigo);
  end loop;

  insert into public.invitaciones (taller_id, codigo, nombre, roles, expira_at)
  values (v_taller, v_codigo, v_nombre, v_roles, v_expira)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'nombre', v_nombre, 'expira_at', v_expira);
end $$;

create or replace function public.anular_invitacion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('equipo');
begin
  update public.invitaciones set anulada_at = now()
   where id = p_id and taller_id = v_taller and usada_at is null and anulada_at is null;
  if not found then
    raise exception 'La invitación no existe o ya se usó.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_id);
end $$;

-- En el celular de la persona invitada (ya con su sesión anónima): el código la vuelve parte del equipo.
create or replace function public.canjear_invitacion(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv    public.invitaciones%rowtype;
  v_de     text;
begin
  if v_uid is null then
    raise exception 'Abre la invitación en el celular que vas a usar.' using errcode = '42501';
  end if;
  select t.nombre into v_de
    from public.perfiles p join public.talleres t on t.id = p.taller_id
   where p.user_id = v_uid;
  if found then
    raise exception 'Este celular ya está en el equipo de %. Para unirte con otro código, sal de la app primero.', v_de;
  end if;

  select * into v_inv from public.invitaciones
   where codigo = v_codigo and usada_at is null and anulada_at is null and expira_at > now()
   for update;
  if not found then
    raise exception 'Ese código no sirve: revisa que esté bien escrito, o pide uno nuevo (cada código sirve una sola vez y por 3 días).'
      using errcode = 'P0002';
  end if;

  insert into public.perfiles (user_id, taller_id, rol, nombre)
  values (v_uid, v_inv.taller_id, 'equipo', v_inv.nombre);

  insert into public.perfil_roles (taller_id, user_id, rol_id, registrado_por)
  select v_inv.taller_id, v_uid, r.id, v_inv.registrado_por
    from public.roles_equipo r
   where r.taller_id = v_inv.taller_id and r.activo and r.id = any (v_inv.roles);

  update public.invitaciones set usada_at = now(), usada_por = v_uid where id = v_inv.id;

  return jsonb_build_object(
    'taller', (select nombre from public.talleres where id = v_inv.taller_id),
    'nombre', v_inv.nombre,
    'areas', to_jsonb(public.fn_areas_de(v_uid))
  );
end $$;

-- ---------------------------------------------------------------------
-- 2. Administrar el equipo
-- ---------------------------------------------------------------------

-- Quita a alguien: su celular pierde el acceso al instante (su perfil y sus roles se van).
create or replace function public.quitar_del_equipo(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('equipo');
  v_p      public.perfiles%rowtype;
begin
  select * into v_p from public.perfiles where user_id = p_user_id and taller_id = v_taller for update;
  if not found then
    raise exception 'Esa persona no es de tu equipo.' using errcode = 'P0002';
  end if;
  if v_p.rol = 'dueno' then
    raise exception 'Al dueño no se le puede quitar del equipo.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No puedes quitarte a ti mismo del equipo.';
  end if;
  perform public.fn_exigir_poder_sobre(p_user_id);

  delete from public.perfiles where user_id = p_user_id and taller_id = v_taller;  -- sus roles se van con él
  return jsonb_build_object('user_id', p_user_id, 'nombre', v_p.nombre);
end $$;

-- Deja a la persona con exactamente estos roles.
create or replace function public.cambiar_roles_miembro(p_user_id uuid, p_roles jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('equipo');
  v_p      public.perfiles%rowtype;
  v_roles  uuid[];
begin
  select * into v_p from public.perfiles where user_id = p_user_id and taller_id = v_taller for update;
  if not found then
    raise exception 'Esa persona no es de tu equipo.' using errcode = 'P0002';
  end if;
  if v_p.rol = 'dueno' then
    raise exception 'El dueño ya tiene todos los permisos.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No puedes cambiar tus propios roles.';
  end if;

  v_roles := public.fn_roles_validos(v_taller, p_roles);
  if cardinality(v_roles) = 0 then
    raise exception 'Elige al menos un rol: sin roles no podría hacer nada.';
  end if;
  perform public.fn_exigir_poder_sobre(p_user_id);
  perform public.fn_exigir_roles_asignables(v_taller, v_roles);

  delete from public.perfil_roles where taller_id = v_taller and user_id = p_user_id;
  insert into public.perfil_roles (taller_id, user_id, rol_id)
  select v_taller, p_user_id, r from unnest(v_roles) r;
  return jsonb_build_object('user_id', p_user_id, 'areas', to_jsonb(public.fn_areas_de(p_user_id)));
end $$;

-- El equipo: roles (con sus áreas), personas (con sus roles) e invitaciones pendientes (con su código).
-- Solo para quien administra el equipo.
create or replace function public.listar_equipo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('equipo');
begin
  return jsonb_build_object(
    'areas', to_jsonb(public.fn_areas()),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'nombre', r.nombre, 'areas', to_jsonb(r.areas),
               'personas', (select count(*) from public.perfil_roles pr
                             where pr.taller_id = v_taller and pr.rol_id = r.id)
             ) order by r.orden, r.nombre)
        from public.roles_equipo r
       where r.taller_id = v_taller and r.activo), '[]'::jsonb),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.user_id, 'nombre', p.nombre, 'rol', p.rol, 'yo', p.user_id = auth.uid(),
               'roles', coalesce((select jsonb_agg(pr.rol_id order by r.orden, r.nombre)
                                    from public.perfil_roles pr
                                    join public.roles_equipo r
                                      on r.taller_id = pr.taller_id and r.id = pr.rol_id and r.activo
                                   where pr.taller_id = v_taller and pr.user_id = p.user_id), '[]'::jsonb),
               'areas', to_jsonb(public.fn_areas_de(p.user_id))
             ) order by p.rol = 'dueno' desc, p.created_at, p.nombre)
        from public.perfiles p
       where p.taller_id = v_taller), '[]'::jsonb),
    'invitaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'nombre', i.nombre, 'codigo', i.codigo, 'expira_at', i.expira_at,
               'roles', coalesce((select jsonb_agg(r.id order by r.orden, r.nombre)
                                    from public.roles_equipo r
                                   where r.taller_id = v_taller and r.activo and r.id = any (i.roles)), '[]'::jsonb)
             ) order by i.created_at desc)
        from public.invitaciones i
       where i.taller_id = v_taller and i.usada_at is null and i.anulada_at is null and i.expira_at > now()),
      '[]'::jsonb)
  );
end $$;

select public.fn_aplicar_permisos();

-- >>>>>>>>>> 20261017000006_ordenes.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0006 · CLIENTES, VEHÍCULOS Y ÓRDENES (SPEC F2 y F5)
--
--   * REGISTRO RÁPIDO (recibir_vehiculo): placa, celular y servicio. Si la placa ya existe en el taller, la pantalla
--     trae al cliente (buscar_vehiculo). El cliente es único por celular dentro del taller; el vehículo, por placa.
--     Si un vehículo llega con otro celular (se vendió, lo trae otra persona), el vehículo queda con ese cliente.
--   * Una orden por visita, con número consecutivo por taller (#1, #2…) y la clave que manda la pantalla como id:
--     un reintento por mala señal devuelve la misma orden en vez de crear otra.
--   * ESTADOS: recibido → diagnostico → en_proceso → listo → entregado; cancelada con motivo. Entre los abiertos se
--     puede ir y volver (los errores pasan); entregada y cancelada son finales. Un vehículo tiene a lo sumo UNA orden
--     abierta (índice único parcial). Cada cambio queda en orden_eventos con el nombre de quien lo hizo.
--   * ASIGNACIÓN a un jefe de patio: solo a alguien del taller que abra el área "patio" (o el dueño).
--   * ENLACE DEL CLIENTE (/o/<token>): publico_orden muestra taller, placa, servicio, estado e historia, sin celular
--     ni notas internas. 30 días después de cerrada, el enlace deja de mostrar la orden.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Normalización (espejos en src/lib/telefono.ts, src/lib/placa.ts y src/lib/ordenes.ts; pruebas los comparan)
-- ---------------------------------------------------------------------

-- Celular -> E.164. Un celular colombiano de 10 dígitos que empieza en 3 recibe +57; con "+" o "00" se respeta el país.
-- Vacío -> null. Si no se entiende, falla con un mensaje claro.
create or replace function public.fn_normalizar_telefono(p_texto text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_txt text := btrim(coalesce(p_texto, ''));
  v_dig text;
begin
  if v_txt = '' then
    return null;
  end if;
  v_dig := regexp_replace(v_txt, '\D', '', 'g');
  if left(v_txt, 1) = '+' or left(v_dig, 2) = '00' then
    v_dig := regexp_replace(v_dig, '^00', '');
    if v_dig ~ '^[1-9][0-9]{7,14}$' then
      return '+' || v_dig;
    end if;
  elsif v_dig ~ '^3[0-9]{9}$' then
    return '+57' || v_dig;
  elsif v_dig ~ '^573[0-9]{9}$' then
    return '+' || v_dig;
  end if;
  raise exception 'El celular no es válido. Escríbelo con 10 dígitos, por ejemplo 300 123 4567.';
end $$;

-- " abc-123 " -> "ABC123". De 5 a 7 letras y números, con al menos una letra y un número.
create or replace function public.fn_normalizar_placa(p_texto text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := upper(regexp_replace(coalesce(p_texto, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if v = '' then
    raise exception 'Escribe la placa.';
  end if;
  if v !~ '^[A-Z0-9]{5,7}$' or v !~ '[A-Z]' or v !~ '[0-9]' then
    raise exception 'La placa no es válida. Escríbela como ABC123 (carro) o ABC12D (moto).';
  end if;
  return v;
end $$;

create or replace function public.fn_estados()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$ select array['recibido', 'diagnostico', 'en_proceso', 'listo', 'entregado', 'cancelada']::text[] $$;

create or replace function public.fn_estados_abiertos()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$ select array['recibido', 'diagnostico', 'en_proceso', 'listo']::text[] $$;

-- El nombre (del perfil) de una persona del taller, para dejarlo escrito en la historia.
create or replace function public.fn_nombre_de(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select nombre from public.perfiles where user_id = p_user $$;

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id             uuid primary key default gen_random_uuid(),
  taller_id      uuid not null references public.talleres(id),
  nombre         text check (nombre is null or length(btrim(nombre)) between 1 and 60),
  celular        text not null check (celular ~ '^\+[1-9][0-9]{7,14}$'),
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (taller_id, id),
  unique (taller_id, celular)
);
comment on table public.clientes is 'Clientes del taller: uno por celular.';

create table if not exists public.vehiculos (
  id             uuid primary key default gen_random_uuid(),
  taller_id      uuid not null references public.talleres(id),
  placa          text not null check (placa ~ '^[A-Z0-9]{5,7}$'),
  tipo           text generated always as (
                   case when placa ~ '^[A-Z]{3}[0-9]{3}$' then 'carro'
                        when placa ~ '^[A-Z]{3}[0-9]{2}[A-Z]$' then 'moto'
                        else 'otro' end) stored,
  cliente_id     uuid not null,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (taller_id, id),
  unique (taller_id, placa),
  foreign key (taller_id, cliente_id) references public.clientes (taller_id, id)
);
comment on table public.vehiculos is 'Vehículos del taller: uno por placa, con el cliente de su última visita.';

create table if not exists public.ordenes (
  id                 uuid primary key default gen_random_uuid(),
  taller_id          uuid not null references public.talleres(id),
  numero             integer not null check (numero > 0),
  vehiculo_id        uuid not null,
  cliente_id         uuid not null,
  servicio           text not null check (length(btrim(servicio)) between 1 and 120),
  kilometraje        integer check (kilometraje is null or kilometraje between 0 and 3000000),
  estado             text not null default 'recibido' check (estado = any (public.fn_estados())),
  estado_desde       timestamptz not null default now(),
  asignado_a         uuid,
  -- Código secreto del enlace del cliente (/o/<token>). No adivinable.
  token              uuid not null default gen_random_uuid(),
  motivo_cancelacion text check (motivo_cancelacion is null or length(btrim(motivo_cancelacion)) between 3 and 200),
  entregado_at       timestamptz,
  cancelada_at       timestamptz,
  created_at         timestamptz not null default now(),
  registrado_por     uuid default auth.uid() references auth.users(id) on delete set null,
  unique (taller_id, id),
  unique (taller_id, numero),
  unique (token),
  foreign key (taller_id, vehiculo_id) references public.vehiculos (taller_id, id),
  foreign key (taller_id, cliente_id) references public.clientes (taller_id, id),
  -- Si la persona sale del equipo, la orden queda sin asignar (no se pierde).
  foreign key (taller_id, asignado_a) references public.perfiles (taller_id, user_id) on delete set null (asignado_a),
  check ((estado = 'cancelada') = (motivo_cancelacion is not null and cancelada_at is not null)),
  check ((estado = 'entregado') = (entregado_at is not null))
);
comment on table public.ordenes is 'Una visita de un vehículo al taller, de la recepción a la entrega.';

-- Un vehículo tiene a lo sumo una orden abierta.
create unique index if not exists ux_ordenes_abierta on public.ordenes (taller_id, vehiculo_id)
  where estado in ('recibido', 'diagnostico', 'en_proceso', 'listo');
create index if not exists idx_ordenes_taller_estado on public.ordenes (taller_id, estado, created_at);

create table if not exists public.orden_eventos (
  id             uuid primary key default gen_random_uuid(),
  taller_id      uuid not null references public.talleres(id),
  orden_id       uuid not null,
  tipo           text not null check (tipo in ('creada', 'estado', 'asignacion', 'cancelada')),
  estado         text check (estado is null or estado = any (public.fn_estados())),
  detalle        text check (detalle is null or length(detalle) <= 200),
  -- Nombre de quien lo hizo, guardado al momento: si sale del equipo, la historia no se pierde.
  autor          text,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  foreign key (taller_id, orden_id) references public.ordenes (taller_id, id)
);
create index if not exists idx_orden_eventos_orden on public.orden_eventos (taller_id, orden_id, created_at);
comment on table public.orden_eventos is 'Historia de cada orden: creación, cambios de estado, asignaciones y cancelación.';

-- RLS: solo el propio taller y solo quien maneja vehículos (o clientes).
alter table public.clientes      enable row level security;
alter table public.vehiculos     enable row level security;
alter table public.ordenes       enable row level security;
alter table public.orden_eventos enable row level security;

drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated
  using (taller_id = (select public.mi_taller()) and (select public.tiene_area('recepcion', 'patio', 'clientes')));

drop policy if exists vehiculos_select on public.vehiculos;
create policy vehiculos_select on public.vehiculos for select to authenticated
  using (taller_id = (select public.mi_taller()) and (select public.tiene_area('recepcion', 'patio', 'clientes')));

drop policy if exists ordenes_select on public.ordenes;
create policy ordenes_select on public.ordenes for select to authenticated
  using (taller_id = (select public.mi_taller()) and (select public.tiene_area('recepcion', 'patio')));

drop policy if exists orden_eventos_select on public.orden_eventos;
create policy orden_eventos_select on public.orden_eventos for select to authenticated
  using (taller_id = (select public.mi_taller()) and (select public.tiene_area('recepcion', 'patio')));

grant select on public.clientes, public.vehiculos, public.ordenes, public.orden_eventos to authenticated;

-- Anular en vez de borrar.
drop trigger if exists trg_bloquear_borrado on public.clientes;
create trigger trg_bloquear_borrado before delete on public.clientes
  for each row execute function public.fn_bloquear_borrado();
drop trigger if exists trg_bloquear_borrado on public.vehiculos;
create trigger trg_bloquear_borrado before delete on public.vehiculos
  for each row execute function public.fn_bloquear_borrado();
drop trigger if exists trg_bloquear_borrado on public.ordenes;
create trigger trg_bloquear_borrado before delete on public.ordenes
  for each row execute function public.fn_bloquear_borrado();
drop trigger if exists trg_bloquear_borrado on public.orden_eventos;
create trigger trg_bloquear_borrado before delete on public.orden_eventos
  for each row execute function public.fn_bloquear_borrado();

-- ---------------------------------------------------------------------
-- 3. Ayudantes internos
-- ---------------------------------------------------------------------

-- ¿Se le puede asignar una orden a esta persona? Debe ser del taller y abrir el área "patio" (el dueño la abre).
create or replace function public.fn_exigir_asignable(p_taller uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null then
    return;
  end if;
  if not exists (select 1 from public.perfiles where taller_id = p_taller and user_id = p_user)
     or not coalesce(public.fn_areas_de(p_user) && array['patio'], false) then
    raise exception 'A esa persona no se le pueden asignar vehículos: debe ser jefe de patio.';
  end if;
end $$;

-- La orden del taller, bloqueada para cambiarla. Falla si no existe o si ya está cerrada.
create or replace function public.fn_orden_abierta_para_cambiar(p_taller uuid, p_id uuid)
returns public.ordenes
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v public.ordenes%rowtype;
begin
  select * into v from public.ordenes where taller_id = p_taller and id = p_id for update;
  if not found then
    raise exception 'La orden no existe.' using errcode = 'P0002';
  end if;
  if not (v.estado = any (public.fn_estados_abiertos())) then
    raise exception 'Esta orden ya está cerrada (%).', case v.estado when 'entregado' then 'entregada' else 'cancelada' end;
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 4. Escrituras
-- ---------------------------------------------------------------------

-- Recibir un vehículo: crea o actualiza cliente y vehículo y abre la orden. p_clave la genera la pantalla al abrirse.
create or replace function public.recibir_vehiculo(
  p_clave       uuid,
  p_placa       text,
  p_celular     text,
  p_servicio    text,
  p_nombre      text default null,
  p_asignado    uuid default null,
  p_kilometraje integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller   uuid := public.requerir_area('recepcion');
  v_placa    text := public.fn_normalizar_placa(p_placa);
  v_celular  text := public.fn_normalizar_telefono(p_celular);
  v_nombre   text := nullif(left(public.fn_limpiar_texto(p_nombre), 60), '');
  v_servicio text := public.fn_limpiar_texto(p_servicio);
  v_previa   public.ordenes%rowtype;
  v_cliente  uuid;
  v_vehiculo uuid;
  v_abierta  integer;
  v_numero   integer;
  v_orden    public.ordenes%rowtype;
  v_autor    text := public.fn_nombre_de(auth.uid());
begin
  if p_clave is null then
    raise exception 'Falta la clave de la operación. Vuelve a abrir la pantalla.';
  end if;
  -- Reintento (mala señal): la misma clave devuelve la misma orden.
  select * into v_previa from public.ordenes where id = p_clave;
  if found then
    if v_previa.taller_id <> v_taller then
      raise exception 'Falta la clave de la operación. Vuelve a abrir la pantalla.';
    end if;
    return jsonb_build_object('id', v_previa.id, 'numero', v_previa.numero, 'token', v_previa.token, 'repetida', true);
  end if;

  if v_celular is null then
    raise exception 'Escribe el celular del cliente: por ahí le llega el enlace.';
  end if;
  if length(v_servicio) = 0 or length(v_servicio) > 120 then
    raise exception 'Escribe qué servicio se le va a hacer (máximo 120 caracteres).';
  end if;
  if p_kilometraje is not null and (p_kilometraje < 0 or p_kilometraje > 3000000) then
    raise exception 'El kilometraje no es válido.';
  end if;
  perform public.fn_exigir_asignable(v_taller, p_asignado);

  -- Un taller a la vez: el número consecutivo no se repite.
  perform pg_advisory_xact_lock(hashtextextended(v_taller::text, 0));

  insert into public.clientes (taller_id, nombre, celular)
  values (v_taller, v_nombre, v_celular)
  on conflict (taller_id, celular) do update set nombre = coalesce(excluded.nombre, public.clientes.nombre)
  returning id into v_cliente;

  insert into public.vehiculos (taller_id, placa, cliente_id)
  values (v_taller, v_placa, v_cliente)
  on conflict (taller_id, placa) do update set cliente_id = excluded.cliente_id
  returning id into v_vehiculo;

  select numero into v_abierta from public.ordenes
   where taller_id = v_taller and vehiculo_id = v_vehiculo and estado = any (public.fn_estados_abiertos());
  if found then
    raise exception 'El vehículo % ya está en el patio (orden #%).', v_placa, v_abierta;
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.ordenes where taller_id = v_taller;

  insert into public.ordenes (id, taller_id, numero, vehiculo_id, cliente_id, servicio, kilometraje, asignado_a)
  values (p_clave, v_taller, v_numero, v_vehiculo, v_cliente, v_servicio, p_kilometraje, p_asignado)
  returning * into v_orden;

  insert into public.orden_eventos (taller_id, orden_id, tipo, estado, autor)
  values (v_taller, v_orden.id, 'creada', 'recibido', v_autor);
  if p_asignado is not null then
    insert into public.orden_eventos (taller_id, orden_id, tipo, detalle, autor)
    values (v_taller, v_orden.id, 'asignacion', public.fn_nombre_de(p_asignado), v_autor);
  end if;

  return jsonb_build_object('id', v_orden.id, 'numero', v_orden.numero, 'token', v_orden.token, 'repetida', false);
end $$;

-- Cambiar el estado de una orden abierta (o entregarla). Pedir el mismo estado no es un error: no hace nada.
create or replace function public.cambiar_estado_orden(p_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v        public.ordenes%rowtype;
begin
  if p_estado is null or not (p_estado = any (public.fn_estados())) then
    raise exception 'Ese estado no existe.';
  end if;
  if p_estado = 'cancelada' then
    raise exception 'Para cancelar una orden hay que escribir el motivo.';
  end if;
  v := public.fn_orden_abierta_para_cambiar(v_taller, p_id);
  if v.estado = p_estado then
    return jsonb_build_object('id', v.id, 'estado', v.estado, 'cambio', false);
  end if;

  update public.ordenes
     set estado = p_estado,
         estado_desde = now(),
         entregado_at = case when p_estado = 'entregado' then now() end
   where taller_id = v_taller and id = p_id;
  insert into public.orden_eventos (taller_id, orden_id, tipo, estado, autor)
  values (v_taller, p_id, 'estado', p_estado, public.fn_nombre_de(auth.uid()));

  return jsonb_build_object('id', p_id, 'estado', p_estado, 'cambio', true);
end $$;

-- Cancelar una orden abierta, con su motivo (queda en la historia).
create or replace function public.cancelar_orden(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_motivo text := left(public.fn_limpiar_texto(p_motivo), 200);
begin
  if length(v_motivo) < 3 then
    raise exception 'Escribe por qué se cancela (por ejemplo: el cliente se llevó el vehículo sin arreglar).';
  end if;
  perform public.fn_orden_abierta_para_cambiar(v_taller, p_id);

  update public.ordenes
     set estado = 'cancelada', estado_desde = now(), cancelada_at = now(), motivo_cancelacion = v_motivo
   where taller_id = v_taller and id = p_id;
  insert into public.orden_eventos (taller_id, orden_id, tipo, estado, detalle, autor)
  values (v_taller, p_id, 'cancelada', 'cancelada', v_motivo, public.fn_nombre_de(auth.uid()));

  return jsonb_build_object('id', p_id, 'estado', 'cancelada');
end $$;

-- Asignar (o quitar la asignación de) una orden abierta a un jefe de patio.
create or replace function public.asignar_orden(p_id uuid, p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v        public.ordenes%rowtype;
begin
  v := public.fn_orden_abierta_para_cambiar(v_taller, p_id);
  perform public.fn_exigir_asignable(v_taller, p_user);
  if v.asignado_a is not distinct from p_user then
    return jsonb_build_object('id', p_id, 'asignado_a', p_user, 'cambio', false);
  end if;

  update public.ordenes set asignado_a = p_user where taller_id = v_taller and id = p_id;
  insert into public.orden_eventos (taller_id, orden_id, tipo, detalle, autor)
  values (v_taller, p_id, 'asignacion', coalesce(public.fn_nombre_de(p_user), 'Sin asignar'), public.fn_nombre_de(auth.uid()));

  return jsonb_build_object('id', p_id, 'asignado_a', p_user, 'cambio', true);
end $$;

-- ---------------------------------------------------------------------
-- 5. Lecturas del personal
-- ---------------------------------------------------------------------

-- ¿Ya conocemos esta placa? Para llenar solo el registro rápido. Una placa incompleta o inválida no es un error.
create or replace function public.buscar_vehiculo(p_placa text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion');
  v_placa  text;
  v_r      jsonb;
begin
  begin
    v_placa := public.fn_normalizar_placa(p_placa);
  exception when others then
    return jsonb_build_object('existe', false);
  end;

  select jsonb_build_object(
           'existe', true,
           'placa', v.placa,
           'tipo', v.tipo,
           'cliente', jsonb_build_object('nombre', c.nombre, 'celular', c.celular),
           'visitas', (select count(*) from public.ordenes o where o.taller_id = v.taller_id and o.vehiculo_id = v.id),
           'orden_abierta', (select jsonb_build_object('id', o.id, 'numero', o.numero, 'estado', o.estado)
                               from public.ordenes o
                              where o.taller_id = v.taller_id and o.vehiculo_id = v.id
                                and o.estado = any (public.fn_estados_abiertos())))
    into v_r
    from public.vehiculos v
    join public.clientes c on c.taller_id = v.taller_id and c.id = v.cliente_id
   where v.taller_id = v_taller and v.placa = v_placa;
  return coalesce(v_r, jsonb_build_object('existe', false, 'placa', v_placa));
end $$;

-- A quién se le puede asignar un vehículo (quien abre "patio"), con el número de órdenes abiertas que tiene.
create or replace function public.listar_jefes_patio()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', p.user_id, 'nombre', p.nombre, 'yo', p.user_id = auth.uid(),
             'abiertas', (select count(*) from public.ordenes o
                           where o.taller_id = v_taller and o.asignado_a = p.user_id
                             and o.estado = any (public.fn_estados_abiertos()))
           ) order by p.user_id = auth.uid() desc, p.nombre)
      from public.perfiles p
     where p.taller_id = v_taller and coalesce(public.fn_areas_de(p.user_id) && array['patio'], false)), '[]'::jsonb);
end $$;

-- Las órdenes abiertas (las más viejas primero) y cuántas se entregaron hoy.
create or replace function public.listar_ordenes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
begin
  return jsonb_build_object(
    'abiertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'numero', o.numero, 'placa', v.placa, 'tipo', v.tipo, 'servicio', o.servicio,
               'estado', o.estado, 'estado_desde', o.estado_desde, 'created_at', o.created_at,
               'cliente', c.nombre,
               'asignado', case when o.asignado_a is null then null
                                else jsonb_build_object('user_id', o.asignado_a, 'nombre', public.fn_nombre_de(o.asignado_a)) end,
               'mia', coalesce(o.asignado_a = auth.uid(), false)
             ) order by o.created_at)
        from public.ordenes o
        join public.vehiculos v on v.taller_id = o.taller_id and v.id = o.vehiculo_id
        join public.clientes c on c.taller_id = o.taller_id and c.id = o.cliente_id
       where o.taller_id = v_taller and o.estado = any (public.fn_estados_abiertos())), '[]'::jsonb),
    'entregadas_hoy', (select count(*) from public.ordenes o
                        where o.taller_id = v_taller and o.estado = 'entregado'
                          and public.fecha_bogota(o.entregado_at) = public.hoy_bogota())
  );
end $$;

-- Una orden con su vehículo, su cliente y su historia.
create or replace function public.obtener_orden(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_r      jsonb;
begin
  select jsonb_build_object(
           'id', o.id, 'numero', o.numero, 'token', o.token, 'servicio', o.servicio, 'kilometraje', o.kilometraje,
           'estado', o.estado, 'estado_desde', o.estado_desde, 'created_at', o.created_at,
           'entregado_at', o.entregado_at, 'cancelada_at', o.cancelada_at, 'motivo_cancelacion', o.motivo_cancelacion,
           'vehiculo', jsonb_build_object('placa', v.placa, 'tipo', v.tipo),
           'cliente', jsonb_build_object('nombre', c.nombre, 'celular', c.celular),
           'asignado', case when o.asignado_a is null then null
                            else jsonb_build_object('user_id', o.asignado_a, 'nombre', public.fn_nombre_de(o.asignado_a)) end,
           'mia', coalesce(o.asignado_a = auth.uid(), false),
           'eventos', coalesce((select jsonb_agg(jsonb_build_object(
                                         'tipo', e.tipo, 'estado', e.estado, 'detalle', e.detalle,
                                         'autor', e.autor, 'at', e.created_at) order by e.created_at, e.id)
                                  from public.orden_eventos e
                                 where e.taller_id = o.taller_id and e.orden_id = o.id), '[]'::jsonb))
    into v_r
    from public.ordenes o
    join public.vehiculos v on v.taller_id = o.taller_id and v.id = o.vehiculo_id
    join public.clientes c on c.taller_id = o.taller_id and c.id = o.cliente_id
   where o.taller_id = v_taller and o.id = p_id;
  if v_r is null then
    raise exception 'La orden no existe.' using errcode = 'P0002';
  end if;
  return v_r;
end $$;

-- ---------------------------------------------------------------------
-- 6. Enlace del cliente (sin cuenta: el token es su único permiso)
-- ---------------------------------------------------------------------
create or replace function public.fn_publico_orden(p_token uuid, p_ahora timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d record;
begin
  select o.id, o.taller_id, o.numero, o.servicio, o.estado, o.estado_desde, o.created_at, o.entregado_at,
         o.cancelada_at, o.asignado_a, ve.placa, ve.tipo, c.nombre as cliente,
         t.nombre as taller, t.whatsapp, t.direccion
    into d
    from public.ordenes o
    join public.talleres t on t.id = o.taller_id
    join public.vehiculos ve on ve.taller_id = o.taller_id and ve.id = o.vehiculo_id
    join public.clientes c on c.taller_id = o.taller_id and c.id = o.cliente_id
   where o.token = p_token;
  if not found or coalesce(d.entregado_at, d.cancelada_at) < p_ahora - interval '30 days' then
    return jsonb_build_object('existe', false);
  end if;

  return jsonb_build_object(
    'existe', true,
    'taller', jsonb_build_object('nombre', d.taller, 'whatsapp', d.whatsapp, 'direccion', d.direccion),
    'orden', jsonb_build_object(
      'numero', d.numero, 'placa', d.placa, 'tipo', d.tipo, 'servicio', d.servicio, 'estado', d.estado,
      'estado_desde', d.estado_desde, 'created_at', d.created_at, 'entregado_at', d.entregado_at,
      -- Solo primeros nombres: ni apellidos ni celulares salen por el enlace.
      'cliente', nullif(split_part(btrim(coalesce(d.cliente, '')), ' ', 1), ''),
      'atiende', nullif(split_part(btrim(coalesce(public.fn_nombre_de(d.asignado_a), '')), ' ', 1), ''),
      'historia', coalesce((select jsonb_agg(jsonb_build_object('estado', e.estado, 'at', e.created_at)
                                             order by e.created_at, e.id)
                              from public.orden_eventos e
                             where e.taller_id = d.taller_id and e.orden_id = d.id and e.estado is not null), '[]'::jsonb)));
end $$;

create or replace function public.publico_orden(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.fn_publico_orden(p_token, now()) $$;

select public.fn_aplicar_permisos();

-- >>>>>>>>>> 20261018000007_fotos.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0007 · FOTOS DE INGRESO (SPEC F3)
--
--   * Al recibir el vehículo se le toman fotos de su estado (golpes, rayones). El celular las achica a JPEG
--     (≤ 1280 px, < 1 MB) y el servidor de la app las sube con la sesión de quien las toma.
--   * Bucket `fotos`, ruta <taller_id>/<orden_id>/<clave>.jpg. La clave (uuid) la genera el celular: es también el id
--     de la foto, así un reintento por mala señal no duplica nada.
--   * SIN service_role: el cliente no tiene sesión, así que la app sirve las fotos ella misma: al personal con su
--     sesión (ruta_foto_orden) y al cliente con el token de su enlace (publico_ruta_foto). Para poder leerlas sin
--     sesión, el bucket se marca público, pero nadie puede LISTARLO (sin política de lectura para anon) y la ruta nunca
--     sale de la app: lleva dos uuid que no se pueden adivinar.
--   * Quitar una foto = anularla con motivo (el archivo queda; nada se borra). Hasta 12 fotos de ingreso por orden,
--     solo mientras la orden esté abierta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------
create table if not exists public.fotos_orden (
  id               uuid primary key,
  taller_id        uuid not null references public.talleres(id),
  orden_id         uuid not null,
  tipo             text not null default 'ingreso' check (tipo in ('ingreso')),
  ruta             text not null check (ruta ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  autor            text,
  anulada_at       timestamptz,
  motivo_anulacion text check (motivo_anulacion is null or length(btrim(motivo_anulacion)) between 3 and 200),
  created_at       timestamptz not null default now(),
  registrado_por   uuid default auth.uid() references auth.users(id) on delete set null,
  unique (taller_id, id),
  unique (ruta),
  foreign key (taller_id, orden_id) references public.ordenes (taller_id, id),
  -- La ruta es la del taller, de la orden y de la foto: nadie apunta a archivos ajenos.
  constraint chk_foto_ruta check (ruta = taller_id::text || '/' || orden_id::text || '/' || id::text || '.jpg'),
  check ((anulada_at is null) = (motivo_anulacion is null))
);
create index if not exists idx_fotos_orden_orden on public.fotos_orden (taller_id, orden_id, created_at);
comment on table public.fotos_orden is 'Fotos de una orden (por ahora, las de ingreso). Se anulan con motivo; no se borran.';

alter table public.fotos_orden enable row level security;
drop policy if exists fotos_orden_select on public.fotos_orden;
create policy fotos_orden_select on public.fotos_orden for select to authenticated
  using (taller_id = (select public.mi_taller()) and (select public.tiene_area('recepcion', 'patio')));
grant select on public.fotos_orden to authenticated;

drop trigger if exists trg_bloquear_borrado on public.fotos_orden;
create trigger trg_bloquear_borrado before delete on public.fotos_orden
  for each row execute function public.fn_bloquear_borrado();

-- ---------------------------------------------------------------------
-- 2. Storage: el bucket y quién sube
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Sube quien trabaja vehículos, y solo en la carpeta de su taller.
drop policy if exists fotos_insert on storage.objects;
create policy fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = (select public.mi_taller())::text
    and (select public.tiene_area('recepcion', 'patio'))
  );

-- Ve la lista de archivos solo el personal de ese taller. Para anon no hay política: no puede listar el bucket.
drop policy if exists fotos_select on storage.objects;
create policy fotos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = (select public.mi_taller())::text
    and (select public.tiene_area('recepcion', 'patio'))
  );

-- ---------------------------------------------------------------------
-- 3. Escrituras
-- ---------------------------------------------------------------------

-- Registra una foto ya subida. La ruta la arma la base (taller/orden/clave.jpg): la app sube con esa misma regla.
create or replace function public.registrar_foto_orden(p_clave uuid, p_orden uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_previa public.fotos_orden%rowtype;
  v_ruta   text;
begin
  if p_clave is null then
    raise exception 'Falta la clave de la foto. Vuelve a tomarla.';
  end if;
  -- Reintento (mala señal): la misma clave devuelve la misma foto.
  select * into v_previa from public.fotos_orden where id = p_clave;
  if found then
    if v_previa.taller_id <> v_taller or v_previa.orden_id <> p_orden then
      raise exception 'Falta la clave de la foto. Vuelve a tomarla.';
    end if;
    return jsonb_build_object('id', v_previa.id, 'repetida', true);
  end if;

  perform public.fn_orden_abierta_para_cambiar(v_taller, p_orden);
  if (select count(*) from public.fotos_orden
       where taller_id = v_taller and orden_id = p_orden and tipo = 'ingreso' and anulada_at is null) >= 12 then
    raise exception 'Ya hay 12 fotos de ingreso. Quita alguna antes de tomar otra.';
  end if;

  v_ruta := v_taller::text || '/' || p_orden::text || '/' || p_clave::text || '.jpg';
  insert into public.fotos_orden (id, taller_id, orden_id, tipo, ruta, autor)
  values (p_clave, v_taller, p_orden, 'ingreso', v_ruta, public.fn_nombre_de(auth.uid()));

  return jsonb_build_object('id', p_clave, 'repetida', false);
end $$;

-- Quitar una foto (equivocada, borrosa): queda anulada con su motivo.
create or replace function public.quitar_foto_orden(p_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_motivo text := coalesce(nullif(left(public.fn_limpiar_texto(p_motivo), 200), ''), 'Se quitó la foto');
begin
  if length(v_motivo) < 3 then
    v_motivo := 'Se quitó la foto';
  end if;
  update public.fotos_orden set anulada_at = now(), motivo_anulacion = v_motivo
   where taller_id = v_taller and id = p_id and anulada_at is null;
  if not found then
    raise exception 'La foto no existe o ya se quitó.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_id);
end $$;

-- ---------------------------------------------------------------------
-- 4. Lecturas
-- ---------------------------------------------------------------------

-- La ruta de una foto para que la app la sirva al personal (null si no existe, se quitó o es de otro taller).
create or replace function public.ruta_foto_orden(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
begin
  return (select ruta from public.fotos_orden where taller_id = v_taller and id = p_id and anulada_at is null);
end $$;

-- Una orden con su vehículo, su cliente, sus fotos y su historia (0006 + fotos).
create or replace function public.obtener_orden(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_r      jsonb;
begin
  select jsonb_build_object(
           'id', o.id, 'numero', o.numero, 'token', o.token, 'servicio', o.servicio, 'kilometraje', o.kilometraje,
           'estado', o.estado, 'estado_desde', o.estado_desde, 'created_at', o.created_at,
           'entregado_at', o.entregado_at, 'cancelada_at', o.cancelada_at, 'motivo_cancelacion', o.motivo_cancelacion,
           'vehiculo', jsonb_build_object('placa', v.placa, 'tipo', v.tipo),
           'cliente', jsonb_build_object('nombre', c.nombre, 'celular', c.celular),
           'asignado', case when o.asignado_a is null then null
                            else jsonb_build_object('user_id', o.asignado_a, 'nombre', public.fn_nombre_de(o.asignado_a)) end,
           'mia', coalesce(o.asignado_a = auth.uid(), false),
           'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'tipo', f.tipo, 'autor', f.autor,
                                                                'at', f.created_at) order by f.created_at, f.id)
                                from public.fotos_orden f
                               where f.taller_id = o.taller_id and f.orden_id = o.id and f.anulada_at is null), '[]'::jsonb),
           'eventos', coalesce((select jsonb_agg(jsonb_build_object(
                                         'tipo', e.tipo, 'estado', e.estado, 'detalle', e.detalle,
                                         'autor', e.autor, 'at', e.created_at) order by e.created_at, e.id)
                                  from public.orden_eventos e
                                 where e.taller_id = o.taller_id and e.orden_id = o.id), '[]'::jsonb))
    into v_r
    from public.ordenes o
    join public.vehiculos v on v.taller_id = o.taller_id and v.id = o.vehiculo_id
    join public.clientes c on c.taller_id = o.taller_id and c.id = o.cliente_id
   where o.taller_id = v_taller and o.id = p_id;
  if v_r is null then
    raise exception 'La orden no existe.' using errcode = 'P0002';
  end if;
  return v_r;
end $$;

-- ---------------------------------------------------------------------
-- 5. Enlace del cliente: la orden con sus fotos, y la ruta de cada foto con el token
-- ---------------------------------------------------------------------

-- ¿Sigue visible el enlace? (existe y no lleva más de 30 días cerrada). Devuelve la orden o null.
create or replace function public.fn_orden_de_token(p_token uuid, p_ahora timestamptz)
returns public.ordenes
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.* from public.ordenes o
   where o.token = p_token
     and coalesce(coalesce(o.entregado_at, o.cancelada_at) >= p_ahora - interval '30 days', true)
$$;

create or replace function public.fn_publico_orden(p_token uuid, p_ahora timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  o public.ordenes%rowtype := public.fn_orden_de_token(p_token, p_ahora);
  d record;
begin
  if o.id is null then
    return jsonb_build_object('existe', false);
  end if;
  select ve.placa, ve.tipo, c.nombre as cliente, t.nombre as taller, t.whatsapp, t.direccion
    into d
    from public.talleres t
    join public.vehiculos ve on ve.taller_id = t.id and ve.id = o.vehiculo_id
    join public.clientes c on c.taller_id = t.id and c.id = o.cliente_id
   where t.id = o.taller_id;

  return jsonb_build_object(
    'existe', true,
    'taller', jsonb_build_object('nombre', d.taller, 'whatsapp', d.whatsapp, 'direccion', d.direccion),
    'orden', jsonb_build_object(
      'numero', o.numero, 'placa', d.placa, 'tipo', d.tipo, 'servicio', o.servicio, 'estado', o.estado,
      'estado_desde', o.estado_desde, 'created_at', o.created_at, 'entregado_at', o.entregado_at,
      -- Solo primeros nombres: ni apellidos ni celulares salen por el enlace.
      'cliente', nullif(split_part(btrim(coalesce(d.cliente, '')), ' ', 1), ''),
      'atiende', nullif(split_part(btrim(coalesce(public.fn_nombre_de(o.asignado_a), '')), ' ', 1), ''),
      -- Las fotos van por id: la ruta del archivo no sale de aquí.
      'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'tipo', f.tipo, 'at', f.created_at)
                                          order by f.created_at, f.id)
                           from public.fotos_orden f
                          where f.taller_id = o.taller_id and f.orden_id = o.id and f.anulada_at is null), '[]'::jsonb),
      'historia', coalesce((select jsonb_agg(jsonb_build_object('estado', e.estado, 'at', e.created_at)
                                             order by e.created_at, e.id)
                              from public.orden_eventos e
                             where e.taller_id = o.taller_id and e.orden_id = o.id and e.estado is not null), '[]'::jsonb)));
end $$;

-- La ruta de una foto de la orden de ESE token (la usa el servidor de la app para servirla). null si no corresponde.
create or replace function public.fn_publico_ruta_foto(p_token uuid, p_foto uuid, p_ahora timestamptz)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.ruta
    from public.fotos_orden f
    join public.fn_orden_de_token(p_token, p_ahora) o on o.taller_id = f.taller_id and o.id = f.orden_id
   where f.id = p_foto and f.anulada_at is null
$$;

create or replace function public.publico_ruta_foto(p_token uuid, p_foto uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.fn_publico_ruta_foto(p_token, p_foto, now()) $$;

select public.fn_aplicar_permisos();

-- >>>>>>>>>> 20261018000008_hallazgos.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0008 · HALLAZGOS Y AUTORIZACIÓN (SPEC F4)
--
--   * CATÁLOGO por taller: los hallazgos más comunes con su descripción ya escrita para el cliente. Cada taller nace
--     con ~30 (llantas, dirección, frenos, suspensión, motor, eléctrico) y los ajusta quien abre el área "catalogo".
--   * HALLAZGO: lo que el jefe de patio encontró en un vehículo (del catálogo o escrito a mano), con precio opcional
--     y hasta 3 fotos. La clave la genera el celular: un reintento no lo duplica.
--   * RESPUESTA ÚNICA: el cliente autoriza o rechaza desde su enlace (publico_responder_hallazgo), o el taller anota
--     la respuesta que le dieron por teléfono. Una vez respondido no cambia; un error del taller se anula con motivo.
--   * AVISO PUSH: cuando el cliente responde, el servidor de la app toma UNA vez (y solo en los 10 minutos siguientes)
--     las suscripciones de quien atiende el vehículo (o de todo el patio si nadie lo tiene) con publico_tomar_aviso.
--     Sin service_role: es la misma puerta que en Barberías.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogo
-- ---------------------------------------------------------------------
-- Espejo en src/lib/hallazgos.ts (una prueba las compara).
create or replace function public.fn_categorias_hallazgo()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$ select array['llantas', 'direccion', 'frenos', 'suspension', 'motor', 'electrico', 'otros']::text[] $$;

create table if not exists public.catalogo_hallazgos (
  id              uuid primary key default gen_random_uuid(),
  taller_id       uuid not null references public.talleres(id),
  categoria       text not null check (categoria = any (public.fn_categorias_hallazgo())),
  nombre          text not null check (length(btrim(nombre)) between 1 and 80),
  descripcion     text not null check (length(btrim(descripcion)) between 1 and 300),
  precio_sugerido integer check (precio_sugerido is null or precio_sugerido between 0 and 20000000),
  orden           integer not null default 0,
  activo          boolean not null default true,      -- archivar = activo false (no se borra)
  created_at      timestamptz not null default now(),
  registrado_por  uuid default auth.uid() references auth.users(id) on delete set null,
  unique (taller_id, id)
);
create unique index if not exists ux_catalogo_hallazgos_nombre on public.catalogo_hallazgos (taller_id, lower(nombre)) where activo;
comment on table public.catalogo_hallazgos is 'Hallazgos comunes del taller, con la descripción que lee el cliente.';

alter table public.catalogo_hallazgos enable row level security;
drop policy if exists catalogo_hallazgos_select on public.catalogo_hallazgos;
create policy catalogo_hallazgos_select on public.catalogo_hallazgos for select to authenticated
  using (taller_id = (select public.mi_taller()) and (select public.tiene_area('recepcion', 'patio', 'catalogo')));
grant select on public.catalogo_hallazgos to authenticated;

drop trigger if exists trg_bloquear_borrado on public.catalogo_hallazgos;
create trigger trg_bloquear_borrado before delete on public.catalogo_hallazgos
  for each row execute function public.fn_bloquear_borrado();

-- Con lo que arranca un taller (solo si todavía no tiene ninguno). Textos para el cliente, sin tecnicismos.
create or replace function public.fn_catalogo_inicial(p_taller uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.catalogo_hallazgos (taller_id, categoria, nombre, descripcion, orden)
  select p_taller, c.categoria, c.nombre, c.descripcion, c.orden
    from (values
      ('llantas', 'Llanta lisa (sin labrado)', 'La llanta perdió el labrado: en lluvia el carro se patina y frena mal. Se recomienda cambiarla.', 1),
      ('llantas', 'Llanta con desgaste irregular', 'La llanta se gastó más por un lado. Suele ser por alineación; si sigue así, dura mucho menos.', 2),
      ('llantas', 'Llanta con corte o chichón lateral', 'La llanta tiene un corte o un chichón en el costado. Puede estallar: no es seguro seguir usándola.', 3),
      ('llantas', 'Llanta con clavo o pinchazo', 'Encontramos un clavo o un pinchazo. Se puede reparar si está en la zona de rodamiento.', 4),
      ('llantas', 'Válvula de llanta dañada', 'La válvula por donde se infla la llanta está dañada y deja escapar el aire.', 5),
      ('llantas', 'Rin golpeado o torcido', 'El rin tiene un golpe o está torcido: hace vibrar el carro y puede dañar la llanta.', 6),
      ('direccion', 'Desalineación', 'Las llantas no van derechas: el carro se va hacia un lado y las llantas se gastan rápido.', 1),
      ('direccion', 'Balanceo necesario (vibración)', 'Las llantas están desbalanceadas: por eso vibra el timón a cierta velocidad.', 2),
      ('direccion', 'Terminales de dirección con juego', 'Las piezas que unen la dirección con las ruedas tienen juego: el timón se siente flojo.', 3),
      ('direccion', 'Rótulas con juego', 'Las rótulas (articulaciones de la suspensión) están flojas: suenan y desgastan las llantas.', 4),
      ('direccion', 'Bujes de tijera desgastados', 'Los cauchos de la suspensión delantera están gastados: el carro suena y pierde estabilidad.', 5),
      ('direccion', 'Cremallera de dirección con fuga', 'La dirección pierde líquido: con el tiempo se pone dura y se puede dañar.', 6),
      ('frenos', 'Pastillas de freno delanteras gastadas', 'Las pastillas están por debajo del mínimo: el carro tarda más en frenar.', 1),
      ('frenos', 'Pastillas de freno traseras gastadas', 'Las pastillas de atrás están por debajo del mínimo: frenar toma más distancia.', 2),
      ('frenos', 'Bandas de freno gastadas', 'Las bandas de los frenos traseros están gastadas: el freno de mano y el frenado pierden fuerza.', 3),
      ('frenos', 'Discos de freno rayados o torcidos', 'Los discos están rayados o torcidos: el pedal vibra y las pastillas nuevas se gastan rápido.', 4),
      ('frenos', 'Líquido de frenos vencido o bajo', 'El líquido de frenos está bajo o vencido: el pedal se puede ir al fondo.', 5),
      ('suspension', 'Amortiguadores delanteros con fuga', 'Los amortiguadores de adelante botan aceite: el carro rebota y frena peor.', 1),
      ('suspension', 'Amortiguadores traseros con fuga', 'Los amortiguadores de atrás botan aceite: el carro rebota y pierde estabilidad.', 2),
      ('suspension', 'Bases de amortiguador dañadas', 'Las bases de los amortiguadores están dañadas: suenan al pasar huecos y resaltos.', 3),
      ('suspension', 'Espirales vencidos o partidos', 'Los resortes de la suspensión están vencidos o partidos: el carro va bajito y golpea.', 4),
      ('suspension', 'Bieletas o cauchos de estabilizadora dañados', 'Las piezas de la barra estabilizadora están flojas: el carro suena y se inclina en las curvas.', 5),
      ('motor', 'Aceite de motor vencido', 'El aceite ya cumplió su tiempo o kilometraje: protege menos al motor.', 1),
      ('motor', 'Fuga de aceite', 'El motor bota aceite. Hay que encontrar por dónde antes de que se quede sin aceite.', 2),
      ('motor', 'Filtro de aire sucio', 'El filtro de aire está tapado: el motor respira mal y gasta más combustible.', 3),
      ('motor', 'Correa de accesorios agrietada', 'La correa está agrietada: si se revienta, el carro se puede quedar sin carga ni dirección.', 4),
      ('motor', 'Refrigerante bajo o contaminado', 'El líquido refrigerante está bajo o sucio: el motor se puede recalentar.', 5),
      ('electrico', 'Batería débil', 'La batería está baja de carga: el carro puede no prender, sobre todo en la mañana.', 1),
      ('electrico', 'Bornes de batería sulfatados', 'Los bornes de la batería tienen sulfato: el carro arranca mal y se descarga.', 2),
      ('electrico', 'Bombillos fundidos', 'Hay bombillos fundidos: es un riesgo de noche y es causa de comparendo.', 3),
      ('electrico', 'Plumillas desgastadas', 'Las plumillas ya no limpian bien: en lluvia no se ve.', 4)
    ) as c(categoria, nombre, descripcion, orden)
   where not exists (select 1 from public.catalogo_hallazgos where taller_id = p_taller)
$$;

create or replace function public.fn_catalogo_de_taller_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_catalogo_inicial(new.id);
  return new;
end $$;

drop trigger if exists trg_catalogo_inicial on public.talleres;
create trigger trg_catalogo_inicial
  after insert on public.talleres
  for each row execute function public.fn_catalogo_de_taller_nuevo();

-- ---------------------------------------------------------------------
-- 2. Hallazgos de una orden
-- ---------------------------------------------------------------------
create table if not exists public.hallazgos (
  id               uuid primary key,
  taller_id        uuid not null references public.talleres(id),
  orden_id         uuid not null,
  catalogo_id      uuid,
  titulo           text not null check (length(btrim(titulo)) between 1 and 80),
  descripcion      text not null check (length(btrim(descripcion)) between 1 and 300),
  precio           integer check (precio is null or precio between 0 and 20000000),
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'autorizado', 'rechazado', 'anulado')),
  respondido_at    timestamptz,
  canal            text check (canal is null or canal in ('enlace', 'telefono')),
  -- Quién respondió, escrito al momento: el primer nombre del cliente o la persona del taller que anotó la llamada.
  autor_respuesta  text,
  anulado_at       timestamptz,
  motivo_anulacion text check (motivo_anulacion is null or length(btrim(motivo_anulacion)) between 3 and 200),
  -- Cuándo se tomó el aviso push de la respuesta (una sola vez).
  aviso_at         timestamptz,
  autor            text,
  created_at       timestamptz not null default now(),
  registrado_por   uuid default auth.uid() references auth.users(id) on delete set null,
  unique (taller_id, id),
  foreign key (taller_id, orden_id) references public.ordenes (taller_id, id),
  foreign key (taller_id, catalogo_id) references public.catalogo_hallazgos (taller_id, id),
  check (estado not in ('autorizado', 'rechazado') or (respondido_at is not null and canal is not null)),
  check (estado <> 'pendiente' or (respondido_at is null and canal is null)),
  check ((estado = 'anulado') = (anulado_at is not null and motivo_anulacion is not null))
);
create index if not exists idx_hallazgos_orden on public.hallazgos (taller_id, orden_id, created_at);
comment on table public.hallazgos is 'Lo que se encontró en un vehículo y la respuesta del cliente (autoriza o no).';

alter table public.hallazgos enable row level security;
drop policy if exists hallazgos_select on public.hallazgos;
create policy hallazgos_select on public.hallazgos for select to authenticated
  using (taller_id = (select public.mi_taller()) and (select public.tiene_area('recepcion', 'patio')));
grant select on public.hallazgos to authenticated;

drop trigger if exists trg_bloquear_borrado on public.hallazgos;
create trigger trg_bloquear_borrado before delete on public.hallazgos
  for each row execute function public.fn_bloquear_borrado();

-- La historia de la orden cuenta también los hallazgos y sus respuestas.
alter table public.orden_eventos drop constraint if exists orden_eventos_tipo_check;
alter table public.orden_eventos add constraint orden_eventos_tipo_check
  check (tipo in ('creada', 'estado', 'asignacion', 'cancelada', 'hallazgo', 'respuesta'));

-- Las fotos de un hallazgo son fotos de la orden ligadas a él.
alter table public.fotos_orden add column if not exists hallazgo_id uuid;
alter table public.fotos_orden drop constraint if exists fotos_orden_tipo_check;
alter table public.fotos_orden add constraint fotos_orden_tipo_check check (tipo in ('ingreso', 'hallazgo'));
alter table public.fotos_orden drop constraint if exists fk_fotos_orden_hallazgo;
alter table public.fotos_orden add constraint fk_fotos_orden_hallazgo
  foreign key (taller_id, hallazgo_id) references public.hallazgos (taller_id, id);
alter table public.fotos_orden drop constraint if exists chk_foto_hallazgo;
alter table public.fotos_orden add constraint chk_foto_hallazgo check ((tipo = 'hallazgo') = (hallazgo_id is not null));

-- ---------------------------------------------------------------------
-- 3. Suscripciones push del personal
-- ---------------------------------------------------------------------
create table if not exists public.suscripciones_push (
  id             uuid primary key default gen_random_uuid(),
  taller_id      uuid not null references public.talleres(id),
  user_id        uuid not null,
  endpoint       text not null check (endpoint ~ '^https://' and length(endpoint) between 20 and 1000),
  p256dh         text not null check (length(p256dh) between 20 and 200),
  auth           text not null check (length(auth) between 8 and 100),
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (endpoint),
  foreign key (taller_id, user_id) references public.perfiles (taller_id, user_id) on delete cascade
);
create index if not exists idx_suscripciones_push_taller on public.suscripciones_push (taller_id);
comment on table public.suscripciones_push is 'Celulares del equipo que reciben avisos cuando un cliente responde (Web Push).';

alter table public.suscripciones_push enable row level security;
-- Sin políticas y sin privilegios: son llaves de cifrado. Solo las funciones de abajo las tocan.

-- ---------------------------------------------------------------------
-- 4. Catálogo: lectura y edición
-- ---------------------------------------------------------------------
create or replace function public.listar_catalogo(p_todos boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio', 'catalogo');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'categoria', c.categoria, 'nombre', c.nombre, 'descripcion', c.descripcion,
             'precio_sugerido', c.precio_sugerido, 'activo', c.activo
           ) order by array_position(public.fn_categorias_hallazgo(), c.categoria), c.orden, c.nombre)
      from public.catalogo_hallazgos c
     where c.taller_id = v_taller and (c.activo or coalesce(p_todos, false))), '[]'::jsonb);
end $$;

-- Crear (p_id null) o editar un hallazgo del catálogo.
create or replace function public.guardar_hallazgo_catalogo(
  p_id          uuid,
  p_categoria   text,
  p_nombre      text,
  p_descripcion text,
  p_precio      integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller      uuid := public.requerir_area('catalogo');
  v_nombre      text := public.fn_limpiar_texto(p_nombre);
  v_descripcion text := public.fn_limpiar_texto(p_descripcion);
  v_id          uuid;
begin
  if p_categoria is null or not (p_categoria = any (public.fn_categorias_hallazgo())) then
    raise exception 'Elige la categoría.';
  end if;
  if length(v_nombre) = 0 or length(v_nombre) > 80 then
    raise exception 'Escribe el nombre del hallazgo (máximo 80 caracteres).';
  end if;
  if length(v_descripcion) = 0 or length(v_descripcion) > 300 then
    raise exception 'Escribe lo que le explicamos al cliente (máximo 300 caracteres).';
  end if;
  if p_precio is not null and (p_precio < 0 or p_precio > 20000000) then
    raise exception 'El precio no es válido.';
  end if;

  begin
    if p_id is null then
      insert into public.catalogo_hallazgos (taller_id, categoria, nombre, descripcion, precio_sugerido, orden)
      values (v_taller, p_categoria, v_nombre, v_descripcion, p_precio,
              coalesce((select max(orden) + 1 from public.catalogo_hallazgos where taller_id = v_taller and categoria = p_categoria), 1))
      returning id into v_id;
    else
      update public.catalogo_hallazgos
         set categoria = p_categoria, nombre = v_nombre, descripcion = v_descripcion, precio_sugerido = p_precio
       where taller_id = v_taller and id = p_id
      returning id into v_id;
      if v_id is null then
        raise exception 'Ese hallazgo no existe.' using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay un hallazgo con ese nombre.';
  end;
  return jsonb_build_object('id', v_id);
end $$;

-- Archivar o restaurar (no se borra: los hallazgos viejos lo siguen nombrando).
create or replace function public.fijar_hallazgo_catalogo_activo(p_id uuid, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('catalogo');
begin
  begin
    update public.catalogo_hallazgos set activo = coalesce(p_activo, false) where taller_id = v_taller and id = p_id;
  exception when unique_violation then
    raise exception 'Ya hay otro hallazgo activo con ese nombre.';
  end;
  if not found then
    raise exception 'Ese hallazgo no existe.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_id, 'activo', coalesce(p_activo, false));
end $$;

-- ---------------------------------------------------------------------
-- 5. Hallazgos: crear, respuesta por teléfono, anular
-- ---------------------------------------------------------------------
create or replace function public.crear_hallazgo(
  p_clave       uuid,
  p_orden       uuid,
  p_titulo      text,
  p_descripcion text,
  p_precio      integer default null,
  p_catalogo    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller      uuid := public.requerir_area('patio');
  v_titulo      text := public.fn_limpiar_texto(p_titulo);
  v_descripcion text := public.fn_limpiar_texto(p_descripcion);
  v_previo      public.hallazgos%rowtype;
begin
  if p_clave is null then
    raise exception 'Falta la clave del hallazgo. Vuelve a abrir la pantalla.';
  end if;
  select * into v_previo from public.hallazgos where id = p_clave;
  if found then
    if v_previo.taller_id <> v_taller or v_previo.orden_id <> p_orden then
      raise exception 'Falta la clave del hallazgo. Vuelve a abrir la pantalla.';
    end if;
    return jsonb_build_object('id', v_previo.id, 'repetido', true);
  end if;

  perform public.fn_orden_abierta_para_cambiar(v_taller, p_orden);
  if length(v_titulo) = 0 or length(v_titulo) > 80 then
    raise exception 'Escribe qué se encontró (máximo 80 caracteres).';
  end if;
  if length(v_descripcion) = 0 or length(v_descripcion) > 300 then
    raise exception 'Explícale al cliente qué pasa (máximo 300 caracteres).';
  end if;
  if p_precio is not null and (p_precio < 0 or p_precio > 20000000) then
    raise exception 'El precio no es válido.';
  end if;
  if p_catalogo is not null and not exists (select 1 from public.catalogo_hallazgos where taller_id = v_taller and id = p_catalogo) then
    raise exception 'Ese hallazgo no está en la lista del taller.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.hallazgos where taller_id = v_taller and orden_id = p_orden and estado <> 'anulado') >= 20 then
    raise exception 'Esta orden ya tiene 20 hallazgos. Anula alguno antes de agregar otro.';
  end if;

  insert into public.hallazgos (id, taller_id, orden_id, catalogo_id, titulo, descripcion, precio, autor)
  values (p_clave, v_taller, p_orden, p_catalogo, v_titulo, v_descripcion, p_precio, public.fn_nombre_de(auth.uid()));
  insert into public.orden_eventos (taller_id, orden_id, tipo, detalle, autor)
  values (v_taller, p_orden, 'hallazgo', left(v_titulo, 200), public.fn_nombre_de(auth.uid()));

  return jsonb_build_object('id', p_clave, 'repetido', false);
end $$;

-- El hallazgo pendiente del taller, bloqueado, con su orden abierta. Falla con un mensaje claro si no se puede responder.
create or replace function public.fn_hallazgo_para_responder(p_taller uuid, p_id uuid)
returns public.hallazgos
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v public.hallazgos%rowtype;
begin
  select * into v from public.hallazgos where taller_id = p_taller and id = p_id for update;
  if not found then
    raise exception 'Ese hallazgo no existe.' using errcode = 'P0002';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'Este hallazgo ya tiene respuesta (%).', v.estado;
  end if;
  perform public.fn_orden_abierta_para_cambiar(p_taller, v.orden_id);
  return v;
end $$;

-- El cliente respondió por teléfono (o en persona): se anota con el nombre de quien atendió.
create or replace function public.responder_hallazgo_telefono(p_id uuid, p_respuesta text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v        public.hallazgos%rowtype;
  v_autor  text := public.fn_nombre_de(auth.uid());
begin
  if p_respuesta is null or p_respuesta not in ('autorizado', 'rechazado') then
    raise exception 'Elige si el cliente autorizó o no.';
  end if;
  v := public.fn_hallazgo_para_responder(v_taller, p_id);

  update public.hallazgos
     set estado = p_respuesta, respondido_at = now(), canal = 'telefono', autor_respuesta = v_autor
   where taller_id = v_taller and id = p_id;
  insert into public.orden_eventos (taller_id, orden_id, tipo, detalle, autor)
  values (v_taller, v.orden_id, 'respuesta',
          left(case p_respuesta when 'autorizado' then 'Autorizó por teléfono: ' else 'No autorizó por teléfono: ' end || v.titulo, 200),
          v_autor);
  return jsonb_build_object('id', p_id, 'estado', p_respuesta);
end $$;

-- Un hallazgo puesto por error (o mal anotado): queda anulado con su motivo.
create or replace function public.anular_hallazgo(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('patio');
  v_motivo text := left(public.fn_limpiar_texto(p_motivo), 200);
  v        public.hallazgos%rowtype;
begin
  if length(v_motivo) < 3 then
    raise exception 'Escribe por qué se anula.';
  end if;
  select * into v from public.hallazgos where taller_id = v_taller and id = p_id for update;
  if not found or v.estado = 'anulado' then
    raise exception 'Ese hallazgo no existe o ya se anuló.' using errcode = 'P0002';
  end if;

  update public.hallazgos set estado = 'anulado', anulado_at = now(), motivo_anulacion = v_motivo
   where taller_id = v_taller and id = p_id;
  insert into public.orden_eventos (taller_id, orden_id, tipo, detalle, autor)
  values (v_taller, v.orden_id, 'hallazgo', left('Anulado: ' || v.titulo || ' (' || v_motivo || ')', 200),
          public.fn_nombre_de(auth.uid()));
  return jsonb_build_object('id', p_id, 'estado', 'anulado');
end $$;

-- ---------------------------------------------------------------------
-- 6. Fotos: ahora también de un hallazgo (0007 + p_hallazgo; la firma cambia, se borra la anterior)
-- ---------------------------------------------------------------------
drop function if exists public.registrar_foto_orden(uuid, uuid);

create or replace function public.registrar_foto_orden(p_clave uuid, p_orden uuid, p_hallazgo uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_previa public.fotos_orden%rowtype;
  v_ruta   text;
  v_tipo   text := case when p_hallazgo is null then 'ingreso' else 'hallazgo' end;
begin
  if p_clave is null then
    raise exception 'Falta la clave de la foto. Vuelve a tomarla.';
  end if;
  -- Reintento (mala señal): la misma clave devuelve la misma foto.
  select * into v_previa from public.fotos_orden where id = p_clave;
  if found then
    if v_previa.taller_id <> v_taller or v_previa.orden_id <> p_orden
       or v_previa.hallazgo_id is distinct from p_hallazgo then
      raise exception 'Falta la clave de la foto. Vuelve a tomarla.';
    end if;
    return jsonb_build_object('id', v_previa.id, 'repetida', true);
  end if;

  perform public.fn_orden_abierta_para_cambiar(v_taller, p_orden);
  if p_hallazgo is null then
    if (select count(*) from public.fotos_orden
         where taller_id = v_taller and orden_id = p_orden and tipo = 'ingreso' and anulada_at is null) >= 12 then
      raise exception 'Ya hay 12 fotos de ingreso. Quita alguna antes de tomar otra.';
    end if;
  else
    if not exists (select 1 from public.hallazgos
                    where taller_id = v_taller and id = p_hallazgo and orden_id = p_orden and estado <> 'anulado') then
      raise exception 'Ese hallazgo no existe.' using errcode = 'P0002';
    end if;
    if (select count(*) from public.fotos_orden
         where taller_id = v_taller and hallazgo_id = p_hallazgo and anulada_at is null) >= 3 then
      raise exception 'Un hallazgo lleva hasta 3 fotos.';
    end if;
  end if;

  v_ruta := v_taller::text || '/' || p_orden::text || '/' || p_clave::text || '.jpg';
  insert into public.fotos_orden (id, taller_id, orden_id, tipo, hallazgo_id, ruta, autor)
  values (p_clave, v_taller, p_orden, v_tipo, p_hallazgo, v_ruta, public.fn_nombre_de(auth.uid()));

  return jsonb_build_object('id', p_clave, 'repetida', false);
end $$;

-- ---------------------------------------------------------------------
-- 7. Lecturas del personal (redefinidas: 0006/0007 + hallazgos)
-- ---------------------------------------------------------------------
create or replace function public.listar_ordenes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
begin
  return jsonb_build_object(
    'abiertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'numero', o.numero, 'placa', v.placa, 'tipo', v.tipo, 'servicio', o.servicio,
               'estado', o.estado, 'estado_desde', o.estado_desde, 'created_at', o.created_at,
               'cliente', c.nombre,
               'asignado', case when o.asignado_a is null then null
                                else jsonb_build_object('user_id', o.asignado_a, 'nombre', public.fn_nombre_de(o.asignado_a)) end,
               'mia', coalesce(o.asignado_a = auth.uid(), false),
               'hallazgos_pendientes', (select count(*) from public.hallazgos h
                                         where h.taller_id = o.taller_id and h.orden_id = o.id and h.estado = 'pendiente'),
               'hallazgos_autorizados', (select count(*) from public.hallazgos h
                                          where h.taller_id = o.taller_id and h.orden_id = o.id and h.estado = 'autorizado')
             ) order by o.created_at)
        from public.ordenes o
        join public.vehiculos v on v.taller_id = o.taller_id and v.id = o.vehiculo_id
        join public.clientes c on c.taller_id = o.taller_id and c.id = o.cliente_id
       where o.taller_id = v_taller and o.estado = any (public.fn_estados_abiertos())), '[]'::jsonb),
    'entregadas_hoy', (select count(*) from public.ordenes o
                        where o.taller_id = v_taller and o.estado = 'entregado'
                          and public.fecha_bogota(o.entregado_at) = public.hoy_bogota())
  );
end $$;

create or replace function public.obtener_orden(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_r      jsonb;
begin
  select jsonb_build_object(
           'id', o.id, 'numero', o.numero, 'token', o.token, 'servicio', o.servicio, 'kilometraje', o.kilometraje,
           'estado', o.estado, 'estado_desde', o.estado_desde, 'created_at', o.created_at,
           'entregado_at', o.entregado_at, 'cancelada_at', o.cancelada_at, 'motivo_cancelacion', o.motivo_cancelacion,
           'vehiculo', jsonb_build_object('placa', v.placa, 'tipo', v.tipo),
           'cliente', jsonb_build_object('nombre', c.nombre, 'celular', c.celular),
           'asignado', case when o.asignado_a is null then null
                            else jsonb_build_object('user_id', o.asignado_a, 'nombre', public.fn_nombre_de(o.asignado_a)) end,
           'mia', coalesce(o.asignado_a = auth.uid(), false),
           'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'tipo', f.tipo, 'autor', f.autor,
                                                                'at', f.created_at) order by f.created_at, f.id)
                                from public.fotos_orden f
                               where f.taller_id = o.taller_id and f.orden_id = o.id and f.tipo = 'ingreso'
                                 and f.anulada_at is null), '[]'::jsonb),
           'hallazgos', coalesce((select jsonb_agg(jsonb_build_object(
                                           'id', h.id, 'titulo', h.titulo, 'descripcion', h.descripcion,
                                           'precio', h.precio, 'estado', h.estado, 'respondido_at', h.respondido_at,
                                           'canal', h.canal, 'autor_respuesta', h.autor_respuesta,
                                           'motivo_anulacion', h.motivo_anulacion, 'autor', h.autor, 'at', h.created_at,
                                           'fotos', coalesce((select jsonb_agg(f.id order by f.created_at, f.id)
                                                                from public.fotos_orden f
                                                               where f.taller_id = h.taller_id and f.hallazgo_id = h.id
                                                                 and f.anulada_at is null), '[]'::jsonb)
                                         ) order by h.created_at, h.id)
                                    from public.hallazgos h
                                   where h.taller_id = o.taller_id and h.orden_id = o.id), '[]'::jsonb),
           'eventos', coalesce((select jsonb_agg(jsonb_build_object(
                                         'tipo', e.tipo, 'estado', e.estado, 'detalle', e.detalle,
                                         'autor', e.autor, 'at', e.created_at) order by e.created_at, e.id)
                                  from public.orden_eventos e
                                 where e.taller_id = o.taller_id and e.orden_id = o.id), '[]'::jsonb))
    into v_r
    from public.ordenes o
    join public.vehiculos v on v.taller_id = o.taller_id and v.id = o.vehiculo_id
    join public.clientes c on c.taller_id = o.taller_id and c.id = o.cliente_id
   where o.taller_id = v_taller and o.id = p_id;
  if v_r is null then
    raise exception 'La orden no existe.' using errcode = 'P0002';
  end if;
  return v_r;
end $$;

-- ---------------------------------------------------------------------
-- 8. Enlace del cliente (redefinidas: 0007 + hallazgos)
-- ---------------------------------------------------------------------
create or replace function public.fn_publico_orden(p_token uuid, p_ahora timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  o public.ordenes%rowtype := public.fn_orden_de_token(p_token, p_ahora);
  d record;
begin
  if o.id is null then
    return jsonb_build_object('existe', false);
  end if;
  select ve.placa, ve.tipo, c.nombre as cliente, t.nombre as taller, t.whatsapp, t.direccion
    into d
    from public.talleres t
    join public.vehiculos ve on ve.taller_id = t.id and ve.id = o.vehiculo_id
    join public.clientes c on c.taller_id = t.id and c.id = o.cliente_id
   where t.id = o.taller_id;

  return jsonb_build_object(
    'existe', true,
    'taller', jsonb_build_object('nombre', d.taller, 'whatsapp', d.whatsapp, 'direccion', d.direccion),
    'orden', jsonb_build_object(
      'numero', o.numero, 'placa', d.placa, 'tipo', d.tipo, 'servicio', o.servicio, 'estado', o.estado,
      'estado_desde', o.estado_desde, 'created_at', o.created_at, 'entregado_at', o.entregado_at,
      -- Solo primeros nombres: ni apellidos ni celulares salen por el enlace.
      'cliente', nullif(split_part(btrim(coalesce(d.cliente, '')), ' ', 1), ''),
      'atiende', nullif(split_part(btrim(coalesce(public.fn_nombre_de(o.asignado_a), '')), ' ', 1), ''),
      -- Las fotos van por id: la ruta del archivo no sale de aquí.
      'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'tipo', f.tipo, 'at', f.created_at)
                                          order by f.created_at, f.id)
                           from public.fotos_orden f
                          where f.taller_id = o.taller_id and f.orden_id = o.id and f.tipo = 'ingreso'
                            and f.anulada_at is null), '[]'::jsonb),
      -- Los hallazgos vigentes (no los anulados), sin quién los registró.
      'hallazgos', coalesce((select jsonb_agg(jsonb_build_object(
                                      'id', h.id, 'titulo', h.titulo, 'descripcion', h.descripcion, 'precio', h.precio,
                                      'estado', h.estado, 'respondido_at', h.respondido_at, 'canal', h.canal,
                                      'fotos', coalesce((select jsonb_agg(f.id order by f.created_at, f.id)
                                                           from public.fotos_orden f
                                                          where f.taller_id = h.taller_id and f.hallazgo_id = h.id
                                                            and f.anulada_at is null), '[]'::jsonb)
                                    ) order by h.created_at, h.id)
                               from public.hallazgos h
                              where h.taller_id = o.taller_id and h.orden_id = o.id and h.estado <> 'anulado'), '[]'::jsonb),
      'historia', coalesce((select jsonb_agg(jsonb_build_object('estado', e.estado, 'at', e.created_at)
                                             order by e.created_at, e.id)
                              from public.orden_eventos e
                             where e.taller_id = o.taller_id and e.orden_id = o.id and e.estado is not null), '[]'::jsonb)));
end $$;

-- La ruta de una foto de la orden de ESE token (0007 + las de un hallazgo anulado ya no se sirven).
create or replace function public.fn_publico_ruta_foto(p_token uuid, p_foto uuid, p_ahora timestamptz)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.ruta
    from public.fotos_orden f
    join public.fn_orden_de_token(p_token, p_ahora) o on o.taller_id = f.taller_id and o.id = f.orden_id
   where f.id = p_foto and f.anulada_at is null
     and (f.hallazgo_id is null
          or exists (select 1 from public.hallazgos h
                      where h.taller_id = f.taller_id and h.id = f.hallazgo_id and h.estado <> 'anulado'))
$$;

-- El cliente autoriza o rechaza desde su enlace. Una sola vez: después ya no cambia.
create or replace function public.fn_publico_responder_hallazgo(p_token uuid, p_hallazgo uuid, p_respuesta text, p_ahora timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  o       public.ordenes%rowtype := public.fn_orden_de_token(p_token, p_ahora);
  v       public.hallazgos%rowtype;
  v_autor text;
begin
  if p_respuesta is null or p_respuesta not in ('autorizado', 'rechazado') or o.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  select * into v from public.hallazgos
   where taller_id = o.taller_id and orden_id = o.id and id = p_hallazgo and estado <> 'anulado'
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if v.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'ya_respondido', 'estado', v.estado);
  end if;
  if not (o.estado = any (public.fn_estados_abiertos())) then
    return jsonb_build_object('ok', false, 'motivo', 'cerrada');
  end if;

  select coalesce(nullif(split_part(btrim(coalesce(c.nombre, '')), ' ', 1), ''), 'El cliente') into v_autor
    from public.clientes c where c.taller_id = o.taller_id and c.id = o.cliente_id;
  update public.hallazgos
     set estado = p_respuesta, respondido_at = p_ahora, canal = 'enlace', autor_respuesta = v_autor
   where taller_id = o.taller_id and id = v.id;
  insert into public.orden_eventos (taller_id, orden_id, tipo, detalle, autor, registrado_por)
  values (o.taller_id, o.id, 'respuesta',
          left(case p_respuesta when 'autorizado' then 'Autorizó: ' else 'No autorizó: ' end || v.titulo, 200),
          v_autor, null);
  return jsonb_build_object('ok', true, 'estado', p_respuesta);
end $$;

create or replace function public.publico_responder_hallazgo(p_token uuid, p_hallazgo uuid, p_respuesta text)
returns jsonb
language sql
volatile
security definer
set search_path = public, pg_temp
as $$ select public.fn_publico_responder_hallazgo(p_token, p_hallazgo, p_respuesta, now()) $$;

-- ---------------------------------------------------------------------
-- 9. Avisos push
-- ---------------------------------------------------------------------
create or replace function public.guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
begin
  -- Si ese celular ya estaba (otra persona lo usaba antes), pasa a esta.
  insert into public.suscripciones_push (taller_id, user_id, endpoint, p256dh, auth)
  values (v_taller, auth.uid(), btrim(coalesce(p_endpoint, '')), btrim(coalesce(p_p256dh, '')), btrim(coalesce(p_auth, '')))
  on conflict (endpoint) do update
     set taller_id = excluded.taller_id, user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  return jsonb_build_object('ok', true);
exception when check_violation then
  raise exception 'Ese celular no pudo activar los avisos. Intenta de nuevo.';
end $$;

create or replace function public.quitar_suscripcion_push(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
begin
  delete from public.suscripciones_push where taller_id = v_taller and user_id = auth.uid() and endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end $$;

-- Con el token del cliente: los datos del aviso y las suscripciones de quien debe enterarse, UNA vez por respuesta y
-- solo en los 10 minutos siguientes. Recibe quien atiende el vehículo; si nadie, todo el que abre "patio".
create or replace function public.publico_tomar_aviso(p_token uuid, p_hallazgo uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  o      public.ordenes%rowtype := public.fn_orden_de_token(p_token, now());
  v      public.hallazgos%rowtype;
  v_subs jsonb;
begin
  if o.id is null then
    return jsonb_build_object('ok', false);
  end if;
  select * into v from public.hallazgos
   where taller_id = o.taller_id and orden_id = o.id and id = p_hallazgo
     for update;
  if not found or v.canal is distinct from 'enlace' or v.aviso_at is not null
     or v.respondido_at < now() - interval '10 minutes' then
    return jsonb_build_object('ok', false);
  end if;
  update public.hallazgos set aviso_at = now() where taller_id = o.taller_id and id = v.id;

  select coalesce(jsonb_agg(jsonb_build_object('endpoint', sp.endpoint, 'p256dh', sp.p256dh, 'auth', sp.auth)), '[]'::jsonb)
    into v_subs
    from public.suscripciones_push sp
   where sp.taller_id = o.taller_id
     and case when o.asignado_a is not null then sp.user_id = o.asignado_a
              else coalesce(public.fn_areas_de(sp.user_id) && array['patio'], false) end;

  return jsonb_build_object(
    'ok', true,
    'aviso', jsonb_build_object(
      'orden_id', o.id, 'numero', o.numero, 'estado', v.estado, 'titulo', v.titulo,
      'placa', (select placa from public.vehiculos where taller_id = o.taller_id and id = o.vehiculo_id),
      'cliente', v.autor_respuesta),
    'suscripciones', v_subs);
end $$;

-- Borra una suscripción que el servicio de push dio por muerta (404/410).
create or replace function public.publico_olvidar_suscripcion_push(p_endpoint text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with borradas as (
    delete from public.suscripciones_push where endpoint = p_endpoint returning 1
  )
  select jsonb_build_object('ok', true, 'borradas', (select count(*) from borradas))
$$;

-- Los talleres que ya existían también reciben su catálogo inicial.
select public.fn_catalogo_inicial(id) from public.talleres;

select public.fn_aplicar_permisos();

-- >>>>>>>>>> 20261021000009_mensajes.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0009 · MENSAJES DESDE EL ENLACE (SPEC F6)
--
--   * El CLIENTE escribe desde su enlace (publico_enviar_mensaje) mientras la orden está abierta. Límite anti-spam:
--     10 mensajes por hora por orden. La clave la genera el celular: un reintento no lo duplica.
--   * El TALLER responde desde la orden (enviar_mensaje_orden, recepción o patio) y le avisa al cliente por wa.me
--     (la app nunca manda mensajes sola). Responder o abrir la orden marca como vistos los del cliente.
--   * AVISO PUSH: cuando el cliente escribe, el servidor toma UNA vez (y solo en los 10 minutos siguientes) las
--     suscripciones de quien atiende el vehículo, o de todo el patio si nadie lo tiene (publico_tomar_aviso_mensaje).
--   * Nada se borra ni se edita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mensajes de una orden
-- ---------------------------------------------------------------------
create table if not exists public.mensajes_orden (
  id             uuid primary key,                 -- la clave que generó el celular
  taller_id      uuid not null references public.talleres(id),
  orden_id       uuid not null,
  de             text not null check (de in ('cliente', 'taller')),
  texto          text not null check (length(btrim(texto)) between 1 and 500),
  -- Quién escribió, al momento: el primer nombre del cliente o el nombre de la persona del taller.
  autor          text,
  -- Solo los del cliente: cuándo lo vio el taller y cuándo se tomó su aviso push (una vez).
  leido_at       timestamptz,
  aviso_at       timestamptz,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (taller_id, id),
  foreign key (taller_id, orden_id) references public.ordenes (taller_id, id),
  check (de = 'cliente' or (leido_at is null and aviso_at is null))
);
create index if not exists idx_mensajes_orden on public.mensajes_orden (taller_id, orden_id, created_at);
create index if not exists idx_mensajes_sin_leer on public.mensajes_orden (taller_id, orden_id)
  where de = 'cliente' and leido_at is null;
comment on table public.mensajes_orden is 'Mensajes entre el cliente (desde su enlace) y el taller, por orden.';

alter table public.mensajes_orden enable row level security;
drop policy if exists mensajes_orden_select on public.mensajes_orden;
create policy mensajes_orden_select on public.mensajes_orden for select to authenticated
  using (taller_id = (select public.mi_taller()) and (select public.tiene_area('recepcion', 'patio')));
grant select on public.mensajes_orden to authenticated;

drop trigger if exists trg_bloquear_borrado on public.mensajes_orden;
create trigger trg_bloquear_borrado before delete on public.mensajes_orden
  for each row execute function public.fn_bloquear_borrado();

-- Un mensaje conserva sus renglones, pero sin espacios de sobra ni más de una línea en blanco seguida.
create or replace function public.fn_limpiar_mensaje(p_texto text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select btrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(replace(coalesce(p_texto, ''), E'\r', ''), '[ \t\f\v]+', ' ', 'g'),
               ' ?\n ?', E'\n', 'g'),
             '\n{3,}', E'\n\n', 'g'),
           E' \n')
$$;

-- Espejo en src/lib/mensajes.ts (una prueba las compara).
create or replace function public.fn_limite_mensajes_hora()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 10 $$;

-- ---------------------------------------------------------------------
-- 2. El cliente escribe desde su enlace
-- ---------------------------------------------------------------------
-- {ok, id, repetido} o {ok:false, motivo: 'no_existe' | 'cerrada' | 'vacio' | 'largo' | 'limite'}.
create or replace function public.fn_publico_enviar_mensaje(p_token uuid, p_clave uuid, p_texto text, p_ahora timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  o       public.ordenes%rowtype := public.fn_orden_de_token(p_token, p_ahora);
  v_previo public.mensajes_orden%rowtype;
  v_texto text := public.fn_limpiar_mensaje(p_texto);
  v_autor text;
begin
  if o.id is null or p_clave is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  -- Reintento (mala señal): la misma clave devuelve el mismo mensaje.
  select * into v_previo from public.mensajes_orden where id = p_clave;
  if found then
    if v_previo.taller_id <> o.taller_id or v_previo.orden_id <> o.id or v_previo.de <> 'cliente' then
      return jsonb_build_object('ok', false, 'motivo', 'no_existe');
    end if;
    return jsonb_build_object('ok', true, 'id', v_previo.id, 'repetido', true);
  end if;

  if not (o.estado = any (public.fn_estados_abiertos())) then
    return jsonb_build_object('ok', false, 'motivo', 'cerrada');
  end if;
  if length(v_texto) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'vacio');
  end if;
  if length(v_texto) > 500 then
    return jsonb_build_object('ok', false, 'motivo', 'largo');
  end if;

  -- Un mensaje a la vez por orden: así el conteo del límite no se lo salta nadie.
  perform 1 from public.ordenes where taller_id = o.taller_id and id = o.id for update;
  if (select count(*) from public.mensajes_orden
       where taller_id = o.taller_id and orden_id = o.id and de = 'cliente'
         and created_at > p_ahora - interval '1 hour') >= public.fn_limite_mensajes_hora() then
    return jsonb_build_object('ok', false, 'motivo', 'limite');
  end if;

  select coalesce(nullif(split_part(btrim(coalesce(c.nombre, '')), ' ', 1), ''), 'El cliente') into v_autor
    from public.clientes c where c.taller_id = o.taller_id and c.id = o.cliente_id;
  insert into public.mensajes_orden (id, taller_id, orden_id, de, texto, autor, created_at, registrado_por)
  values (p_clave, o.taller_id, o.id, 'cliente', v_texto, v_autor, p_ahora, null);
  return jsonb_build_object('ok', true, 'id', p_clave, 'repetido', false);
end $$;

create or replace function public.publico_enviar_mensaje(p_token uuid, p_clave uuid, p_texto text)
returns jsonb
language sql
volatile
security definer
set search_path = public, pg_temp
as $$ select public.fn_publico_enviar_mensaje(p_token, p_clave, p_texto, now()) $$;

-- ---------------------------------------------------------------------
-- 3. El taller responde y ve los mensajes
-- ---------------------------------------------------------------------
create or replace function public.enviar_mensaje_orden(p_clave uuid, p_orden uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_texto  text := public.fn_limpiar_mensaje(p_texto);
  v_previo public.mensajes_orden%rowtype;
begin
  if p_clave is null then
    raise exception 'Falta la clave del mensaje. Vuelve a abrir la orden.';
  end if;
  select * into v_previo from public.mensajes_orden where id = p_clave;
  if found then
    if v_previo.taller_id <> v_taller or v_previo.orden_id <> p_orden or v_previo.de <> 'taller' then
      raise exception 'Falta la clave del mensaje. Vuelve a abrir la orden.';
    end if;
    return jsonb_build_object('id', v_previo.id, 'repetido', true);
  end if;

  perform public.fn_orden_abierta_para_cambiar(v_taller, p_orden);
  if length(v_texto) = 0 then
    raise exception 'Escribe el mensaje.';
  end if;
  if length(v_texto) > 500 then
    raise exception 'El mensaje es muy largo (máximo 500 caracteres).';
  end if;

  insert into public.mensajes_orden (id, taller_id, orden_id, de, texto, autor)
  values (p_clave, v_taller, p_orden, 'taller', v_texto, public.fn_nombre_de(auth.uid()));
  -- Quien responde ya leyó lo que el cliente escribió.
  update public.mensajes_orden set leido_at = now()
   where taller_id = v_taller and orden_id = p_orden and de = 'cliente' and leido_at is null;
  return jsonb_build_object('id', p_clave, 'repetido', false);
end $$;

-- Al abrir la orden: lo que escribió el cliente queda visto (él lo ve en su enlace).
create or replace function public.marcar_mensajes_leidos(p_orden uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_n      integer;
begin
  update public.mensajes_orden set leido_at = now()
   where taller_id = v_taller and orden_id = p_orden and de = 'cliente' and leido_at is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('marcados', v_n);
end $$;

-- ---------------------------------------------------------------------
-- 4. Avisos push: a quién le llegan (una regla para respuestas y mensajes)
-- ---------------------------------------------------------------------
-- Quien atiende el vehículo; si nadie lo tiene, todo el que abre "patio".
create or replace function public.fn_suscripciones_de_orden(p_taller uuid, p_asignado uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', sp.endpoint, 'p256dh', sp.p256dh, 'auth', sp.auth)), '[]'::jsonb)
    from public.suscripciones_push sp
   where sp.taller_id = p_taller
     and case when p_asignado is not null then sp.user_id = p_asignado
              else coalesce(public.fn_areas_de(sp.user_id) && array['patio'], false) end
$$;

-- 0008 con la regla de arriba (mismo comportamiento).
create or replace function public.publico_tomar_aviso(p_token uuid, p_hallazgo uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  o public.ordenes%rowtype := public.fn_orden_de_token(p_token, now());
  v public.hallazgos%rowtype;
begin
  if o.id is null then
    return jsonb_build_object('ok', false);
  end if;
  select * into v from public.hallazgos
   where taller_id = o.taller_id and orden_id = o.id and id = p_hallazgo
     for update;
  if not found or v.canal is distinct from 'enlace' or v.aviso_at is not null
     or v.respondido_at < now() - interval '10 minutes' then
    return jsonb_build_object('ok', false);
  end if;
  update public.hallazgos set aviso_at = now() where taller_id = o.taller_id and id = v.id;

  return jsonb_build_object(
    'ok', true,
    'aviso', jsonb_build_object(
      'orden_id', o.id, 'numero', o.numero, 'estado', v.estado, 'titulo', v.titulo,
      'placa', (select placa from public.vehiculos where taller_id = o.taller_id and id = o.vehiculo_id),
      'cliente', v.autor_respuesta),
    'suscripciones', public.fn_suscripciones_de_orden(o.taller_id, o.asignado_a));
end $$;

-- Con el token del cliente: el aviso de SU mensaje, una vez y en los 10 minutos siguientes.
create or replace function public.publico_tomar_aviso_mensaje(p_token uuid, p_mensaje uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  o public.ordenes%rowtype := public.fn_orden_de_token(p_token, now());
  m public.mensajes_orden%rowtype;
begin
  if o.id is null then
    return jsonb_build_object('ok', false);
  end if;
  select * into m from public.mensajes_orden
   where taller_id = o.taller_id and orden_id = o.id and id = p_mensaje and de = 'cliente'
     for update;
  if not found or m.aviso_at is not null or m.created_at < now() - interval '10 minutes' then
    return jsonb_build_object('ok', false);
  end if;
  update public.mensajes_orden set aviso_at = now() where taller_id = o.taller_id and id = m.id;

  return jsonb_build_object(
    'ok', true,
    'aviso', jsonb_build_object(
      'orden_id', o.id, 'numero', o.numero, 'texto', left(m.texto, 140), 'cliente', m.autor,
      'placa', (select placa from public.vehiculos where taller_id = o.taller_id and id = o.vehiculo_id)),
    'suscripciones', public.fn_suscripciones_de_orden(o.taller_id, o.asignado_a));
end $$;

-- ---------------------------------------------------------------------
-- 5. Lecturas del personal (redefinidas: 0008 + mensajes)
-- ---------------------------------------------------------------------
create or replace function public.listar_ordenes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
begin
  return jsonb_build_object(
    'abiertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'numero', o.numero, 'placa', v.placa, 'tipo', v.tipo, 'servicio', o.servicio,
               'estado', o.estado, 'estado_desde', o.estado_desde, 'created_at', o.created_at,
               'cliente', c.nombre,
               'asignado', case when o.asignado_a is null then null
                                else jsonb_build_object('user_id', o.asignado_a, 'nombre', public.fn_nombre_de(o.asignado_a)) end,
               'mia', coalesce(o.asignado_a = auth.uid(), false),
               'hallazgos_pendientes', (select count(*) from public.hallazgos h
                                         where h.taller_id = o.taller_id and h.orden_id = o.id and h.estado = 'pendiente'),
               'hallazgos_autorizados', (select count(*) from public.hallazgos h
                                          where h.taller_id = o.taller_id and h.orden_id = o.id and h.estado = 'autorizado'),
               'mensajes_sin_leer', (select count(*) from public.mensajes_orden m
                                      where m.taller_id = o.taller_id and m.orden_id = o.id
                                        and m.de = 'cliente' and m.leido_at is null)
             ) order by o.created_at)
        from public.ordenes o
        join public.vehiculos v on v.taller_id = o.taller_id and v.id = o.vehiculo_id
        join public.clientes c on c.taller_id = o.taller_id and c.id = o.cliente_id
       where o.taller_id = v_taller and o.estado = any (public.fn_estados_abiertos())), '[]'::jsonb),
    'entregadas_hoy', (select count(*) from public.ordenes o
                        where o.taller_id = v_taller and o.estado = 'entregado'
                          and public.fecha_bogota(o.entregado_at) = public.hoy_bogota())
  );
end $$;

create or replace function public.obtener_orden(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('recepcion', 'patio');
  v_r      jsonb;
begin
  select jsonb_build_object(
           'id', o.id, 'numero', o.numero, 'token', o.token, 'servicio', o.servicio, 'kilometraje', o.kilometraje,
           'estado', o.estado, 'estado_desde', o.estado_desde, 'created_at', o.created_at,
           'entregado_at', o.entregado_at, 'cancelada_at', o.cancelada_at, 'motivo_cancelacion', o.motivo_cancelacion,
           'vehiculo', jsonb_build_object('placa', v.placa, 'tipo', v.tipo),
           'cliente', jsonb_build_object('nombre', c.nombre, 'celular', c.celular),
           'asignado', case when o.asignado_a is null then null
                            else jsonb_build_object('user_id', o.asignado_a, 'nombre', public.fn_nombre_de(o.asignado_a)) end,
           'mia', coalesce(o.asignado_a = auth.uid(), false),
           'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'tipo', f.tipo, 'autor', f.autor,
                                                                'at', f.created_at) order by f.created_at, f.id)
                                from public.fotos_orden f
                               where f.taller_id = o.taller_id and f.orden_id = o.id and f.tipo = 'ingreso'
                                 and f.anulada_at is null), '[]'::jsonb),
           'hallazgos', coalesce((select jsonb_agg(jsonb_build_object(
                                           'id', h.id, 'titulo', h.titulo, 'descripcion', h.descripcion,
                                           'precio', h.precio, 'estado', h.estado, 'respondido_at', h.respondido_at,
                                           'canal', h.canal, 'autor_respuesta', h.autor_respuesta,
                                           'motivo_anulacion', h.motivo_anulacion, 'autor', h.autor, 'at', h.created_at,
                                           'fotos', coalesce((select jsonb_agg(f.id order by f.created_at, f.id)
                                                                from public.fotos_orden f
                                                               where f.taller_id = h.taller_id and f.hallazgo_id = h.id
                                                                 and f.anulada_at is null), '[]'::jsonb)
                                         ) order by h.created_at, h.id)
                                    from public.hallazgos h
                                   where h.taller_id = o.taller_id and h.orden_id = o.id), '[]'::jsonb),
           -- Los últimos 100, del más viejo al más nuevo.
           'mensajes', coalesce((select jsonb_agg(jsonb_build_object(
                                          'id', m.id, 'de', m.de, 'texto', m.texto, 'autor', m.autor,
                                          'at', m.created_at, 'leido', m.leido_at is not null)
                                        order by m.created_at, m.id)
                                   from (select * from public.mensajes_orden
                                          where taller_id = o.taller_id and orden_id = o.id
                                          order by created_at desc, id desc limit 100) m), '[]'::jsonb),
           'eventos', coalesce((select jsonb_agg(jsonb_build_object(
                                         'tipo', e.tipo, 'estado', e.estado, 'detalle', e.detalle,
                                         'autor', e.autor, 'at', e.created_at) order by e.created_at, e.id)
                                  from public.orden_eventos e
                                 where e.taller_id = o.taller_id and e.orden_id = o.id), '[]'::jsonb))
    into v_r
    from public.ordenes o
    join public.vehiculos v on v.taller_id = o.taller_id and v.id = o.vehiculo_id
    join public.clientes c on c.taller_id = o.taller_id and c.id = o.cliente_id
   where o.taller_id = v_taller and o.id = p_id;
  if v_r is null then
    raise exception 'La orden no existe.' using errcode = 'P0002';
  end if;
  return v_r;
end $$;

-- ---------------------------------------------------------------------
-- 6. Enlace del cliente (redefinida: 0008 + mensajes)
-- ---------------------------------------------------------------------
create or replace function public.fn_publico_orden(p_token uuid, p_ahora timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  o public.ordenes%rowtype := public.fn_orden_de_token(p_token, p_ahora);
  d record;
begin
  if o.id is null then
    return jsonb_build_object('existe', false);
  end if;
  select ve.placa, ve.tipo, c.nombre as cliente, t.nombre as taller, t.whatsapp, t.direccion
    into d
    from public.talleres t
    join public.vehiculos ve on ve.taller_id = t.id and ve.id = o.vehiculo_id
    join public.clientes c on c.taller_id = t.id and c.id = o.cliente_id
   where t.id = o.taller_id;

  return jsonb_build_object(
    'existe', true,
    'taller', jsonb_build_object('nombre', d.taller, 'whatsapp', d.whatsapp, 'direccion', d.direccion),
    'orden', jsonb_build_object(
      'numero', o.numero, 'placa', d.placa, 'tipo', d.tipo, 'servicio', o.servicio, 'estado', o.estado,
      'estado_desde', o.estado_desde, 'created_at', o.created_at, 'entregado_at', o.entregado_at,
      -- Solo primeros nombres: ni apellidos ni celulares salen por el enlace.
      'cliente', nullif(split_part(btrim(coalesce(d.cliente, '')), ' ', 1), ''),
      'atiende', nullif(split_part(btrim(coalesce(public.fn_nombre_de(o.asignado_a), '')), ' ', 1), ''),
      -- Las fotos van por id: la ruta del archivo no sale de aquí.
      'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'tipo', f.tipo, 'at', f.created_at)
                                          order by f.created_at, f.id)
                           from public.fotos_orden f
                          where f.taller_id = o.taller_id and f.orden_id = o.id and f.tipo = 'ingreso'
                            and f.anulada_at is null), '[]'::jsonb),
      -- Los hallazgos vigentes (no los anulados), sin quién los registró.
      'hallazgos', coalesce((select jsonb_agg(jsonb_build_object(
                                      'id', h.id, 'titulo', h.titulo, 'descripcion', h.descripcion, 'precio', h.precio,
                                      'estado', h.estado, 'respondido_at', h.respondido_at, 'canal', h.canal,
                                      'fotos', coalesce((select jsonb_agg(f.id order by f.created_at, f.id)
                                                           from public.fotos_orden f
                                                          where f.taller_id = h.taller_id and f.hallazgo_id = h.id
                                                            and f.anulada_at is null), '[]'::jsonb)
                                    ) order by h.created_at, h.id)
                               from public.hallazgos h
                              where h.taller_id = o.taller_id and h.orden_id = o.id and h.estado <> 'anulado'), '[]'::jsonb),
      -- Los últimos 50 mensajes. Del taller sale solo el primer nombre de quien escribió; de los del cliente, si ya
      -- los vio el taller.
      'mensajes', coalesce((select jsonb_agg(jsonb_build_object(
                                     'id', m.id, 'de', m.de, 'texto', m.texto, 'at', m.created_at,
                                     'autor', case when m.de = 'taller'
                                                   then nullif(split_part(btrim(coalesce(m.autor, '')), ' ', 1), '') end,
                                     'visto', case when m.de = 'cliente' then m.leido_at is not null end)
                                   order by m.created_at, m.id)
                              from (select * from public.mensajes_orden
                                     where taller_id = o.taller_id and orden_id = o.id
                                     order by created_at desc, id desc limit 50) m), '[]'::jsonb),
      'historia', coalesce((select jsonb_agg(jsonb_build_object('estado', e.estado, 'at', e.created_at)
                                             order by e.created_at, e.id)
                              from public.orden_eventos e
                             where e.taller_id = o.taller_id and e.orden_id = o.id and e.estado is not null), '[]'::jsonb)));
end $$;

select public.fn_aplicar_permisos();

-- >>>>>>>>>> 20261021000010_resumen.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0010 · RESUMEN (SPEC F7)
--
--   Lo que el dueño (o quien abra el área "resumen") ve de un periodo de días de Bogotá:
--   * HALLAZGOS registrados en el periodo (sin los anulados): enviados, autorizados, no autorizados y esperando, con su
--     valor; cuántos respondieron desde el enlace; cuánto tardan en responder; lo que más se autoriza.
--   * VEHÍCULOS: recibidos, entregados y cancelados en el periodo.
--   * TIEMPOS: de los vehículos recibidos en el periodo, cuánto pasan en promedio en cada estado (solo los tramos ya
--     terminados; si un vehículo volvió a un estado, se suman sus tramos) y de recibido a entregado.
--   Solo lectura. Las cifras salen de fn_resumen, que las pruebas llaman con fechas fijas.
-- =====================================================================

create or replace function public.fn_resumen(p_taller uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  -- El periodo va de la medianoche de Bogotá de p_desde a la de después de p_hasta.
  v_desde timestamptz := p_desde::timestamp at time zone 'America/Bogota';
  v_hasta timestamptz := (p_hasta + 1)::timestamp at time zone 'America/Bogota';
  v_hallazgos jsonb;
  v_ordenes   jsonb;
  v_tiempos   jsonb;
  v_top       jsonb;
begin
  -- Hallazgos registrados en el periodo, sin los anulados.
  select jsonb_build_object(
           'enviados',    jsonb_build_object('n', count(*), 'valor', coalesce(sum(h.precio), 0)),
           'autorizados', jsonb_build_object('n', count(*) filter (where h.estado = 'autorizado'),
                                             'valor', coalesce(sum(h.precio) filter (where h.estado = 'autorizado'), 0)),
           'rechazados',  jsonb_build_object('n', count(*) filter (where h.estado = 'rechazado'),
                                             'valor', coalesce(sum(h.precio) filter (where h.estado = 'rechazado'), 0)),
           'pendientes',  jsonb_build_object('n', count(*) filter (where h.estado = 'pendiente'),
                                             'valor', coalesce(sum(h.precio) filter (where h.estado = 'pendiente'), 0)),
           'sin_precio', count(*) filter (where h.precio is null),
           'desde_enlace', count(*) filter (where h.canal = 'enlace'),
           'minutos_respuesta', round(avg(extract(epoch from h.respondido_at - h.created_at) / 60)
                                      filter (where h.respondido_at is not null)))
    into v_hallazgos
    from public.hallazgos h
   where h.taller_id = p_taller and h.estado <> 'anulado'
     and h.created_at >= v_desde and h.created_at < v_hasta;

  -- Lo que más se autoriza (por título), hasta 5.
  select coalesce(jsonb_agg(jsonb_build_object('titulo', t.titulo, 'autorizados', t.n, 'valor', t.valor)
                            order by t.n desc, t.valor desc, t.titulo), '[]'::jsonb)
    into v_top
    from (select min(h.titulo) as titulo, count(*) as n, coalesce(sum(h.precio), 0) as valor
            from public.hallazgos h
           where h.taller_id = p_taller and h.estado = 'autorizado'
             and h.created_at >= v_desde and h.created_at < v_hasta
           group by lower(h.titulo)
           order by count(*) desc, coalesce(sum(h.precio), 0) desc, min(h.titulo)
           limit 5) t;

  select jsonb_build_object(
           'recibidas',  (select count(*) from public.ordenes o
                           where o.taller_id = p_taller and o.created_at >= v_desde and o.created_at < v_hasta),
           'entregadas', (select count(*) from public.ordenes o
                           where o.taller_id = p_taller and o.entregado_at >= v_desde and o.entregado_at < v_hasta),
           'canceladas', (select count(*) from public.ordenes o
                           where o.taller_id = p_taller and o.cancelada_at >= v_desde and o.cancelada_at < v_hasta),
           -- De recibido a entregado: los recibidos en el periodo que ya se entregaron.
           'minutos_entrega', (select round(avg(extract(epoch from o.entregado_at - o.created_at) / 60))
                                 from public.ordenes o
                                where o.taller_id = p_taller and o.entregado_at is not null
                                  and o.created_at >= v_desde and o.created_at < v_hasta),
           'mensajes_clientes', (select count(*) from public.mensajes_orden m
                                  where m.taller_id = p_taller and m.de = 'cliente'
                                    and m.created_at >= v_desde and m.created_at < v_hasta))
    into v_ordenes;

  -- Tiempo en cada estado: cada cambio de estado abre un tramo que cierra el siguiente.
  with tramos as (
    select e.orden_id, e.estado, e.created_at as desde,
           lead(e.created_at) over (partition by e.orden_id order by e.created_at, e.id) as hasta
      from public.orden_eventos e
      join public.ordenes o on o.taller_id = e.taller_id and o.id = e.orden_id
     where e.taller_id = p_taller and e.estado is not null
       and o.created_at >= v_desde and o.created_at < v_hasta
  ), por_orden as (
    select orden_id, estado, sum(extract(epoch from hasta - desde) / 60) as minutos
      from tramos
     where hasta is not null
     group by orden_id, estado
  )
  -- Los cuatro estados siempre salen, en orden; sin tramos terminados, minutos es null.
  select jsonb_agg(jsonb_build_object('estado', x.estado, 'minutos', x.minutos, 'ordenes', x.ordenes) order by x.n)
    into v_tiempos
    from (select s.estado, s.n, round(avg(p.minutos)) as minutos, count(p.orden_id) as ordenes
            from unnest(array['recibido', 'diagnostico', 'en_proceso', 'listo']) with ordinality as s(estado, n)
            left join por_orden p on p.estado = s.estado
           group by s.estado, s.n) x;

  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'hallazgos', v_hallazgos, 'top', v_top, 'ordenes', v_ordenes, 'tiempos', v_tiempos);
end $$;

-- El resumen del propio taller entre dos días de Bogotá (inclusive). Hasta un año.
create or replace function public.obtener_resumen(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_area('resumen');
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Elige un periodo válido.';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'El periodo puede ser de hasta un año.';
  end if;
  return public.fn_resumen(v_taller, p_desde, p_hasta);
end $$;

select public.fn_aplicar_permisos();

-- >>>>>>>>>> 20261021000011_demo.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0011 · TALLER DE DEMO CON DATOS FICTICIOS Y REINICIO (SPEC F8)
--
--   fn_provisionar_demo(correo, correo_jefe)  deja lista la demo para dos usuarios que ya existen en Supabase (el
--                                             gerente y el jefe de patio) y le carga los datos de ejemplo.
--   fn_cargar_datos_demo(taller, ahora)       borra TODO lo de la demo y lo vuelve a crear, siempre igual y RELATIVO A
--                                             HOY: el patio de hoy, dos semanas de vehículos entregados con sus
--                                             hallazgos y respuestas, mensajes de clientes.
--   reiniciar_demo(pin)                       lo que llama el gerente desde «Más»: solo en una demo, con PIN si lo tiene.
--   fn_definir_pin_reinicio(pin, taller)      pone, cambia o quita el PIN (solo quien administra, desde el SQL Editor).
--
-- REGLAS (las mismas de Barberías)
--   * TODO es inventado: nombres, celulares (+57 300 000 20xx), placas, dirección y montos. Nada de clientes reales.
--   * Determinista: qué vehículo, qué servicio, a qué hora y qué respondió el cliente salen de un hash del día y del
--     turno, no de random(). Dos cargas con el mismo `ahora` dejan lo mismo (los ids y los enlaces son nuevos).
--   * Es la ÚNICA excepción a «no se borra»: solo en un taller con es_demo = true, y durante su transacción activa
--     app.reiniciando_demo (ver fn_bloquear_borrado).
--   * Sobrevive al reinicio: el taller (nombre y enlace), la cuenta del gerente, la del jefe de patio de la demo y el
--     PIN. Lo demás se recrea; quien entró con un código de invitación y los avisos en los celulares se van.
--   * Las fotos no se recrean (no hay archivos de ejemplo): se toman en vivo durante la visita. Las que se tomaron en
--     una visita quedan huérfanas en el bucket (sus rutas nunca salieron de la app).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PIN para reiniciar y el jefe de patio de la demo
-- ---------------------------------------------------------------------
alter table public.talleres add column if not exists reinicio_con_pin boolean not null default false;
comment on column public.talleres.reinicio_con_pin is 'true = reiniciar la demo pide PIN (ver fn_definir_pin_reinicio).';
alter table public.talleres add column if not exists demo_jefe uuid references auth.users(id) on delete set null;
comment on column public.talleres.demo_jefe is 'Solo demos: la cuenta del jefe de patio de «Probar la demo» (sobrevive al reinicio).';

create table if not exists public.pines_reinicio (
  taller_id       uuid primary key references public.talleres(id) on delete cascade,
  hash            text not null,
  intentos        integer not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_at  timestamptz not null default now()
);
alter table public.pines_reinicio enable row level security;
-- Sin políticas y sin permisos: nadie la lee (ni el gerente); solo las funciones de abajo.
revoke all on public.pines_reinicio from anon, authenticated;
comment on table public.pines_reinicio is 'PIN (cifrado) para reiniciar la demo y sus intentos fallidos. Nadie la lee directamente.';

create or replace function public.fn_hash_pin(p_taller uuid, p_pin text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select encode(sha256(convert_to(p_taller::text || ':' || coalesce(p_pin, ''), 'UTF8')), 'hex') $$;

-- Pone, cambia o quita (null) el PIN. Sin p_taller aplica a TODAS las demos. Devuelve a cuántas.
create or replace function public.fn_definir_pin_reinicio(p_pin text, p_taller uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pin text := nullif(btrim(coalesce(p_pin, '')), '');
  v_n   integer := 0;
  r     record;
begin
  if v_pin is not null and v_pin !~ '^[0-9]{4,8}$' then
    raise exception 'El PIN debe tener entre 4 y 8 dígitos.';
  end if;
  for r in select t.id from public.talleres t where t.es_demo and (p_taller is null or t.id = p_taller) loop
    if v_pin is null then
      delete from public.pines_reinicio where taller_id = r.id;
    else
      insert into public.pines_reinicio (taller_id, hash)
      values (r.id, public.fn_hash_pin(r.id, v_pin))
      on conflict (taller_id) do update
        set hash = excluded.hash, intentos = 0, bloqueado_hasta = null, actualizado_at = now();
    end if;
    update public.talleres set reinicio_con_pin = (v_pin is not null) where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- 2. Ayudantes de los datos de ejemplo
-- ---------------------------------------------------------------------
-- Un número «al azar» pero fijo: el mismo texto da siempre el mismo valor (0 a p_modulo − 1).
create or replace function public.fn_demo_hash(p_texto text, p_modulo integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select (abs(hashtext(p_texto)::bigint) % greatest(p_modulo, 1))::integer $$;

-- El instante de una hora de pared de Bogotá: (2026-10-16, 450) = 7:30 a. m. de ese día.
create or replace function public.fn_demo_instante(p_dia date, p_min integer)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$ select (p_dia::timestamp + make_interval(mins => p_min)) at time zone 'America/Bogota' $$;

-- Una orden con su historia, como la dejarían recibir_vehiculo, asignar_orden y cambiar_estado_orden.
-- p_tiempos: cuándo llegó a recibido, diagnóstico, en proceso, listo y entregado (null = no llegó). El número es
-- provisional: fn_cargar_datos_demo numera todo al final por orden de llegada.
create or replace function public.fn_demo_orden(
  p_taller       uuid,
  p_vehiculo     uuid,
  p_servicio     text,
  p_km           integer,
  p_asignado     uuid,
  p_registra     uuid,
  p_autor_recibe text,
  p_autor_patio  text,
  p_tiempos      timestamptz[],
  p_cancelada_at timestamptz default null,
  p_motivo       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estados text[] := array['recibido', 'diagnostico', 'en_proceso', 'listo', 'entregado'];
  v_id      uuid := gen_random_uuid();
  v_cliente uuid;
  v_ultimo  integer := 1;
  v_numero  integer;
begin
  select cliente_id into v_cliente from public.vehiculos where taller_id = p_taller and id = p_vehiculo;
  for i in 2..5 loop
    if p_tiempos[i] is not null then v_ultimo := i; end if;
  end loop;
  select 1000 + count(*) + 1 into v_numero from public.ordenes where taller_id = p_taller;

  insert into public.ordenes (id, taller_id, numero, vehiculo_id, cliente_id, servicio, kilometraje, estado, estado_desde,
                              asignado_a, motivo_cancelacion, entregado_at, cancelada_at, created_at, registrado_por)
  values (v_id, p_taller, v_numero, p_vehiculo, v_cliente, p_servicio, p_km,
          case when p_cancelada_at is not null then 'cancelada' else v_estados[v_ultimo] end,
          coalesce(p_cancelada_at, p_tiempos[v_ultimo]), p_asignado, p_motivo,
          p_tiempos[5], p_cancelada_at, p_tiempos[1], p_registra);

  insert into public.orden_eventos (taller_id, orden_id, tipo, estado, autor, created_at, registrado_por)
  values (p_taller, v_id, 'creada', 'recibido', p_autor_recibe, p_tiempos[1], p_registra);
  if p_asignado is not null then
    insert into public.orden_eventos (taller_id, orden_id, tipo, detalle, autor, created_at, registrado_por)
    values (p_taller, v_id, 'asignacion', public.fn_nombre_de(p_asignado), p_autor_recibe,
            p_tiempos[1] + interval '1 second', p_registra);
  end if;
  for i in 2..v_ultimo loop
    if p_tiempos[i] is not null then
      insert into public.orden_eventos (taller_id, orden_id, tipo, estado, autor, created_at, registrado_por)
      values (p_taller, v_id, 'estado', v_estados[i], p_autor_patio, p_tiempos[i], p_registra);
    end if;
  end loop;
  if p_cancelada_at is not null then
    insert into public.orden_eventos (taller_id, orden_id, tipo, estado, detalle, autor, created_at, registrado_por)
    values (p_taller, v_id, 'cancelada', 'cancelada', p_motivo, p_autor_recibe, p_cancelada_at, p_registra);
  end if;
  return v_id;
end $$;

-- Un hallazgo del catálogo de la demo (por su nombre), con la respuesta del cliente si ya la dio. Como crear_hallazgo
-- y publico_responder_hallazgo / responder_hallazgo_telefono, con su historia.
create or replace function public.fn_demo_hallazgo(
  p_taller          uuid,
  p_orden           uuid,
  p_titulo          text,
  p_creado          timestamptz,
  p_estado          text,          -- pendiente | autorizado | rechazado
  p_canal           text,          -- enlace | telefono (si respondió)
  p_respondido      timestamptz,
  p_autor           text,
  p_autor_respuesta text,
  p_registra        uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c          public.catalogo_hallazgos%rowtype;
  v_id       uuid := gen_random_uuid();
  v_responde boolean := p_estado in ('autorizado', 'rechazado');
begin
  select * into c from public.catalogo_hallazgos where taller_id = p_taller and nombre = p_titulo and activo;
  if not found then
    raise exception 'Falta «%» en la lista de hallazgos de la demo.', p_titulo;
  end if;

  insert into public.hallazgos (id, taller_id, orden_id, catalogo_id, titulo, descripcion, precio, estado, respondido_at,
                                canal, autor_respuesta, aviso_at, autor, created_at, registrado_por)
  values (v_id, p_taller, p_orden, c.id, c.nombre, c.descripcion, c.precio_sugerido, p_estado,
          case when v_responde then p_respondido end,
          case when v_responde then p_canal end,
          case when v_responde then p_autor_respuesta end,
          -- El aviso push de una respuesta de ejemplo ya «se tomó»: nadie recibe avisos de cosas inventadas.
          case when v_responde and p_canal = 'enlace' then p_respondido end,
          p_autor, p_creado, p_registra);

  insert into public.orden_eventos (taller_id, orden_id, tipo, detalle, autor, created_at, registrado_por)
  values (p_taller, p_orden, 'hallazgo', left(c.nombre, 200), p_autor, p_creado, p_registra);
  if v_responde then
    insert into public.orden_eventos (taller_id, orden_id, tipo, detalle, autor, created_at, registrado_por)
    values (p_taller, p_orden, 'respuesta',
            left(case when p_canal = 'enlace'
                      then case p_estado when 'autorizado' then 'Autorizó: ' else 'No autorizó: ' end
                      else case p_estado when 'autorizado' then 'Autorizó por teléfono: ' else 'No autorizó por teléfono: ' end
                 end || c.nombre, 200),
            p_autor_respuesta, p_respondido, case when p_canal = 'enlace' then null else p_registra end);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. Los datos de ejemplo
-- ---------------------------------------------------------------------
create or replace function public.fn_cargar_datos_demo(p_taller uuid, p_ahora timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy      date := public.fecha_bogota(p_ahora);
  v_antes    timestamptz := p_ahora - interval '60 days';
  v_dueno    uuid;
  v_jefe     uuid;
  v_patio    uuid;            -- a quién se le asigna «el jefe» (el gerente si la demo no tiene jefe)
  v_nd       text := 'Mónica Vélez';
  v_nj       text := 'Andrés Mejía';
  v_np       text;
  v_rol_jefe uuid;
  v_nombres  text[] := array['Jorge Castaño', 'Marcela Ríos', 'Hernán Zapata', 'Paola Arango', 'Rubén Ospina',
                             'Liliana Mesa', 'Gustavo Henao', 'Natalia Correa', 'Fabián Muñoz', 'Sandra Villa',
                             'Wilson Agudelo', 'Claudia Rendón', 'Iván Montoya', 'Diana Salazar', 'Óscar Patiño',
                             'Beatriz Cardona', 'Mauricio Giraldo', 'Yolanda Pineda', 'Camilo Trujillo', 'Adriana Gil',
                             'Hugo Valencia', 'Lorena Quiroz', 'Efraín Ochoa', 'Viviana Duque'];
  v_placas   text[] := array['JKL482', 'MNP315', 'QRS27F', 'TUV908', 'WXY641', 'BCD774', 'FGH203', 'KLN559',
                             'PQR118', 'STU736', 'VWX420', 'YZA385', 'CDE612', 'GHI947', 'LMN264', 'OPQ803',
                             'RST51G', 'UVW177', 'XYZ690', 'ABE342', 'DFG815', 'HJK06C', 'NPR493', 'SWT228'];
  v_servicios text[] := array['Alineación y balanceo', 'Cambio de aceite y filtro', 'Revisión de frenos',
                              'Montaje de 4 llantas', 'Revisión de suspensión', 'Despinche',
                              'Rotación de llantas y balanceo', 'Cambio de batería', 'Revisión general antes de viaje',
                              'Sincronización'];
  v_hallazgos text[] := array['Pastillas de freno delanteras gastadas', 'Desalineación', 'Balanceo necesario (vibración)',
                              'Amortiguadores delanteros con fuga', 'Llanta lisa (sin labrado)', 'Filtro de aire sucio',
                              'Líquido de frenos vencido o bajo', 'Bieletas o cauchos de estabilizadora dañados',
                              'Plumillas desgastadas', 'Bombillos fundidos', 'Terminales de dirección con juego',
                              'Discos de freno rayados o torcidos', 'Aceite de motor vencido', 'Llanta con clavo o pinchazo',
                              'Batería débil'];
  v_cli      uuid[] := array(select gen_random_uuid() from generate_series(1, 24));
  v_veh      uuid[] := array(select gen_random_uuid() from generate_series(1, 24));
  v_off      integer;
  v_dia      date;
  v_n        integer;
  v_k        integer := 0;
  v_i        integer;
  v_ini      integer;
  v_t        timestamptz[];
  v_orden    uuid;
  v_asig     uuid;
  v_auto     text;
  v_semilla  text;
  v_nh       integer;
  v_h        integer;
  v_prev     integer;
  v_creado   timestamptz;
  v_estado   text;
  v_canal    text;
  v_resp     timestamptz;
  v_cliente  text;
  v_km       integer;
  -- minutos hacia atrás desde `ahora`
  m          integer[];
begin
  if not exists (select 1 from public.talleres t where t.id = p_taller and t.es_demo) then
    raise exception 'Solo la demo se puede reiniciar.' using errcode = '42501';
  end if;
  select p.user_id into v_dueno from public.perfiles p where p.taller_id = p_taller and p.rol = 'dueno' limit 1;
  select t.demo_jefe into v_jefe from public.talleres t where t.id = p_taller;

  -- 1) Limpiar. Es la única excepción al «no se borra»: solo en la demo y solo aquí.
  perform set_config('app.reiniciando_demo', 'on', true);
  delete from public.mensajes_orden     where taller_id = p_taller;
  delete from public.fotos_orden        where taller_id = p_taller;
  delete from public.hallazgos          where taller_id = p_taller;
  delete from public.orden_eventos      where taller_id = p_taller;
  delete from public.ordenes            where taller_id = p_taller;
  delete from public.vehiculos          where taller_id = p_taller;
  delete from public.clientes           where taller_id = p_taller;
  delete from public.catalogo_hallazgos where taller_id = p_taller;
  delete from public.suscripciones_push where taller_id = p_taller;
  delete from public.invitaciones       where taller_id = p_taller;
  delete from public.perfil_roles       where taller_id = p_taller;
  -- Quien entró con un código se va; el gerente y el jefe de la demo se quedan.
  delete from public.perfiles           where taller_id = p_taller and rol <> 'dueno' and user_id is distinct from v_jefe;
  delete from public.roles_equipo       where taller_id = p_taller;
  perform set_config('app.reiniciando_demo', 'off', true);

  -- 2) El taller, el equipo y la lista de hallazgos, como recién instalados.
  update public.talleres
     set whatsapp = '+573000002000', direccion = 'Carrera 50 #30-20, Zona Industrial'
   where id = p_taller;
  update public.perfiles set nombre = v_nd where taller_id = p_taller and user_id = v_dueno;
  perform public.fn_roles_iniciales(p_taller);
  update public.roles_equipo set created_at = v_antes, registrado_por = v_dueno where taller_id = p_taller;
  if v_jefe is not null then
    insert into public.perfiles (user_id, taller_id, rol, nombre, created_at)
    values (v_jefe, p_taller, 'equipo', v_nj, v_antes)
    on conflict (user_id) do update set nombre = excluded.nombre;
    select id into v_rol_jefe from public.roles_equipo where taller_id = p_taller and nombre = 'Jefe de patio';
    insert into public.perfil_roles (taller_id, user_id, rol_id, created_at, registrado_por)
    values (p_taller, v_jefe, v_rol_jefe, v_antes, v_dueno);
  end if;
  v_patio := coalesce(v_jefe, v_dueno);
  v_np := case when v_jefe is null then v_nd else v_nj end;

  perform public.fn_catalogo_inicial(p_taller);
  update public.catalogo_hallazgos c
     set precio_sugerido = p.precio, created_at = v_antes, registrado_por = v_dueno
    from (values ('Llanta lisa (sin labrado)', 320000), ('Llanta con corte o chichón lateral', 320000),
                 ('Llanta con clavo o pinchazo', 25000), ('Válvula de llanta dañada', 15000),
                 ('Rin golpeado o torcido', 80000), ('Desalineación', 60000), ('Balanceo necesario (vibración)', 40000),
                 ('Terminales de dirección con juego', 150000), ('Rótulas con juego', 180000),
                 ('Bujes de tijera desgastados', 220000), ('Pastillas de freno delanteras gastadas', 180000),
                 ('Pastillas de freno traseras gastadas', 160000), ('Bandas de freno gastadas', 140000),
                 ('Discos de freno rayados o torcidos', 260000), ('Líquido de frenos vencido o bajo', 45000),
                 ('Amortiguadores delanteros con fuga', 480000), ('Amortiguadores traseros con fuga', 420000),
                 ('Bases de amortiguador dañadas', 160000), ('Espirales vencidos o partidos', 300000),
                 ('Bieletas o cauchos de estabilizadora dañados', 120000), ('Aceite de motor vencido', 150000),
                 ('Filtro de aire sucio', 45000), ('Correa de accesorios agrietada', 90000),
                 ('Refrigerante bajo o contaminado', 60000), ('Batería débil', 380000),
                 ('Bornes de batería sulfatados', 20000), ('Bombillos fundidos', 25000),
                 ('Plumillas desgastadas', 50000)) as p(nombre, precio)
   where c.taller_id = p_taller and c.nombre = p.nombre;
  update public.catalogo_hallazgos set created_at = v_antes, registrado_por = v_dueno
   where taller_id = p_taller and precio_sugerido is null;

  -- 3) Clientes y vehículos. Todo inventado; los celulares son +57 300 000 20xx.
  for i in 1..24 loop
    insert into public.clientes (id, taller_id, nombre, celular, created_at, registrado_por)
    values (v_cli[i], p_taller, v_nombres[i], '+57300000' || (2000 + i)::text, v_antes + make_interval(hours => i), v_dueno);
    insert into public.vehiculos (id, taller_id, placa, cliente_id, created_at, registrado_por)
    values (v_veh[i], p_taller, v_placas[i], v_cli[i], v_antes + make_interval(hours => i), v_dueno);
  end loop;

  -- 4) Dos semanas de vehículos entregados (los 16 últimos vehículos van y vuelven). Domingo, medio día.
  for v_off in -13..-1 loop
    v_dia := v_hoy + v_off;
    v_n := case when extract(dow from v_dia) = 0 then 1 else 2 + public.fn_demo_hash('n|' || v_off, 3) end;
    for j in 1..v_n loop
      v_k := v_k + 1;
      v_semilla := v_off || '|' || j;
      v_i := 9 + public.fn_demo_hash('v|' || v_semilla, 16);
      v_ini := 450 + (j - 1) * 130 + public.fn_demo_hash('h|' || v_semilla, 60);
      v_t := array[public.fn_demo_instante(v_dia, v_ini)]::timestamptz[];
      v_t := v_t || (v_t[1] + make_interval(mins => 10 + public.fn_demo_hash('d1|' || v_semilla, 20)));
      v_t := v_t || (v_t[2] + make_interval(mins => 20 + public.fn_demo_hash('d2|' || v_semilla, 40)));
      v_t := v_t || (v_t[3] + make_interval(mins => 40 + public.fn_demo_hash('d3|' || v_semilla, 140)));
      v_t := v_t || (v_t[4] + make_interval(mins => 15 + public.fn_demo_hash('d4|' || v_semilla, 100)));
      v_asig := case when public.fn_demo_hash('a|' || v_semilla, 3) = 0 then v_dueno else v_patio end;
      v_auto := case when v_asig = v_dueno then v_nd else v_np end;
      v_km := 15000 + public.fn_demo_hash('km|' || v_semilla, 1500) * 100;

      if v_k = 6 then
        -- Uno se canceló: el cliente no esperó el diagnóstico.
        v_orden := public.fn_demo_orden(p_taller, v_veh[v_i], v_servicios[1 + public.fn_demo_hash('s|' || v_semilla, 10)],
                                        v_km, v_asig, v_dueno, v_nd, v_auto, array[v_t[1], null, null, null, null]::timestamptz[],
                                        v_t[1] + interval '35 minutes', 'El cliente no pudo esperar el diagnóstico');
        continue;
      end if;
      v_orden := public.fn_demo_orden(p_taller, v_veh[v_i], v_servicios[1 + public.fn_demo_hash('s|' || v_semilla, 10)],
                                      v_km, v_asig, v_dueno, v_nd, v_auto, v_t);

      -- 0, 1 o 2 hallazgos durante el diagnóstico; casi siempre responden desde el enlace en pocos minutos.
      v_nh := (array[0, 1, 1, 2, 1])[1 + public.fn_demo_hash('nh|' || v_semilla, 5)];
      v_prev := 0;
      for h in 1..v_nh loop
        v_h := 1 + public.fn_demo_hash('t|' || v_semilla || '|' || h, 15);
        if v_h = v_prev then v_h := 1 + (v_h % 15); end if;
        v_prev := v_h;
        v_creado := v_t[2] + make_interval(mins => 5 + h * 3 + public.fn_demo_hash('hc|' || v_semilla || '|' || h, 10));
        v_estado := case when public.fn_demo_hash('he|' || v_semilla || '|' || h, 100) < 68 then 'autorizado' else 'rechazado' end;
        v_canal := case when public.fn_demo_hash('hk|' || v_semilla || '|' || h, 4) = 0 then 'telefono' else 'enlace' end;
        v_resp := v_creado + make_interval(mins => 3 + public.fn_demo_hash('hr|' || v_semilla || '|' || h, 35));
        v_cliente := split_part(v_nombres[v_i], ' ', 1);
        perform public.fn_demo_hallazgo(p_taller, v_orden, v_hallazgos[v_h], v_creado, v_estado, v_canal, v_resp, v_auto,
                                        case when v_canal = 'enlace' then v_cliente else v_auto end, v_dueno);
      end loop;
    end loop;
  end loop;

  -- 5) Hoy: dos entregados y seis en el patio, relativos a este momento (minutos hacia atrás).
  m := array[330, 315, 290, 150, 120];
  v_orden := public.fn_demo_orden(p_taller, v_veh[7], 'Despinche', 48200, v_patio, v_dueno, v_nd, v_np,
                                  array[p_ahora - make_interval(mins => m[1]), p_ahora - make_interval(mins => m[2]),
                                        p_ahora - make_interval(mins => m[3]), p_ahora - make_interval(mins => m[4]),
                                        p_ahora - make_interval(mins => m[5])]);
  perform public.fn_demo_hallazgo(p_taller, v_orden, 'Llanta con clavo o pinchazo', p_ahora - interval '305 minutes',
                                  'autorizado', 'enlace', p_ahora - interval '298 minutes', v_np, 'Gustavo', v_dueno);
  v_orden := public.fn_demo_orden(p_taller, v_veh[8], 'Cambio de aceite y filtro', 61500, v_dueno, v_dueno, v_nd, v_nd,
                                  array[p_ahora - interval '260 minutes', p_ahora - interval '250 minutes',
                                        p_ahora - interval '235 minutes', p_ahora - interval '190 minutes',
                                        p_ahora - interval '175 minutes']);

  -- Frenos: en proceso, el cliente autorizó las pastillas desde el enlace y preguntó por mensaje.
  v_orden := public.fn_demo_orden(p_taller, v_veh[1], 'Revisión de frenos', 72400, v_patio, v_dueno, v_nd, v_np,
                                  array[p_ahora - interval '150 minutes', p_ahora - interval '135 minutes',
                                        p_ahora - interval '60 minutes', null, null]::timestamptz[]);
  perform public.fn_demo_hallazgo(p_taller, v_orden, 'Pastillas de freno delanteras gastadas', p_ahora - interval '120 minutes',
                                  'autorizado', 'enlace', p_ahora - interval '95 minutes', v_np, 'Jorge', v_dueno);
  insert into public.mensajes_orden (id, taller_id, orden_id, de, texto, autor, leido_at, aviso_at, created_at, registrado_por)
  values (gen_random_uuid(), p_taller, v_orden, 'cliente', '¿Me avisan cuando esté listo, por favor?', 'Jorge',
          p_ahora - interval '85 minutes', p_ahora - interval '90 minutes', p_ahora - interval '90 minutes', null),
         (gen_random_uuid(), p_taller, v_orden, 'taller', 'Claro, Jorge. Te escribimos apenas quede.', v_np,
          null, null, p_ahora - interval '85 minutes', v_patio);

  -- Alineación: en diagnóstico, esperando que el cliente autorice los amortiguadores.
  v_orden := public.fn_demo_orden(p_taller, v_veh[2], 'Alineación y balanceo', 38900, v_patio, v_dueno, v_nd, v_np,
                                  array[p_ahora - interval '55 minutes', p_ahora - interval '35 minutes', null, null, null]::timestamptz[]);
  perform public.fn_demo_hallazgo(p_taller, v_orden, 'Amortiguadores delanteros con fuga', p_ahora - interval '14 minutes',
                                  'pendiente', null, null, v_np, null, v_dueno);

  -- Moto lista para entregar.
  v_orden := public.fn_demo_orden(p_taller, v_veh[3], 'Cambio de aceite y filtro', 21300, v_patio, v_dueno, v_nd, v_np,
                                  array[p_ahora - interval '95 minutes', p_ahora - interval '88 minutes',
                                        p_ahora - interval '80 minutes', p_ahora - interval '20 minutes', null]::timestamptz[]);

  -- Recién llegado, sin asignar.
  v_orden := public.fn_demo_orden(p_taller, v_veh[4], 'Montaje de 4 llantas', 104700, null, v_dueno, v_nd, v_np,
                                  array[p_ahora - interval '9 minutes', null, null, null, null]::timestamptz[]);

  -- Suspensión: una cosa la autorizó y otra no (por teléfono); acaba de escribir y nadie lo ha leído.
  v_orden := public.fn_demo_orden(p_taller, v_veh[5], 'Revisión de suspensión', 88100, v_dueno, v_dueno, v_nd, v_nd,
                                  array[p_ahora - interval '200 minutes', p_ahora - interval '185 minutes',
                                        p_ahora - interval '100 minutes', null, null]::timestamptz[]);
  perform public.fn_demo_hallazgo(p_taller, v_orden, 'Terminales de dirección con juego', p_ahora - interval '168 minutes',
                                  'autorizado', 'enlace', p_ahora - interval '140 minutes', v_nd, 'Rubén', v_dueno);
  perform public.fn_demo_hallazgo(p_taller, v_orden, 'Bieletas o cauchos de estabilizadora dañados',
                                  p_ahora - interval '170 minutes', 'rechazado', 'telefono', p_ahora - interval '150 minutes',
                                  v_nd, v_nd, v_dueno);
  insert into public.mensajes_orden (id, taller_id, orden_id, de, texto, autor, leido_at, aviso_at, created_at, registrado_por)
  values (gen_random_uuid(), p_taller, v_orden, 'cliente', '¿Cuánto me sale en total con lo que encontraron?', 'Rubén',
          null, p_ahora - interval '6 minutes', p_ahora - interval '6 minutes', null);

  -- Revisión antes de viaje: autorizó la batería por teléfono; las plumillas esperan.
  v_orden := public.fn_demo_orden(p_taller, v_veh[6], 'Revisión general antes de viaje', 56300, v_patio, v_dueno, v_nd, v_np,
                                  array[p_ahora - interval '40 minutes', p_ahora - interval '30 minutes', null, null, null]::timestamptz[]);
  perform public.fn_demo_hallazgo(p_taller, v_orden, 'Batería débil', p_ahora - interval '25 minutes',
                                  'autorizado', 'telefono', p_ahora - interval '18 minutes', v_np, v_np, v_dueno);
  perform public.fn_demo_hallazgo(p_taller, v_orden, 'Plumillas desgastadas', p_ahora - interval '8 minutes',
                                  'pendiente', null, null, v_np, null, v_dueno);

  -- 6) Números de orden consecutivos por orden de llegada.
  update public.ordenes o
     set numero = x.n
    from (select o2.id, row_number() over (order by o2.created_at, v.placa) as n
            from public.ordenes o2 join public.vehiculos v on v.taller_id = o2.taller_id and v.id = o2.vehiculo_id
           where o2.taller_id = p_taller) x
   where o.taller_id = p_taller and o.id = x.id;
end $$;

-- ---------------------------------------------------------------------
-- 4. Dar de alta la demo (una sola vez, quien administra)
-- ---------------------------------------------------------------------
--   1. Supabase → Authentication → Users → Add user, con «Auto Confirm User»: el gerente de la demo y el jefe de patio.
--      Sus correos y contraseñas van en DEMO_EMAIL / DEMO_PASSWORD y DEMO_JEFE_EMAIL / DEMO_JEFE_PASSWORD (ver .env.example).
--   2. SQL Editor:  select public.fn_provisionar_demo('demo@tu-dominio.com', 'jefe-demo@tu-dominio.com');
--   3. (Opcional) un PIN para que nadie reinicie la demo en plena visita:  select public.fn_definir_pin_reinicio('4821');
-- Se puede volver a correr: si el taller ya existe y es una demo, solo recarga los datos.
create or replace function public.fn_provisionar_demo(
  p_correo      text,
  p_correo_jefe text default null,
  p_nombre      text default 'Llantas y Servicios Demo',
  p_ahora       timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_cjefe  text := nullif(lower(btrim(coalesce(p_correo_jefe, ''))), '');
  v_nombre text := public.fn_limpiar_texto(p_nombre);
  v_user   uuid;
  v_jefe   uuid;
  v_taller uuid;
  v_otro   uuid;
begin
  if length(v_nombre) = 0 or length(v_nombre) > 60 then
    raise exception 'Escribe el nombre del taller de demo (máximo 60 caracteres).';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = v_correo;
  if v_user is null then
    raise exception 'No existe el usuario %. Créalo primero en Authentication > Users (con "Auto Confirm User").', v_correo;
  end if;
  if v_cjefe is not null then
    select u.id into v_jefe from auth.users u where lower(u.email) = v_cjefe;
    if v_jefe is null then
      raise exception 'No existe el usuario %. Créalo primero en Authentication > Users (con "Auto Confirm User").', v_cjefe;
    end if;
    if v_jefe = v_user then
      raise exception 'El jefe de patio de la demo necesita su propio usuario.';
    end if;
  end if;

  select p.taller_id into v_taller from public.perfiles p where p.user_id = v_user;
  if v_taller is not null then
    if not (select t.es_demo from public.talleres t where t.id = v_taller) then
      raise exception 'El usuario % ya tiene un taller de verdad: la demo necesita su propio usuario.', v_correo;
    end if;
  else
    insert into public.talleres (nombre, es_demo) values (v_nombre, true) returning id into v_taller;
    insert into public.perfiles (user_id, taller_id, rol, nombre) values (v_user, v_taller, 'dueno', 'Mónica Vélez');
  end if;
  if v_jefe is not null then
    select p.taller_id into v_otro from public.perfiles p where p.user_id = v_jefe;
    if v_otro is not null and v_otro <> v_taller then
      raise exception 'El usuario % ya está en otro taller: el jefe de la demo necesita su propio usuario.', v_cjefe;
    end if;
  end if;
  update public.talleres set demo_jefe = v_jefe where id = v_taller;

  perform public.fn_cargar_datos_demo(v_taller, p_ahora);
  return jsonb_build_object('taller_id', v_taller, 'jefe', v_jefe is not null);
end $$;

-- ---------------------------------------------------------------------
-- 5. Reiniciar la demo desde la app (solo el gerente, solo una demo)
-- ---------------------------------------------------------------------
--   {"ok": true}                                          listo: datos de ejemplo recargados.
--   {"ok": false, "motivo": "pin", "intentos_restantes"}  el PIN no coincide (a los 5 fallos se bloquea 5 minutos).
--   {"ok": false, "motivo": "bloqueado", "minutos"}       demasiados intentos: espera.
create or replace function public.reiniciar_demo(p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller uuid := public.requerir_dueno();
  v_t      public.talleres%rowtype;
  v_pin    public.pines_reinicio%rowtype;
  v_fallos integer;
begin
  select * into v_t from public.talleres where id = v_taller for update;
  if not coalesce(v_t.es_demo, false) then
    raise exception 'Solo la demo se puede reiniciar.' using errcode = '42501';
  end if;

  select * into v_pin from public.pines_reinicio where taller_id = v_taller for update;
  if found then
    if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > now() then
      return jsonb_build_object('ok', false, 'motivo', 'bloqueado',
                                'minutos', greatest(1, ceil(extract(epoch from (v_pin.bloqueado_hasta - now())) / 60.0)::integer));
    end if;
    if public.fn_hash_pin(v_taller, btrim(coalesce(p_pin, ''))) <> v_pin.hash then
      v_fallos := v_pin.intentos + 1;
      update public.pines_reinicio
         set intentos = case when v_fallos >= 5 then 0 else v_fallos end,
             bloqueado_hasta = case when v_fallos >= 5 then now() + interval '5 minutes' end
       where taller_id = v_taller;
      if v_fallos >= 5 then
        return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', 5);
      end if;
      return jsonb_build_object('ok', false, 'motivo', 'pin', 'intentos_restantes', 5 - v_fallos);
    end if;
    update public.pines_reinicio set intentos = 0, bloqueado_hasta = null where taller_id = v_taller;
  end if;

  perform public.fn_cargar_datos_demo(v_taller);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 6. La app necesita saber si debe pedir el PIN (nunca cuál es). Igual que 0003, con `reinicio_con_pin`.
-- ---------------------------------------------------------------------
create or replace function public.obtener_contexto()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'taller', (select jsonb_build_object('id', t.id, 'nombre', t.nombre, 'slug', t.slug, 'es_demo', t.es_demo,
                                         'reinicio_con_pin', t.reinicio_con_pin,
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

-- >>>>>>>>>> 20261022000012_importar_clientes.sql >>>>>>>>>>
-- =====================================================================
-- SERVITECAS · 0012 · CARGA DE CLIENTES DESDE UN ARCHIVO (SPEC F9)
--
--   importar_clientes(p_filas, p_guardar)   [{fila, placa, nombre, celular}, …] ya revisadas en el celular
--                                           (src/lib/importar-clientes.ts). La base las vuelve a normalizar y decide.
--     * p_guardar = false: VISTA PREVIA. Hace exactamente lo mismo y deshace todo al final: las cifras que ve la persona
--       antes de tocar «Guardar» salen del mismo código que guarda.
--     * Un cliente se reconoce por su celular y un vehículo por su placa (únicos por taller). Volver a cargar el mismo
--       archivo no duplica nada.
--     * Lo que ya está en la app manda: un nombre existente no se cambia (solo se completa si faltaba) y un vehículo que
--       ya es de otro cliente no cambia de dueño (se avisa como conflicto).
--   Área "clientes". Hasta 2.000 filas por carga.
-- =====================================================================

create or replace function public.importar_clientes(p_filas jsonb, p_guardar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taller        uuid := public.requerir_area('clientes');
  r               record;
  v_cel           text;
  v_placa         text;
  v_nombre        text;
  v_cli           uuid;
  v_nom_actual    text;
  v_dueno_actual  uuid;
  v_cambio        boolean;
  v_nuevos_cli    integer := 0;
  v_completados   integer := 0;
  v_nuevos_veh    integer := 0;
  v_sin_cambios   integer := 0;
  v_errores       jsonb := '[]'::jsonb;
  v_conflictos    jsonb := '[]'::jsonb;
begin
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'No llegaron las filas del archivo. Vuelve a elegirlo.';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'Carga hasta 2.000 clientes a la vez: divide el archivo en partes.';
  end if;

  begin
    for r in select * from jsonb_to_recordset(p_filas) as x(fila integer, placa text, nombre text, celular text) loop
      -- La base vuelve a normalizar: si algo no se entiende, la fila se reporta y se sigue con las demás.
      begin
        v_cel := public.fn_normalizar_telefono(r.celular);
        v_placa := case when btrim(coalesce(r.placa, '')) = '' then null else public.fn_normalizar_placa(r.placa) end;
      exception when others then
        v_errores := v_errores || jsonb_build_object('fila', r.fila, 'motivo', sqlerrm);
        continue;
      end;
      if v_cel is null then
        v_errores := v_errores || jsonb_build_object('fila', r.fila, 'motivo', 'Falta el celular.');
        continue;
      end if;
      v_nombre := nullif(left(public.fn_limpiar_texto(r.nombre), 60), '');
      v_cambio := false;

      -- El cliente, por su celular.
      select c.id, c.nombre into v_cli, v_nom_actual
        from public.clientes c where c.taller_id = v_taller and c.celular = v_cel;
      if not found then
        insert into public.clientes (taller_id, nombre, celular) values (v_taller, v_nombre, v_cel) returning id into v_cli;
        v_nuevos_cli := v_nuevos_cli + 1;
        v_cambio := true;
      elsif v_nom_actual is null and v_nombre is not null then
        update public.clientes set nombre = v_nombre where taller_id = v_taller and id = v_cli;
        v_completados := v_completados + 1;
        v_cambio := true;
      end if;

      -- Su vehículo, por la placa.
      if v_placa is not null then
        select v.cliente_id into v_dueno_actual from public.vehiculos v where v.taller_id = v_taller and v.placa = v_placa;
        if not found then
          insert into public.vehiculos (taller_id, placa, cliente_id) values (v_taller, v_placa, v_cli);
          v_nuevos_veh := v_nuevos_veh + 1;
          v_cambio := true;
        elsif v_dueno_actual <> v_cli then
          v_conflictos := v_conflictos || jsonb_build_object(
            'fila', r.fila, 'motivo', 'La placa ' || v_placa || ' ya está registrada con otro cliente: no se cambió.');
          continue;
        end if;
      end if;

      if not v_cambio then
        v_sin_cambios := v_sin_cambios + 1;
      end if;
    end loop;

    -- Vista previa: se deshace todo lo de este bloque (las cuentas, que son variables, se quedan).
    if not coalesce(p_guardar, false) then
      raise exception using errcode = 'SV001', message = 'vista previa';
    end if;
  exception when sqlstate 'SV001' then
    null;
  end;

  return jsonb_build_object(
    'guardado', coalesce(p_guardar, false),
    'clientes_nuevos', v_nuevos_cli,
    'clientes_completados', v_completados,
    'vehiculos_nuevos', v_nuevos_veh,
    'sin_cambios', v_sin_cambios,
    'errores', v_errores,
    'conflictos', v_conflictos);
end $$;

select public.fn_aplicar_permisos();
