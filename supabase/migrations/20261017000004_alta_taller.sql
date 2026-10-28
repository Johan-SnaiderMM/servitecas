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
