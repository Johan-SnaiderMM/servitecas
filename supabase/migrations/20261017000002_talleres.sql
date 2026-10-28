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
