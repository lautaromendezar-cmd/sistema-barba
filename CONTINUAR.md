# Para retomar esto en otra computadora

Última actualización: **13 de octubre de 2026**.

> **28-oct-2026 — v2.0 PUBLICADA (0020 aplicada):** lista oficial + oferta por
> línea, actualizar precios por Excel y costo en ingresos. Falta la oferta
> inicial y la oficial de octubre (espera a Fede). Todo en **PLAN-LISTAS-Y-COSTOS.md**.
> Las listas de Fede van en `datos/listas 28-oct/` (fuera de git: bajarlas del
> WhatsApp). Trabajar cuando ellos no cargan.

## EN USO desde el 21/22-oct-2026: mantenimiento

**El equipo ya carga todo en el sistema. No se tocan datos de producción sin
OK explícito de Lautaro.** Lautaro cobra mantenimiento ($50.000/mes).

- **Copia a mano mientras siga en el plan gratis** (que no tiene copias
  diarias): `python scripts/respaldar.py` deja todas las tablas + usuarios en
  `datos/backups/<fecha-hora>/` (fuera de git), con `RESTAURAR.txt`. Solo lee.
  Primera: 28-oct 21:00, probada restaurándola en tablas temporales (idéntica).
- **Plan pago (NO hecho al 28-oct; estaba agendado para el sáb 24-oct):** pasar el proyecto de Supabase
  `grupo-barba-stock` a la organización paga (Settings → General → Transfer
  project) para tener copias de seguridad diarias y que no se pause, y el
  proyecto `barba-remitos` de Vercel a Pro si está en Hobby (uso comercial).
  Después, confirmar en Database → Backups que hay copias.
- **Revisión semanal automática:** el cron de Vercel (`vercel.json`) llama a
  `/api/revision-semanal` los **sábados 9:00** (12:00 UTC), cuando no trabajan,
  y el resultado le llega por mail a Lautaro (Resend). Variables en Vercel,
  solo Production: `CRON_SECRET`, `REVISION_CLAVE` (= la clave de federico:
  **si se le cambia, actualizarla**), `REVISION_MAIL`, `RESEND_API_KEY`.
  La lógica está en `lib/revision.ts`. A mano, la misma revisión:

  ```bash
  npx tsx scripts/revisar_datos.ts          # o --dias 30
  ```

  Solo lee. Los chequeos duros (remitos, anulaciones e ingresos cuadran con
  los movimientos de stock) tienen que dar OK; si alguno da ⚠ es un problema
  de la base y se mira antes de tocar nada. Los blandos (negativos, ingresos
  vacíos, borradores viejos, pendientes de más de 7 días, saltos de numeración,
  ajustes manuales) son para preguntarle al equipo. Primera corrida, 22-oct:
  base coherente; 6 ingresos vacíos del bug de abajo, sin anular.
- **22-oct, primer día:** ingresos sin Nº fallaban (0018), se agregó Anular
  ingreso (0019) y la columna Sueltas (v1.7). En esta PC las migraciones las
  pega Lautaro en el SQL Editor (no hay `SUPABASE_DB_URL`); la prueba de 0019
  fue un `do $$ … raise exception` que deshace todo.

## Lo primero, siempre

```bash
git pull
npm install
```

**Las dos PC commitean a este repo.** Si arrancás a trabajar sin hacer `git pull`
vas a tener que resolver conflictos después.

## Lo único que no está en el repo: `.env.local`

Tiene las credenciales, así que no se commitea nunca. Sin él, ni la app ni los
scripts arrancan. Se arma así:

```bash
# Las dos primeras las baja Vercel solo:
npx vercel link --yes
npx vercel env pull .env.local
```

Después hay que **agregarle a mano estas líneas**, que Vercel no tiene porque
el navegador no las necesita:

```
SUPABASE_DB_URL=postgresql://postgres:<clave de la base>@db.oiznxtovxlxxxoeoorii.supabase.co:5432/postgres
CLAVE_DEV_FEDERICO=<la clave de federico>
CLAVE_DEV_CLAUDIA=<la clave de claudia>
CLAVE_DEV_ROXANA=<la clave de roxana>
```

- La **clave de la base** está en el panel de Supabase: proyecto
  `grupo-barba-stock` → Settings → Database. Si no la tenés, ahí mismo se
  resetea (y conviene, ver *Pendientes*).
