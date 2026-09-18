-- Proveedores: a quién se le compra.
--
-- Hasta acá el proveedor era la columna de texto `bodega`, escrita a mano en
-- cada producto y en cada ingreso. Eso alcanzaba mientras todo fuera vino,
-- pero venden cristalería Volf, pastas, aceites, heladeras y cavas: esos no
-- salen de ninguna bodega.
--
-- Ojo con la diferencia, que importa: la BODEGA es quien produce el vino y
-- viaja en el catálogo y en la lista de precios; el PROVEEDOR es a quién se
-- le compra. Casi siempre coinciden, pero no siempre —se le puede comprar a
-- un distribuidor que trae varias bodegas—, así que `bodega` se queda como
-- dato del producto y el proveedor es una entidad aparte.

create table proveedores (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  contacto  text,
  telefono  text,
  email     text,
  notas     text not null default '',
  activo    boolean not null default true,
  creado_at timestamptz not null default now()
);

create index proveedores_nombre_idx on proveedores (lower(nombre));

alter table productos add column proveedor_id uuid references proveedores (id);
alter table ingresos  add column proveedor_id uuid references proveedores (id);

create index productos_proveedor_idx on productos (proveedor_id);
create index ingresos_proveedor_idx on ingresos (proveedor_id);

-- Los productos que ya están cargados tienen su bodega escrita. Se crea un
-- proveedor por cada bodega distinta y se los engancha, así nadie tiene que
-- rehacer a mano lo que ya estaba.
insert into proveedores (nombre)
select distinct trim(bodega)
  from productos
 where bodega is not null
   and trim(bodega) <> ''
on conflict (nombre) do nothing;

update productos p
   set proveedor_id = v.id
  from proveedores v
 where lower(trim(p.bodega)) = lower(v.nombre)
   and p.proveedor_id is null;

update ingresos i
   set proveedor_id = v.id
  from proveedores v
 where lower(trim(i.bodega)) = lower(v.nombre)
   and i.proveedor_id is null;

-- Seguridad: las mismas reglas que el resto. Ver 0004.
alter table proveedores enable row level security;

create policy proveedores_equipo on proveedores
  for all to authenticated
  using (es_del_equipo()) with check (es_del_equipo());
