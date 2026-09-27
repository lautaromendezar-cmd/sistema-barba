"""
Carga el catalogo real desde la planilla que mando el cliente.

    python scripts/importar_planilla.py            # en seco: no toca nada
    python scripts/importar_planilla.py --aplicar  # escribe en la base

En seco imprime el informe de que entraria y que queda afuera, y deja la lista
de conflictos en datos/. Es lo que hay que mirar antes de aplicar.

El archivo vive en datos/, fuera del repo: son datos reales de clientes.

DECISIONES QUE ESTAN TOMADAS ACA, para que se puedan discutir:

1. El precio de la planilla es POR UNIDAD y se guarda tal cual. Se comprobo
   cruzando 177 codigos contra la lista vieja de Tienda Nube: el cociente da
   exactamente 1/6 en los de caja de 6 y 1/24 en los de 24. La que estaba por
   bulto era la vieja, aunque su encabezado dijera "X UNIDAD".

2. Los que dicen "Consultar" entran con precio 0 y marcados: la base no deja
   emitir un remito con ellos hasta que alguien les escriba el precio
   (migracion 0007).

3. Los codigos que aparecen dos veces apuntando a DOS PRODUCTOS DISTINTOS no
   entran, ninguno de los dos. Quedan en datos/conflictos-codigos.csv para que
   Federico diga cual es cual. Si entraran, uno pisaria al otro y alguien
   emitiria un remito de una bodega con el precio de otra.

4. Un nombre de cliente repetido es UNA persona con varias direcciones de
   entrega, no dos clientes. Varios de los repetidos son el mismo domicilio
   escrito distinto ("CRAMER 1266" y "CREAMER 1266").

5. La seccion no viene en la planilla: la deduzco de la columna bodega cuando
   ahi hay un rubro y no una bodega (ACEITES, WHISKY, GIN...), y el resto
   queda como "Vinos". Es una decision mia y se cambia en masa con un update.
"""

import csv
import pathlib
import sys
import unicodedata

import openpyxl
import psycopg

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from migrar import leer_env, url_conexion  # noqa: E402

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PLANILLA = RAIZ / "datos" / "BASE PRODUCTOS - CLIENTES Y PROVEEDORES.xlsx"
CONFLICTOS = RAIZ / "datos" / "conflictos-codigos.csv"

# Bodegas que en realidad son rubros, agrupadas como las agrupaban las listas
# viejas. Lo que no cae aca es una bodega de verdad y va a "Vinos".
SECCIONES = {
    "Aceites, Pastas y Aceto": ("ACEITES", "PASTAS", "ACETO"),
    "Whisky, Gin y Aperitivos": ("WHISKY", "GIN", "APERITIVO", "VODKA", "RON"),
    "Espumantes e Importados": ("CHAMPAGNE IMPORTADO", "VINO IMPORTADO"),
    "Cervezas y Aguas": ("CERVEZAS", "AGUA TONICA", "AGUA IMPORTADA"),
}

# Federico dijo en la reunion que estos tambien se venden sueltos, no solo por
# bulto. Los de bulto de 1 se venden sueltos por definicion.
SUELTOS = ("WHISKY", "GIN", "VODKA", "APERITIVO", "PASTAS", "ACEITES", "ACETO")


def txt(v) -> str:
    return "" if v is None else str(v).strip()


def sin_tildes(s: str) -> str:
    plano = unicodedata.normalize("NFKD", s)
    return "".join(c for c in plano if not unicodedata.combining(c)).upper()


def seccion_de(bodega: str) -> str:
    b = sin_tildes(bodega)
    for seccion, rubros in SECCIONES.items():
        if any(b.startswith(r) for r in rubros):
            return seccion
    return "Vinos"


def se_vende_suelto(bodega: str, por_bulto: int) -> bool:
    return por_bulto == 1 or sin_tildes(bodega).startswith(SUELTOS)


def precio_de(celda: str) -> tuple[float, bool]:
    """Devuelve (precio por unidad, hay que consultarlo)."""
    limpio = celda.replace(",", ".")
    try:
        return float(limpio), False
    except ValueError:
        return 0.0, True


def leer_planilla():
    if not PLANILLA.exists():
        sys.exit(f"No esta la planilla en {PLANILLA}")
    libro = openpyxl.load_workbook(PLANILLA, read_only=True, data_only=True)

    crudos = [
        (i, f)
        for i, f in enumerate(
            libro["BASE PRODUCTOS"].iter_rows(min_row=2, values_only=True), start=2
        )
        if txt(f[0])
    ]

    # Un codigo que aparece dos veces con datos distintos no es un duplicado:
    # son dos productos peleando por la misma llave.
    veces: dict[str, list] = {}
    for fila, f in crudos:
        veces.setdefault(txt(f[0]), []).append((fila, f))
    chocados = {c: g for c, g in veces.items() if len(g) > 1}

    productos = []
    for codigo, grupo in veces.items():
        if codigo in chocados:
            continue
        _, f = grupo[0]
        por_bulto = int(txt(f[3]) or 1) or 1
        precio, consultar = precio_de(txt(f[5]))
        bodega = txt(f[1])
        productos.append(
            {
                "codigo": codigo,
                "nombre": txt(f[2]) or codigo,
                "bodega": bodega,
                "seccion": seccion_de(bodega),
                "presentacion": txt(f[4]),
                "unidades_por_bulto": por_bulto,
                "se_vende_suelto": se_vende_suelto(bodega, por_bulto),
                "precio_lista": precio,
                "precio_a_consultar": consultar,
            }
        )

    # Mismo nombre = mismo cliente con varias direcciones de entrega.
    clientes: dict[str, dict] = {}
    for f in libro["DATOS CLIENTES (2)"].iter_rows(min_row=2, values_only=True):
        nombre = txt(f[0])
        if not nombre:
            continue
        clave = sin_tildes(nombre)
        cli = clientes.setdefault(clave, {"nombre": nombre, "direcciones": []})
        direccion = txt(f[1])
        if direccion and direccion not in cli["direcciones"]:
            cli["direcciones"].append(direccion)

    proveedores = []
    vistos = set()
    for f in libro["DATOS PROVEEDORES"].iter_rows(min_row=2, values_only=True):
        nombre = txt(f[0])
        if not nombre or sin_tildes(nombre) in vistos:
            continue
        vistos.add(sin_tildes(nombre))
        direccion = txt(f[1])
        proveedores.append(
            {
                "nombre": nombre,
                "notas": f"Direccion: {direccion}" if direccion else "",
            }
        )

    return productos, list(clientes.values()), proveedores, chocados


