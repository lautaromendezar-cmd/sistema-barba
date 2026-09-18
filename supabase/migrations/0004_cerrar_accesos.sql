-- Cierra lo que una auditoría desde afuera encontró abierto.
--
-- El contexto: la clave "anon" es pública por diseño, viaja en el JavaScript
-- de la página y cualquiera puede copiarla. Toda la seguridad real está en la
-- base. Con esa clave y ninguna cuenta se podía:
--
--   1. Leer el stock completo por las vistas, que no heredan las políticas de
--      las tablas: una vista corre con los permisos de QUIEN LA CREÓ, así que
--      stock_fisico exponía las existencias de toda la empresa.
--   2. Ejecutar emitir_remito, anular_remito y ajustar_stock, porque Postgres
--      le da permiso de ejecución a todo el mundo por omisión. Faltaba adivinar
--      un uuid para anularle un remito a alguien.
--   3. Registrarse solo. Y como las políticas le daban todo a cualquiera que
--      estuviera logueado, bastaba con confirmar el mail propio para entrar a
--      leer y escribir la base entera.
--
-- El punto 3 es el que manda: mientras el permiso sea "estar logueado", el
-- sistema depende de una casilla del panel de Supabase que nadie recuerda
-- haber tocado. Acá el permiso pasa a ser "tener perfil de empleado", que es
-- una fila que solo crea el administrador.

-- ---------------------------------------------------------------------------
-- Quién es del equipo
-- ---------------------------------------------------------------------------
-- security definer para que pueda mirar `perfiles` sin quedar atrapada en las
-- políticas de la propia tabla que está resolviendo.

create or replace function es_del_equipo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
     where id = auth.uid()
       and activo
  );
$$;

revoke execute on function es_del_equipo() from public, anon;
grant execute on function es_del_equipo() to authenticated;

-- ---------------------------------------------------------------------------
-- Las vistas dejan de ser una puerta de atrás
-- ---------------------------------------------------------------------------
-- security_invoker hace que la vista corra con los permisos de quien consulta,
-- y entonces sí respeta las políticas de `movimientos` y `remito_lineas`.

alter view stock_fisico  set (security_invoker = on);
alter view stock_a_pedir set (security_invoker = on);

revoke all on stock_fisico  from anon;
revoke all on stock_a_pedir from anon;
grant select on stock_fisico  to authenticated;
grant select on stock_a_pedir to authenticated;

-- ---------------------------------------------------------------------------
-- Las funciones que mueven stock, solo para el equipo
-- ---------------------------------------------------------------------------

revoke execute on function emitir_remito(uuid) from public, anon;
revoke execute on function anular_remito(uuid, text) from public, anon;
revoke execute on function ajustar_stock(uuid, integer, text, tipo_movimiento)
  from public, anon;

grant execute on function emitir_remito(uuid) to authenticated;
grant execute on function anular_remito(uuid, text) to authenticated;
grant execute on function ajustar_stock(uuid, integer, text, tipo_movimiento)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Estar logueado ya no alcanza: hay que ser del equipo
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'perfiles', 'clientes', 'cliente_direcciones', 'productos',
    'precios_historial', 'remito_lineas', 'ingreso_lineas',
    'devoluciones', 'devolucion_lineas', 'importaciones'
  ]
  loop
    execute format('drop policy if exists %I on %I', t || '_authenticated', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (es_del_equipo()) with check (es_del_equipo())',
      t || '_equipo', t
    );
  end loop;
end $$;

-- Movimientos: se leen y se insertan, nunca se editan ni se borran (0003).
drop policy if exists movimientos_lectura on movimientos;
drop policy if exists movimientos_alta on movimientos;

create policy movimientos_lectura on movimientos
  for select to authenticated using (es_del_equipo());

create policy movimientos_alta on movimientos
  for insert to authenticated with check (es_del_equipo());

-- Remitos e ingresos: se crean y se modifican, nunca se borran (0003).
drop policy if exists remitos_lectura on remitos;
drop policy if exists remitos_alta on remitos;
drop policy if exists remitos_cambio on remitos;

create policy remitos_lectura on remitos
  for select to authenticated using (es_del_equipo());
create policy remitos_alta on remitos
  for insert to authenticated with check (es_del_equipo());
create policy remitos_cambio on remitos
  for update to authenticated using (es_del_equipo()) with check (es_del_equipo());

drop policy if exists ingresos_lectura on ingresos;
drop policy if exists ingresos_alta on ingresos;
drop policy if exists ingresos_cambio on ingresos;

create policy ingresos_lectura on ingresos
  for select to authenticated using (es_del_equipo());
create policy ingresos_alta on ingresos
  for insert to authenticated with check (es_del_equipo());
create policy ingresos_cambio on ingresos
  for update to authenticated using (es_del_equipo()) with check (es_del_equipo());

-- ---------------------------------------------------------------------------
-- Detalle de higiene: fijar el search_path de las funciones
-- ---------------------------------------------------------------------------
-- Sin esto, alguien que pueda crear objetos podría hacer que la función llame
-- a una tabla suya en vez de a la nuestra.

alter function emitir_remito(uuid) set search_path = public;
alter function anular_remito(uuid, text) set search_path = public;
alter function ajustar_stock(uuid, integer, text, tipo_movimiento)
  set search_path = public;
alter function mov_por_ingreso() set search_path = public;
alter function mov_por_devolucion() set search_path = public;
