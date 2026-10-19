# Inventario: lo que falta cargar

Al **19-oct-2026**. Sale de las respuestas de Federico en
`datos/inventario-corregido.xlsx` (fuera de git, en la PC de la oficina). Lo que
estaba claro ya se cargó: 27 productos y 528 botellas (ver CONTINUAR.md, *Inventario
real cargado*). **Desde la carga del 14-oct no hubo ningún remito**, así que
`ajustar_stock` se puede usar con el conteo de la planilla sin pisar ventas. Si
empiezan a hacer remitos, eso deja de valer: hay que sumarle al conteo lo que
salió desde entonces.

Cómo se carga sin la clave de la base: logueado como `federico` con supabase-js
(`CLAVE_DEV_FEDERICO` en `.env.local`), `update` en `productos` y
`rpc("ajustar_stock", {..., p_tipo: "inventario_inicial"})`.

`c` = cajas, `s` = botellas sueltas. "Fila" es la fila de `INVENTARIO ACTUAL 2026.xlsx`.

## 1. Dudas para preguntarle a Federico

| Fila | Producto | Qué hay que saber |
|---|---|---|
| 489 | Pispi Blend de Tintas (W2399) | La caja es de 6, pero las 5 cajas se contaron como de 3. ¿Son 15 o 30 botellas? |
| 834 | Estuche Animal Orgánico Colección x6 (W716) | Hay 1 estuche. ¿Se carga 1 o 6? |
| 289 | Salentein Espumante Magnum (W4396) | La planilla dice caja de 4 (1c + 5s = 9) y el sistema, de 6. ¿Cuál es? |
| 869-870 | Doña Paula Selección de Bodega Malbec (W1067) | Está en dos filas, con 18 y 12. ¿Se suman (30) o vale una? |
| 135 | Trivento Golden Reserva Cab Sauvignon (7c + 3s = 45) | Confirmó W3313, pero en el sistema W3313 es el Trivento **Reserve** CS, no el Golden. |
| 136 | Trivento Golden Reserva Cab Franc (3c = 18) | Puso W3303 y "se eliminó la bodega La Salonera". En el sistema W3303 es La Salonera Patero: **hay que renombrar ese producto** (precio y caja nuevos), no solo cargarle stock. |
| 1327-1328 | Domingo Molina Hermanos Malbec (4c = 24) y Torrontés (1c = 6) | "Teníamos invertido el código": el Torrontés es W4160 y el Malbec W4164. Hoy W4160 se llama "Hermanos Malbec" y W4164 no existe: hay que renombrar W4160 y dar de alta W4164. |
| 463 | Owner Malbec Red Blend (4c = 24) | Puso W4681 y "no tengo incorporada esa bodega", pero en el sistema W4681 es el Catena **Malbec Argentino**. Le falta un código propio. |
| 1064 | Catena Malbec Argentino (6c + 4s = 40) | Puso W4686, que no existe, y "hay cajas de 6; el W654 es el que viene por 4". En el sistema el Malbec Argentino x6 es W4681. ¿Va en W4681? |

**No contestó** (quedaron como estaban; preguntar si son o no):

| Fila | Inventario | Sugerido por el sistema |
|---|---|---|
| 400 | Raquis Las Bases Malbec 2021, 1c x6 = 6 | W2919 Las Bases 2021 Malbec (en el sistema la caja es de 3) |
| 1053 | Birth of Catena, 1c + 4s = 10 | W44505 (x4). Ojo: W44506 también es Birth of Catena, x6 |
| 1270 | Casalta Clásico vidrio x400, 1c + 1s = 13 | W4186 Casalta **Reducción**, que ya tiene 13 cargadas de otra fila |
| 1002 | Chachingo Porter, 1s | W3966 Chachingo Blonde (en el sistema W3965 es Starberg) |
| 1003 | Chachingo Amber, 1s | W3966 Chachingo Blonde (en el sistema W3963 es Asahi) |

**Sin código que caen en un producto existente.** El código lo escribió Federico
(el script no sugería por debajo de 0,8 de parecido), pero algunos ya tienen stock
de otra fila. Hay que saber si se suman:

| Fila | Inventario | Producto | Ya tiene |
|---|---|---|---|
| 1352 | trivento reserva white mb, 1c | W4406 Trivento Reserve White Blend (x6) | 0 → cargar 6 |
| 1362 | Pascual Toso Cabernet, 3c | W2547 Estate Cabernet Sauvignon (x6) | 0 → cargar 18 |
| 1356 | Silvestra pinot, 2s | W453 Sylvestra Pinot Noir Rosé | 5 (¿quedaría en 7?) |
| 1371 | Las Perdices syrah viognier, 5s | W1999 Las Perdices Viognier | 3 (¿y es el mismo vino?) |
| 1389 | Brut Codorníu tradicional semi sec, 2s | W2972 María Codorníu Método Tradicional | 20 (¿y es el mismo vino?) |
| 1390 | Brut Codorníu clásico, 5s | W2974 María Codorníu Brut Nature | 8 (¿y es el mismo vino?) |
| 1307 | Casarena DNA CS 2017, 1c | W542 (x3): **sugerencia nuestra, no la tocó** | 3 |

## 2. Productos a dar de alta (66)

No existen en el sistema. Federico les asignó un código; para cada uno faltan
**precio y unidades por caja**. Lo más probable es que entren con la próxima lista
de precios. Después se les carga el stock.

**Con código de otro producto en la planilla.** El código viejo es de otro vino
del sistema: no tocar ese, crear el nuevo.

