-- Emitir y anular un remito no puede hacerse con un PATCH directo.
--
-- El problema: `remitos_alta` y `remitos_cambio` (0002) le dan a cualquiera
-- del equipo permiso de insertar y modificar CUALQUIER columna de `remitos`,
-- incluidas las que arman la maquina de estados: `numero`, `estado`,
-- `emitido_at`, `anulado_por`, `anulado_at` y `motivo_anulacion`. Esas
-- columnas estan pensadas para que las escriban solo `emitir_remito` y
-- `anular_remito` (0002, 0007), pero nada en la base lo obliga: con la clave
-- de sesion de cualquiera del equipo y un PATCH /rest/v1/remitos directo (sin
-- pasar por esas funciones) se puede:
--
--   * Reabrir un remito ya emitido (volverlo a `estado = 'borrador'` con
--     `numero = null`) y despues llamar a `emitir_remito`: toma un numero
--     nuevo y descuenta el stock por segunda vez.
--   * Marcar un remito `anulado` a mano, con `anulado_por` apuntando a otro
--     empleado, sin que `anular_remito` devuelva el stock que ese remito
--     habia descontado.
--   * Insertar remitos con `estado = 'emitido'` y el `numero` que le toca al
--     proximo, dejando huecos en la numeracion legal y haciendo fallar la
--     emision real.
--
-- La solucion no puede ser "solo se puede hacer UPDATE si estado = 'borrador'"
-- a secas: `anular_remito` tiene que poder pasar un remito de `emitido` a
-- `anulado`, así que esa regla lo bloquearía a el tambien. Lo que se bloquea
-- es al CLIENTE escribiendo esas columnas por su cuenta: un trigger las
-- protege salvo que la propia transaccion traiga la marca que solo ponen
-- `emitir_remito` y `anular_remito`, justo antes de su propio UPDATE. Crear un
-- borrador y editar sus campos (cliente, notas, etc.) antes de emitirlo sigue
-- andando igual que hoy, porque esas columnas no las toca el trigger.

-- ---------------------------------------------------------------------------
-- Un alta no puede nacer ya emitida, numerada o anulada
-- ---------------------------------------------------------------------------

drop policy if exists remitos_alta on remitos;

create policy remitos_alta on remitos
  for insert to authenticated with check (
    es_del_equipo()
    and estado = 'borrador'
    and numero is null
    and emitido_at is null
    and anulado_por is null
    and anulado_at is null
    and motivo_anulacion is null
  );

-- ---------------------------------------------------------------------------
-- La maquina de estados no se toca por UPDATE directo
-- ---------------------------------------------------------------------------

create or replace function bloquear_transicion_directa_de_remito()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.estado          is distinct from old.estado
      or new.numero           is distinct from old.numero
      or new.emitido_at       is distinct from old.emitido_at
      or new.anulado_por      is distinct from old.anulado_por
      or new.anulado_at       is distinct from old.anulado_at
      or new.motivo_anulacion is distinct from old.motivo_anulacion)
     and coalesce(current_setting('app.remito_transicion', true), '') <> 'on'
  then
    raise exception
      'El estado de un remito solo lo cambian emitir_remito o anular_remito';
  end if;

  return new;
end;
$$;

drop trigger if exists remitos_bloquear_transicion_directa on remitos;
create trigger remitos_bloquear_transicion_directa
  before update on remitos
  for each row execute function bloquear_transicion_directa_de_remito();

-- ---------------------------------------------------------------------------
-- Las dos funciones levantan la marca justo antes de escribir el estado
-- ---------------------------------------------------------------------------
-- `set_config(..., true)` la deja valer solo para esta transaccion: no hace
-- falta bajarla despues, Postgres la descarta sola al terminar. El resto de
-- cada funcion queda identico a 0007 (emitir_remito) y 0002 (anular_remito).

create or replace function emitir_remito(p_remito_id uuid)
returns remitos
language plpgsql
as $$
declare
  v_remito remitos;
  v_lineas integer;
  v_sin_precio text;
begin
  select * into v_remito from remitos where id = p_remito_id for update;

  if not found then
    raise exception 'El remito no existe';
  end if;

  if v_remito.estado <> 'borrador' then
    raise exception 'El remito % ya fue emitido o anulado', coalesce(v_remito.numero::text, '(borrador)');
  end if;

  select count(*) into v_lineas from remito_lineas where remito_id = p_remito_id;
  if v_lineas = 0 then
    raise exception 'No se puede emitir un remito sin lineas';
  end if;

  select string_agg(p.nombre, ', ') into v_sin_precio
    from remito_lineas l
    join productos p on p.id = l.producto_id
   where l.remito_id = p_remito_id
     and p.precio_a_consultar
     and coalesce(l.precio_unitario, 0) = 0;

  if v_sin_precio is not null then
    raise exception 'Falta ponerle precio a: %', v_sin_precio;
  end if;

  perform set_config('app.remito_transicion', 'on', true);

  update remitos
     set numero     = nextval('remitos_numero_seq'),
         estado     = 'emitido',
         emitido_at = now()
   where id = p_remito_id
  returning * into v_remito;

  insert into movimientos (producto_id, tipo, unidades, usuario_id, remito_id, nota)
  select l.producto_id,
         'egreso',
         -l.unidades_totales,
         v_remito.usuario_id,
         v_remito.id,
         'Remito ' || v_remito.numero
    from remito_lineas l
   where l.remito_id = p_remito_id
     and l.entregado
     and l.unidades_totales > 0;

  return v_remito;
end;
$$;

alter function emitir_remito(uuid) set search_path = public;
revoke execute on function emitir_remito(uuid) from public, anon;
grant execute on function emitir_remito(uuid) to authenticated;

create or replace function anular_remito(p_remito_id uuid, p_motivo text default '')
returns remitos
language plpgsql
as $$
declare
  v_remito remitos;
  v_usuario uuid;
begin
  select * into v_remito from remitos where id = p_remito_id for update;

  if not found then
    raise exception 'El remito no existe';
  end if;

  if v_remito.estado <> 'emitido' then
    raise exception 'Solo se puede anular un remito emitido';
  end if;

  select id into v_usuario from perfiles where id = auth.uid();

  insert into movimientos (producto_id, tipo, unidades, usuario_id, remito_id, nota)
  select m.producto_id,
         'anulacion',
         -m.unidades,
         v_usuario,
         v_remito.id,
         'Anulacion del remito ' || v_remito.numero
    from movimientos m
   where m.remito_id = p_remito_id
     and m.tipo = 'egreso';

  perform set_config('app.remito_transicion', 'on', true);

  update remitos
     set estado           = 'anulado',
         anulado_por      = v_usuario,
         anulado_at       = now(),
         motivo_anulacion = nullif(p_motivo, '')
   where id = p_remito_id
  returning * into v_remito;

  return v_remito;
end;
$$;

alter function anular_remito(uuid, text) set search_path = public;
revoke execute on function anular_remito(uuid, text) from public, anon;
grant execute on function anular_remito(uuid, text) to authenticated;
