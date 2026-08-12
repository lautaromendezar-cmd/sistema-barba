# Sistema de Remitos y Stock — Grupo Barba

**Documento de alcance** · v1 · 12 de agosto de 2026
Estado: **pendiente de aprobación**. No se empieza a construir hasta que Federico confirme la Parte 1 y se respondan las preguntas abiertas.

---

# Parte 1 — Para Federico

## El problema, como lo entendimos

Hoy en Grupo Barba **todo pasa por papel**: los remitos se escriben a mano, y después esa información se vuelve a cargar en planillas de Excel. Eso consume horas todas las semanas y, además, hace que nadie sepa con certeza qué hay en el depósito: la planilla de stock que se mira para saber si hay mercadería está siempre un paso atrás de la realidad.

## La decisión de fondo

**No vamos a construir un sistema de stock. Vamos a construir un sistema de remitos.**

La diferencia no es de nombre. Un sistema de stock le agrega trabajo a todo el mundo: alguien tiene que sentarse aparte a descontar lo que salió. Ese trabajo extra es la razón por la que estos sistemas se abandonan a los tres meses — exactamente lo que ya pasó con la planilla actual.

En cambio, si el remito se arma en el sistema en lugar de en papel, **el stock se descuenta solo**. Nadie carga movimientos: el descuento es la consecuencia automática de un trabajo que igual hay que hacer, y que además se hace más rápido que a mano.

> El remito es el corazón del sistema. El stock es un subproducto gratis.

## Qué van a poder hacer

- **Armar el remito en pantalla** eligiendo cliente y productos, con el total calculado solo, y **imprimirlo** para que viaje en la camioneta.
- **Saber cuánto hay de cada producto** sin ir a mirar al depósito, actualizado con cada remito emitido.
- **Cargar la mercadería que entra** del proveedor, en una pantalla simple.
- **Corregir el stock a mano** cuando el número no coincide con la realidad.
- **Ver qué hay que pedirle al proveedor**: los productos que se vendieron de lista y todavía no están en el depósito, agrupados por bodega.
- **Buscar y reimprimir cualquier remito** emitido.

## Cómo se calcula el stock

Cada producto tiene **dos números separados, que nunca se suman**:

| | |
|---|---|
| **Físico** | Lo que está hoy en el estante del depósito. |
| **A pedir** | Lo que se vendió de lista y hay que conseguirle al proveedor. |

Se mantienen separados a propósito. Si se sumaran, el sistema diría "hay 40" cuando en el depósito hay 4 — y a la segunda vez que eso pasa, nadie le cree más al sistema.

## Cómo arranca el stock

**Todos los productos arrancan en cero.** No hace falta parar el depósito dos días para contar 541 productos.

El número se construye solo: cada mercadería que entra se carga, cada remito descuenta. En tres o cuatro semanas, el 80% de lo que rota tiene un número real. Para lo que rota mucho y se necesita antes, está la corrección manual.

Si en algún momento quieren hacer un inventario formal, hay una pantalla de conteo. Pero **el sistema funciona igual si nunca lo hacen** — esto es a propósito.

## Dos reglas que parecen detalles y no lo son

**1. El stock negativo no bloquea la venta.** Si el sistema dice que hay −3 botellas, igual deja emitir el remito y lo muestra en rojo. Bloquear una venta porque el sistema cree que no hay mercadería es la forma más rápida de que alguien vuelva al papel. El rojo no es un error: es la lista de lo que falta cargar.

**2. Un remito emitido no se borra: se anula.** Queda registrado, con quién lo anuló y cuándo. Sin eso, no hay manera de explicar un faltante dentro de seis meses.

## Fases

**Fase 1 — El remito sale del papel.**
Usuarios y login · catálogo de 541 productos cargado · clientes · armado e impresión del remito · descuento automático de stock · carga de mercadería que entra · corrección manual de stock.

**Fase 2 — El sistema empieza a avisar.**
Pantalla de "hay que pedirle al proveedor" · importación de la lista de precios nueva cada mes · pantalla de conteo de inventario.

**Fase 3 — A definir más adelante, no comprometida.**
Alertas de reposición por producto · reportes de lo que más se vende.

## Qué NO incluye este sistema

Esto es tan importante como lo que sí incluye.

