/**
 * Leer las listas de precios de Grupo Barba y compararlas con el sistema.
 * Todo corre en el navegador: el Excel no se sube a ningún lado.
 *
 * - La OFICIAL se sube tal cual llega (hojas LISTA, IMPORTADOS Y WHISKY'S,
 *   PASTAS-ACEITES-ACETO): se buscan las hojas con encabezado CODIGO y
 *   «Precio unitario». Las de chocolates, cristalería y cavas tienen otro
 *   formato y quedan afuera solas, porque no tienen ese encabezado.
 * - La OFERTA no trae códigos, así que va por una planilla que arma el sistema
 *   (planillaDeOferta) y que vuelve con la última columna cambiada.
 *
 * Los dos precios son POR UNIDAD, igual que el sistema.
 */
import type { WorkBook } from "xlsx";
import type { Lista, Producto } from "./types";

/** Para cruzar textos: sin tildes, mayúsculas y un solo espacio entre palabras. */
export function clave(texto: unknown) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Un precio de la planilla: número, «Consultar» o nada. Acepta texto con
 * formato argentino («$ 12.000,50») por si alguna celda vino como texto.
 */
export function leerPrecio(v: unknown): number | "consultar" | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const t = clave(v);
  if (!t) return null;
  if (t.includes("CONSULTAR")) return "consultar";
  const limpio = t.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  return limpio && Number.isFinite(n) && n > 0 ? n : null;
}

/** Un renglón con precio de la planilla, ya cruzado (o no) con un producto. */
export type Renglon = {
  hoja: string;
  /** Número de fila como lo muestra Excel (1 = la primera). */
  fila: number;
  codigoExcel: string;
  bodega: string;
  nombre: string;
  /** null = la celda dice «Consultar» (oficial) o está vacía (oferta: sale). */
  precio: number | null;
  consultar: boolean;
  producto?: Producto;
  /** Cómo se encontró: por código o por bodega + producto. */
  por?: "codigo" | "nombre";
};

type Columnas = Record<string, number>;

/** Busca en las primeras filas la que tiene todos los encabezados pedidos. */
function encabezado(
  filas: unknown[][],
  pedidos: Record<string, (celda: string) => boolean>,
): { fila: number; columnas: Columnas } | null {
  for (let f = 0; f < Math.min(filas.length, 40); f++) {
    const celdas = (filas[f] ?? []).map(clave);
    const columnas: Columnas = {};
    for (const [nombre, es] of Object.entries(pedidos)) {
      const c = celdas.findIndex(es);
      if (c >= 0) columnas[nombre] = c;
    }
    if (Object.keys(columnas).length === Object.keys(pedidos).length)
      return { fila: f, columnas };
  }
  return null;
}

/** Índices del catálogo para cruzar: por código y por bodega + producto. */
function indices(productos: Producto[]) {
  const porCodigo = new Map(productos.map((p) => [clave(p.codigo), p]));
  const porNombre = new Map<string, Producto | null>();
  for (const p of productos) {
    const k = `${clave(p.bodega)}|${clave(p.nombre)}`;
    // Dos productos con la misma bodega y nombre: no se puede elegir, no se cruza.
    porNombre.set(k, porNombre.has(k) ? null : p);
  }
  return { porCodigo, porNombre };
}

type Hojas = (wb: WorkBook) => { nombre: string; filas: unknown[][] }[];

/** Las hojas como matrices de celdas. Se pasa el `utils` de xlsx para no importarlo acá. */
export function hojasDe(utils: typeof import("xlsx").utils): Hojas {
  return (wb) =>
    wb.SheetNames.map((nombre) => ({
      nombre,
      filas: utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      }),
    }));
}

