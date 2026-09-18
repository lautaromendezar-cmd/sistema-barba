# Sistema de Remitos y Stock — Grupo Barba

Sistema interno para reemplazar los remitos escritos a mano. **El remito es el
corazón: el stock se descuenta como consecuencia de emitirlo, no como una tarea
aparte.**

Un sistema de stock puro le agrega trabajo a todo el mundo y se abandona a los
tres meses — ya les pasó con la planilla que hoy miran. Si alguien invierte ese
orden, el proyecto se muere.

## Cómo correrlo

```bash
npm install
npm run dev
```

Hace falta un `.env.local` con:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_DB_URL=postgresql://postgres:<clave>@db.<ref>.supabase.co:5432/postgres
```

`SUPABASE_DB_URL` sólo la usan los scripts de mantenimiento; al navegador nunca
llega. La conexión directa es IPv6 y no resuelve desde cualquier red: los
scripts van solos por el pooler.

Se entra con nombre de usuario (`federico`, `claudia`, `roxana`), no con mail.
Supabase Auth exige un email, así que la pantalla de login arma uno interno
(`claudia@barba.local`) que no existe ni recibe correo.

## Scripts

| Comando | Qué hace |
|---|---|
| `python scripts/migrar.py` | Aplica las migraciones que falten. Lleva registro: se puede correr las veces que haga falta |
| `python scripts/migrar.py --estado` | Muestra qué migraciones están aplicadas |
| `python scripts/crear_usuarios.py [clave]` | Crea las cuentas o les cambia la clave |
| `npx tsx scripts/cargar_seed.ts` | Carga productos y clientes de ejemplo |

## Pruebas

```bash
python scripts/probar_operaciones.py   # la lógica de stock, contra Postgres
npx tsx scripts/probar_app.ts          # integración con sesión real y RLS
node scripts/probar_navegador.mjs      # la app en Chrome, de punta a punta
```

La primera corre dentro de una transacción que se revierte: no ensucia la base.
La tercera emite un remito de verdad desde la pantalla y deja capturas en
`scripts/capturas/`.

## Reglas de negocio

- **El stock es la suma de los movimientos.** No hay una columna `stock` que se
  pise: por eso el ajuste manual es un movimiento más y todo queda auditable.
- **El remito nace borrador**: se arma antes de ir a juntar el pedido. No
  consume número ni descuenta nada hasta que se emite.
- **Solo lo entregado descuenta.** Una línea pendiente alimenta la pantalla de
  "falta pedirle al proveedor".
- **El stock negativo no bloquea la venta**, se muestra en rojo. Bloquear es la
  forma más rápida de que vuelvan al papel.
- **Los remitos se anulan, no se borran**, y la anulación devuelve el stock.
- **El precio se guarda siempre por unidad.** La carga y la visualización van en
  bultos, y las unidades por bulto quedan congeladas en cada línea igual que el
  precio.
- **Emitir y anular viven en la base**, no en la app: son dos cosas que tienen
  que pasar juntas o no pasar.

## Estructura

```
app/                      pantallas
components/               UI compartida
lib/store.tsx             capa de datos: todo Supabase pasa por acá
supabase/migrations/      el esquema, en orden
scripts/                  mantenimiento y pruebas
docs/ALCANCE.md           el alcance acordado con el cliente
```

## Lo que falta

1. Importar los 5.000 productos y los 1.000 clientes. ⚠️ **El último Excel tiene
   el precio por bulto y el anterior lo tenía por unidad**: importarlo sin mirar
   multiplica todos los precios por el tamaño del bulto.
2. Pantallas de **clientes** (con sus direcciones, descuento y vendedor) y de
   **devoluciones**: el esquema ya las soporta.
3. El paso explícito de borrador a emitido en la interfaz.
4. Confirmar con el cliente si el precio lleva IVA incluido.

## Stack

Next.js 16 · React 19 · Tailwind CSS v4 · TypeScript · Supabase (Postgres + Auth).
