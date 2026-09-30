-- Un ingreso no puede quedar a nombre de otro.
--
-- El insert desde el navegador mandaba `usuario_id` a mano: el uuid de quien
-- tuviera la sesión abierta en esa pantalla, sin que nada en la base lo
-- comprobara. La política de alta (0004) solo pedía `es_del_equipo()`, así
-- que cualquiera del equipo podía cargar un ingreso con el uuid de un
-- compañero, o con null. El trigger que arma el movimiento de stock (0002,
-- mov_por_ingreso) copia ese mismo `usuario_id` a `movimientos`, así que el
-- "cargó <usuario>" de la pantalla de ingresos y la autoría del movimiento
-- quedaban tan falsificables como el insert que los originó.
--
-- La autoría pasa a salir de la sesión, no del insert: el default la completa
-- sola si el cliente no la manda, y el alta exige que sea igual a auth.uid(),
-- así que ni un uuid ajeno ni un null explícito pasan. Un ingreso ya cargado
-- tampoco puede cambiar de autor después: el trigger de movimientos recién lee
-- `usuario_id` cuando se insertan las líneas, así que sin esto alguien podría
-- cargar el ingreso a su nombre y reasignarlo antes de cargar las líneas.

alter table ingresos
  alter column usuario_id set default auth.uid();

drop policy if exists ingresos_alta on ingresos;
create policy ingresos_alta on ingresos
  for insert to authenticated
  with check (es_del_equipo() and usuario_id = auth.uid());

create or replace function bloquear_cambio_autor_ingreso()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.usuario_id is distinct from old.usuario_id then
    raise exception 'No se puede cambiar quién cargó un ingreso ya guardado';
  end if;
  return new;
end;
$$;

drop trigger if exists ingresos_autor_fijo on ingresos;
create trigger ingresos_autor_fijo
  before update on ingresos
  for each row execute function bloquear_cambio_autor_ingreso();
