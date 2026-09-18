-- Sistema de Remitos y Stock — Grupo Barba
-- Esquema inicial. Incorpora las respuestas de Federico (17-sep-2026).
--
-- Reglas que este esquema hace cumplir, y que no se negocian:
--   1. El precio SIEMPRE se guarda por unidad. La carga y la vista van en bultos.
--   2. El stock es la suma de los movimientos. No hay columna "stock" que se pise.
--   3. Un remito no se borra: se anula, y la anulacion devuelve el stock.
--   4. Lo pendiente no descuenta stock: alimenta "hay que pedirle al proveedor".

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
-- Tres personas, alta manual, sin registro publico: Fede, Claudia y Roxana.
-- Todos ven todo, incluidos precios y margenes (decision explicita de Federico).
-- Lo que se registra es QUIEN hizo cada cosa.

create table perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null,
  rol        text not null default 'operador',
  activo     boolean not null default true,
  creado_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
-- Son mas de 1000. Cada uno puede tener varias direcciones de entrega y un
-- vendedor asignado (habituales Fede, nuevos Claudia, entregas Roxana).

create table clientes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  telefono       text,
  vendedor       text,
  -- Descuento fijo del cliente, copiado a cada remito al crearlo.
  descuento_pct  numeric(5,2) not null default 0,
  notas          text not null default '',
  activo         boolean not null default true,
  creado_at      timestamptz not null default now()
);

create index clientes_nombre_idx on clientes (lower(nombre));

create table cliente_direcciones (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes (id) on delete cascade,
  direccion     text not null,
  localidad     text,
  contacto      text,
  telefono      text,
  es_principal  boolean not null default false
);

create index cliente_direcciones_cliente_idx on cliente_direcciones (cliente_id);

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------
-- Son mas de 5000, no los 541 de la lista de oferta. Hay productos viejos sin
-- codigo: el importador les genera uno estable y respeta los que ya lo tienen.
-- La misma bebida en 750cc, 3L y 5L son productos distintos con codigo propio.

create table productos (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null unique,
  nombre             text not null,
  bodega             text,
  seccion            text,
  -- Texto libre tal como viene del Excel: "Caja x 6 botellas".
  presentacion       text,
  unidades_por_bulto integer not null default 1 check (unidades_por_bulto > 0),
  -- Whisky, aperitivos, gin, vodka, pastas y aceites se venden tambien sueltos.
  se_vende_suelto    boolean not null default false,
  -- POR UNIDAD, siempre. El precio del bulto se calcula al mostrarlo.
  precio_lista       numeric(12,2) not null default 0,
  en_lista_actual    boolean not null default true,
  activo             boolean not null default true,
  creado_at          timestamptz not null default now()
);

create index productos_nombre_idx on productos (lower(nombre));
create index productos_bodega_idx on productos (bodega);

-- Los precios cambian todos los meses y de a poco. Cada vez que la importacion
-- pisa un precio, el anterior queda aca: sirve para explicar un aumento.
create table precios_historial (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references productos (id) on delete cascade,
  precio_anterior numeric(12,2),
  precio_nuevo    numeric(12,2) not null,
  fecha           timestamptz not null default now(),
  usuario_id      uuid references perfiles (id),
  origen          text not null default 'importacion'
);

