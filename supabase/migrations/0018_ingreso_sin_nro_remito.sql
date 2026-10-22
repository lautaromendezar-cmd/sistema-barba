-- Ingresos sin Nº de remito del proveedor (22-oct-2026, ya en uso)
-- ---------------------------------------------------------------------------
-- mov_por_ingreso (0002) copiaba el Nº de remito a la nota del movimiento con
-- nullif(..., ''): sin número quedaba null, y movimientos.nota es not null.
-- Resultado: todo ingreso sin Nº fallaba al guardar las lineas y dejaba la
-- cabecera vacia en «Ingresos anteriores». Ahora sin Nº la nota va vacia.
--
-- Solo cambia la funcion: no toca ningun dato. El search_path es el de 0004.

create or replace function mov_por_ingreso()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ingreso ingresos;
begin
  if new.unidades_totales <= 0 then
    return new;
  end if;

  select * into v_ingreso from ingresos where id = new.ingreso_id;

  insert into movimientos (producto_id, tipo, unidades, usuario_id, ingreso_id, nota)
  values (new.producto_id,
          'ingreso',
          new.unidades_totales,
          v_ingreso.usuario_id,
          new.ingreso_id,
          coalesce(v_ingreso.nro_remito_proveedor, ''));

  return new;
end;
$$;
