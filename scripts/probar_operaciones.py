"""Prueba el ciclo completo de stock contra la base real.

    python scripts/probar_operaciones.py

Todo corre dentro de una transaccion que al final se revierte: la base queda
como estaba. Sirve para verificar que emitir, anular, ingresar, devolver y
ajustar mueven el stock como tienen que moverlo, que es la parte del sistema
donde un error no se nota hasta el inventario.
"""

import sys

import psycopg

from migrar import leer_env, url_conexion

fallos: list[str] = []


def chequear(descripcion: str, obtenido, esperado) -> None:
    if obtenido == esperado:
        print(f"  OK   {descripcion}")
    else:
        print(f"  MAL  {descripcion}: esperaba {esperado!r}, vino {obtenido!r}")
        fallos.append(descripcion)


def main() -> None:
    con = psycopg.connect(url_conexion(leer_env()), connect_timeout=20)
    con.autocommit = False

    def uno(sql: str, *args):
        return con.execute(sql, args).fetchone()

    def stock(producto_id) -> int:
        fila = uno("select unidades from stock_fisico where producto_id = %s", producto_id)
        return fila[0] if fila else 0

    def a_pedir(producto_id) -> int:
        fila = uno("select unidades from stock_a_pedir where producto_id = %s", producto_id)
        return fila[0] if fila else 0

    try:
        print("\nDatos de prueba")
        prod = uno(
            """insert into productos (codigo, nombre, bodega, unidades_por_bulto, precio_lista)
               values ('TEST-1', 'Producto de prueba', 'Bodega Test', 6, 1000)
               returning id"""
        )[0]
        cliente = uno(
            "insert into clientes (nombre, descuento_pct) values ('Cliente Test', 5) returning id"
        )[0]
        chequear("un producto nuevo arranca en cero", stock(prod), 0)

        print("\nIngreso de mercaderia: 10 bultos de 6")
        ingreso = uno(
            """insert into ingresos (bodega, nro_remito_proveedor)
               values ('Bodega Test', 'R-TEST') returning id"""
        )[0]
        con.execute(
            """insert into ingreso_lineas
                 (ingreso_id, producto_id, cantidad_bultos, unidades_por_bulto)
               values (%s, %s, 10, 6)""",
            (ingreso, prod),
        )
        chequear("el ingreso suma 60 unidades", stock(prod), 60)

        print("\nRemito borrador: 2 bultos entregados + 3 bultos pendientes")
        remito = uno(
            "insert into remitos (cliente_id, descuento_pct) values (%s, 5) returning id",
            cliente,
        )[0]
        con.execute(
            """insert into remito_lineas
                 (remito_id, producto_id, cantidad_bultos, unidades_por_bulto,
                  precio_unitario, entregado)
               values (%s, %s, 2, 6, 1000, true),
                      (%s, %s, 3, 6, 1000, false)""",
            (remito, prod, remito, prod),
        )
        chequear("el borrador no toca el stock", stock(prod), 60)
        chequear("el borrador no tiene numero", uno("select numero from remitos where id = %s", remito)[0], None)

        print("\nEmitir")
        numero = uno("select numero from emitir_remito(%s)", remito)[0]
        chequear("toma numero al emitir", isinstance(numero, int), True)
        chequear("descuenta solo lo entregado (12 unidades)", stock(prod), 48)
        chequear("lo pendiente queda para pedir (18 unidades)", a_pedir(prod), 18)

        print("\nEmitir dos veces tiene que fallar")
        con.execute("savepoint sp")
        try:
            con.execute("select emitir_remito(%s)", (remito,))
            chequear("emitir dos veces da error", False, True)
        except psycopg.errors.RaiseException:
            chequear("emitir dos veces da error", True, True)
        con.execute("rollback to savepoint sp")

        print("\nAnular")
        uno("select numero from anular_remito(%s, 'prueba')", remito)
        chequear("la anulacion devuelve el stock", stock(prod), 60)
        chequear("un remito anulado ya no pide nada", a_pedir(prod), 0)
        chequear(
            "queda el rastro de la anulacion",
            uno("select estado::text, motivo_anulacion from remitos where id = %s", remito),
            ("anulado", "prueba"),
        )

        print("\nDevolucion de 1 bulto (vuelve al estante)")
        dev = uno(
            "insert into devoluciones (cliente_id, motivo) values (%s, 'no lo vendio') returning id",
            cliente,
        )[0]
        con.execute(
            """insert into devolucion_lineas
                 (devolucion_id, producto_id, cantidad_bultos, unidades_por_bulto)
               values (%s, %s, 1, 6)""",
            (dev, prod),
        )
        chequear("la devolucion suma 6 unidades", stock(prod), 66)

        print("\nDevolucion rota (no vuelve al estante)")
        con.execute(
            """insert into devolucion_lineas
                 (devolucion_id, producto_id, cantidad_bultos, unidades_por_bulto,
                  reingresa_stock)
               values (%s, %s, 1, 6, false)""",
            (dev, prod),
        )
        chequear("lo roto no suma stock", stock(prod), 66)

        print("\nAjuste manual: se contaron 60")
        uno("select ajustar_stock(%s, 60, 'conteo del jueves')", prod)
        chequear("el ajuste deja el stock en lo contado", stock(prod), 60)

        print("\nRotura de 2 unidades: quedan 58")
        uno("select ajustar_stock(%s, 58, 'se cayo una caja', 'rotura')", prod)
        chequear("la rotura baja el stock", stock(prod), 58)
        chequear(
            "la rotura queda tipificada",
            uno("select count(*) from movimientos where producto_id = %s and tipo = 'rotura'", prod)[0],
            1,
        )

        print("\nEl stock negativo no se bloquea")
        remito2 = uno("insert into remitos (cliente_id) values (%s) returning id", cliente)[0]
        con.execute(
            """insert into remito_lineas
                 (remito_id, producto_id, cantidad_bultos, unidades_por_bulto, precio_unitario)
               values (%s, %s, 100, 6, 1000)""",
            (remito2, prod),
        )
        uno("select numero from emitir_remito(%s)", remito2)
        chequear("deja vender mas de lo que hay", stock(prod), 58 - 600)

    except Exception as e:  # noqa: BLE001
        print(f"\nERROR inesperado: {type(e).__name__}: {e}")
        fallos.append(str(e))
    finally:
        con.rollback()
        con.close()

    print()
    if fallos:
        print(f"{len(fallos)} chequeo(s) fallaron.")
        sys.exit(1)
    print("Todo bien. La base quedo sin cambios (rollback).")


if __name__ == "__main__":
    main()
