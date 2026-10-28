-- Lista oficial + oferta, precios desde Excel y costo de compra
-- (pedido de Federico por audio, 28-oct-2026; ver PLAN-LISTAS-Y-COSTOS.md)
-- ---------------------------------------------------------------------------
-- Todo lo de aca es aditivo: columnas nuevas que arrancan vacias o con el
-- valor de hoy. Un remito o un ingreso cargado como hasta ahora se guarda
-- igual, y la app vieja sigue andando con esta migracion aplicada.
--
--   1. productos.precio_oferta: el precio de la lista de oferta. NULL = ese
--      producto no esta en oferta (lo de nicho queda solo en la oficial).
--   2. remito_lineas.lista: de que lista salio el precio de ESA linea. Se elige
--      por linea y no por remito: «10 cajas, 5 a oficial y 5 a oferta». El
--      precio sigue congelado en precio_unitario; esto es solo el origen.
--   3. ingreso_lineas.costo_unitario: lo que se le pago al proveedor, POR
--      UNIDAD como todo precio del sistema (en pantalla se carga por caja).
--      Es lo unico de una linea de ingreso que se puede cambiar despues: el
--      remito del proveedor a veces llega sin precio.
--   4. precios_historial empieza a escribirse: cada cambio de precio_lista o
--      de precio_oferta deja una fila, venga del Excel o de editar a mano.
--   5. aplicar_precios(): pisa los precios de una lista en una sola
--      transaccion, para que un Excel no quede aplicado a medias.
--   6. ultimo_costo: la ultima compra con costo de cada producto, para verla
--      al lado del precio cuando se vende.

-- ---------------------------------------------------------------------------
-- 1. Precio de oferta
-- ---------------------------------------------------------------------------

alter table productos add column if not exists precio_oferta numeric(12,2);

alter table productos drop constraint if exists productos_precio_oferta_positivo;
alter table productos add constraint productos_precio_oferta_positivo
  check (precio_oferta is null or precio_oferta > 0);

comment on column productos.precio_oferta is
  'POR UNIDAD, como precio_lista. NULL = no esta en la lista de oferta.';

-- ---------------------------------------------------------------------------
-- 2. De que lista salio cada linea del remito
-- ---------------------------------------------------------------------------
-- Las lineas que ya existen son todas de la oficial: hasta hoy no habia otra.

alter table remito_lineas
  add column if not exists lista text not null default 'oficial';

alter table remito_lineas drop constraint if exists remito_lineas_lista_valida;
alter table remito_lineas add constraint remito_lineas_lista_valida
  check (lista in ('oficial', 'oferta'));

-- ---------------------------------------------------------------------------
-- 3. Costo de compra en el ingreso
-- ---------------------------------------------------------------------------
-- Cuatro decimales porque se carga por caja y se divide: $70.000 la caja de 6
-- son $11.666,6667 por botella, y con dos decimales volveria como $70.000,02.

alter table ingreso_lineas add column if not exists costo_unitario numeric(14,4);

alter table ingreso_lineas drop constraint if exists ingreso_lineas_costo_positivo;
alter table ingreso_lineas add constraint ingreso_lineas_costo_positivo
  check (costo_unitario is null or costo_unitario > 0);

comment on column ingreso_lineas.costo_unitario is
  'Lo que se le pago al proveedor, POR UNIDAD. NULL = no se cargo.';

-- La politica de ingreso_lineas (0004) es "for all": cualquiera del equipo
-- podia cambiar las cantidades de un ingreso ya guardado, y el movimiento de
-- stock que genero al insertarse quedaba con el numero viejo. Ahora que hay
-- un motivo legitimo para editar una linea (completar el costo), se deja
-- tocar eso y nada mas. Una cantidad mal cargada se arregla como hasta hoy:
-- ajuste en Productos, o anular el ingreso (0019) y cargarlo de nuevo.
create or replace function ingreso_lineas_solo_costo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ingreso_id         is distinct from old.ingreso_id
     or new.producto_id     is distinct from old.producto_id
     or new.cantidad_bultos is distinct from old.cantidad_bultos
     or new.cantidad_unidades is distinct from old.cantidad_unidades
     or new.unidades_por_bulto is distinct from old.unidades_por_bulto
  then
    raise exception 'De un ingreso ya guardado solo se puede cambiar el costo';
  end if;
  return new;
end;
$$;

drop trigger if exists ingreso_lineas_solo_costo on ingreso_lineas;
create trigger ingreso_lineas_solo_costo
  before update on ingreso_lineas
  for each row execute function ingreso_lineas_solo_costo();

