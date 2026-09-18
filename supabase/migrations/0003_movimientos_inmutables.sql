-- Los movimientos no se editan ni se borran.
--
-- Todo el sistema se apoya en que el historial de stock es inmutable: por eso
-- un remito se anula en vez de borrarse, y por eso el ajuste manual es un
-- movimiento mas en lugar de una correccion silenciosa. Pero la politica
-- anterior daba permiso de todo a cualquiera que estuviera logueado, asi que
-- la regla vivia en la buena fe y no en la base: con la sesion abierta y la
-- consola del navegador, un movimiento se podia borrar.
--
-- Un numero de stock equivocado se arregla con un ajuste, que deja rastro de
-- quien lo hizo. Nunca borrando lo que ya paso.

drop policy if exists movimientos_authenticated on movimientos;

create policy movimientos_lectura on movimientos
  for select to authenticated using (true);

create policy movimientos_alta on movimientos
  for insert to authenticated with check (true);

-- Sin politicas de update ni de delete: quedan prohibidos para todos, incluidas
-- las funciones emitir_remito y anular_remito, que solo insertan.

-- Los remitos y los ingresos tampoco se borran: se anulan o se corrigen.
drop policy if exists remitos_authenticated on remitos;

create policy remitos_lectura on remitos
  for select to authenticated using (true);

create policy remitos_alta on remitos
  for insert to authenticated with check (true);

-- Se pueden modificar (emitir, anular, corregir notas) pero no eliminar.
create policy remitos_cambio on remitos
  for update to authenticated using (true) with check (true);

drop policy if exists ingresos_authenticated on ingresos;

create policy ingresos_lectura on ingresos
  for select to authenticated using (true);

create policy ingresos_alta on ingresos
  for insert to authenticated with check (true);

create policy ingresos_cambio on ingresos
  for update to authenticated using (true) with check (true);
