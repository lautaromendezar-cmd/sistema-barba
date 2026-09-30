-- ---------------------------------------------------------------------------
-- stock_a_pedir: la suma no puede volver a caber en int4
-- ---------------------------------------------------------------------------
-- sum(l.unidades_totales) sobre remito_lineas.unidades_totales (int4 por
-- línea) devuelve bigint en Postgres. El ::integer que sigue lo angostaba de
-- vuelta: dos líneas de 2.147.483.647 unidades del mismo producto, emitidas
-- y sin entregar, hacen que esa suma pase el techo de int4 y el cast levante
-- una excepción en cada SELECT sobre la vista. lib/store.tsx trata eso como
-- una falla total de carga para todo el equipo.
--
-- La solución es la misma que para stock_fisico: se deja de angostar y la
-- columna "unidades" queda bigint. A diferencia de ajustar_stock (que corrige
-- stock_fisico escribiendo en movimientos.unidades, un int4), no hay ninguna
-- función ni trigger que lea de stock_a_pedir para volver a escribir ese
-- valor en una columna más angosta: es una vista de sólo lectura que
-- lib/store.tsx consume con SELECT. Ensancharla no deja ninguna escritura
-- angosta pendiente de arreglar.
--
-- CREATE OR REPLACE VIEW no puede cambiar el tipo de una columna existente,
-- así que hay que recrearla.

drop view stock_a_pedir;

create view stock_a_pedir as
  select l.producto_id,
         sum(l.unidades_totales) as unidades
    from remito_lineas l
    join remitos r on r.id = l.remito_id
   where not l.entregado
     and r.estado = 'emitido'
   group by l.producto_id;

-- Re-aplicar exactamente lo que 0004_cerrar_accesos.sql le había puesto:
-- la vista corre con los permisos de quien consulta (respeta las políticas
-- de remito_lineas) y sólo el equipo autenticado puede leerla.

alter view stock_a_pedir set (security_invoker = on);

revoke all on stock_a_pedir from anon;
grant select on stock_a_pedir to authenticated;
