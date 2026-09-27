# Para retomar esto en otra computadora

Última actualización: **26 de septiembre de 2026**.

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

Después hay que **agregarle a mano estas dos líneas**, que Vercel no tiene
porque el navegador no las necesita:

```
SUPABASE_DB_URL=postgresql://postgres:<clave de la base>@db.oiznxtovxlxxxoeoorii.supabase.co:5432/postgres
CLAVE_DEV=<la clave con la que entran los usuarios>
```

- La **clave de la base** está en el panel de Supabase: proyecto
  `grupo-barba-stock` → Settings → Database. Si no la tenés, ahí mismo se
  resetea (y conviene, ver *Pendientes*).
- La **clave de los usuarios** es la que se puso con `crear_usuarios.py`. Si no
  te acordás, se cambia: `python scripts/crear_usuarios.py <clave nueva>`.

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
node scripts/probar_navegador.mjs         # la app en Chrome, de punta a punta
npx tsx scripts/medir_carga.ts            # cuánto pesa y tarda cada consulta
```

La de navegador acepta una URL para probar contra producción:
`node scripts/probar_navegador.mjs https://barba-remitos.vercel.app`

> Si el servidor de desarrollo deja de responder en medio de las pruebas, no es
> el código: `next dev` se cuelga cada tantas corridas. Se mata por puerto y se
> levanta de nuevo.

## Base de datos

```bash
python scripts/migrar.py            # aplica lo que falte
python scripts/migrar.py --estado   # qué hay aplicado
```

Las migraciones están en `supabase/migrations/`, numeradas. Llevan registro en
la tabla `_migraciones`, así que se pueden correr las veces que haga falta.

**La conexión directa (`db.<ref>.supabase.co`) es IPv6 y no resuelve desde
cualquier red.** Los scripts van solos por el pooler; no hace falta hacer nada.

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

1. **Importar los datos reales.** La planilla del cliente está en `datos/`
   (fuera del repo: son datos reales). ⚠️ **El precio de esa planilla es POR
   UNIDAD**, que es como lo guarda la base: se importa sin dividir. Lo que
   estaba por bulto era la lista vieja de Tienda Nube, aunque su encabezado
   dijera "X UNIDAD". Se comprobó cruzando 177 códigos: el cociente entre las
   dos listas da exactamente 1/6 en los de caja de 6 y 1/24 en los de 24.
   Antes de importar hay que resolver: **50 códigos duplicados**, **1.264
   productos que dicen "Consultar" en vez de precio**, y que la columna bodega
   mezcla productores con rubros (ACEITES, WHISKY, GIN, APERITIVO).
2. **El dashboard miente cuando crecen los remitos.** Suma las ventas de 12
   meses sobre `db.remitos`, que viene recortado a los últimos 500 con sus
   líneas. A 10 remitos por día eso es mes y medio de historia: a partir de ahí
   los totales salen incompletos **sin avisar**. Es el mismo problema que tenía
   el stock antes de la auditoría, y se arregla igual: que sume Postgres.
   Además los 500 remitos con líneas son hoy lo más pesado de cada recarga.
3. **El combo de clientes del remito** es un `<select>` con todos adentro:
   inusable con mil. Necesita el mismo buscador que ya tienen los productos.
4. **Informes.** No están hechos y **no se los debemos**: en el alcance figuran
   en Fase 3, "no comprometida".
5. **Devoluciones**: el esquema las soporta, falta la pantalla.

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
