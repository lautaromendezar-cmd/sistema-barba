"""Carga el stock contado de `datos/INVENTARIO ACTUAL 2026.xlsx` (fuera de git).

Federico mando el 13-oct-2026 su planilla de inventario. La hoja INVENTARIO
tiene una fila por producto; el stock actual es la columna TOTAL EN UNIDADES
(cajas actuales x unidades por caja + botellas sueltas), que Excel calcula de
un stock inicial mas las hojas ENTRADAS y SALIDAS.

Ojo: el codigo de esa hoja no esta escrito, lo busca un VLOOKUP por nombre en
la hoja LISTA (la lista de precios de FEBRERO 2024). El catalogo del sistema
salio de otra planilla (26-sep), y entre una y otra hay codigos que cambiaron
de producto. Por eso una fila solo entra si TODO cierra:

  * tiene codigo y el codigo existe en el sistema;
  * el nombre se parece al del sistema (si no, el codigo es de otro vino);
  * las unidades por caja coinciden con las del sistema (si no, no se sabe
    cuantas botellas son las cajas contadas);
  * el codigo no aparece en dos filas con stock;
  * el total es un numero positivo (los negativos son errores de la planilla:
    el producto queda en cero).

Lo demas no se carga: va a `datos/inventario-para-revisar.xlsx`, una hoja por
motivo y con el producto del sistema que parece corresponder, para que
Federico lo confirme.

Cada producto cargado es un movimiento `inventario_inicial` (ajustar_stock),
con nota, asi que se ve en su historial. Se puede volver a correr: si el stock
ya es el contado, ajustar_stock no escribe nada.

    python scripts/importar_inventario.py            # en seco: informe + planilla
    python scripts/importar_inventario.py --aplicar  # escribe
"""

import collections
import difflib
import pathlib
import re
import sys
import warnings

import openpyxl
import psycopg
from openpyxl.styles import Font, PatternFill

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from migrar import leer_env, url_conexion  # noqa: E402

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PLANILLA = RAIZ / "datos" / "INVENTARIO ACTUAL 2026.xlsx"
REVISAR = RAIZ / "datos" / "inventario-para-revisar.xlsx"
NOTA = "Inventario inicial (planilla del 13-oct-2026)"
PARECIDO_MINIMO = 0.6


def norm(texto) -> str:
    texto = str(texto or "").upper()
    for a, b in zip("ÁÉÍÓÚÜÑ", "AEIOUUN"):
        texto = texto.replace(a, b)
    return re.sub(r"[^A-Z0-9]", "", texto)


def parecido(a, b) -> float:
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def numero(valor):
    return valor if isinstance(valor, (int, float)) and not isinstance(valor, bool) else None


def leer_planilla() -> list[dict]:
    warnings.filterwarnings("ignore")  # validaciones y areas de impresion de Excel
    hoja = openpyxl.load_workbook(PLANILLA, data_only=True)["INVENTARIO"]
    filas = []
    for i, r in enumerate(hoja.iter_rows(min_row=2, values_only=True), start=2):
        if not any(r[1:5]):
            continue
        filas.append(
            {
                "fila": i,
                "codigo": str(r[1]).strip() if r[1] and str(r[1]).strip() else "",
                "bodega": str(r[2] or "").strip(),
                "producto": str(r[3] or "").strip(),
                "por_caja": numero(r[6]),
                "cajas": numero(r[13]),
                "sueltas": numero(r[14]),
                "total": numero(r[17]),
            }
        )
    return filas