- **Cada cuenta tiene su propia clave, no una compartida entre las tres.** Si
  no las tenés a mano, se generan de nuevo con `python scripts/crear_usuarios.py`
  (que las imprime una sola vez) o se le fija una puntual poniendo su
  `CLAVE_DEV_<USUARIO>` en `.env.local` antes de correrlo.

Para los scripts de Python hace falta, una sola vez:

```bash
python -m pip install "psycopg[binary]"
```

## Levantarlo

```bash
npm run dev        # http://localhost:3000
```

Se entra con **nombre de usuario**, no con mail: `federico`, `claudia` o
`roxana`.

**Federico es administrador y las dos empleadas no** (migración 0006). La
diferencia es la pantalla de inicio: él ve el panel con la facturación, el
stock valorizado y las ventas del año; ellas ven una pantalla operativa con lo
que falta entregar, lo que hay que reponer y los últimos remitos. Todo lo demás
lo hacen igual. **Los nombres Claudia y Roxana salieron de lo que contestó
Federico en la reunión, pero no están confirmados por escrito:** si están mal se
renombran con `python scripts/crear_usuarios.py`.

⚠️ **Eso es una cortina, no una pared.** El panel se calcula con los remitos y
el stock, que las empleadas necesitan para trabajar, así que siguen llegando al
navegador: quien sepa abrir la consola puede volver a sumarlos. Para que fuera
una pared habría que recortarles el historial de remitos a una ventana de
tiempo, y eso les cambia el trabajo. Sin decidir.

## Publicar

**El push a `main` publica solo** (desde el 30-sep, cuando se recuperó la
cuenta de GitHub). Si algún día deja de hacerlo, se publica a mano:

```bash
npx vercel deploy --prod --yes
```

En vivo: **https://barba-remitos.vercel.app**

## Comprobar que no se rompió nada

```bash
python scripts/probar_operaciones.py      # la lógica de stock, contra Postgres
npx tsx scripts/probar_app.ts             # integración con sesión real
npx tsx scripts/probar_seguridad.ts       # ataca el sistema desde afuera
python scripts/probar_intruso_con_cuenta.py   # cuenta sin perfil: no ve nada
npx tsx scripts/probar_avisos_en_vivo.ts  # lo que hace una PC le llega a las otras
node scripts/probar_navegador.mjs         # la app en Chrome, pantalla por pantalla
node scripts/probar_recorrido.mjs         # un día de uso completo, con datos reales
npx tsx scripts/medir_carga.ts            # cuánto pesa y tarda cada consulta
```

La de navegador acepta una URL para probar contra producción:
`node scripts/probar_navegador.mjs https://barba-remitos.vercel.app`

> Si el servidor de desarrollo deja de responder en medio de las pruebas, no es
> el código: `next dev` se cuelga cada tantas corridas. Se mata por puerto y se
> levanta de nuevo.

`probar_recorrido.mjs` emite, recibe, ajusta y anula de verdad, y **deja la base
como la encontró** (borra el movimiento y vuelve el producto de prueba a «a
consultar»). Igual, después de correr las pruebas conviene `datos_ejemplo.py
--limpiar` para que la numeración arranque en R-0001.

## Base de datos

```bash
python scripts/migrar.py            # aplica lo que falte
python scripts/migrar.py --estado   # qué hay aplicado
```

Las migraciones están en `supabase/migrations/`, numeradas. Llevan registro en
la tabla `_migraciones`, así que se pueden correr las veces que haga falta.

**La conexión directa (`db.<ref>.supabase.co`) es IPv6 y no resuelve desde
cualquier red.** Los scripts van solos por el pooler; no hace falta hacer nada.

## Los datos reales ya están cargados

**26 de septiembre de 2026: la base tiene el catálogo real**, no los datos de
ejemplo. 4.323 productos, 587 clientes con 599 direcciones y 30 proveedores,
importados de la planilla que mandó Federico por WhatsApp.

```bash
python scripts/importar_planilla.py            # en seco: informe, no toca nada
python scripts/importar_planilla.py --aplicar  # carga (pide la base sin remitos)
```

Lo que hay que saber de esa importación:

- **El precio de la planilla es POR UNIDAD y se guardó tal cual.** Confirmado
  por dos cruces independientes: contra la lista de Tienda Nube (5-ago) da 1/6
  en los de caja de 6 y 1/24 en los de 24, o sea que **esa** era la que estaba
  por bulto; y contra la oferta de junio da ~1,06 parejo en todas las
  presentaciones, o sea misma base y solo aumento de precio.
