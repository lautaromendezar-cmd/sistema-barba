-- El autor de un remito no puede ser lo que mande el cliente.
--
-- emitirRemito (lib/store.tsx) manda usuario_id en el INSERT tal como lo tiene
-- en el estado del navegador. Las políticas de remitos son "for all to
-- authenticated" sin comprobar esa columna (0004_cerrar_accesos.sql), así que
-- cualquiera de las tres personas logueadas puede firmar un remito con el uuid
-- de otra, o con null, con solo tocar el payload antes de que salga.
--
-- La corrección va en la base, no en el cliente: quien hizo el pedido HTTP es
-- auth.uid(), y eso reemplaza lo que haya llegado en la columna. Pero
-- auth.uid() solo existe dentro de una sesión de PostgREST/Supabase Auth. La
-- carga de ejemplo (scripts/datos_ejemplo.py) escribe remitos por una conexión
-- directa a Postgres con SUPABASE_DB_URL, sin pasar por ahí, y asigna a mano
-- un usuario_id por remito para poder mostrar el sistema con actividad
-- repartida entre las tres personas. En esa conexión auth.uid() da null.
--
-- Por eso el trigger solo pisa la columna cuando auth.uid() no es null: cierra
-- la suplantación desde el navegador (ahí SIEMPRE hay un auth.uid(), porque
-- las políticas ya exigen estar autenticado) sin voltear lo que carga un
-- script de mantenimiento por la conexión directa.
--
-- En un UPDATE no se copia auth.uid(): eso pisaría al autor original con quien
-- sea que haga el siguiente cambio (por ejemplo, anular_remito lo ejecuta
-- cualquiera de las tres personas). Lo que corresponde ahí es no dejar tocar
-- la columna: se conserva el valor que ya tenía la fila.

create or replace function remitos_fijar_usuario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.usuario_id := auth.uid();
    end if;
  elsif tg_op = 'UPDATE' then
    if auth.uid() is not null then
      new.usuario_id := old.usuario_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists remitos_autor_del_lado_servidor on remitos;

create trigger remitos_autor_del_lado_servidor
  before insert or update on remitos
  for each row execute function remitos_fijar_usuario();
