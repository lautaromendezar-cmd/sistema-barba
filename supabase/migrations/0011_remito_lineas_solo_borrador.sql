-- Un remito ya emitido no puede seguir cambiando por abajo.
--
-- La politica remito_lineas_equipo (0004) es "for all", asi que cualquiera
-- del equipo podia insertar, editar o borrar lineas de un remito con estado
-- 'emitido': el documento impreso y el movimiento de egreso que ya se generó
-- quedaban fijos, pero las lineas seguian cambiando. El remito entregado y el
-- stock descontado dejaban de coincidir con lo que la base decia haber
-- vendido, sin que nada lo avisara.
--
-- Esto tiene dos partes, y las dos son necesarias:
--
--   1. remito_lineas solo acepta alta, edicion o baja mientras el remito al
--      que pertenecen siga en 'borrador'. Una vez emitido (o anulado), la
--      linea se lee, no se toca: se corrige con lo que ya existe para eso
--      (anular el remito).
--
--   2. Esa regla vale lo que valga remitos.estado. La politica remitos_cambio
--      (0004) deja escribir esa columna a cualquiera del equipo sin mirar la
--      transicion, asi que sin este freno alcanzaba con un PATCH directo a
--      /remitos poniendo estado='borrador' para reabrir un remito ya emitido,
--      editar sus lineas con la politica de arriba ya satisfecha, y volver a
--      poner estado='emitido': el mismo problema, un paso mas largo. El freno
--      es minimo y puntual: una vez 'emitido' o 'anulado', estado no puede
--      retroceder a 'borrador'. No protege ninguna otra columna del remito
--      (numero, emitido_at, anulado_por, ...) ni otras transiciones: proteger
--      el resto de la maquina de estados es una tarea aparte, mas amplia y
--      todavia pendiente.

-- ---------------------------------------------------------------------------
-- 1. remito_lineas: alta, edicion y baja solo con el remito en 'borrador'
-- ---------------------------------------------------------------------------

drop policy if exists remito_lineas_equipo on remito_lineas;

create policy remito_lineas_lectura on remito_lineas
  for select to authenticated using (es_del_equipo());

create policy remito_lineas_alta on remito_lineas
  for insert to authenticated with check (
    es_del_equipo()
    and exists (
      select 1 from remitos r
       where r.id = remito_id
         and r.estado = 'borrador'
    )
  );

create policy remito_lineas_modifica on remito_lineas
  for update to authenticated
  using (
    es_del_equipo()
    and exists (
      select 1 from remitos r
       where r.id = remito_id
         and r.estado = 'borrador'
    )
  )
  with check (
    es_del_equipo()
    and exists (
      select 1 from remitos r
       where r.id = remito_id
         and r.estado = 'borrador'
    )
  );

create policy remito_lineas_borra on remito_lineas
  for delete to authenticated using (
    es_del_equipo()
    and exists (
      select 1 from remitos r
       where r.id = remito_id
         and r.estado = 'borrador'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. remitos.estado no puede retroceder a 'borrador'
-- ---------------------------------------------------------------------------
-- emitir_remito hace borrador -> emitido y anular_remito hace emitido ->
-- anulado: ninguna de las dos vuelve a 'borrador', asi que el freno no les
-- molesta.

create or replace function remitos_no_reabrir()
returns trigger
language plpgsql
as $$
begin
  if old.estado in ('emitido', 'anulado') and new.estado = 'borrador' then
    raise exception 'Un remito % no puede volver a borrador', old.estado;
  end if;
  return new;
end;
$$;

alter function remitos_no_reabrir() set search_path = public;

drop trigger if exists remitos_no_reabrir on remitos;
create trigger remitos_no_reabrir
  before update on remitos
  for each row execute function remitos_no_reabrir();
