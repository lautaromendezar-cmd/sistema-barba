-- Anular un ingreso (pedido de Lautaro, 22-oct-2026, ya en uso)
-- ---------------------------------------------------------------------------
-- Hasta ahora un ingreso mal cargado solo se arreglaba con un ajuste por
-- producto. Ahora se anula como un remito: no se borra, queda marcado con
-- quien y cuando, y cada movimiento de ingreso se compensa con uno de
-- 'anulacion' por las mismas unidades en negativo. Si parte ya se vendio, el
-- stock queda en negativo, igual que con cualquier faltante.
--
-- Las dos columnas solo las escribe anular_ingreso: un PATCH directo
-- dejaria el ingreso marcado sin devolver el stock (mismo criterio que 0010).

alter table ingresos add column if not exists anulado_por uuid references perfiles (id);
alter table ingresos add column if not exists anulado_at  timestamptz;

create or replace function bloquear_anulacion_directa_de_ingreso()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.anulado_por is distinct from old.anulado_por
      or new.anulado_at is distinct from old.anulado_at)
     and coalesce(current_setting('app.ingreso_anulacion', true), '') <> 'on'
  then
    raise exception 'Un ingreso solo se anula con anular_ingreso';
  end if;

  return new;
end;
$$;

drop trigger if exists ingresos_bloquear_anulacion_directa on ingresos;
create trigger ingresos_bloquear_anulacion_directa
  before update on ingresos
  for each row execute function bloquear_anulacion_directa_de_ingreso();

-- Tampoco se puede dar de alta un ingreso que ya nazca anulado.
drop policy if exists ingresos_alta on ingresos;
create policy ingresos_alta on ingresos
  for insert to authenticated
  with check (es_del_equipo() and usuario_id = auth.uid()
              and anulado_por is null and anulado_at is null);

create or replace function anular_ingreso(p_ingreso_id uuid)
returns ingresos
language plpgsql
as $$
declare
  v_ingreso ingresos;
  v_usuario uuid;
begin
  select * into v_ingreso from ingresos where id = p_ingreso_id for update;

  if not found then
    raise exception 'El ingreso no existe';
  end if;

  if v_ingreso.anulado_at is not null then
    raise exception 'El ingreso ya está anulado';
  end if;

  select id into v_usuario from perfiles where id = auth.uid();

  insert into movimientos (producto_id, tipo, unidades, usuario_id, ingreso_id, nota)
  select m.producto_id,
         'anulacion',
         -m.unidades,
         v_usuario,
         v_ingreso.id,
         'Anulacion del ingreso ' || coalesce(nullif(v_ingreso.nro_remito_proveedor, ''), 's/nº')
    from movimientos m
   where m.ingreso_id = p_ingreso_id
     and m.tipo = 'ingreso';

  perform set_config('app.ingreso_anulacion', 'on', true);

  update ingresos
     set anulado_por = v_usuario,
         anulado_at  = now()
   where id = p_ingreso_id
  returning * into v_ingreso;

  -- La marca vive hasta el fin de la transaccion: se apaga ya, para que nada
  -- mas en la misma transaccion pueda tocar estas columnas.
  perform set_config('app.ingreso_anulacion', 'off', true);

  return v_ingreso;
end;
$$;

alter function anular_ingreso(uuid) set search_path = public;
revoke execute on function anular_ingreso(uuid) from public, anon;
grant execute on function anular_ingreso(uuid) to authenticated;
