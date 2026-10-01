# Para retomar esto en otra computadora

Última actualización: **1 de octubre de 2026**.

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

No hay despliegue automático: **el push a GitHub no dispara nada** (la cuenta
está marcada y eso rompe la integración, aunque el `git push` sí funciona).
Se publica a mano:

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

⚠️ **`NEXT_PUBLIC_MODO_DEMO` sigue prendido en Vercel.** Ahora los datos son
reales, así que esa franja amarilla miente: hay que apagarla antes del próximo
deploy.

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

Hay dos manuales en `docs/`: `MANUAL-FEDERICO` (con el panel y lo que ve el equipo) y `MANUAL-CLAUDIA-ROXANA` (sin el panel de facturación). HTML y PDF de cada uno.

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
