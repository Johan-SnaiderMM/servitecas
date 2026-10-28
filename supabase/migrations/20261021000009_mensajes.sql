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