-- ---------------------------------------------------------------------------
-- 4. Historial de precios
-- ---------------------------------------------------------------------------
-- La tabla existe desde 0001 y nadie la escribia. Un trigger en vez de que la
-- escriba cada pantalla: asi tambien queda el cambio hecho a mano en «Editar
-- producto», y nadie tiene que acordarse.

alter table precios_historial
  add column if not exists lista text not null default 'oficial';

alter table precios_historial drop constraint if exists precios_historial_lista_valida;
alter table precios_historial add constraint precios_historial_lista_valida
  check (lista in ('oficial', 'oferta'));

-- Sacar un producto de la oferta deja precio_nuevo en NULL.
alter table precios_historial alter column precio_nuevo drop not null;

create or replace function registrar_cambio_de_precio()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- aplicar_precios lo pone en 'excel'; lo demas es una edicion a mano.
  v_origen text := coalesce(nullif(current_setting('app.precio_origen', true), ''), 'manual');
begin
  if new.precio_lista is distinct from old.precio_lista then
    insert into precios_historial
      (producto_id, precio_anterior, precio_nuevo, usuario_id, origen, lista)
    values (new.id, old.precio_lista, new.precio_lista, auth.uid(), v_origen, 'oficial');
  end if;

  if new.precio_oferta is distinct from old.precio_oferta then
    insert into precios_historial
      (producto_id, precio_anterior, precio_nuevo, usuario_id, origen, lista)
    values (new.id, old.precio_oferta, new.precio_oferta, auth.uid(), v_origen, 'oferta');
  end if;

  return new;
end;
$$;

drop trigger if exists productos_historial_precio on productos;
create trigger productos_historial_precio
  after update of precio_lista, precio_oferta on productos
  for each row execute function registrar_cambio_de_precio();

-- ---------------------------------------------------------------------------
-- 5. Aplicar una lista entera
-- ---------------------------------------------------------------------------
-- p_precios: [{"id": "<uuid del producto>", "precio": 12000}, ...]
-- En la oficial el precio tiene que ser > 0 (un «Consultar» no se manda: la
-- pantalla lo informa y deja el precio que habia). En la oferta, precio null
-- saca al producto de la oferta.
-- Si un producto marcado «a consultar» recibe precio, el trigger de 0007 le
-- saca la marca solo. Devuelve cuantos productos cambiaron.

create or replace function aplicar_precios(p_lista text, p_precios jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_cambiados integer;
begin
  if p_lista not in ('oficial', 'oferta') then
    raise exception 'Lista desconocida: %', p_lista;
  end if;

  if jsonb_typeof(p_precios) <> 'array' then
    raise exception 'Se esperaba una lista de precios';
  end if;

  if p_lista = 'oficial' and exists (
    select 1 from jsonb_array_elements(p_precios) e
     where coalesce((e->>'precio')::numeric, 0) <= 0
  ) then
    raise exception 'En la lista oficial todos los precios tienen que ser mayores a cero';
  end if;

  perform set_config('app.precio_origen', 'excel', true);

  if p_lista = 'oficial' then
    update productos p
       set precio_lista = (e->>'precio')::numeric
      from jsonb_array_elements(p_precios) e
     where p.id = (e->>'id')::uuid
       and p.precio_lista is distinct from (e->>'precio')::numeric;
  else
    update productos p
       set precio_oferta = (e->>'precio')::numeric
      from jsonb_array_elements(p_precios) e
     where p.id = (e->>'id')::uuid
       and p.precio_oferta is distinct from (e->>'precio')::numeric;
  end if;

  get diagnostics v_cambiados = row_count;

  -- Lo que se haga despues en la misma transaccion ya no es «del Excel».
  perform set_config('app.precio_origen', '', true);

  return v_cambiados;
end;
$$;

revoke execute on function aplicar_precios(text, jsonb) from public, anon;
grant execute on function aplicar_precios(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Ultimo costo de cada producto
-- ---------------------------------------------------------------------------
-- Solo ingresos sin anular y con costo cargado. security_invoker por lo mismo
-- que en 0004: sin eso la vista leeria con los permisos de quien la creo.

create or replace view ultimo_costo as
  select distinct on (l.producto_id)
         l.producto_id,
         l.costo_unitario,
         i.creado_at as fecha,
         i.bodega    as proveedor
    from ingreso_lineas l
    join ingresos i on i.id = l.ingreso_id
   where l.costo_unitario is not null
     and i.anulado_at is null
   order by l.producto_id, i.creado_at desc, l.id;

alter view ultimo_costo set (security_invoker = on);
revoke all on ultimo_costo from anon;
grant select on ultimo_costo to authenticated;
