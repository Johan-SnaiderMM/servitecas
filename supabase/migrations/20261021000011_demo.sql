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