| Código nuevo | Producto | Stock |
|---|---|---|
| W4762 | Mythic Mountain Cabernet Franc | 2c x6 = 12 |
| W4763 | Chakana Uco Selección Malbec | 4c x6 = 24 |
| W4764 | Chakana Nuna White Blend orgánico | 3c x6 = 18 |
| W4765 | Chakana Nuna Malbec orgánico | 1c x6 = 6 |
| W4766 | Chakana Ayni Espumante Brut Nature | 1c x6 = 6 |
| W4767 | Black Colibrí Reserva Malbec | 2c x6 = 12 |

**Los que no estaban en el sistema:**

| Código | Producto | Stock |
|---|---|---|
| W4377 | Viña Cobos Bramare Valle de Uco Chardonnay | 5c x6 = 30 |
| W4166 | Sal de Aquí sal marina grano medio zipper 300 g | 9s |
| W4768 | Owner White Blend | 3c + 3s = 21 |
| W4769 | Owner Blend Especial caja cartón | 8c = 48 |
| W4770 | Owner Malbec caja de madera x4 | 12c x4 + 1s = 49 |
| W4185 | Gran Enemigo Gualtallary Cabernet Franc 2018 | 2s |
| W4757 | Gran Enemigo Gualtallary Cabernet Franc 2023 | 3c = 18 |
| W429 | Biplano Blend de Tintas 2019 | 2c = 12 |
| W4745 | Alamos Cabernet Franc | 4c = 24 |
| W4746 | Nicasia Rosé Blend | 6c = 36 |
| W4747 | DV Catena aceite de oliva Blend de Familia 500 ml | 2s |
| W4748 | DV Catena aceite de oliva Blend Robusto 500 ml | 6s |
| W4750 | Wapisa Malbec | 1c = 6 |
| W4758 | Salentein Espumante Blanc de Noirs | 8c = 48 |

**Los que no tenían código.** Además falta la caja, así que las cajas todavía no
se pueden pasar a botellas:

| Código | Producto | Contado |
|---|---|---|
| W4771 | Solocontigo Tinto de Otoño Malbec | 4s |
| W4772 | Nina Gold Cabernet Franc | 2c |
| W4773 | Massi Passo Doble Organic Wine | 2c |
| W4774 | Mascota Malbec | 1c |
| W4775 | Mascota Cabernet Sauvignon | 2c |
| W4776 | Chakana Nuna Syrah orgánico | 3c |
| W4777 | Volli Extra Dry | 3s |
| W4778 | Vino de la Rioja Malbec | 1s |
| W4779 | Vicentin Malbec | 1c |
| W4780 | Trumpeter Pinot | 1s |
| W4781 | Trivento Lejanamente Juntos Malbec Cab Sauvignon | 4c |
| W4782 | Trivento Golden Reserva Black Series | 4s |
| W4783 | Susana Balbo Signature Rosé Magnum | 2c |
| W4784 | San Huberto Torrontés | 5s |
| W4785 | San Felipe | 1s |
| W4786 | Rutini Espumante estuche | 2s |
| W4787 | Montchenot Extra Brut | 5s |
| W4788 | Mezcal Blanco | 1s |
| W4789 | Matafalcan Malbec | 1s |
| W4790 | Luis Correas Cabernet Sauvignon Roble | 1c |
| W4791 | Los Intocables Black Malbec | 1s |
| W4792 | Los Intocables Barrel Bourbon Malbec | 2c |
| W4793 | Lira x500 | 7s |
| W4794 | Las Acequias Cabernet Sauvignon | 4s |
| W4795 | Kaiken Indómito Cabernet Franc | 2c + 2s |
| W4796 | Kaiken Aventura Mix x3 | 2c |
| W4797 | Imagínate Malbec | 4s |
| W4798 | Imagínate Chardonnay | 4s |
| W4799 | El Equilibrista Presentador Malbec | 4c |
| W4800 | Don David Malbec | 2c |
| W4801 | Cuarimmussi Habras Malbec | 1c |
| W4802 | Condemial | 1c |
| W4803 | Chandon 1,5 L | 1s |
| W4804 | Chamiza x500 | 10s |
| W4805 | Catena Zapata 2013 | 5s |
| W4806 | Casillero del Diablo Devil's Extra Brut + 2 copas | 2s |
| W4807 | Casarena Jamilla | 1c |
| W4808 | Caelum Malbec | 1c |
| W4809 | Cabrales cápsulas Super | 1s |
| W4810 | Cabrales cápsulas Colombia | 1s |
| W4811 | Bag in box Olibox | 1s |
| W4812 | Bad Brother Torrontés Viognier | 2c |
| W4813 | Bacardi Carta Oro 750 cc | 3s |
| W4814 | Arístides Confidencial | 1c |
| W4815 | Anelis Blend | 1c + 1s |
| W4816 | Amor y Vivir Cabernet Sauvignon | 1s |

**Contestado y todavía sin cargar:** La Biblia de Judas Tomo I (fila 228, 1 caja de 3)
→ W3962. El código lo escribió Federico (el nuestro no llegaba a 0,8): cargar 3.

## 3. Sin nada que hacer

- **Negativos** (Malamado, Weinert CS, Penedo Borges Cepas Blend, Doña Paula
  Estate Pinot Noir, Barda Pinot Noir): confirmó el código pero no dio cantidades,
  así que siguen en 0.
- **Spielmann Viñedo 1910 Malbec** (fila 203, 2s): está descontinuado, no se carga.
- **Sophenia Synthesis CS** (fila 741, W1510): contado en 0.