- **1.239 productos dicen "Consultar"**: entraron con precio 0 y marcados
  (`precio_a_consultar`). La base no deja emitir un remito con ellos en cero
  (migración 0007) y en pantalla sale el cartel «a consultar». Cuando alguien
  les escribe un precio, la marca se cae sola.
- **50 códigos apuntaban a dos productos distintos cada uno** (121 filas). No
  entró ninguno: quedaron en `datos/conflictos-codigos.csv` para que Federico
  diga cuál es cuál. Si entraran, uno pisaría al otro y se emitirían remitos de
  una bodega con el precio de otra.
- **La sección no viene en la planilla.** La deduje de la columna bodega cuando
  ahí hay un rubro (ACEITES, WHISKY, GIN...) y el resto quedó como «Vinos». Es
  una decisión mía y se cambia en masa con un update.
- Un nombre de cliente repetido se tomó como **una persona con varias
  direcciones de entrega**, no como dos clientes. Varios de los repetidos son
  el mismo domicilio escrito distinto («CRAMER 1266» y «CREAMER 1266»).

`NEXT_PUBLIC_MODO_DEMO` (la franja amarilla de «datos de ejemplo») se sacó de
Vercel el 13-oct: los datos ya son reales.

## Proveedores con razón social y CUIT (1-oct-2026)

La primera lista de proveedores (26-sep) era la de los que **no** facturan, con
el nombre como los llaman. El 1-oct llegó la de los que facturan:
`datos/listado de proveedores.xlsx` (fuera de git), 25 proveedores, 20 con
CUIT. Se cargó con `python scripts/importar_proveedores.py --aplicar` (en seco
sin el flag; se puede volver a correr sin duplicar).

Migración 0015: columnas `razon_social` y `cuit`. La base no deja guardar un
CUIT con el dígito verificador mal ni dos proveedores con el mismo. Dos ya
existían y se completaron (ARTELLPIATELLI = ARTEL INC PIATELLI, ROSELL BOHER);
a LEY SECA y ROLLAND se les sacó el CUIT que tenían pegado al nombre. Los 23
nuevos quedaron con la razón social como nombre: se pueden renombrar a como
los llamen sin perder la razón social. Quedan 54 proveedores, 22 con CUIT.

## Varias PC a la vez: avisos en vivo (1-oct-2026)

Antes cada PC mostraba lo que había al entrar: un remito emitido en una no
aparecía en las otras hasta refrescar. Ahora la app se suscribe a Supabase
Realtime (migración 0014) y, cuando otra PC cambia remitos, ingresos, stock,
clientes, productos o proveedores, recarga esa parte sola (~1 s). El aviso no
se usa como dato, solo como «volvé a pedir esto». Si la conexión se cortó, al
reconectar o al volver a la pestaña después de 30 s se trae todo.

Realtime respeta las políticas de lectura: alguien sin cuenta no recibe nada
(lo prueba `probar_avisos_en_vivo.ts`). Ojo: después de suscribirse, el
servidor tarda unos segundos en empezar a mandar avisos.

## Clientes: número, apodo y razón social (1-oct-2026)

Migración 0013. Cada cliente tiene un **número** (C-0001…) que pone la base y
no se puede cambiar: si alguien pisa el nombre, por el número se sabe quién
era. La columna `nombre` sigue llamándose así pero en pantalla es el
**apodo** (como Federico lo tiene agendado); `razon_social` es nueva y
opcional, y si está es lo que sale impreso en el remito.

**El remito guarda una copia del cliente al emitirse** (`remitos.cliente_datos`,
la llena un trigger en el paso borrador → emitido y después no se puede tocar).
Antes el remito leía la ficha cada vez: editar un cliente cambiaba todos sus
remitos viejos, también al reimprimirlos.

**9-oct: cada alta gastaba dos números** (default de la columna + trigger,
cada uno con su `nextval`). La 0016 sacó el default. Los 24 clientes cargados
ese día se renumeraron a C-0592…C-0615. **Ojo: `probar_operaciones.py` crea
un cliente adentro de su rollback y la secuencia NO vuelve atrás**: después de
correrlo, el próximo cliente real salta uno. Si molesta,
`select setval('clientes_numero_seq', (select max(numero) from clientes))`.

