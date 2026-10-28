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
