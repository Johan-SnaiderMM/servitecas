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