create index precios_historial_producto_idx on precios_historial (producto_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Remitos
-- ---------------------------------------------------------------------------
-- El remito se arma ANTES de juntar el pedido, asi que nace borrador: no
-- descuenta stock ni consume numero. Al emitirlo toma el numero correlativo y
-- genera los movimientos. La numeracion arranca de cero, no sigue ningun
-- talonario: el formato impreso lo definimos nosotros, no existe hoy.

create type estado_remito as enum ('borrador', 'emitido', 'anulado');

create sequence remitos_numero_seq start 1;

create table remitos (
  id             uuid primary key default gen_random_uuid(),
  -- Null mientras es borrador. Se asigna al emitir.
  numero         integer unique,
  cliente_id     uuid not null references clientes (id),
  direccion_id   uuid references cliente_direcciones (id),
  fecha          date not null default current_date,
  estado         estado_remito not null default 'borrador',
  -- Copiado del cliente al crear el remito, editable en la pantalla.
  descuento_pct  numeric(5,2) not null default 0,
  -- +10,5 por transferencia, o un descuento puntual de esta venta.
  ajuste_pct     numeric(5,2) not null default 0,
  condicion_pago text not null default 'efectivo',
  notas          text not null default '',
  usuario_id     uuid references perfiles (id),
  creado_at      timestamptz not null default now(),
  emitido_at     timestamptz,
  anulado_por    uuid references perfiles (id),
  anulado_at     timestamptz,
  motivo_anulacion text,

  constraint remito_emitido_tiene_numero
    check (estado = 'borrador' or numero is not null)
);

create index remitos_cliente_idx on remitos (cliente_id);
create index remitos_estado_idx on remitos (estado, fecha desc);

create table remito_lineas (
  id                uuid primary key default gen_random_uuid(),
  remito_id         uuid not null references remitos (id) on delete cascade,
  producto_id       uuid not null references productos (id),
  -- Bultos enteros mas unidades sueltas: "3 cajas y 2 botellas".
  cantidad_bultos   integer not null default 0,
  cantidad_unidades integer not null default 0,
  -- Congelado como el precio: si manana cambia la presentacion del producto,
  -- este remito sigue significando la misma cantidad de botellas.
  unidades_por_bulto integer not null default 1 check (unidades_por_bulto > 0),
  unidades_totales  integer generated always as
                    (cantidad_bultos * unidades_por_bulto + cantidad_unidades) stored,
  -- Congelado: si manana cambia la lista, el remito sigue mostrando este.
  precio_unitario   numeric(12,2) not null,
  -- false = se vendio pero no se entrega hoy. No descuenta stock.
  entregado         boolean not null default true,
  orden             integer not null default 0
);

create index remito_lineas_remito_idx on remito_lineas (remito_id);
create index remito_lineas_pendientes_idx on remito_lineas (producto_id) where not entregado;

-- ---------------------------------------------------------------------------
-- Ingresos de mercaderia
-- ---------------------------------------------------------------------------
-- Llega con remito del proveedor. Los carga Claudia. Es el punto donde el
-- sistema se cae si nadie lo hace.

create table ingresos (
  id                   uuid primary key default gen_random_uuid(),
  bodega               text,
  nro_remito_proveedor text,
  fecha                date not null default current_date,
  usuario_id           uuid references perfiles (id),
  notas                text not null default '',
  creado_at            timestamptz not null default now()
);

create table ingreso_lineas (
  id                uuid primary key default gen_random_uuid(),
  ingreso_id        uuid not null references ingresos (id) on delete cascade,
  producto_id       uuid not null references productos (id),
  cantidad_bultos   integer not null default 0,
  cantidad_unidades integer not null default 0,
  unidades_por_bulto integer not null default 1 check (unidades_por_bulto > 0),
  unidades_totales  integer generated always as
                    (cantidad_bultos * unidades_por_bulto + cantidad_unidades) stored
);

create index ingreso_lineas_ingreso_idx on ingreso_lineas (ingreso_id);

-- ---------------------------------------------------------------------------
-- Devoluciones
-- ---------------------------------------------------------------------------
-- Hoy existe un papel de devolucion. Lo que vuelve reingresa al stock.

create table devoluciones (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id),
  remito_id  uuid references remitos (id),
  fecha      date not null default current_date,
  motivo     text not null default '',
  usuario_id uuid references perfiles (id),
  creado_at  timestamptz not null default now()
);