def main():
    aplicar = "--aplicar" in sys.argv
    filas = leer_planilla()

    with psycopg.connect(url_conexion(leer_env()), connect_timeout=20) as con:
        catalogo = {
            codigo: {"id": pid, "nombre": nombre, "bodega": bodega, "por_caja": por_caja}
            for pid, codigo, nombre, bodega, por_caja in con.execute(
                "select id, codigo, nombre, bodega, unidades_por_bulto from productos"
            )
        }

        def sugerir(f) -> tuple[str, str, float]:
            """El producto del sistema que mas se parece por bodega + nombre."""
            buscado = f"{f['bodega']} {f['producto']}"
            mejor = max(
                catalogo.items(),
                key=lambda kv: parecido(buscado, f"{kv[1]['bodega']} {kv[1]['nombre']}"),
            )
            p = mejor[1]
            return mejor[0], f"{p['bodega']} / {p['nombre']}", round(
                parecido(buscado, f"{p['bodega']} {p['nombre']}"), 2
            )

        con_stock = collections.Counter(
            f["codigo"] for f in filas if f["codigo"] and (f["total"] or 0) > 0
        )

        cargar, revisar = [], collections.defaultdict(list)
        for f in filas:
            hay_algo = (f["cajas"] or 0) != 0 or (f["sueltas"] or 0) != 0 or (f["total"] or 0) != 0
            p = catalogo.get(f["codigo"])
            if not f["codigo"]:
                if hay_algo:
                    revisar["Sin codigo"].append(f)
            elif p is None:
                if (f["total"] or 0) > 0:
                    revisar["No esta en el sistema"].append(f)
            elif parecido(f["producto"], p["nombre"]) < PARECIDO_MINIMO:
                if (f["total"] or 0) > 0:
                    revisar["Codigo de otro producto"].append(f)
            elif f["total"] is None:
                if hay_algo:
                    revisar["Sin total"].append(f)
            elif f["total"] < 0:
                revisar["Negativos (quedan en 0)"].append(f)
            elif f["total"] == 0:
                continue
            elif f["por_caja"] != p["por_caja"]:
                revisar["Unidades por caja distintas"].append(f)
            elif con_stock[f["codigo"]] > 1:
                revisar["Codigo repetido"].append(f)
            else:
                cargar.append((f, p))

        print(f"Filas leidas: {len(filas)}")
        print(f"Se cargan: {len(cargar)} productos, {sum(f['total'] for f, _ in cargar):,} unidades")
        for motivo, lista in revisar.items():
            print(f"A revisar - {motivo}: {len(lista)}")

        escribir_revision(revisar, catalogo, sugerir)
        print(f"\nPlanilla para Federico: {REVISAR.relative_to(RAIZ)}")

        if not aplicar:
            print("\nEn seco: no se escribio nada. Con --aplicar se carga.")
            return

        remitos = con.execute("select count(*) from remitos where estado <> 'borrador'").fetchone()[0]
        if remitos:
            sys.exit(
                f"Hay {remitos} remitos emitidos o anulados. El inventario es el punto de "
                "partida: si ya hubo movimiento real, hay que pensar el orden antes de cargar."
            )

        with con.transaction():
            for f, p in cargar:
                con.execute(
                    "select ajustar_stock(%s, %s, %s, 'inventario_inicial')",
                    (p["id"], int(f["total"]), NOTA),
                )
        cargados = con.execute(
            "select count(*), coalesce(sum(unidades), 0) from movimientos where tipo = 'inventario_inicial'"
        ).fetchone()
        print(f"\nListo: {cargados[0]} movimientos de inventario inicial, {cargados[1]:,} unidades.")


def escribir_revision(revisar, catalogo, sugerir):
    libro = openpyxl.Workbook()
    libro.remove(libro.active)
    negrita = Font(bold=True)
    amarillo = PatternFill("solid", fgColor="FFF2CC")

    explicacion = {
        "Sin codigo": "Tienen cajas o botellas contadas pero no tienen codigo. "
        "Al lado va el producto del sistema que mas se parece: confirmar o escribir el codigo correcto.",
        "No esta en el sistema": "El codigo no existe en el sistema. Hay que darlos de alta "
        "(precio y unidades por caja) o decir a que producto corresponden.",
        "Codigo de otro producto": "El mismo codigo es un vino en el inventario y otro en el sistema. "
        "Decir cual es el codigo correcto de cada uno.",
        "Unidades por caja distintas": "La caja trae una cantidad en el inventario y otra en el sistema. "
        "Decir cual es la correcta: cambia cuantas botellas son las cajas contadas.",
        "Codigo repetido": "El mismo codigo aparece en dos filas con stock. Decir si se suman o cual vale.",
        "Negativos (quedan en 0)": "Dan stock negativo en la planilla. Se cargaron en cero: "
        "si hay botellas, poner cuantas.",
        "Sin total": "La planilla no pudo calcular el total.",
    }

    for motivo, lista in revisar.items():
        hoja = libro.create_sheet(motivo[:31])
        hoja.append([explicacion.get(motivo, "")])
        hoja["A1"].font = Font(italic=True)
        hoja.append([])
        encabezado = ["Fila", "Codigo", "Bodega", "Producto", "x caja", "Cajas", "Sueltas", "Total u"]
        if motivo == "Unidades por caja distintas":
            encabezado += ["x caja en el sistema", "CORRECTO (x caja)"]
        elif motivo == "Codigo repetido":
            encabezado += ["CORRECTO"]
        else:
            encabezado += ["Codigo sugerido", "Producto sugerido", "Parecido", "CODIGO CORRECTO"]
        hoja.append(encabezado)
        for celda in hoja[3]:
            celda.font = negrita
        for f in sorted(lista, key=lambda f: f["fila"]):
            base = [f["fila"], f["codigo"], f["bodega"], f["producto"], f["por_caja"],
                    f["cajas"], f["sueltas"], f["total"]]
            if motivo == "Unidades por caja distintas":
                base += [catalogo[f["codigo"]]["por_caja"], None]
            elif motivo == "Codigo repetido":
                base += [None]
            else:
                codigo, nombre, puntaje = sugerir(f)
                # Por debajo de esto la sugerencia es ruido (Owner -> Weinert):
                # mejor dejarlo en blanco que inducir a confirmar otro vino.
                if puntaje < 0.8:
                    codigo, nombre = "", "(sin sugerencia)"
                base += [codigo, nombre, puntaje, None]
            hoja.append(base)
            hoja.cell(hoja.max_row, len(base)).fill = amarillo
        for col, ancho in zip("ABCDEFGHIJKL", [6, 9, 22, 50, 7, 7, 8, 8, 14, 50, 9, 18]):
            hoja.column_dimensions[col].width = ancho
        hoja.freeze_panes = "A4"
    libro.save(REVISAR)


if __name__ == "__main__":
    main()
