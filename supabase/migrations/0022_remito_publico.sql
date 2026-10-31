-- El remito por WhatsApp: link publico con codigo secreto (30-oct-2026)
-- ---------------------------------------------------------------------------
-- Federico quiere mandarle el remito al cliente para que lo vea y confirme. El
-- cliente no tiene cuenta, asi que el link lleva un codigo imposible de adivinar
-- (uuid al azar, uno por remito) y remito_publico() devuelve ESE remito y nada
-- mas. anon no ve ninguna tabla: sigue todo cerrado como en 0004.
--
-- Devuelve lo que sale en el papel y nada mas: ni costo, ni lista, ni motivo
-- de anulacion. Un borrador no existe para afuera. Un anulado se sigue viendo
-- (con el sello): el cliente puede tener el link de antes de anularlo.

alter table remitos
  add column if not exists codigo_publico uuid not null default gen_random_uuid();

alter table remitos
  add constraint remitos_codigo_publico_unico unique (codigo_publico);

create or replace function remito_publico(p_codigo uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'numero',     r.numero,
    'fecha',      coalesce(r.emitido_at, r.creado_at),
    'estado',     r.estado,
    'ajuste_pct', r.ajuste_pct,
    'notas',      r.notas,
    'cliente',    r.cliente_datos,
    'usuario',    pf.nombre,
    'lineas',     coalesce((
      select jsonb_agg(jsonb_build_object(
        'codigo',      p.codigo,
        'descripcion', coalesce(nullif(l.descripcion, ''), p.nombre),
        'bultos',      l.cantidad_bultos,
        'unidades',    l.unidades_totales,
        'precio',      l.precio_unitario,
        'entregado',   l.entregado
      ) order by l.orden)
      from remito_lineas l
      left join productos p on p.id = l.producto_id
      where l.remito_id = r.id
    ), '[]'::jsonb)
  )
  from remitos r
  left join perfiles pf on pf.id = r.usuario_id
  where r.codigo_publico = p_codigo
    and r.estado <> 'borrador';
$$;

revoke execute on function remito_publico(uuid) from public;
grant execute on function remito_publico(uuid) to anon, authenticated;
