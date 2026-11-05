-- El remito imprime todas las direcciones del cliente (5-nov-2026)
-- ---------------------------------------------------------------------------
-- Pedido de Federico: hay clientes con dos direcciones y el remito imprimia
-- solo la principal. El cliente recien avisa el dia de la entrega donde lo
-- recibe, asi que tienen que salir todas: la principal como hasta ahora y las
-- demas debajo ("Otra direccion"). Eligio esto en vez de elegir una al armar
-- el remito.
--
-- La copia del cliente que se congela al emitir (0013) suma `otras`: lista de
-- {direccion, localidad} con las direcciones que no son la impresa arriba.
-- remito_publico() devuelve cliente_datos entero, asi que el link de WhatsApp
-- y el PDF la reciben sin tocarla.

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
    'notas',        c.notas,
    'otras',        coalesce((
      select jsonb_agg(jsonb_build_object(
        'direccion', o.direccion,
        'localidad', o.localidad
      ) order by o.es_principal desc, o.id)
      from cliente_direcciones o
      where o.cliente_id = c.id and o.id <> d.id
    ), '[]'::jsonb)
  )
  from clientes c
  left join lateral (
    select id, direccion, localidad
    from cliente_direcciones
    where cliente_id = c.id
    order by (id = p_direccion) desc, es_principal desc, id
    limit 1
  ) d on true
  where c.id = p_cliente;
$$;

-- Los remitos ya emitidos de clientes con mas de una direccion se completan
-- con las otras direcciones de la ficha de hoy (lo mismo que hizo 0013). La
-- direccion de arriba, el nombre y lo demas quedan como se emitieron.
alter table remitos disable trigger remitos_copiar_cliente;
update remitos r
set cliente_datos = r.cliente_datos || jsonb_build_object('otras', (
  select jsonb_agg(jsonb_build_object(
    'direccion', o.direccion,
    'localidad', o.localidad
  ) order by o.es_principal desc, o.id)
  from cliente_direcciones o
  where o.cliente_id = r.cliente_id
    and o.direccion is distinct from r.cliente_datos ->> 'direccion'
))
where r.cliente_datos is not null
  and not (r.cliente_datos ? 'otras')
  and exists (
    select 1 from cliente_direcciones o
    where o.cliente_id = r.cliente_id
      and o.direccion is distinct from r.cliente_datos ->> 'direccion'
  );
alter table remitos enable trigger remitos_copiar_cliente;
