/**
 * La versión que se ve en el login y al pie del menú, y lo que cambió en cada
 * una. Lo leen Federico, Claudia y Roxana: se escribe para ellos, sin
 * términos técnicos. Lo técnico va en CONTINUAR.md y en los commits.
 *
 * Al publicar algo que ellos van a notar, se agrega una entrada ARRIBA de
 * todo con el número siguiente (1.3 → 1.4). La primera entrada es la versión
 * actual.
 */
export type Novedad = {
  version: string;
  /** Día de publicación, "2026-10-13". */
  fecha: string;
  cambios: string[];
};

export const NOVEDADES: Novedad[] = [
  {
    version: "1.5",
    fecha: "2026-10-22",
    cambios: [
      "Ingresos: ya se pueden guardar sin Nº de remito del proveedor. Antes daba error y quedaba un ingreso vacío en la lista.",
      "Los carteles de error salen en castellano. Si aparece uno que no se entiende, sacale una foto y mandásela a Lautaro.",
    ],
  },
  {
    version: "1.4",
    fecha: "2026-10-13",
    cambios: [
      "Nuevo remito: botón «+ Producto fuera de lista» para algo que no está en el catálogo, como una botella especial para un solo cliente. Se escribe la descripción, las unidades y el precio; sale impreso en el remito y suma al total, pero no descuenta stock.",
    ],
  },
  {
    version: "1.3",
    fecha: "2026-10-13",
    cambios: [
      "Remitos: se pueden ver los de un día o entre dos fechas (Hoy, Ayer, Últimos 7 días, Este mes, o desde/hasta), con un resumen arriba: cuántos remitos, a cuántos clientes, bultos entregados, cuáles tienen cosas pendientes y el total. El listado se puede imprimir.",
      "Remitos: botón «Corregir». Abre el remito con todo cargado para cambiar lo que haga falta; al emitirlo sale con un número nuevo y el anterior queda anulado solo, con el stock devuelto.",
      "Ingreso de mercadería: el proveedor se busca escribiendo y se elige de la lista. Se completa solo con el primer producto, y avisa si un producto es de otro proveedor.",
      "Ingreso de mercadería: un ingreso ya guardado se puede corregir (proveedor y número de remito).",
      "Buscador de productos: al escribir el código exacto y apretar Enter, a veces se agregaba otro producto con un código parecido. Ya no pasa.",
    ],
  },
  {
    version: "1.2",
    fecha: "2026-10-09",
    cambios: ["Se cargaron los clientes nuevos de la lista, sin tocar los que ya estaban."],
  },
  {
    version: "1.1",
    fecha: "2026-10-01",
    cambios: [
      "Las computadoras se actualizan solas: lo que carga una aparece en las otras sin refrescar la página.",
      "Clientes con número fijo, apodo y razón social. El remito guarda los datos del cliente como estaban al emitirlo.",
      "Proveedores con razón social y CUIT.",
      "Abajo a la derecha aparece si algo se guardó o no, y por qué.",
    ],
  },
  {
    version: "1.0",
    fecha: "2026-09-26",
    cambios: [
      "El sistema arranca con los datos reales: productos, clientes y proveedores de Grupo Barba.",
    ],
  },
];

export const VERSION = NOVEDADES[0].version;

/** El commit publicado, para saber exactamente qué hay en vivo (lo pone Vercel). */
export const COMMIT = process.env.NEXT_PUBLIC_COMMIT ?? "";
