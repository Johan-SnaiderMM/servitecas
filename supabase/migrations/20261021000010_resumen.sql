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
