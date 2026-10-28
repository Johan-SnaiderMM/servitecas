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
