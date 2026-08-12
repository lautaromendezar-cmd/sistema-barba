# Cuestionario para la reunión — Grupo Barba

Todo lo que necesito saber para construir el sistema sin adivinar nada.
Ordenado por prioridad: **si la reunión se corta, las primeras cuatro son las que no pueden faltar.**

---

## 🔴 Bloqueantes — sin esto no arranco

**1. El precio de la lista, ¿es lo que le cobran al cliente, o es el costo al que después le suman un margen?**
Es la definición más importante de todas. En el proyecto de la tienda online, ese mismo número se tomó como costo y se le sumó 15%. Si acá se carga al revés, **todos los remitos salen con el precio equivocado**.

**2. Ese precio, ¿es por unidad (una botella) o por bulto (la caja cerrada)?**
La lista dice "precio en efectivo X UNIDAD", pero venden por bulto. Necesito la confirmación explícita, no la deducción.

**3. El remito que hacen hoy, ¿lleva precios y total, o solamente las cantidades?**
Muchas distribuidoras ponen solo cantidades y los precios van aparte. Cambia por completo cómo se imprime.

**4. Cuando un cliente pide algo que no hay en el depósito, ¿le hacen el remito igual en el momento, o esperan a tener la mercadería?**
Define si el sistema necesita "líneas pendientes" o si alcanza con un remito simple.

---

## Artículos

5. ¿Cuántos productos manejan en total? ¿Los 541 de la lista de oferta son todos, o venden cosas que no están ahí?
6. La planilla que tienen, ¿tiene código para **todos** los productos, o hay productos sin código?
7. Ese código, ¿lo inventaron ustedes o viene del proveedor? ¿Se repite alguna vez?
8. **¿Dónde está la cantidad de unidades por bulto?** Sin ese dato no puedo convertir "3 cajas" en botellas, y es el campo que falta en lo que me pasaste.
9. ¿Venden siempre el bulto cerrado o también sueltan unidades? ¿En qué casos?
10. ¿Un mismo producto puede venir en dos presentaciones (750cc y 1L, por ejemplo)?
11. ¿Manejan cosas que no son bebidas? (vi categorías de copas y pastas)

---

## Precios

12. **¿Cada cuánto cambian los precios?** ¿Todos los meses, cuando aumenta el proveedor, sin período fijo?
13. ¿Cambian todos juntos o de a poco, unos pocos productos por vez?
14. ¿Quién arma la lista nueva y en qué archivo? ¿La escribe alguien a mano en Excel o la baja de algún sistema?
15. ¿Los precios llevan IVA incluido o se suma aparte?
16. ¿El precio es el mismo para todos los clientes, o hay descuentos por cliente o por volumen?
17. ¿Sigue vigente el recargo del **10,5% por transferencia**?
18. Cuando cambia un precio, ¿los remitos ya emitidos tienen que seguir mostrando el precio con el que salieron? (asumo que sí, pero lo confirmo)

---

## Clientes

19. ¿Cuántos clientes activos tienen? ¿20, 50, 200?
20. ¿Dónde están hoy sus datos: una planilla, la agenda del celular, la cabeza de Federico?
21. ¿Qué datos van impresos en el remito? ¿Alcanza con nombre, dirección de entrega, localidad y teléfono?
22. ¿Necesitan CUIT o razón social en el remito, aunque la factura se haga por afuera?
23. ¿Un cliente puede tener más de una dirección de entrega (sucursales)?
24. ¿Hay clientes que compran una sola vez, o son todos habituales?
25. ¿Hay un vendedor asignado por cliente?

---

## Remitos

26. ¿Cuántos remitos hacen por día o por semana?
27. **Foto de un remito completado a mano.** Es lo que más me sirve de toda la reunión.
28. ¿El talonario tiene numeración preimpresa? ¿Seguimos esa serie o arrancamos de cero con la del sistema?
29. ¿Cuántas copias hacen? ¿El cliente firma una que vuelve con el repartidor?
30. ¿Quién lo escribe hoy: el que arma el pedido en el depósito o el que atiende el WhatsApp?
31. ¿El remito se hace antes de armar el pedido (para saber qué juntar) o después (para documentar lo que se cargó)?
32. **¿Qué pasa cuando un cliente devuelve mercadería?** ¿Hay algún papel de devolución, o se arregla de palabra?
33. ¿Alguna vez entregan una parte y completan después? ¿Cómo lo anotan?

---

## Depósito y operación

34. ¿Hay un solo depósito, o hay mercadería en más de un lugar?
35. Cuando llega mercadería del proveedor, ¿viene con remito? ¿Quién la recibe?
36. ¿Quién va a ser el responsable de cargar los ingresos? Es el punto donde se cae el sistema si nadie lo hace.
37. ¿Alguien puede contar el depósito una vez para arrancar, o arrancamos todo en cero?
38. ¿Qué hacen hoy con las roturas y los vencimientos?
39. ¿Cuántas personas van a usar el sistema y quiénes? (con la baja de Nahiara, ¿quedan dos o entró alguien nuevo?)
40. ¿Desde qué aparato lo van a usar? ¿Hay una PC en el depósito o es todo celular?

---

## Para volver con

- [ ] Foto de un remito lleno
- [ ] Foto de un remito en blanco (el talonario)
- [ ] La planilla de artículos que usan hoy
- [ ] La lista de clientes, como esté
- [ ] Las respuestas a las cuatro bloqueantes, por escrito
