-- ---------------------------------------------------------------------------
-- Los productos que en la lista dicen "Consultar"
-- ---------------------------------------------------------------------------
-- En la planilla que mandó Federico, 1.264 de los 4.444 productos no tienen
-- precio: dicen "Consultar". Son el 28% del catálogo, así que dejarlos afuera
-- no es opción: hay que poder recibirlos, contarlos y verlos en el stock.
--
-- Entran con precio 0 y marcados. La marca existe para distinguir "vale cero"
-- de "todavía nadie le puso precio", que en un remito son cosas muy distintas:
-- sin la marca, una línea en cero se ve igual que una bonificación y sale
-- impresa sin que nadie se dé cuenta hasta que llega la factura.
--
-- Cuando alguien le escribe un precio, la marca se cae sola (trigger de abajo).

alter table productos
  add column if not exists precio_a_consultar boolean not null default false;

comment on column productos.precio_a_consultar is
  'La lista decía "Consultar". No se puede emitir un remito con este producto en cero.';

-- Poner precio es la forma de sacar la marca: no hay que acordarse de dos pasos.
create or replace function bajar_marca_de_consultar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.precio_lista > 0 then
    new.precio_a_consultar := false;
  end if;
  return new;
end;
$$;

drop trigger if exists productos_precio_cargado on productos;
create trigger productos_precio_cargado
  before insert or update of precio_lista on productos
  for each row execute function bajar_marca_de_consultar();

-- ---------------------------------------------------------------------------
-- Un remito no sale con una línea en cero de un producto sin precio
-- ---------------------------------------------------------------------------
-- La verificación va acá y no en la pantalla porque emitir es lo único que no
-- se puede deshacer sin dejar rastro: el número se consume y el stock se
-- mueve. Un aviso en el navegador se saltea; esto no.

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
     and l.entregado
     and l.unidades_totales > 0;

  return v_remito;
end;
$$;

alter function emitir_remito(uuid) set search_path = public;
alter function bajar_marca_de_consultar() set search_path = public;
revoke execute on function emitir_remito(uuid) from public, anon;
grant execute on function emitir_remito(uuid) to authenticated;