**Clientes nuevos sueltos** (no la planilla grande): `scripts/importar_clientes_nuevos.py`,
en seco por defecto, solo agrega, salta los que chocan por nombre o teléfono.
`importar_planilla.py` NO sirve para esto: borra todos los clientes.
Del lote del 9-oct quedaron afuera **ANDRES CIAMPO** (¿= C-0069 ANDRES CAMPO,
misma dirección?) y **GASTON MUGELLO MOTOS** (¿= C-0222 GASTON BARZOLA, Fleming
2279?): esperan que Federico confirme.

Hay dos manuales en `docs/`: `MANUAL-FEDERICO` (con el panel y lo que ve el equipo) y `MANUAL-CLAUDIA-ROXANA` (sin el panel de facturación). HTML y PDF de cada uno.

## Versión y novedades (13-oct-2026)

El número de versión se ve en el login y al pie del menú (`v1.3`); al
tocarlo se abre «Novedades del sistema», escrito para el equipo. Todo sale de
`lib/version.ts`: **al publicar algo que se note, agregar una entrada arriba
con el número siguiente.** Si hubo una versión nueva desde la última vez que esa
PC miró las novedades, el número lleva un cartelito «nuevo». Pasando el mouse
por el número se ve el commit publicado (lo pone Vercel; ver `next.config.ts`).
La 1.4 es la línea libre (0017).

## Pedidos del 13-oct-2026

Lista que pasó Federico. Estado de cada uno:

1. **Que las PC se actualicen solas**: ya estaba (avisos en vivo, 1-oct).
2. **Configurar las copias del remito**: en suspenso, no está claro qué
   quieren (¿cuántas hojas? ¿original/duplicado? ¿una sin precios?).
3. **Corregir un remito**: botón *Corregir* en Remitos. Abre Nuevo remito con
   todo cargado (`/remitos/nuevo?corrige=<id>`); al emitir, sale uno nuevo
   con «Reemplaza al remito R-xxxx.» en observaciones y el original se anula
   con motivo «Corregido por R-yyyy». El emitido nunca se edita (0010/0011
   siguen igual): si se abandona la corrección, el original queda vigente.
4. **33891 ROLLAND guardado como ANDESMAR**: no era un error del sistema.
   Roxana escribió ANDESMAR en el campo libre «Bodega / proveedor». Ahora el
   proveedor se elige de la lista, se completa solo con el proveedor del
   primer producto, avisa si un producto es de otro y los ingresos se pueden
   corregir (solo proveedor y nº, las cantidades no). El 33891 ya se corrigió
   a ROLLAND en la base.
   De paso apareció un bug real en el buscador de productos: con el código
   exacto + Enter agregaba **otro** producto en 185 códigos (W243 agregaba
   W2435, porque iba el primero por nombre que *contenía* «W243»). Ahora el
   código exacto va primero.
5. **Remitos entre dos fechas**: atajos (Hoy, Ayer, 7 días, Este mes) y
   desde/hasta en Remitos, con resumen (remitos, clientes, bultos, con
   pendientes, anulados, total), columnas de bultos y entrega, e *Imprimir
   listado*. Con fechas, la consulta va a la base (no al límite de 500).
6. **Producto fuera de lista** (botella especial para un solo cliente): línea
   libre en el remito con descripción, unidades y precio; sale impresa y suma
   al total, no toca stock. Migración 0017 (producto_id opcional en
   remito_lineas), **aplicada y publicada el 13-oct como v1.4**.

**Ojo con los datos de prueba en producción:** quedan 4 ingresos «ABRAS
PRUEBA-1» de las pruebas automáticas (`probar_recorrido.mjs` borra el
movimiento pero no la cabecera) y se ven en Ingresos anteriores. Los remitos
R-0003…R-0010 están todos anulados.

## Inventario real cargado (14-oct-2026)

Federico mandó `datos/INVENTARIO ACTUAL 2026.xlsx` (fuera de git). Antes de
cargarlo se borró todo el movimiento de prueba (`datos_ejemplo.py --limpiar`;
backup en `datos/backups/movimiento-antes-del-inventario-2026-10-14.json`), así
que **la base arranca limpia: 0 remitos, el próximo es R-0001.**

`python scripts/importar_inventario.py --aplicar` cargó **788 productos, 24.276
unidades**, como movimientos `inventario_inicial`. Solo entró lo que cierra con
el sistema: código, nombre y unidades por caja. **Ojo: el código de esa
planilla sale de un VLOOKUP contra la lista de febrero 2024, y hay códigos que
hoy son de otro vino** (W3302 es Trivento Golden en el inventario y La Salonera
en el sistema).

