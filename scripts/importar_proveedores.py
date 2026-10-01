"""Carga la lista de proveedores que facturan (razon social + CUIT).

Llego el 1-oct-2026 como `datos/listado de proveedores.xlsx` (fuera de git): 25 proveedores, 20 con
CUIT. La primera lista (26-sep, ya cargada) era la de los que no facturan, con
el nombre como los llaman en el deposito.

Que hace:
  * Si el proveedor ya existe (por nombre, o por la equivalencia de abajo), le
    completa razon social y CUIT y le deja el nombre como estaba.
  * Si no existe, lo crea con la razon social como nombre. Despues lo pueden
    renombrar a como lo llamen ("SALENTEIN") sin perder la razon social.
  * Los dos de la lista vieja que traian el CUIT pegado al nombre ("LEY SECA
    S.A  CUIT 30-71482506-9") quedan con el CUIT en su columna.

Ningun CUIT entra sin el digito verificador correcto (la base lo rechaza, 0015).

    python scripts/importar_proveedores.py            # en seco: informe
    python scripts/importar_proveedores.py --aplicar  # escribe
"""

import pathlib
import re
import sys

import openpyxl
import psycopg

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from migrar import leer_env, url_conexion  # noqa: E402

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PLANILLA = RAIZ / "datos" / "listado de proveedores.xlsx"

# La planilla y el sistema los llaman distinto. La columna A de la planilla lo
# aclara para Piatelli ("en el programa dice ADRIAN PIATELLI").
EQUIVALENCIAS = {"ARTEL INC PIATELLI": "ARTELLPIATELLI"}


def limpiar(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


def clave(texto: str) -> str:
    return re.sub(r"[^A-Z0-9Ñ]", "", texto.upper())


def formatear_cuit(texto: str | None) -> str | None:
    digitos = re.sub(r"\D", "", texto or "")
    if not digitos:
        return None
    if len(digitos) != 11:
        raise ValueError(f"CUIT con {len(digitos)} digitos: {texto!r}")
    return f"{digitos[:2]}-{digitos[2:10]}-{digitos[10]}"


def leer_planilla():
    hoja = openpyxl.load_workbook(PLANILLA, data_only=True).active
    filas = []
    for nota, nombre, cuit in hoja.iter_rows(min_row=1, max_col=3, values_only=True):
        # La fila 2 es el titulo de la columna.
        if not nombre or limpiar(str(nombre)).upper() in ("", "PROVEEDORES"):
            continue
        filas.append(
            {
                "razon_social": limpiar(str(nombre)),
                "cuit": formatear_cuit(cuit),
                "nota": limpiar(str(nota)) if nota else "",
            }
        )
    return filas


def main():
    aplicar = "--aplicar" in sys.argv
    filas = leer_planilla()

    with psycopg.connect(url_conexion(leer_env())) as con:
        existentes = {
            clave(nombre): (id_, nombre)
            for id_, nombre in con.execute("select id, nombre from proveedores")
        }

        nuevos, completados = [], []
        for f in filas:
            buscado = EQUIVALENCIAS.get(f["razon_social"], f["razon_social"])
            hallado = existentes.get(clave(buscado))
            if hallado:
                completados.append((hallado, f))
            else:
                nuevos.append(f)

        # Los de la lista vieja con el CUIT pegado al nombre.
        separados = []
        for id_, nombre in con.execute(
            "select id, nombre from proveedores where nombre ~* 'CUIT' and cuit is null"
        ):
            antes, _, despues = re.split(r"(CUIT)", nombre, maxsplit=1, flags=re.I)
            separados.append((id_, nombre, limpiar(antes), formatear_cuit(despues)))

        print(f"Planilla: {len(filas)} proveedores, {sum(1 for f in filas if f['cuit'])} con CUIT.\n")
        print(f"Ya estaban, se les completa razon social y CUIT ({len(completados)}):")
        for (_, nombre), f in completados:
            print(f"  {nombre:28} <- {f['razon_social']}  {f['cuit'] or '(sin CUIT)'}")
        print(f"\nNuevos ({len(nuevos)}):")
        for f in nuevos:
            print(f"  {f['razon_social']:45} {f['cuit'] or '(sin CUIT)'}")
        print(f"\nCUIT pegado al nombre, se separa ({len(separados)}):")
        for _, viejo, nombre, cuit in separados:
            print(f"  {viejo!r} -> {nombre!r} + {cuit}")

        if not aplicar:
            print("\nEn seco: no se escribio nada. Para cargar: --aplicar")
            return

        with con.transaction():
            for (id_, _), f in completados:
                con.execute(
                    """update proveedores
                       set razon_social = %(rs)s, cuit = %(cuit)s,
                           notas = case when %(nota)s = '' then notas
                                        when position(%(nota)s in coalesce(notas, '')) > 0 then notas
                                        when coalesce(notas, '') = '' then %(nota)s
                                        else notas || E'\n' || %(nota)s end
                       where id = %(id)s""",
                    {"rs": f["razon_social"], "cuit": f["cuit"], "nota": f["nota"], "id": id_},
                )
            for f in nuevos:
                con.execute(
                    "insert into proveedores (nombre, razon_social, cuit) values (%s, %s, %s)",
                    (f["razon_social"], f["razon_social"], f["cuit"]),
                )
            for id_, _, nombre, cuit in separados:
                con.execute(
                    "update proveedores set nombre = %s, razon_social = %s, cuit = %s where id = %s",
                    (nombre, nombre, cuit, id_),
                )
        print("\nListo: cargado.")


if __name__ == "__main__":
    main()
