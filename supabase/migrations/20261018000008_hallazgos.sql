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