Lo que no entró está en `datos/inventario-para-revisar.xlsx`, una hoja por
motivo, para que Federico complete la columna amarilla: 54 sin código, 24 con
código de otro producto, 20 que no existen en el sistema, 17 con unidades por
caja distintas, 5 negativos (quedaron en 0), 2 códigos repetidos y 2 sin total.
Cuando vuelva, esos se cargan con `ajustar_stock(..., 'inventario_inicial')`.

**`datos_ejemplo.py --limpiar` ya no es inofensivo:** borra el inventario.

### Respuestas de Federico, primera tanda (19-oct-2026)

Federico devolvió la planilla completada (`datos/inventario-corregido.xlsx`,
fuera de git; en la PC de la oficina). Se cargó lo que quedó claro: **27
productos, 528 botellas** como `inventario_inicial`, y se pasaron a caja x6
W1106 y W1107 (Durigutti Clásico Malbec y Cab Franc, el reclamo que lo
destrabó), W948, W2398 y W1967. Se hizo logueado como federico
(`ajustar_stock` por la API), sin la clave de la base.

**Lo que falta, producto por producto, está en
[PENDIENTES-INVENTARIO.md](PENDIENTES-INVENTARIO.md):** dudas para Federico,
66 productos para dar de alta (faltan precio y caja) y lo que no hay que hacer.

## Datos de ejemplo

Lo que hoy se ve en el sistema **es inventado**: un año de movimiento para poder
mostrarlo.

```bash
python scripts/datos_ejemplo.py             # carga
python scripts/datos_ejemplo.py --limpiar   # borra TODO el movimiento
```

⚠️ **Antes de cargar los datos reales hay que correr `--limpiar`**, o el primer
remito de verdad va a salir con un número que ya se usó. Productos, clientes y
proveedores no se tocan.

## Dónde está cada cosa

```
app/                      las pantallas
lib/store.tsx             TODO lo que habla con Supabase pasa por acá
lib/types.ts              la forma de los datos
supabase/migrations/      el esquema, en orden
scripts/                  mantenimiento y pruebas
docs/ALCANCE.md           lo acordado con el cliente
docs/CUESTIONARIO-REUNION.md  las 40 preguntas
```

## Estado

**Anda:** login con perfiles, remitos (armado, impresión, anulación), stock por
movimientos, ingresos de mercadería, ajustes, ABM de clientes con varias
direcciones, ABM de proveedores, edición de productos, buscador global y
dashboard.

**26-sep: la carga de datos dejó de traerse todo.** Cada operación recarga
solo lo que tocó (emitir un remito pide remitos y stock, no los 4.400
productos), el stock viene filtrado a los productos que se movieron y el
historial de un producto se consulta a la base al abrirlo en vez de salir de
los últimos 5.000 movimientos. Medido con `npx tsx scripts/medir_carga.ts`:
proyectado al catálogo real, **2.888 KB por operación pasaron a 94 KB**.

**Falta:**

1. **El dashboard miente cuando crecen los remitos.** Suma las ventas de 12
   meses sobre `db.remitos`, que viene recortado a los últimos 500 con sus
   líneas. A 10 remitos por día eso es mes y medio de historia: a partir de ahí
   los totales salen incompletos **sin avisar**. Es el mismo problema que tenía
   el stock antes de la auditoría, y se arregla igual: que sume Postgres.
2. **El combo de clientes del remito** es un `<select>` con todos adentro:
   inusable con mil. Necesita el mismo buscador que ya tienen los productos.
3. **Informes.** No están hechos y **no se los debemos**: en el alcance figuran
   en Fase 3, "no comprometida".
4. **Devoluciones**: el esquema las soporta, falta la pantalla.

## Pendientes que no son de código

- **Rotar la clave de la base** (viajó por un chat) y ponerles claves largas a
  los tres usuarios: el login acepta muchos intentos seguidos y eso se sube en
  el panel, Auth → Rate limits.
- **Avisarle a Federico que Supabase son USD 25/mes**, no los ~10 que dice el
  PDF de alcance que ya tiene.
- **La base de producción va en São Paulo.** La de hoy quedó en Oregon: sirve
  para desarrollo, pero la región no se puede cambiar después.
- Preguntarle si el precio de la lista lleva **IVA** incluido. Es lo único del
  cuestionario que quedó sin responder.
- Pedirle los tres archivos: el Excel de precios nuevo, la planilla de 5.000
  artículos y la lista de clientes.
