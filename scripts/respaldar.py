"""
Copia de seguridad a mano de la base, mientras el proyecto de Supabase siga
en el plan gratis (sin copias diarias). SOLO LEE.

    python scripts/respaldar.py

Deja datos/backups/<fecha-hora>/ (fuera de git: son datos reales de clientes
y los usuarios con sus claves cifradas):
  - una CSV por tabla, con COPY: el mismo formato con que Postgres las vuelve
    a cargar. Las columnas calculadas (unidades_totales) no van: se recalculan.
  - secuencias.json: el próximo número de remito y de cliente.
  - manifiesto.json: filas por tabla y migraciones aplicadas.
  - RESTAURAR.txt: cómo volver a cargarla.

Todo se lee en UNA transacción REPEATABLE READ: la copia es una foto de un
mismo instante aunque alguien esté emitiendo un remito mientras corre.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import pathlib
import sys

import psycopg

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from migrar import leer_env, url_conexion  # noqa: E402

RAIZ = pathlib.Path(__file__).resolve().parent.parent
# Usuarios: sin estas dos, los perfiles quedan apuntando a cuentas que no existen.
AUTH = ["auth.users", "auth.identities"]
SECUENCIAS = ["remitos_numero_seq", "clientes_numero_seq"]

RESTAURAR = """Cómo restaurar esta copia (proyecto de Supabase NUEVO y vacío)

1. Esquema: python scripts/migrar.py contra el proyecto nuevo (SUPABASE_DB_URL
   apuntando a él). Crea tablas, funciones, triggers y políticas.
2. Datos, en una transacción con los triggers apagados (si no, cada ingreso
   volvería a generar su movimiento de stock y el stock quedaría duplicado):

     begin;
     set session_replication_role = replica;
     \\copy auth.users       from 'auth.users.csv'       csv header
     \\copy auth.identities  from 'auth.identities.csv'  csv header
     -- después las de public, padres antes que hijos:
     -- perfiles, proveedores, clientes, cliente_direcciones, productos,
     -- precios_historial, remitos, remito_lineas, ingresos, ingreso_lineas,
     -- devoluciones, devolucion_lineas, movimientos, importaciones
     -- (_migraciones ya la deja migrar.py)
     set session_replication_role = origin;
     commit;

3. Secuencias, con los valores de secuencias.json:
     select setval('remitos_numero_seq', <last_value>, <is_called>);
     select setval('clientes_numero_seq', <last_value>, <is_called>);
4. Comparar filas con manifiesto.json y correr npx tsx scripts/revisar_datos.ts.
"""


def main() -> None:
    sello = dt.datetime.now().strftime("%Y-%m-%d_%H%M")
    destino = RAIZ / "datos" / "backups" / sello
    destino.mkdir(parents=True, exist_ok=False)

    with psycopg.connect(url_conexion(leer_env()), connect_timeout=20) as con:
        con.execute("set transaction isolation level repeatable read, read only")
        tablas = [
            f"public.{t}"
            for (t,) in con.execute(
                """select table_name from information_schema.tables
                    where table_schema = 'public' and table_type = 'BASE TABLE'
                    order by table_name"""
            )
        ] + AUTH

        filas: dict[str, int] = {}
        for tabla in tablas:
            archivo = destino / f"{tabla.removeprefix('public.')}.csv"
            with con.cursor().copy(f"copy {tabla} to stdout with (format csv, header)") as copia, \
                    archivo.open("wb") as salida:
                for bloque in copia:
                    salida.write(bloque)
            # Contar con csv (no por renglones: una nota puede tener saltos de línea).
            with archivo.open(encoding="utf-8", newline="") as f:
                filas[tabla] = sum(1 for _ in csv.reader(f)) - 1
            esperado = con.execute(f"select count(*) from {tabla}").fetchone()[0]
            if filas[tabla] != esperado:
                sys.exit(f"{tabla}: el archivo tiene {filas[tabla]} filas y la base {esperado}")
            print(f"  {tabla:32} {filas[tabla]:>7} filas")

        secuencias = {
            s: dict(zip(("last_value", "is_called"),
                        con.execute(f"select last_value, is_called from {s}").fetchone()))
            for s in SECUENCIAS
        }
        migraciones = [m for (m,) in con.execute("select nombre from _migraciones order by nombre")]
        version = con.execute("select version()").fetchone()[0]

    (destino / "secuencias.json").write_text(json.dumps(secuencias, indent=2), encoding="utf-8")
    (destino / "manifiesto.json").write_text(
        json.dumps(
            {"fecha": dt.datetime.now().isoformat(timespec="seconds"), "postgres": version,
             "filas": filas, "migraciones": migraciones},
            indent=2, ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (destino / "RESTAURAR.txt").write_text(RESTAURAR, encoding="utf-8")

    peso = sum(f.stat().st_size for f in destino.iterdir())
    print(f"\nCopia en {destino} ({peso / 1024 / 1024:.1f} MB)")
    print(f"Próximo remito: R-{secuencias['remitos_numero_seq']['last_value'] + 1:04d}")


if __name__ == "__main__":
    main()
