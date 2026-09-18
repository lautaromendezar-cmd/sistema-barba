"""Llena el sistema con movimiento de ejemplo, para poder mostrarlo.

    python scripts/datos_ejemplo.py            # carga
    python scripts/datos_ejemplo.py --limpiar  # borra todo el movimiento

Genera ingresos de mercadería y un año de remitos repartidos mes a mes, usando
las mismas funciones de la base que usa la app: el stock que muestra el sistema
sale de esos movimientos y no de un número escrito a mano.

La semilla es fija, así que dos corridas dan lo mismo. Productos, clientes y
proveedores no se tocan.

OJO: esto es para mostrar. Antes de cargar los datos de verdad hay que correr
--limpiar, o el primer remito real va a salir con un número que ya se usó.
"""

import random
import sys
from datetime import datetime, timedelta, timezone

import psycopg

from migrar import leer_env, url_conexion

SEMILLA = 2026
MESES = 12
REMITOS_POR_MES = (3, 7)


def limpiar(con) -> None:
    for t in (
        "movimientos",
        "remito_lineas",
        "remitos",
        "ingreso_lineas",
        "ingresos",
        "devolucion_lineas",
        "devoluciones",
    ):
        con.execute(f"delete from {t}")
    con.execute("alter sequence remitos_numero_seq restart with 1")
    con.commit()
    print("Listo: no quedó ningún movimiento, y la numeración vuelve a R-0001.")


def main() -> None:
    env = leer_env()
    solo_limpiar = "--limpiar" in sys.argv

    with psycopg.connect(url_conexion(env), connect_timeout=20) as con:
        if solo_limpiar:
            limpiar(con)
            return

        productos = con.execute(
            """select id, codigo, unidades_por_bulto, precio_lista
                 from productos order by codigo"""
        ).fetchall()
        clientes = con.execute(
            "select id, descuento_pct from clientes order by nombre"
        ).fetchall()
        usuarios = [
            f[0]
            for f in con.execute("select id from perfiles order by nombre").fetchall()
        ]

        if not productos or not clientes or not usuarios:
            sys.exit("Faltan productos, clientes o usuarios: cargá el seed primero.")

        limpiar(con)
        rnd = random.Random(SEMILLA)
        hoy = datetime.now(timezone.utc)

        # --- Mercadería que entra, hace un año, para tener con qué vender ---
        arranque = hoy - timedelta(days=MESES * 30 + 5)
        ingreso_id = con.execute(
            """insert into ingresos (bodega, nro_remito_proveedor, fecha, usuario_id, notas)
               values ('Varias', 'INICIAL-0001', %s, %s, 'Carga inicial de ejemplo')
               returning id""",
            (arranque.date(), usuarios[0]),
        ).fetchone()[0]

        for pid, _cod, upb, _precio in productos:
            bultos = rnd.randint(40, 90)
            con.execute(
                """insert into ingreso_lineas
                     (ingreso_id, producto_id, cantidad_bultos, unidades_por_bulto)
                   values (%s, %s, %s, %s)""",
                (ingreso_id, pid, bultos, upb),
            )
        con.execute(
            "update movimientos set fecha = %s where ingreso_id = %s",
            (arranque, ingreso_id),
        )
        con.commit()
        print(f"Ingreso inicial cargado: {len(productos)} productos.")

        # --- Un año de remitos ---
        total = 0
        for atras in range(MESES - 1, -1, -1):
            base = hoy - timedelta(days=atras * 30)
            # El último mes con un poco más de actividad, que es lo que se mira.
            cuantos = rnd.randint(*REMITOS_POR_MES) + (2 if atras == 0 else 0)

            for _ in range(cuantos):
                dia = base - timedelta(days=rnd.randint(0, 27), hours=rnd.randint(0, 9))
                cliente_id, descuento = rnd.choice(clientes)
                usuario_id = rnd.choice(usuarios)
                # El recargo por transferencia aparece en una de cada tres ventas.
                ajuste = 10.5 if rnd.random() < 0.33 else 0

                remito_id = con.execute(
                    """insert into remitos
                         (cliente_id, fecha, descuento_pct, ajuste_pct,
                          condicion_pago, usuario_id, creado_at)
                       values (%s, %s, %s, %s, %s, %s, %s) returning id""",
                    (
                        cliente_id,
                        dia.date(),
                        descuento,
                        ajuste,
                        "transferencia" if ajuste else "efectivo",
                        usuario_id,
                        dia,
                    ),
                ).fetchone()[0]

                for orden, (pid, _cod, upb, precio) in enumerate(
                    rnd.sample(productos, rnd.randint(1, min(5, len(productos))))
                ):
                    # Una de cada ocho líneas queda pendiente de entrega.
                    entregado = rnd.random() > 0.12
                    con.execute(
                        """insert into remito_lineas
                             (remito_id, producto_id, cantidad_bultos,
                              unidades_por_bulto, precio_unitario, entregado, orden)
                           values (%s, %s, %s, %s, %s, %s, %s)""",
                        (
                            remito_id,
                            pid,
                            rnd.randint(1, 6),
                            upb,
                            precio,
                            entregado,
                            orden,
                        ),
                    )

                con.execute("select emitir_remito(%s)", (remito_id,))
                # emitir_remito sella con la hora de ahora: se corrige para que
                # el remito quede en su mes.
                con.execute(
                    "update remitos set emitido_at = %s where id = %s",
                    (dia, remito_id),
                )
                con.execute(
                    "update movimientos set fecha = %s where remito_id = %s",
                    (dia, remito_id),
                )
                total += 1

        con.commit()
        print(f"Remitos emitidos: {total}, repartidos en {MESES} meses.")

        # --- Que las alertas del panel tengan de qué hablar ---
        con.execute(
            """insert into movimientos (producto_id, tipo, unidades, usuario_id, nota, fecha)
               select id, 'rotura', -greatest(1, floor(random() * 4))::int, %s,
                      'Rotura de ejemplo', now() - interval '3 days'
                 from productos order by codigo limit 2""",
            (usuarios[0],),
        )
        con.commit()

        fila = con.execute(
            """select count(*) from movimientos""",
        ).fetchone()[0]
        print(f"Movimientos totales: {fila}.")
        print("\nPara borrar todo esto: python scripts/datos_ejemplo.py --limpiar")


if __name__ == "__main__":
    main()