/** La lista oficial, tal cual la manda Federico. */
export function leerOficial(
  hojas: { nombre: string; filas: unknown[][] }[],
  productos: Producto[],
): { renglones: Renglon[]; hojasLeidas: string[]; hojasSalteadas: string[] } {
  const { porCodigo, porNombre } = indices(productos);
  const renglones: Renglon[] = [];
  const hojasLeidas: string[] = [];
  const hojasSalteadas: string[] = [];

  for (const { nombre: hoja, filas } of hojas) {
    const enc = encabezado(filas, {
      codigo: (c) => c === "CODIGO" || c === "COD" || c === "COD.",
      bodega: (c) => c === "BODEGA",
      producto: (c) => c === "PRODUCTO",
      precio: (c) => c.includes("PRECIO UNITARIO"),
    });
    if (!enc) {
      hojasSalteadas.push(hoja);
      continue;
    }
    hojasLeidas.push(hoja);
    const col = enc.columnas;

    for (let f = enc.fila + 1; f < filas.length; f++) {
      const celdas = filas[f] ?? [];
      const precio = leerPrecio(celdas[col.precio]);
      if (precio === null) continue; // títulos, separadores, renglones vacíos

      const codigoExcel = clave(celdas[col.codigo]);
      const bodega = String(celdas[col.bodega] ?? "").trim();
      const nombre = String(celdas[col.producto] ?? "").trim();
      if (!codigoExcel && !nombre) continue;

      let producto: Producto | undefined;
      let por: Renglon["por"];
      if (codigoExcel && porCodigo.has(codigoExcel)) {
        producto = porCodigo.get(codigoExcel);
        por = "codigo";
      } else if (!codigoExcel) {
        // Sin código en el Excel: el sistema le generó uno en la carga inicial.
        const p = porNombre.get(`${clave(bodega)}|${clave(nombre)}`);
        if (p) {
          producto = p;
          por = "nombre";
        }
      }

      renglones.push({
        hoja,
        fila: f + 1,
        codigoExcel,
        bodega,
        nombre,
        precio: precio === "consultar" ? null : precio,
        consultar: precio === "consultar",
        producto,
        por,
      });
    }
  }
  return { renglones, hojasLeidas, hojasSalteadas };
}

export const ENCABEZADO_OFERTA = [
  "Código",
  "Bodega",
  "Producto",
  "Caja",
  "Precio oficial x u",
  "Precio oferta x u",
] as const;

/** La planilla que se baja para cargar la oferta: todo el catálogo activo. */
export function planillaDeOferta(productos: Producto[]): (string | number)[][] {
  const activos = productos
    .filter((p) => p.activo !== false)
    .sort(
      (a, b) =>
        a.bodega.localeCompare(b.bodega, "es") ||
        a.nombre.localeCompare(b.nombre, "es"),
    );
  return [
    [...ENCABEZADO_OFERTA],
    ...activos.map((p) => [
      p.codigo,
      p.bodega,
      p.nombre,
      p.unidadesPorBulto,
      p.precioAConsultar ? "Consultar" : p.precioLista,
      p.precioOferta ?? "",
    ]),
  ];
}

/** La planilla de oferta que vuelve completada. Vacío = sale de la oferta. */
export function leerOferta(
  hojas: { nombre: string; filas: unknown[][] }[],
  productos: Producto[],
): { renglones: Renglon[]; hojasLeidas: string[]; hojasSalteadas: string[] } {
  const { porCodigo } = indices(productos);
  const renglones: Renglon[] = [];
  const hojasLeidas: string[] = [];
  const hojasSalteadas: string[] = [];

  for (const { nombre: hoja, filas } of hojas) {
    const enc = encabezado(filas, {
      codigo: (c) => c === "CODIGO",
      oferta: (c) => c.startsWith("PRECIO OFERTA"),
    });
    if (!enc) {
      hojasSalteadas.push(hoja);
      continue;
    }
    hojasLeidas.push(hoja);
    const col = enc.columnas;

    for (let f = enc.fila + 1; f < filas.length; f++) {
      const celdas = filas[f] ?? [];
      const codigoExcel = clave(celdas[col.codigo]);
      if (!codigoExcel) continue;
      const precio = leerPrecio(celdas[col.oferta]);
      const producto = porCodigo.get(codigoExcel);
      renglones.push({
        hoja,
        fila: f + 1,
        codigoExcel,
        bodega: producto?.bodega ?? "",
        nombre: producto?.nombre ?? "",
        // «Consultar» en la oferta no tiene sentido: se toma como que no está.
        precio: typeof precio === "number" ? precio : null,
        consultar: false,
        producto,
        por: producto ? "codigo" : undefined,
      });
    }
  }
  return { renglones, hojasLeidas, hojasSalteadas };
}

/** Un cambio que se va a aplicar, o que hay que revisar antes. */
export type Cambio = {
  producto: Producto;
  antes: number | null;
  despues: number | null;
  renglon: Renglon;
  /** Por qué hay que tildarlo para que entre. Sin motivo, entra solo. */
  revisar?: string;
};