create table devolucion_lineas (
  id                uuid primary key default gen_random_uuid(),
  devolucion_id     uuid not null references devoluciones (id) on delete cascade,
  producto_id       uuid not null references productos (id),
  cantidad_bultos   integer not null default 0,
  cantidad_unidades integer not null default 0,
  unidades_por_bulto integer not null default 1 check (unidades_por_bulto > 0),
  unidades_totales  integer generated always as
                    (cantidad_bultos * unidades_por_bulto + cantidad_unidades) stored,
  -- false = volvio rota o vencida: no vuelve al stock vendible.
  reingresa_stock   boolean not null default true
);

create index devolucion_lineas_devolucion_idx on devolucion_lineas (devolucion_id);

-- ---------------------------------------------------------------------------
-- Movimientos: la fuente de verdad del stock
-- ---------------------------------------------------------------------------
-- Todo lo que mueve una unidad pasa por aca, con signo. El ajuste manual es un
-- movimiento mas, y por eso queda auditable igual que el resto.

create type tipo_movimiento as enum (
  'inventario_inicial',
  'ingreso',
  'egreso',
  'devolucion',
  'anulacion',
  'ajuste',
  'rotura',
  'vencimiento'
);

create table movimientos (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references productos (id),
  tipo          tipo_movimiento not null,
  -- Unidades con signo: positivo entra, negativo sale. Nunca cero.
  unidades      integer not null check (unidades <> 0),
  fecha         timestamptz not null default now(),
  usuario_id    uuid references perfiles (id),
  nota          text not null default '',
  remito_id     uuid references remitos (id),
  ingreso_id    uuid references ingresos (id),
  devolucion_id uuid references devoluciones (id)
);

create index movimientos_producto_idx on movimientos (producto_id, fecha desc);
create index movimientos_remito_idx on movimientos (remito_id);

-- ---------------------------------------------------------------------------
-- Vistas de stock
-- ---------------------------------------------------------------------------
-- Fisico y "a pedir" son dos numeros que NUNCA se suman. Si se sumaran, el
-- sistema diria "hay 40" con 4 botellas en el estante, y a la segunda vez que
-- eso pasa nadie le cree mas.

create view stock_fisico as
  select p.id as producto_id,
         p.codigo,
         coalesce(sum(m.unidades), 0)::integer as unidades
    from productos p
    left join movimientos m on m.producto_id = p.id
   group by p.id, p.codigo;

create view stock_a_pedir as
  select l.producto_id,
         sum(l.unidades_totales)::integer as unidades
    from remito_lineas l
    join remitos r on r.id = l.remito_id
   where not l.entregado
     and r.estado = 'emitido'
   group by l.producto_id;

-- ---------------------------------------------------------------------------
-- Importaciones
-- ---------------------------------------------------------------------------

create table importaciones (
  id          uuid primary key default gen_random_uuid(),
  archivo     text not null,
  fecha       timestamptz not null default now(),
  usuario_id  uuid references perfiles (id),
  resumen     jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------
-- Sistema interno de tres personas: quien esta autenticado ve y hace todo.
-- Lo que no puede pasar es que alguien sin sesion toque nada.
-- El registro publico se deshabilita en el panel de Supabase (Auth > Providers).

alter table perfiles            enable row level security;
alter table clientes            enable row level security;
alter table cliente_direcciones enable row level security;
alter table productos           enable row level security;
alter table precios_historial   enable row level security;
alter table remitos             enable row level security;
alter table remito_lineas       enable row level security;
alter table ingresos            enable row level security;
alter table ingreso_lineas      enable row level security;
alter table devoluciones        enable row level security;
alter table devolucion_lineas   enable row level security;
alter table movimientos         enable row level security;
alter table importaciones       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'perfiles', 'clientes', 'cliente_direcciones', 'productos',
    'precios_historial', 'remitos', 'remito_lineas', 'ingresos',
    'ingreso_lineas', 'devoluciones', 'devolucion_lineas', 'movimientos',
    'importaciones'
  ]
  loop
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_authenticated', t
    );
  end loop;
end $$;
