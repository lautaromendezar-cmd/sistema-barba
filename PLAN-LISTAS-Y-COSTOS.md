# Plan: lista oficial + oferta, actualizar precios por Excel, costo de compra

Pedido de Federico por audio el 28-oct-2026 (3 puntos) y respuestas a 3 preguntas
el mismo día. Las listas que mandó están en `datos/listas 28-oct/` (fuera de git:
si se sigue en otra PC, pedírselas a Lautaro, están en el WhatsApp).

## Lo que pidió (con sus respuestas)

1. **Dos listas: oficial y oferta.** Ej.: un vino a $12.000 en la oficial y
   $10.980 en la oferta. La oferta son las cosas que compran por volumen; lo de
   nicho (ej. un gran corte de $150.000) queda solo en la oficial.
   **La lista se elige POR LÍNEA, no por remito:** «a un cliente le vendí 10
   cajas, 5 pueden ir a oficial y 5 a oferta».
2. **Actualizar precios.** El lunes 2/11 llega la oficial con cambios en
   algunas cosas; la oferta probablemente no cambia. La primera carga la hacemos
   nosotros, después la hacen ellos.
3. **A cuánto entró cada cosa.** Es lo que le pagan AL PROVEEDOR, y alcanza con
   ver cuántas cajas entraron a cada precio. Para qué: «tenerlo real adelante
   para negociar hasta dónde puedo llegar»; hoy lo busca en papeles o en el
   celular. O sea: el costo tiene que estar a la vista cuando vende.

## Lo que encontré en los archivos (28-oct, solo lectura contra prod)

- La base tiene 4.350 productos, todos con código W.
- **Lista oficial octubre** (`Lista GRUPO BARBA OCTUBRE 2026.xlsx`): hojas LISTA,
  IMPORTADOS Y WHISKY'S y PASTAS-ACEITES-ACETO con columnas CODIGO (B),
  BODEGA (C), Producto (D), U (E), Presentación (F), Precio unitario (G),
  Precio Sugerido (H, se ignora). Las hojas de chocolates, cristalería y cavas
  tienen otro formato: quedan afuera, como hoy.
  - 2.523 renglones con código y precio; 2.508 de esos códigos existen en el sistema.
  - **655 renglones con precio NO traen código**, pero 584 se encuentran por
    bodega + producto (el sistema les generó código en la carga inicial). Quedan 74 sin encontrar.
  - **El precio del sistema ES la oficial**: 1.817 iguales a octubre. 691 son
    distintos, con una mediana de +6 %: el sistema tiene precios de un mes anterior.
    ⚠️ Hoy están remitando con precios viejos en esos 691.
  - Hay saltos raros (W011 de $51.967 a $103.935, cocientes de 0,02 a 14): la
    vista previa los tiene que marcar aparte.
- **Oferta** (`Oferta GRUPO BARBA (Valida hasta 18 de Octubre).xlsx`): una hoja,
  columnas BODEGA, Producto, U, Presentación, «precio en efectivo X UNIDAD».
  **Sin códigos.** 553 renglones con precio; 102 agrupados («TODAS LAS
  CEPAS», «MALBEC / CH»), que en el sistema son varios productos cada uno.
- Los dos precios son POR UNIDAD, igual que el sistema.

## Cómo se hace

### Base: migración 0020
- `productos.precio_oferta numeric(12,2)` NULL = no está en oferta.
- `remito_lineas.lista text not null default 'oficial'` con check
  `('oficial','oferta')`. Las líneas libres quedan en 'oficial'. El precio sigue
  congelado en `precio_unitario`; la lista es solo un dato para saber de dónde salió.
- `ingreso_lineas.costo_unitario numeric(12,2)` NULL (POR UNIDAD, como todo).
  En pantalla se carga por caja y se divide por `unidades_por_bulto`.
- `precios_historial.lista text not null default 'oficial'`; el origen pasa a
  ser 'excel' o 'manual'. La tabla ya existe pero hoy nadie la escribe.
- Una función `aplicar_precios(jsonb)` que en una sola transacción pisa los
  precios y escribe el historial. Si un precio > 0 llega a un producto marcado
  «a consultar», el trigger de 0007 le saca la marca solo.
- Ajustar la vista o el store de ingresos para leer y escribir el costo, y
  permitir completarlo después con Corregir (el remito del proveedor a veces no trae precio).
- Como siempre en esta PC: archivo con insert en `_migraciones`, lo pega
  Lautaro en el SQL Editor y se prueba con DO + raise exception (rollback).

### Pantalla «Actualizar precios» (desde Productos)
Todo se lee en el navegador con SheetJS (`xlsx`), sin subir el archivo a ningún lado.
- **Lista oficial: suben el Excel TAL CUAL les llega.** Se buscan las hojas con
  el encabezado CODIGO / Precio unitario. Cruce por código y, si el renglón no
  trae código, por bodega + producto normalizados (mayúsculas, espacios).
  «Consultar» no pisa el precio que haya: se informa.
