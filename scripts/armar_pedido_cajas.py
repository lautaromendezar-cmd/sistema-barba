"""Arma el último pedido a Federico: la caja de los 46 productos nuevos que
volvieron sin ella, y tres decisiones nuestras para que confirme.

    python scripts/armar_pedido_cajas.py

Lee  datos/Grupo Barba - lo que falta del inventario CORREGIDO 17hs.xlsx
Deja datos/Grupo Barba - ultimo pedido (cajas).xlsx
"""
import sys
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill

sys.stdout.reconfigure(encoding="utf-8")
DATOS = Path(__file__).resolve().parent.parent / "datos"
ORIGEN = DATOS / "Grupo Barba - lo que falta del inventario CORREGIDO 17hs.xlsx"
DESTINO = DATOS / "Grupo Barba - ultimo pedido (cajas).xlsx"

amar = PatternFill("solid", fgColor="FFF2CC")
neg = Font(bold=True)
wrap = Alignment(wrap_text=True, vertical="top")

# Los que volvieron con la caja en blanco.
sin_caja = []
for fila in openpyxl.load_workbook(ORIGEN, data_only=True)["Productos nuevos"].iter_rows(min_row=4, values_only=True):
    codigo, producto, cajas, sueltas, caja, suelto, _ = fila
    if codigo and str(codigo).startswith("W") and caja is None:
        sin_caja.append((codigo, producto, cajas, sueltas, suelto))

wb = openpyxl.Workbook()

ws = wb.active
ws.title = "Leeme"
for linea, estilo in [
    ("Sistema Grupo Barba: último pedido del inventario", Font(bold=True, size=14)),
    ("Actualizado al 20 de octubre de 2026", Font(italic=True)),
    ("", None),
    ("YA CARGAMOS", neg),
    ("•  Las 18 preguntas, con lo que contestaron.", None),
    ("•  23 productos nuevos con su stock (los 21 con caja, más el Owner Malbec Red Blend W4817 y el Casalta Clásico W4177). Entraron con precio «a consultar»: se lo ponen ustedes desde Productos → Editar.", None),
    ("", None),
    ("LO ÚLTIMO QUE FALTA", neg),
    (f"•  Hoja «Cajas»: {len(sin_caja)} productos donde falta cuántas botellas trae la caja. Sin ese número no podemos pasar las cajas a botellas, así que todavía no están en el sistema.", None),
    ("•  Hoja «Confirmar»: 3 cosas que resolvimos nosotros. Si está bien, no hace falta escribir nada.", None),
    ("", None),
    ("Si alguno no lo saben, déjenlo en blanco y lo cargamos cuando tengan el dato.", Font(italic=True)),
]:
    ws.append([linea])
    if estilo:
        ws.cell(ws.max_row, 1).font = estilo
    ws.cell(ws.max_row, 1).alignment = Alignment(wrap_text=True)
ws.column_dimensions["A"].width = 110

ws2 = wb.create_sheet("Cajas")
ws2.append([f"{len(sin_caja)} productos: completá la columna amarilla"])
ws2["A1"].font = Font(bold=True, size=12)
ws2.append([])
ws2.append(["Código", "Producto", "Cajas contadas", "Sueltas contadas", "BOTELLAS POR CAJA", "¿Se vende suelto?"])
for c in ws2[3]:
    c.font = neg
ws2["E3"].fill = amar
for codigo, producto, cajas, sueltas, suelto in sin_caja:
    ws2.append([codigo, producto, cajas, sueltas, None, suelto])
    ws2.cell(ws2.max_row, 5).fill = amar
for col, w in zip("ABCDEF", [9, 52, 14, 15, 20, 17]):
    ws2.column_dimensions[col].width = w
ws2.freeze_panes = "A4"

ws3 = wb.create_sheet("Confirmar")
ws3.append(["3 cosas que resolvimos nosotros: si está mal, escribí la corrección en la columna amarilla"])
ws3["A1"].font = Font(bold=True, size=12)
ws3.append([])
ws3.append(["#", "Producto", "Qué hicimos", "CORRECCIÓN (si hace falta)"])
for c in ws3[3]:
    c.font = neg
ws3["D3"].fill = amar
for fila in [
    (1, "Catena Malbec Argentino (40 botellas)",
     "Pusieron W4686, pero ese código no existe en el sistema. Lo cargamos en W4681, que es el Malbec Argentino de caja x6. ¿Está bien, o el código correcto es otro?"),
    (2, "Casalta Clásico vidrio x400 (W4177)",
     "El W4177 no existía, así que lo creamos con caja de 12, como el resto de Casalta (13 unidades). ¿La caja es de 12?"),
    (3, "Domingo Molina Hermanos Torrontés (W4160)",
     "Le cambiamos el nombre, pero quedó con el precio que la lista tenía para el «Hermanos Malbec» ($14.637). ¿Ese precio es el del Torrontés?"),
]:
    ws3.append(list(fila) + [None])
    for c in ws3[ws3.max_row]:
        c.alignment = wrap
    ws3.cell(ws3.max_row, 4).fill = amar
for col, w in zip("ABCD", [4, 40, 80, 32]):
    ws3.column_dimensions[col].width = w

wb.save(DESTINO)
print(f"{DESTINO.name}: {len(sin_caja)} sin caja")