| Fuera de alcance | Por qué |
|---|---|
| **Factura electrónica / ARCA** | La facturación sigue por afuera, como hoy. Emitir factura electrónica es un proyecto entero aparte, con certificados, punto de venta y condición de IVA por cliente. Se cotiza por separado si alguna vez se quiere. |
| **Cuenta corriente y cobranzas** | El sistema no lleva quién debe cuánto ni registra pagos. Exigiría cargar *todos* los pagos con disciplina desde el día uno; cargado a medias, los saldos quedan mal y el sistema pierde credibilidad. |
| **Reparto y hojas de ruta** | La logística de las camionetas la organizan ellos. El sistema imprime el remito; lo que pasa después queda afuera. |
| **Tienda Nube** | El stock interno **no** se sincroniza con la tienda online. Consecuencia asumida: la tienda sigue pudiendo vender algo que no hay en el depósito, igual que hoy. Se decidió así porque el volumen online es marginal frente al mayorista. |

## Costo de funcionamiento

El sistema vive en internet (no se instala en ninguna computadora) y requiere un servicio de base de datos: **Supabase, ~USD 10 por mes**, ya presupuestado. Sin eso el sistema no funciona.

## Preguntas abiertas — hacen falta para arrancar

Ninguna de estas frena la aprobación del documento, pero todas frenan la construcción:

1. **¿De dónde sale la lista de oferta mensual y quién la arma?** ¿La escribe alguien a mano en Excel o la baja de algún sistema?
2. **¿Los 541 productos de la lista de junio son todos los que manejan**, o venden cosas que no están en esa lista?
3. **Cuando un cliente pide algo que no hay en el depósito, ¿le hacés el remito igual en el momento**, o esperás a tener la mercadería?
4. **El precio de la lista, ¿es lo que le cobran al cliente mayorista, o es el costo** al que se le suma un margen? *(Esto es crítico: en el proyecto de la tienda online ese mismo precio se trató como costo y se le sumó 15%.)*
5. **¿Siguen cobrando el 10,5% de recargo por transferencia?**
6. **¿Cuántos clientes son y dónde están hoy sus datos** (dirección de entrega, teléfono)?
7. **¿Qué datos van impresos en el remito hoy?** ¿Lo firma el que recibe?
8. **Foto de un remito completado a mano.** Es lo más útil de todo: muestra qué se escribe realmente, en qué orden, y qué campos quedan siempre vacíos.

---

# Parte 2 — Técnico

## Stack

- **Next.js + Supabase** (Postgres + Auth), deploy en Vercel.
- Web responsive: se usa en PC y desde el celular en el depósito.
- **3 usuarios** (2 empleadas + Federico), creados a mano. **Registro público deshabilitado** — no hay ninguna razón para que exista.
- **Sin multi-empresa.** Un cliente, un proyecto Supabase dedicado. Si mañana aparece otra distribuidora, se clona: es más barato que diseñar multi-tenant hoy para un cliente hipotético.

## Permisos

Los tres usuarios ven todo, **incluidos costos y márgenes** (decisión explícita de Federico). Lo que sí se registra siempre es **quién** hizo cada cosa: quién emitió el remito, quién lo anuló, quién aplicó un descuento, quién ajustó stock. No es vigilancia: es poder responder "¿por qué este remito salió 12% abajo?".

## Modelo de datos

```
usuarios         (Supabase Auth)  — 3, alta manual

clientes         id · nombre_razon_social · direccion_entrega · localidad
                 telefono · notas · activo

productos        id · codigo (identidad estable) · bodega · nombre · seccion
                 presentacion · unidades_por_bulto · precio_lista
                 en_lista_actual (bool) · activo

movimientos      id · producto_id · tipo (ingreso|egreso|ajuste)
                 cantidad_unidades (con signo) · remito_id? · ingreso_id?
                 usuario_id · fecha · nota

remitos          id · numero (R-0001, correlativo) · cliente_id · fecha
                 condicion_pago · ajuste_pct · subtotal · total
                 estado (emitido|anulado) · usuario_id · notas
                 anulado_por? · anulado_at?

remito_lineas    id · remito_id · producto_id · cantidad_bultos
                 cantidad_unidades · precio_unitario · entregado (bool)
                 subtotal

ingresos         id · bodega · fecha · nro_remito_proveedor · usuario_id
ingreso_lineas   id · ingreso_id · producto_id · cantidad_bultos · cantidad_unidades

importaciones    id · archivo · fecha · usuario_id · resumen_json
```

