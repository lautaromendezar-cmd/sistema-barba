# Sistema de Remitos y Stock — Grupo Barba

Sistema interno para reemplazar los remitos escritos a mano. **El remito es el
corazón: el stock se descuenta como consecuencia de emitirlo, no como una tarea
aparte.**

> Estado: **demo para mostrarle al cliente**. Los datos viven en el navegador
> (`localStorage`), no hay base de datos ni servidor. Ver
> [docs/ALCANCE.md](docs/ALCANCE.md) para el alcance completo del sistema real.

## Cómo correrlo

```bash
npm install
npm run dev
```

Usuarios de la demo: `nahiara`, `carla` o `federico`. Contraseña: `demo`.
El botón **Reiniciar demo** (abajo a la derecha) vuelve todo al estado inicial:
sirve para repetir la presentación de cero.

## Qué se puede probar

| Pantalla | Qué muestra |
|---|---|
| **Inicio** | Resumen: productos, unidades en depósito, sin stock, pendientes |
| **Remitos** | Listado, vista imprimible (Ctrl+P sale solo el remito), anulación |
| **Nuevo remito** | Cliente (o alta al vuelo), buscador por código/nombre, bultos, ajuste %, líneas pendientes |
| **Productos y stock** | Stock calculado, movimientos por producto, ajuste manual, alta de producto |
| **Ingreso de mercadería** | Carga de lo que entra del proveedor |

## Reglas de negocio implementadas

- **El stock es la suma de los movimientos** (`lib/store.tsx`). No hay una columna
  `stock` que se pise: por eso el ajuste manual es un movimiento más y todo queda
  auditable.
- **Solo lo entregado descuenta.** Una línea marcada *pendiente* no genera
  movimiento: alimenta la pantalla de "falta pedirle al proveedor".
- **El stock negativo no bloquea la venta**, se muestra en rojo. Bloquear es la
  forma más rápida de que vuelvan al papel.
- **Los remitos se anulan, no se borran**, y la anulación devuelve el stock.
- **Unidad base = unidad (botella)**; la carga y la visualización son en bultos.
- **Ajuste porcentual único sobre el total** (cubre el +10,5% por transferencia y
  cualquier descuento puntual).
- La búsqueda ignora tildes: "perignon" encuentra "Dom Pérignon".

## Datos

Los 12 productos de `lib/seed.ts` son reales, tomados de *Oferta GRUPO BARBA
(válida hasta el 14 de junio)*. La lista completa tiene **541 productos** y
**361 no tienen código**: generarles una identidad estable es parte del trabajo
del sistema real.

Los códigos de la demo son de ejemplo, salvo `W3700` (Pommery), que es el real
de Tienda Nube.

## Qué falta para que esto sea el sistema real

1. Reemplazar `lib/store.tsx` por Supabase (Postgres + Auth). Las pantallas
   quedan casi iguales: la capa de datos está aislada detrás de `useStore()`.
2. Importar los 541 productos y generarles código.
3. Login real, sin registro público.
4. Las respuestas de las 8 preguntas abiertas de [docs/ALCANCE.md](docs/ALCANCE.md) —
   sobre todo si el precio de la lista es de venta o es costo.

## Stack

Next.js 16 · React 19 · Tailwind CSS v4 · TypeScript.
