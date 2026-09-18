-- Operaciones que mueven stock.
--
-- Estan en la base y no en la app a proposito: emitir un remito son dos cosas
-- (marcarlo emitido y descontar el stock) que tienen que pasar juntas o no
-- pasar. Si se hicieran desde el navegador, una caida de red en el medio deja
-- un remito emitido que no descontó nada, y nadie se entera hasta el inventario.
--
-- Regla general: los documentos no se editan. Un remito se anula, un ingreso
-- mal cargado se corrige con un ajuste. Siempre queda el rastro de quien fue.

-- ---------------------------------------------------------------------------
-- Emitir un remito
-- ---------------------------------------------------------------------------
-- El borrador no consume numero ni toca el stock: el remito se arma antes de
-- ir a juntar el pedido al deposito. Al emitirlo toma el correlativo y
-- descuenta SOLO lo que se entrega. Lo pendiente no descuenta: queda para la
-- pantalla de "hay que pedirle al proveedor".
--
-- El stock negativo NO bloquea: se muestra en rojo. Bloquear una venta porque
-- el sistema cree que no hay mercaderia es la forma mas rapida de que vuelvan
-- al papel.

create or replace function emitir_remito(p_remito_id uuid)
returns remitos
language plpgsql
as $$
declare
  v_remito remitos;
  v_lineas integer;
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

-- ---------------------------------------------------------------------------
-- Anular un remito
-- ---------------------------------------------------------------------------
-- No se borra nunca: queda con quien lo anulo y cuando. Sin eso no hay forma
-- de explicar un faltante dentro de seis meses. La anulacion devuelve al stock
-- exactamente lo que ese remito habia descontado.

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

-- ---------------------------------------------------------------------------
-- Ingresos y devoluciones
-- ---------------------------------------------------------------------------
-- No tienen estado intermedio: se cargan una vez y suman al stock en el acto.
-- Por eso van por trigger y no por una funcion que haya que acordarse de
-- llamar. Si una linea se carga mal, se corrige con un ajuste manual, que es
-- un movimiento mas y queda a la vista.

create or replace function mov_por_ingreso()
returns trigger
language plpgsql
as $$
declare
  v_ingreso ingresos;
begin
  if new.unidades_totales <= 0 then
    return new;
  end if;

  select * into v_ingreso from ingresos where id = new.ingreso_id;

  insert into movimientos (producto_id, tipo, unidades, usuario_id, ingreso_id, nota)
  values (new.producto_id,
          'ingreso',
          new.unidades_totales,
          v_ingreso.usuario_id,
          new.ingreso_id,
          nullif(v_ingreso.nro_remito_proveedor, ''));

  return new;
end;
$$;

create trigger ingreso_lineas_mov
  after insert on ingreso_lineas
  for each row execute function mov_por_ingreso();

-- Lo que vuelve rota o vencida no reingresa al stock vendible: se registra en
-- la devolucion para poder reclamarle al proveedor, pero no suma unidades.
create or replace function mov_por_devolucion()
returns trigger
language plpgsql
as $$
declare
  v_dev devoluciones;
begin
  if not new.reingresa_stock or new.unidades_totales <= 0 then
    return new;
  end if;

  select * into v_dev from devoluciones where id = new.devolucion_id;

  insert into movimientos (producto_id, tipo, unidades, usuario_id, devolucion_id, nota)
  values (new.producto_id,
          'devolucion',
          new.unidades_totales,
          v_dev.usuario_id,
          new.devolucion_id,
          v_dev.motivo);

  return new;
end;
$$;

create trigger devolucion_lineas_mov
  after insert on devolucion_lineas
  for each row execute function mov_por_devolucion();

-- ---------------------------------------------------------------------------
-- Ajuste manual de stock
-- ---------------------------------------------------------------------------
-- Para cuando el numero no coincide con lo que hay en el estante, y para las
-- roturas y vencimientos, que hoy se anotan en un papel para sacarlos de stock.
-- Recibe el stock que se conto, no la diferencia: es lo que la persona tiene
-- delante cuando mira el estante.

create or replace function ajustar_stock(
  p_producto_id uuid,
  p_unidades_contadas integer,
  p_nota text default '',
  p_tipo tipo_movimiento default 'ajuste'
)
returns integer
language plpgsql
as $$
declare
  v_actual integer;
  v_delta  integer;
begin
  if p_tipo not in ('ajuste', 'rotura', 'vencimiento', 'inventario_inicial') then
    raise exception 'Tipo de ajuste invalido: %', p_tipo;
  end if;

  select coalesce(sum(unidades), 0) into v_actual
    from movimientos where producto_id = p_producto_id;

  v_delta := p_unidades_contadas - v_actual;

  if v_delta = 0 then
    return v_actual;
  end if;

  insert into movimientos (producto_id, tipo, unidades, usuario_id, nota)
  values (p_producto_id, p_tipo, v_delta,
          (select id from perfiles where id = auth.uid()),
          p_nota);

  return p_unidades_contadas;
end;
$$;