- **Oferta: no trae código**, así que va por plantilla del sistema.
  «Descargar planilla de oferta» baja Código | Bodega | Producto | Caja |
  Precio oficial | Precio oferta, con lo que hay hoy. Le cambian la última
  columna (vacía = sale de la oferta) y la suben.
- **Vista previa antes de guardar:** cuántos suben, cuántos bajan, cuántos
  quedan igual y cuáles no se encontraron (lista para copiar). Los saltos de
  más del 50 % se muestran aparte y hay que tildarlos para que entren. Botón
  «Aplicar» → `aplicar_precios`.

### Primera carga (la hacemos nosotros)
- **Oferta:** script `scripts/armar_oferta_inicial.py`. Cruza los 553 renglones
  contra productos por bodega + nombre, expande los agrupados («TODAS LAS
  CEPAS» = todos los de esa línea y bodega, «A / B» = cada uno) y arma la
  planilla del sistema con el precio de oferta completo. Los dudosos quedan en
  una pestaña aparte y NO entran: Lautaro los mira; lo que no cierre queda sin
  oferta y en el remito se puede pisar el precio a mano, como hoy. Se sube por
  la misma pantalla (sirve de prueba).
- **Oficial:** NO la cargamos nosotros. El lunes 2/11 llega la nueva y la suben
  ellos por la pantalla: es «la próxima, ellos». Si se quiere corregir ya el +6 %
  de los 691, se puede subir la de octubre antes; decidirlo con Lautaro.

### Nuevo remito
- En cada línea, un selector **Oficial / Oferta** (Oferta deshabilitada si el
  producto no tiene `precio_oferta`). Al cambiarlo se pone ese precio; si
  después lo pisan a mano, queda el aviso «lista $X» que ya existe.
- El mismo producto puede ir en dos líneas, una por lista (el caso de las 5 + 5).
  Verificar que hoy no esté bloqueado el producto repetido.
- En la misma línea, en gris y SOLO EN PANTALLA: «costo $X (fecha)», el último
  costo de compra. Es lo que pidió para negociar. **Nunca en RemitoDoc**: el
  papel lo ve el cliente.

### Costos (punto 3)
- Nuevo ingreso y Corregir: columna «Costo x caja» por línea, opcional.
- Ficha del producto: tabla «Compras» agrupada por costo → «10 cajas a $70.000 /
  5 cajas a $120.000», con primera y última fecha y proveedor.
- Productos: columnas Oficial, Oferta y Último costo, más el filtro «en oferta».
- Los ingresos anteriores (desde el 21/10) quedan sin costo; se pueden
  completar con Corregir si quieren.

### Versión
v2.0 en `lib/version.ts` con novedades en castellano simple: «Ahora hay dos
listas…», «Actualizar precios desde Excel», «Costo en los ingresos».

## Decisiones de Lautaro (28-oct, a la noche)
- **Claudia y Roxana SÍ ven el costo**: ellas cargan el stock, Fede no. Así
  que el costo se ve igual para los tres (columna, ficha y aviso en el remito).
  Nunca en el papel.
- **Todos pueden actualizar precios.** Queda en `precios_historial` quién lo
  hizo (trigger de 0020, también para las ediciones a mano).
- **La oficial de octubre NO se sube todavía**: se le preguntó a Fede y no
  contestó. Ojo que mientras tanto siguen remitando con precios viejos en ~691.

## Orden de trabajo

**Estado al 28-oct, 21 h (MSI):** pasos 1, 2, 3, 4 y 6 hechos en código, sin
publicar y **sin aplicar la 0020**. Falta el 5 (necesita las listas) y el 7.
La 0020 se probó contra producción dentro de una transacción con rollback
(15 pruebas en verde). `scripts/probar_listas.ts` prueba la lectura de Excel
con un libro armado como el de Fede (21 pruebas); con un archivo real como
argumento da el resumen contra el catálogo de producción, solo leyendo.
**Orden para publicar: primero aplicar la 0020 (es aditiva, la app vieja
sigue andando con ella), después el push.** Al revés, emitir un remito falla
(la app manda la columna `lista`) y la carga se cae (lee la vista `ultimo_costo`).

1. 0020 + prueba DO/rollback → Lautaro la pega.
2. Store/tipos + Nuevo remito (lista por línea + costo en pantalla).
3. Ingresos con costo + Corregir.
4. Pantalla Actualizar precios (oficial tal cual + plantilla de oferta).
5. Script de oferta inicial → Lautaro revisa los dudosos → se sube.
6. Ficha de compras + columnas en Productos.
7. v2.0, `npm run build`, probar_app, push **por la tarde** (a la mañana
   cargan a full) y verificar en los chunks servidos.
