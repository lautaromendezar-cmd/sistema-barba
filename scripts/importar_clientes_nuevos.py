"""Agrega clientes nuevos a los que ya estan cargados, sin tocar los existentes.

El 9-oct-2026 Federico mando `datos/CLIENTES PARA AGREGAR AL PROGRAMA.xlsx`
(fuera de git): una hoja sin encabezado con nombre, telefono, direccion y
localidad. Una fila sin nombre sigue la direccion del cliente de arriba.

No sirve `importar_planilla.py` para esto: ese borra todos los clientes antes de
cargar, y ya hay remitos que los apuntan.

Que hace:
  * Las filas de continuacion que son parte de la direccion ("LOTE 167",
    "entre VIDAL y CRAMER", el codigo postal) se pegan a la direccion; las
    indicaciones de entrega ("LLAMAR ANTES DE LLEGAR") van a las notas del
    cliente, que el remito tambien imprime.
  * "(CLAU)" en el nombre es la vendedora: se saca del nombre y queda Claudia.
  * Un cliente cuyo nombre o telefono ya existe en la base NO se carga: se
    informa para que alguien diga si es el mismo.
  * Los de PARECEN_YA_CARGADOS (misma direccion que uno existente) tampoco.
  * El numero (C-0592...) lo pone la base.

    python scripts/importar_clientes_nuevos.py            # en seco: informe
    python scripts/importar_clientes_nuevos.py --aplicar  # escribe
"""

import pathlib
import re
import sys

import openpyxl
import psycopg

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from migrar import leer_env, url_conexion  # noqa: E402

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PLANILLA = RAIZ / "datos" / "CLIENTES PARA AGREGAR AL PROGRAMA.xlsx"

# Parecen clientes que ya estan, con otro nombre: misma direccion. Quedan afuera
# hasta que Federico confirme. Si es el mismo, se completa la ficha existente.
PARECEN_YA_CARGADOS = {
    "ANDRES CIAMPO": "C-0069 ANDRES CAMPO (y C-0066 ANDRES), Roque Saenz Pena 868 piso 7",
    "GASTON MUGELLO MOTOS": "C-0222 GASTON BARZOLA, Fleming 2279 Martinez",
}

PARTE_DE_DIRECCION = re.compile(r"^(entre|lote|diagonal|\(\d{4}\))", re.IGNORECASE)


def limpiar(valor) -> str:
    texto = str(valor or "").replace("�", "Ñ")  # "PE?A" en el archivo
    texto = re.sub(r"\(\s+", "(", texto)
    return re.sub(r"\s+", " ", texto).strip()


def clave(texto: str) -> str:
    return re.sub(r"[^A-Z0-9Ñ]", "", texto.upper())


def digitos_telefono(texto: str) -> str:
    # Los ultimos 8 alcanzan para comparar "11 4444 7203" con "+54 9 11 4444-7203".
    return re.sub(r"\D", "", texto)[-8:]


def leer_planilla():
    hoja = openpyxl.load_workbook(PLANILLA, data_only=True).active
    clientes = []
    for nombre, telefono, direccion, localidad in hoja.iter_rows(
        min_row=1, max_col=4, values_only=True
    ):
        nombre, direccion = limpiar(nombre), limpiar(direccion)
        if not nombre:
            if not direccion:
                continue
            ultimo = clientes[-1]
            if PARTE_DE_DIRECCION.match(direccion):
                ultimo["direccion"] += f" - {direccion}"
            else:
                ultimo["notas"].append(direccion)
            continue
        vendedor = None
        if re.search(r"\(\s*CLAU\s*\)", nombre, re.IGNORECASE):
            vendedor = "Claudia"
            nombre = limpiar(re.sub(r"\(\s*CLAU\s*\)", "", nombre, flags=re.IGNORECASE))
        clientes.append(
            {
                "nombre": nombre,
                "telefono": re.sub(r"^TEL\s*", "", limpiar(telefono), flags=re.I) or None,
                "direccion": direccion,
                "localidad": limpiar(localidad) or None,
                "vendedor": vendedor,
                "notas": [],
            }
        )
    return clientes


def main():
    aplicar = "--aplicar" in sys.argv
    clientes = leer_planilla()

    with psycopg.connect(url_conexion(leer_env())) as con:
        por_nombre = {}
        por_telefono = {}
        for numero, nombre, telefono in con.execute(
            "select numero, nombre, telefono from clientes"
        ):
            por_nombre[clave(nombre)] = (numero, nombre)
            if telefono and digitos_telefono(telefono):
                por_telefono[digitos_telefono(telefono)] = (numero, nombre)

        nuevos, repetidos = [], []
        vistos = set()
        for c in clientes:
            choque = por_nombre.get(clave(c["nombre"])) or (
                c["telefono"] and por_telefono.get(digitos_telefono(c["telefono"]))
            )
            if c["nombre"] in PARECEN_YA_CARGADOS:
                choque = choque or ("planilla", PARECEN_YA_CARGADOS[c["nombre"]])
            if clave(c["nombre"]) in vistos:
                choque = choque or ("planilla", "repetido dentro de la planilla")
            vistos.add(clave(c["nombre"]))
            (repetidos if choque else nuevos).append((c, choque))

        print(f"En la planilla: {len(clientes)} clientes")
        print(f"  nuevos:    {len(nuevos)}")
        print(f"  repetidos: {len(repetidos)} (no se cargan)\n")
        for c, _ in nuevos:
            linea = f"  {c['nombre']:<28} {c['telefono'] or '-':<22} {c['direccion']}"
            if c["localidad"]:
                linea += f" | {c['localidad']}"
            if c["vendedor"]:
                linea += f" | vendedor {c['vendedor']}"
            if c["notas"]:
                linea += f" | notas: {'; '.join(c['notas'])}"
            print(linea)
        if repetidos:
            print("\nYa existen (revisar a mano):")
            for c, (numero, nombre) in repetidos:
                print(f"  {c['nombre']:<28} -> C-{numero:04d} {nombre}" if numero != "planilla"
                      else f"  {c['nombre']:<28} -> {nombre}")

        if not aplicar:
            print("\nEn seco: no se escribio nada. Para cargar: --aplicar")
            return

        with con.transaction():
            for c, _ in nuevos:
                cliente_id, numero = con.execute(
                    """insert into clientes (nombre, telefono, vendedor, notas)
                       values (%s, %s, %s, %s) returning id, numero""",
                    (c["nombre"], c["telefono"], c["vendedor"], "\n".join(c["notas"])),
                ).fetchone()
                con.execute(
                    """insert into cliente_direcciones
                         (cliente_id, direccion, localidad, es_principal)
                       values (%s, %s, %s, true)""",
                    (cliente_id, c["direccion"], c["localidad"]),
                )
                print(f"  C-{numero:04d} {c['nombre']}")
        print(f"\nCargados {len(nuevos)} clientes.")


if __name__ == "__main__":
    main()
