-- Lineas libres en el remito (pedido de Federico, oct-2026)
-- ---------------------------------------------------------------------------
-- A veces se entrega algo que no esta en el catalogo y no se va a volver a
-- vender: una botella especial para un solo cliente. Darlo de alta como
-- producto ensucia el catalogo y deja su stock en negativo para siempre.
--
-- Una linea libre no apunta a ningun producto: lleva la descripcion escrita a
-- mano, sale impresa y suma al total, pero no mueve stock ni figura en lo que
-- falta pedir. Toda linea tiene que tener producto o descripcion.

alter table remito_lineas alter column producto_id drop not null;
alter table remito_lineas add column if not exists descripcion text;

alter table remito_lineas drop constraint if exists remito_lineas_producto_o_descripcion;
alter table remito_lineas add constraint remito_lineas_producto_o_descripcion
  check (producto_id is not null or nullif(btrim(descripcion), '') is not null);

-- emitir_remito: identica a 0010 salvo que las lineas libres no generan
-- movimiento (no hay producto al que descontarle).
create or replace function emitir_remito(p_remito_id uuid)
returns remitos
language plpgsql
as $$
declare
  v_remito remitos;
  v_lineas integer;
  v_sin_precio text;
begin
  select * into v_remito from remitos where id = p_remito_id for update;

  if not found then
    raise exception 'El remito no existe';
  end if;

  if v_remito.estado <> 'borrador' then
    raise exception 'El remito % ya fue emitido o anulado', coalesce(v_remito.numero::text, '(borrador)');
  end if;

  select count(*) into v_lineas from remito_lineas where remito_id = p_remito_id;
  if v_lineas = 0 then
    raise exception 'No se puede emitir un remito sin lineas';
  end if;

  select string_agg(p.nombre, ', ') into v_sin_precio
    from remito_lineas l
    join productos p on p.id = l.producto_id
   where l.remito_id = p_remito_id
     and p.precio_a_consultar
     and coalesce(l.precio_unitario, 0) = 0;

  if v_sin_precio is not null then
    raise exception 'Falta ponerle precio a: %', v_sin_precio;
  end if;

  perform set_config('app.remito_transicion', 'on', true);

  update remitos
     set numero     = nextval('remitos_numero_seq'),
         estado     = 'emitido',
         emitido_at = now()
   where id = p_remito_id
  returning * into v_remito;

  insert into movimientos (producto_id, tipo, unidades, usuario_id, remito_id, nota)
  select l.producto_id,
         'egreso',
         -l.unidades_totales,
         v_remito.usuario_id,
         v_remito.id,
         'Remito ' || v_remito.numero
    from remito_lineas l
   where l.remito_id = p_remito_id
     and l.producto_id is not null
     and l.entregado
     and l.unidades_totales > 0;

  return v_remito;
end;
$$;

alter function emitir_remito(uuid) set search_path = public;
revoke execute on function emitir_remito(uuid) from public, anon;
grant execute on function emitir_remito(uuid) to authenticated;

-- stock_a_pedir: una linea libre pendiente no es algo que se le pida a un
-- proveedor (y sin el filtro sumaria una fila con producto_id nulo).
create or replace view stock_a_pedir as
  select l.producto_id,
         sum(l.unidades_totales) as unidades
    from remito_lineas l
    join remitos r on r.id = l.remito_id
   where not l.entregado
     and r.estado = 'emitido'
     and l.producto_id is not null
   group by l.producto_id;

alter view stock_a_pedir set (security_invoker = on);
revoke all on stock_a_pedir from anon;
grant select on stock_a_pedir to authenticated;
