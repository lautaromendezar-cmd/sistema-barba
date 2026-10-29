-- Estado de la base para el mail diario (28-oct-2026)
-- ---------------------------------------------------------------------------
-- La API no deja ver el tamaño de la base ni qué migraciones hay aplicadas
-- (_migraciones está cerrada a todos desde 0004). Esta función devuelve solo
-- eso, y solo a alguien del equipo: la usa /api/revision-diaria para el
-- «Estado del sistema» del mail.
--
-- security definer para poder leer _migraciones; no escribe nada.

create or replace function estado_base()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_del_equipo() then
    raise exception 'Solo para el equipo';
  end if;

  return jsonb_build_object(
    'bytes', pg_database_size(current_database()),
    'ultima_migracion', (select max(nombre) from _migraciones),
    'migraciones', (select count(*) from _migraciones)
  );
end;
$$;

revoke execute on function estado_base() from public, anon;
grant execute on function estado_base() to authenticated;