export type Comparacion = {
  lista: Lista;
  suben: Cambio[];
  bajan: Cambio[];
  /** Oficial: tenían «a consultar». Oferta: entran a la oferta. */
  nuevos: Cambio[];
  /** Solo oferta: salen de la oferta (celda vacía). */
  salen: Cambio[];
  /** Los que hay que tildar uno por uno (saltos de más del 50 %, etc.). */
  aRevisar: Cambio[];
  iguales: number;
  /** Oficial: dicen «Consultar» y el sistema tiene precio: no se tocan. */
  consultar: Renglon[];
  noEncontrados: Renglon[];
  /** El mismo producto aparece dos veces con precios distintos: no se toca. */
  repetidos: Renglon[];
};

/** Más de 50 % de diferencia en cualquier sentido. */
const esSalto = (antes: number, despues: number) =>
  despues > antes * 1.5 || despues < antes * 0.5;

export function comparar(lista: Lista, renglones: Renglon[]): Comparacion {
  const c: Comparacion = {
    lista,
    suben: [],
    bajan: [],
    nuevos: [],
    salen: [],
    aRevisar: [],
    iguales: 0,
    consultar: [],
    noEncontrados: [],
    repetidos: [],
  };

  // El mismo producto dos veces: si coinciden en precio da igual; si no, no
  // hay forma de saber cuál vale y queda afuera.
  const porProducto = new Map<string, Renglon[]>();
  for (const r of renglones) {
    if (!r.producto) {
      // Un «Consultar» o una oferta vacía que no se encuentra no cambia nada.
      if (r.precio !== null) c.noEncontrados.push(r);
      continue;
    }
    const k = r.producto.codigo;
    porProducto.set(k, [...(porProducto.get(k) ?? []), r]);
  }

  for (const grupo of porProducto.values()) {
    const precios = new Set(grupo.map((r) => r.precio ?? -1));
    if (precios.size > 1) {
      c.repetidos.push(...grupo);
      continue;
    }
    const r = grupo[0];
    const p = r.producto!;

    if (lista === "oficial") {
      if (r.consultar || r.precio === null) {
        if (!p.precioAConsultar && p.precioLista > 0) c.consultar.push(r);
        continue;
      }
      const antes = p.precioAConsultar ? 0 : p.precioLista;
      const cambio: Cambio = { producto: p, antes: antes || null, despues: r.precio, renglon: r };
      if (!antes) c.nuevos.push(cambio);
      else if (r.precio === antes) c.iguales++;
      else {
        if (esSalto(antes, r.precio))
          cambio.revisar = `${r.precio > antes ? "sube" : "baja"} más de 50 %`;
        (r.precio > antes ? c.suben : c.bajan).push(cambio);
      }
      if (cambio.revisar) c.aRevisar.push(cambio);
    } else {
      const antes = p.precioOferta ?? null;
      const despues = r.precio;
      if (antes === despues) {
        c.iguales++;
        continue;
      }
      const cambio: Cambio = { producto: p, antes, despues, renglon: r };
      if (despues !== null && p.precioLista > 0 && despues > p.precioLista)
        cambio.revisar = "la oferta es más cara que la oficial";
      else if (antes !== null && despues !== null && esSalto(antes, despues))
        cambio.revisar = `${despues > antes ? "sube" : "baja"} más de 50 %`;
      else if (antes === null && despues !== null && p.precioLista > 0 && despues < p.precioLista * 0.5)
        cambio.revisar = "menos de la mitad de la oficial";

      if (antes === null) c.nuevos.push(cambio);
      else if (despues === null) c.salen.push(cambio);
      else (despues > antes ? c.suben : c.bajan).push(cambio);
      if (cambio.revisar) c.aRevisar.push(cambio);
    }
  }
  return c;
}

/** Lo que se manda a aplicar_precios: todo menos lo que hay que revisar y no se tildó. */
export function aAplicar(c: Comparacion, tildados: Set<string>) {
  return [...c.suben, ...c.bajan, ...c.nuevos, ...c.salen]
    .filter((x) => !x.revisar || tildados.has(x.producto.codigo))
    .map((x) => ({ codigo: x.producto.codigo, precio: x.despues }));
}
