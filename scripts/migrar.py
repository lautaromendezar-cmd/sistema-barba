"""Aplica las migraciones de supabase/migrations/ a la base configurada.

    python scripts/migrar.py            # aplica lo que falte
    python scripts/migrar.py --estado   # solo muestra que hay aplicado

Lleva registro en la tabla _migraciones, asi que se puede correr las veces que
haga falta: aplica solo lo que todavia no paso.

Las credenciales salen de .env.local, que no se commitea. La conexion va por el
pooler porque la directa (db.<ref>.supabase.co) es IPv6 y no resuelve desde
cualquier red.
"""

import pathlib
import sys

import psycopg
from urllib.parse import unquote, urlsplit

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MIGRACIONES = RAIZ / "supabase" / "migrations"


def leer_env() -> dict[str, str]:
    archivo = RAIZ / ".env.local"
    if not archivo.exists():
        sys.exit("Falta .env.local")
    env = {}
    for linea in archivo.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#") and "=" in linea:
            clave, valor = linea.split("=", 1)
            env[clave.strip()] = valor.strip()
    return env


def url_conexion(env: dict[str, str]) -> str:
    if env.get("SUPABASE_POOLER_URL"):
        return env["SUPABASE_POOLER_URL"]

    directa = env.get("SUPABASE_DB_URL")
    if not directa:
        sys.exit("Falta SUPABASE_DB_URL o SUPABASE_POOLER_URL en .env.local")

    # postgresql://postgres:<pass>@db.<ref>.supabase.co:5432/postgres
    partes = urlsplit(directa)
    password = unquote(partes.password or "")
    host = partes.hostname or ""
    if not host.startswith("db.") or not password:
        sys.exit(f"No pude leer el proyecto de SUPABASE_DB_URL (host: {host})")
    ref = host.split(".")[1]
    region = env.get("SUPABASE_REGION", "us-west-2")
    return (
        f"postgresql://postgres.{ref}:{password}"
        f"@aws-0-{region}.pooler.supabase.com:5432/postgres?sslmode=require"
    )


def main() -> None:
    env = leer_env()
    solo_estado = "--estado" in sys.argv

    archivos = sorted(MIGRACIONES.glob("*.sql"))
    if not archivos:
        sys.exit(f"No hay migraciones en {MIGRACIONES}")

    with psycopg.connect(url_conexion(env), connect_timeout=20) as con:
        con.execute("""
            create table if not exists _migraciones (
              nombre      text primary key,
              aplicada_at timestamptz not null default now()
            )
        """)
        con.commit()

        aplicadas = {
            fila[0] for fila in con.execute("select nombre from _migraciones")
        }

        if solo_estado:
            for archivo in archivos:
                marca = "OK" if archivo.name in aplicadas else "--"
                print(f"  [{marca}] {archivo.name}")
            return

        pendientes = [a for a in archivos if a.name not in aplicadas]
        if not pendientes:
            print("Todo al dia: no hay migraciones pendientes.")
            return

        for archivo in pendientes:
            print(f"Aplicando {archivo.name} ...", end=" ", flush=True)
            try:
                con.execute(archivo.read_text(encoding="utf-8"))
                con.execute(
                    "insert into _migraciones (nombre) values (%s)", (archivo.name,)
                )
                con.commit()
                print("OK")
            except Exception as e:  # noqa: BLE001
                con.rollback()
                print("FALLO")
                print(f"\n  {type(e).__name__}: {e}")
                sys.exit(1)

        print(f"\nListo: {len(pendientes)} migracion(es) aplicada(s).")


if __name__ == "__main__":
    main()