def guardar_conflictos(chocados: dict) -> None:
    CONFLICTOS.parent.mkdir(exist_ok=True)
    with CONFLICTOS.open("w", encoding="utf-8-sig", newline="") as salida:
        w = csv.writer(salida)
        w.writerow(["CODIGO", "FILA DEL EXCEL", "BODEGA", "PRODUCTO", "U", "PRESENTACION", "PRECIO"])
        for codigo in sorted(chocados):
            for fila, f in chocados[codigo]:
                w.writerow([codigo, fila, txt(f[1]), txt(f[2]), txt(f[3]), txt(f[4]), txt(f[5])])


def informe(productos, clientes, proveedores, chocados) -> None:
    consultar = sum(1 for p in productos if p["precio_a_consultar"])
    sueltos = sum(1 for p in productos if p["se_vende_suelto"])
    direcciones = sum(len(c["direcciones"]) for c in clientes)
    con_varias = [c for c in clientes if len(c["direcciones"]) > 1]

    print("Lo que entraria")
    print(f"  productos            {len(productos):>6}")
    print(f"    sin precio         {consultar:>6}  dicen 'Consultar': entran marcados")
    print(f"    se venden sueltos  {sueltos:>6}")
    print(f"  clientes             {len(clientes):>6}")
    print(f"    direcciones        {direcciones:>6}")
    print(f"  proveedores          {len(proveedores):>6}")

    print("\nPor seccion")
    porcion: dict[str, int] = {}
    for p in productos:
        porcion[p["seccion"]] = porcion.get(p["seccion"], 0) + 1
    for s, n in sorted(porcion.items(), key=lambda x: -x[1]):
        print(f"  {n:>6}  {s}")

    print(f"\nLo que queda afuera: {len(chocados)} codigos, {sum(len(g) for g in chocados.values())} filas")
    print("  Cada uno apunta a dos productos distintos. Ejemplos:")
    for codigo in sorted(chocados)[:3]:
        print(f"    {codigo}")
        for _, f in chocados[codigo]:
            print(f"       {txt(f[1])[:20]:20s} {txt(f[2])[:34]:34s} {txt(f[5])}")
    print(f"  La lista completa quedo en {CONFLICTOS.relative_to(RAIZ)}")

    if con_varias:
        print(f"\nClientes con mas de una direccion: {len(con_varias)}")
        print("  (nombre repetido en la planilla; varios son el mismo domicilio escrito distinto)")
        for c in con_varias[:5]:
            print(f"    {c['nombre']}")
            for d in c["direcciones"]:
                print(f"       {d[:66]}")


def aplicar(con, productos, clientes, proveedores) -> None:
    cur = con.cursor()

    cur.execute("select count(*) from remitos")
    remitos = cur.fetchone()[0]
    if remitos:
        sys.exit(
            f"Hay {remitos} remitos cargados. Corre primero:\n"
            "  python scripts/datos_ejemplo.py --limpiar\n"
            "Si no, el primer remito real sale con un numero ya usado."
        )

    # Sin remitos ni movimientos, el catalogo de ejemplo se puede tirar entero.
    cur.execute("delete from cliente_direcciones")
    cur.execute("delete from clientes")
    cur.execute("update productos set proveedor_id = null")
    cur.execute("delete from proveedores")
    cur.execute("delete from productos")

    cur.executemany(
        """insert into productos
             (codigo, nombre, bodega, seccion, presentacion, unidades_por_bulto,
              se_vende_suelto, precio_lista, precio_a_consultar, en_lista_actual)
           values (%(codigo)s, %(nombre)s, %(bodega)s, %(seccion)s, %(presentacion)s,
                   %(unidades_por_bulto)s, %(se_vende_suelto)s, %(precio_lista)s,
                   %(precio_a_consultar)s, true)""",
        productos,
    )

    for c in clientes:
        cur.execute(
            "insert into clientes (nombre) values (%s) returning id", (c["nombre"],)
        )
        cliente_id = cur.fetchone()[0]
        for i, direccion in enumerate(c["direcciones"]):
            cur.execute(
                """insert into cliente_direcciones (cliente_id, direccion, es_principal)
                   values (%s, %s, %s)""",
                (cliente_id, direccion, i == 0),
            )

    cur.executemany(
        "insert into proveedores (nombre, notas) values (%(nombre)s, %(notas)s)",
        proveedores,
    )

    con.commit()
    print("\nCargado.")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    productos, clientes, proveedores, chocados = leer_planilla()
    guardar_conflictos(chocados)
    informe(productos, clientes, proveedores, chocados)

    if "--aplicar" not in sys.argv:
        print("\nEsto fue en seco: no se toco la base.")
        print("Para cargarlo de verdad: python scripts/importar_planilla.py --aplicar")
        return

    with psycopg.connect(url_conexion(leer_env())) as con:
        aplicar(con, productos, clientes, proveedores)


if __name__ == "__main__":
    main()
