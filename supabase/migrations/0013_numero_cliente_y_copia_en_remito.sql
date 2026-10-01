-- Numero de cliente, razon social, y el remito guarda una copia del cliente.
--
-- Los clientes vinieron de la planilla con el nombre como Federico los tiene
-- agendados en el telefono ("SANTI", "CLAU DE LUKI"). Con el tiempo les van a
-- cargar la razon social. Dos problemas:
--
--   * Si alguien pisa el nombre por accidente no queda rastro de quien era:
--     no hay ningun dato fijo que identifique al cliente. -> `numero`, que pone
--     la base y no se puede cambiar. `nombre` sigue siendo la columna, pero en
--     pantalla pasa a llamarse "apodo"; `razon_social` es nueva y opcional.
--
--   * El remito no guardaba el nombre ni la direccion: los leia de la ficha
--     cada vez que se mostraba. Cambiar la ficha cambiaba todos los remitos
--     viejos de ese cliente, tambien al reimprimirlos. -> `remitos.cliente_datos`
--     se llena al emitir, dentro de la transicion de `emitir_remito`, y despues
--     no se puede tocar.

-- ---------------------------------------------------------------------------
-- Numero de cliente
-- ---------------------------------------------------------------------------

alter table clientes add column if not exists numero integer;
alter table clientes add column if not exists razon_social text;

-- Los que ya estan cargados se numeran por orden alfabetico del apodo.
with orden as (
  select id, row_number() over (order by lower(nombre), id) as n
  from clientes
)
update clientes c set numero = orden.n
from orden
where orden.id = c.id and c.numero is null;

create sequence if not exists clientes_numero_seq owned by clientes.numero;
select setval('clientes_numero_seq', coalesce(max(numero), 0) + 1, false)
from clientes;

alter table clientes
  alter column numero set default nextval('clientes_numero_seq'),
  alter column numero set not null;

alter table clientes
  add constraint clientes_numero_unico unique (numero);

grant usage on sequence clientes_numero_seq to authenticated;

-- El numero lo pone siempre la base: en un alta se ignora el que mande el
-- navegador, y despues no se cambia nunca.
create or replace function fijar_numero_de_cliente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.numero := nextval('clientes_numero_seq');
  elsif new.numero is distinct from old.numero then
    raise exception 'El numero de cliente no se puede cambiar';
  end if;
  return new;
end;
$$;

drop trigger if exists clientes_fijar_numero on clientes;
create trigger clientes_fijar_numero
  before insert or update on clientes
  for each row execute function fijar_numero_de_cliente();

-- ---------------------------------------------------------------------------
-- Copia del cliente en el remito
-- ---------------------------------------------------------------------------

alter table remitos add column if not exists cliente_datos jsonb;

create or replace function datos_de_cliente_para_remito(
  p_cliente uuid, p_direccion uuid
) returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'numero',       c.numero,
    'apodo',        c.nombre,
    'razon_social', c.razon_social,
    'telefono',     c.telefono,
    'direccion',    d.direccion,
    'localidad',    d.localidad,
    'notas',        c.notas
  )
  from clientes c
  left join lateral (
    select direccion, localidad
    from cliente_direcciones
    where cliente_id = c.id
    order by (id = p_direccion) desc, es_principal desc, id
    limit 1
  ) d on true
  where c.id = p_cliente;
$$;

-- Se llena en el paso de borrador a emitido (que solo hace `emitir_remito`,
-- ver 0010) y queda congelada: lo que el navegador mande en esa columna se
-- descarta en el alta y se rechaza en cualquier otro cambio.
create or replace function copiar_cliente_al_remito()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.cliente_datos := null;
  elsif old.estado = 'borrador' and new.estado = 'emitido' then
    new.cliente_datos :=
      datos_de_cliente_para_remito(new.cliente_id, new.direccion_id);
  elsif new.cliente_datos is distinct from old.cliente_datos then
    raise exception 'Los datos del cliente de un remito no se pueden cambiar';
  end if;
  return new;
end;
$$;

drop trigger if exists remitos_copiar_cliente on remitos;
create trigger remitos_copiar_cliente
  before insert or update on remitos
  for each row execute function copiar_cliente_al_remito();

-- Los remitos que ya existen se copian con la ficha de hoy, que es lo mejor
-- que hay.
alter table remitos disable trigger remitos_copiar_cliente;
update remitos
set cliente_datos = datos_de_cliente_para_remito(cliente_id, direccion_id)
where estado <> 'borrador' and cliente_datos is null;
alter table remitos enable trigger remitos_copiar_cliente;
