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