**`movimientos` es la fuente de verdad del stock.** No hay una columna `stock` que se pisa: el stock actual es la suma de los movimientos, expuesta como vista. Con 541 productos y este volumen, el costo es despreciable y a cambio se obtiene trazabilidad completa — se puede reconstruir por qué un producto tiene el número que tiene. También es lo que hace que el ajuste manual sea un movimiento más y no una excepción al modelo.

### Unidades

La unidad base de todo el sistema es la **unidad (botella)**. La carga y la visualización son en **bultos**, con la equivalencia de `unidades_por_bulto` (columna `U` de la lista). Una sola unidad interna evita el bug clásico de descontar 1 cuando eran 12. Los productos que se venden sueltos (aceites) simplemente tienen `unidades_por_bulto = 1`.

### Precios

Precio de lista único para todos los clientes. El remito tiene **un campo de ajuste porcentual sobre el total** (positivo recarga, negativo descuenta) — cubre el 10,5% de transferencia y cualquier descuento puntual sin tocar código. El PDF muestra `subtotal → ajuste → total`. No hay descuento por línea: multiplica la complejidad de la pantalla que más rápido tiene que ser.

### Identidad de producto — el punto delicado

La lista grande (541 productos) **no tiene columna `CODIGO`**: arranca en `BODEGA`, y el nombre es texto libre reescrito cada mes. Solo los 180 que están en Tienda Nube tienen código.

Si el sistema identificara productos por nombre, la lista del mes siguiente crearía 541 duplicados y partiría el stock en dos.

**Solución:** se importa la lista una vez, se le genera un `codigo` estable a cada producto (respetando los 180 códigos que ya existen, para que el día que se quiera conectar Tienda Nube el match ya esté hecho), y ese código es la identidad para siempre.

Cada lista nueva entra como **actualización de precios con revisión humana**: el sistema muestra *"estos 12 no los reconozco: ¿son nuevos o cambiaron de nombre?"* y una persona decide. Es la misma mecánica de "Analizar antes de Actualizar" del `.exe` de precios que Nahiara ya usa y entiende.

**Regla dura:** un producto que desaparece de la lista del mes **no se borra** — se marca `en_lista_actual = false` y conserva su stock físico. En la lista de agosto ya pasó: un producto vino con `SIN STOCK` como texto en la celda de precio.

## Pantallas

| Pantalla | Notas |
|---|---|
| **Remito nuevo** | La pantalla crítica. Buscador por código y por nombre, navegable con teclado, cantidad en bultos, total en vivo. Alta de cliente al vuelo desde acá — si hay que ir a otra pantalla, van a escribir el nombre en un campo libre y el padrón nace roto. Cada línea puede marcarse *pendiente de entrega*. |
| **Remitos** | Listado, búsqueda, reimpresión, anulación. |
| **Clientes** | ABM simple. |
| **Productos / Stock** | 541 filas: filtro por sección y bodega, búsqueda. Negativos en rojo. |
| **Ingreso de mercadería** | Carga del remito del proveedor. La usa una de las empleadas. |
| **Ajuste / conteo** | Corrección manual, siempre con nota y usuario. |
| **Pendientes por proveedor** *(F2)* | Líneas no entregadas, agrupadas por bodega. |
| **Importar lista** *(F2)* | Analizar → revisar diferencias → aplicar. |

## Comportamiento del remito

- Numeración propia correlativa `R-0001`, sin reutilizar la del talonario de papel.
- **Solo descuenta stock lo efectivamente entregado.** Lo marcado como pendiente no genera movimiento; alimenta la pantalla de pedidos al proveedor.
- PDF imprimible: viaja en la camioneta. Dos copias si hace falta firma de recepción.
- No es comprobante fiscal y así debe verse — sin numeración que se confunda con una factura.

## Riesgos identificados

1. **361 productos sin código y nombres en texto libre.** Mitigado con código generado + revisión humana en cada importación. Es el punto donde más probablemente aparezca trabajo manual imprevisto.
2. **Si nadie carga los ingresos, todo el stock se va a negativo en un mes** y el sistema pierde credibilidad. Mitigado con la pantalla de ingreso simple y con la regla de que el negativo no bloquea. Depende de una persona: es el riesgo real del proyecto, no un riesgo técnico.
3. **Ambigüedad costo/precio de la lista** (pregunta abierta 4). Si se resuelve mal, todos los remitos salen con el precio equivocado.
4. **El remito en papel no se vio todavía.** Puede faltar un campo que se escribe siempre. Costo de descubrirlo tarde: rehacer la pantalla más importante.
