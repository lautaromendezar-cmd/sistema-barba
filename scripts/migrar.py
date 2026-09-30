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
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MIGRACIONES = RAIZ / "supabase" / "migrations"

# El pooler de Supabase firma con SU PROPIA CA privada ("Supabase Root 2021
# CA", auto-firmada), no con una CA publica: 'sslrootcert=system' probado en
# esta maquina da 'certificate verify failed' porque ese root no esta en el
# almacen de confianza del sistema operativo, ni en el bundle de certifi.
# El archivo de abajo es ese root, bajado de la conexion real al pooler
# (aws-0-us-west-2.pooler.supabase.com:5432) y confirmado contra la cadena
# que el servidor manda (Root 2021 CA -> Intermediate 2021 CA -> *.pooler.
# supabase.com); Supabase lo usa para todos los proyectos, no es especifico
# de este, asi que no hace falta descargarlo de nuevo por proyecto.
RAIZ_SUPABASE = RAIZ / "supabase" / "certs" / "supabase-root-2021-ca.pem"


def _raiz_de_confianza() -> str:
    """El valor a usar en sslrootcert para verificar el certificado del
    pooler. Si el archivo con el root de Supabase esta en el repo (lo
    normal), se usa ese. Si no esta -- por ejemplo un checkout viejo antes
    de este cambio -- se cae a 'system' con un aviso, en vez de fallar en
    seco: sigue sin validar contra un root cualquiera (mismo riesgo que
    sslmode=require solo si tampoco existe el archivo), pero no rompe el
    script para quien todavia no hizo `git pull`."""
    if RAIZ_SUPABASE.exists():
        return str(RAIZ_SUPABASE)
    print(
        f"aviso: no encontre {RAIZ_SUPABASE.relative_to(RAIZ)} -- "
        "hace `git pull`. Verificando contra el almacen del sistema "
        "mientras tanto (puede fallar la conexion).",
        file=sys.stderr,
    )
    return "system"


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


def _forzar_verificacion_tls(url: str) -> str:
    """Sobrescribe sslmode/sslrootcert de una URL de conexion ya armada para
    que siempre verifique el certificado del servidor contra el almacen de
    confianza del sistema, sin depender de que quien puso la URL (por ejemplo
    en SUPABASE_POOLER_URL) se haya acordado de pedirlo. Conserva cualquier
    otro parametro que la URL ya traiga."""
    partes = urlsplit(url)
    query = dict(parse_qsl(partes.query, keep_blank_values=True))
    query["sslmode"] = "verify-full"
    query["sslrootcert"] = _raiz_de_confianza()
    return urlunsplit(partes._replace(query=urlencode(query)))


def url_conexion(env: dict[str, str]) -> str:
    if env.get("SUPABASE_POOLER_URL"):
        return _forzar_verificacion_tls(env["SUPABASE_POOLER_URL"])

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
    query = urlencode({"sslmode": "verify-full", "sslrootcert": _raiz_de_confianza()})
    return (
        f"postgresql://postgres.{ref}:{password}"
        f"@aws-0-{region}.pooler.supabase.com:5432/postgres"
        f"?{query}"
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
        # Se ejecuta siempre (no solo cuando se crea la tabla) para que un
        # proyecto con _migraciones creada antes de este fix tambien quede
        # protegida la proxima vez que corra este script.
        con.execute("alter table _migraciones enable row level security")
        con.execute("revoke all on _migraciones from anon, authenticated")
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
