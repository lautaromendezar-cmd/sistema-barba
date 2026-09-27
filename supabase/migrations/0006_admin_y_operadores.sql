-- ---------------------------------------------------------------------------
-- Federico administra, las dos empleadas operan
-- ---------------------------------------------------------------------------
-- Hasta acá los tres usuarios veían lo mismo: así estaba escrito en el alcance
-- ("los tres ven todo, incluidos costos y márgenes"). Federico cambió de idea:
-- quiere que las empleadas vean la parte operativa y no el panel con la plata
-- del negocio.
--
-- Hay que ser honesto con lo que esta migración puede y no puede hacer. El
-- panel se calcula con los remitos y el stock, que las empleadas necesitan
-- para trabajar. Esconderlo es sacarlo de la pantalla, no ponerlo fuera de
-- alcance: quien sepa abrir la consola del navegador puede volver a sumarlo.
-- Para que fuera una pared de verdad habría que recortarles el historial de
-- remitos, y eso les cambia el trabajo. Está anotado en CONTINUAR.md.
--
-- Lo que sí arregla esta migración es un agujero real: `perfiles` tenía una
-- política `for all`, así que cualquiera del equipo podía escribirla. Con una
-- marca de administrador ahí adentro, eso pasaba a ser "cualquiera se hace
-- administrador solo". Ahora los perfiles se leen desde la app y se escriben
-- únicamente desde la conexión directa (scripts/crear_usuarios.py).

alter table perfiles
  add column if not exists es_admin boolean not null default false;

comment on column perfiles.es_admin is
  'Ve el panel con la facturación. Solo se cambia desde la conexión directa.';

-- Federico. Se busca por el mail interno, que es el identificador estable:
-- el nombre que se muestra puede cambiar.
update perfiles
   set es_admin = true
 where id in (select id from auth.users where email = 'federico@barba.local');

create or replace function es_admin()
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
       and es_admin
  );
$$;

revoke execute on function es_admin() from public, anon;
grant execute on function es_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Los perfiles se leen, no se escriben
-- ---------------------------------------------------------------------------

drop policy if exists perfiles_equipo on perfiles;
drop policy if exists perfiles_authenticated on perfiles;

create policy perfiles_lectura on perfiles
  for select to authenticated using (es_del_equipo());
