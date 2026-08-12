import type { DB, Producto, Cliente, Movimiento, Ingreso, Remito } from "./types";

/**
 * DEMO. Productos reales tomados de "Oferta GRUPO BARBA (Válida hasta 14 de Junio)".
 * Los códigos son de ejemplo: en la lista real solo los 180 de Tienda Nube tienen
 * código, los otros ~361 hay que generárselos (ver ALCANCE.md).
 */
const productos: Producto[] = [
  {
    codigo: "W1101",
    nombre: "Aguijón de Abeja Obrera — Todas las Cepas",
    bodega: "Aguijón de Abeja",
    seccion: "Media Gama",
    presentacion: "Caja x 6 bot x 750cc",
    unidadesPorBulto: 6,
    precioLista: 11934,
    enListaActual: true,
  },
  {
    codigo: "W1102",
    nombre: "Aguijón de Abeja Reina — Malbec / Cabernet Franc",
    bodega: "Aguijón de Abeja",
    seccion: "Media Gama",
    presentacion: "Caja x 6 bot x 750cc",
    unidadesPorBulto: 6,
    precioLista: 14491,
    enListaActual: true,
  },
  {
    codigo: "W1120",
    nombre: "Alta Vista — Malbec / Cabernet Franc / Sauvignon Blanc",
    bodega: "Alta Vista",
    seccion: "Media Gama",
    presentacion: "Caja x 6 bot x 750cc",
    unidadesPorBulto: 6,
    precioLista: 7815,
    enListaActual: true,
  },
  {
    codigo: "W2201",
    nombre: "Alfa Crux Malbec",
    bodega: "Alfa Crux",
    seccion: "Alta Gama",
    presentacion: "Caja x 6 bot x 750cc",
    unidadesPorBulto: 6,
    precioLista: 40005,
    enListaActual: true,
  },
  {
    codigo: "W2202",
    nombre: "Beta Crux Malbec",
    bodega: "Alfa Crux",
    seccion: "Alta Gama",
    presentacion: "Caja x 6 bot x 750cc",
    unidadesPorBulto: 6,
    precioLista: 24765,
    enListaActual: true,
  },
  {
    codigo: "W2203",
    nombre: "Beta Crux Corte Uco II",
    bodega: "Alfa Crux",
    seccion: "Alta Gama",
    presentacion: "Caja x 6 bot x 750cc",
    unidadesPorBulto: 6,
    precioLista: 27623,
    enListaActual: true,
  },
  {
    codigo: "W3010",
    nombre: "Dom Pérignon 2015",
    bodega: "Champagne Importado",
    seccion: "Espumantes e Importados",
    presentacion: "Caja x 1 bot x 750cc",
    unidadesPorBulto: 1,
    precioLista: 462000,
    enListaActual: true,
  },
  {
    codigo: "W3700",
    nombre: "Pommery Brut Royal",
    bodega: "Champagne Importado",
    seccion: "Espumantes e Importados",
    presentacion: "Caja x 1 bot x 750cc",
    unidadesPorBulto: 1,
    precioLista: 129600,
    enListaActual: true,
  },
  {
    codigo: "W4010",
    nombre: "Talisker 10 Años",
    bodega: "Whisky",
    seccion: "Whisky, Gin y Aperitivos",
    presentacion: "1 x 750cc",
    unidadesPorBulto: 1,
    precioLista: 136800,
    enListaActual: true,
  },
  {
    codigo: "W4011",
    nombre: "Johnnie Walker Green Label",
    bodega: "Whisky",
    seccion: "Whisky, Gin y Aperitivos",
    presentacion: "1 x 750cc",
    unidadesPorBulto: 1,
    precioLista: 144000,
    enListaActual: true,
  },
  {
    codigo: "A5010",
    nombre: "Familia Mastrantonio Extra Virgen Intenso",
    bodega: "Aceites",
    seccion: "Aceites, Pastas y Aceto",
    presentacion: "1 x 500cc",
    unidadesPorBulto: 1,
    precioLista: 13750,
    enListaActual: true,
  },
  {
    codigo: "A5030",
    nombre: "Mariflor Aceite de Oliva x 250",
    bodega: "Aceites",
    seccion: "Aceites, Pastas y Aceto",
    presentacion: "12 x 250cc",
    unidadesPorBulto: 12,
    precioLista: 8757,
    enListaActual: true,
  },
];

const clientes: Cliente[] = [
  {
    id: "c1",
    nombre: "Vinoteca La Cava",
    direccion: "Av. Rivadavia 12340",
    localidad: "Ramos Mejía",
    telefono: "11 4567-8901",
    notas: "Recibe hasta las 13 h.",
  },
  {
    id: "c2",
    nombre: "Almacén Don Pepe",
    direccion: "San Martín 455",
    localidad: "Morón",
    telefono: "11 4629-2210",
    notas: "",
  },
  {
    id: "c3",
    nombre: "Restó Bella Vista",
    direccion: "Belgrano 1220",
    localidad: "Haedo",
    telefono: "11 4443-7788",
    notas: "Entregar por la puerta lateral.",
  },
  {
    id: "c4",
    nombre: "Distribuidora del Oeste",
    direccion: "Rodríguez Peña 88",
    localidad: "Castelar",
    telefono: "11 4628-1199",
    notas: "",
  },
];

/** Fechas fijas: la demo tiene que verse igual siempre que se reinicie. */
const HOY = "2026-08-12";
const dia = (d: string, h = "09:00") => `${d}T${h}:00`;

const ingresos: Ingreso[] = [
  {
    id: "i1",
    fecha: dia("2026-08-04", "10:15"),
    bodega: "Aguijón de Abeja",
    nroRemitoProveedor: "0001-00042871",
    usuario: "Carla",
    lineas: [
      { productoCodigo: "W1101", bultos: 10, unidades: 60 },
      { productoCodigo: "W1102", bultos: 6, unidades: 36 },
    ],
  },
  {
    id: "i2",
    fecha: dia("2026-08-06", "11:40"),
    bodega: "Alfa Crux",
    nroRemitoProveedor: "0003-00011204",
    usuario: "Carla",
    lineas: [
      { productoCodigo: "W2201", bultos: 4, unidades: 24 },
      { productoCodigo: "W2202", bultos: 5, unidades: 30 },
    ],
  },
  {
    id: "i3",
    fecha: dia("2026-08-07", "16:05"),
    bodega: "Varios",
    nroRemitoProveedor: "0002-00007733",
    usuario: "Carla",
    lineas: [
      { productoCodigo: "W1120", bultos: 8, unidades: 48 },
      { productoCodigo: "W3700", bultos: 3, unidades: 3 },
      { productoCodigo: "W4010", bultos: 2, unidades: 2 },
      { productoCodigo: "A5010", bultos: 24, unidades: 24 },
      { productoCodigo: "A5030", bultos: 4, unidades: 48 },
    ],
  },
];

const remitos: Remito[] = [
  {
    id: "r1",
    numero: "R-0001",
    clienteId: "c1",
    fecha: dia("2026-08-08", "12:20"),
    ajustePct: 0,
    lineas: [
      { productoCodigo: "W1101", bultos: 2, unidades: 12, precioUnitario: 11934, entregado: true },
      { productoCodigo: "W1120", bultos: 2, unidades: 12, precioUnitario: 7815, entregado: true },
    ],
    estado: "emitido",
    usuario: "Carla",
    notas: "",
  },
  {
    id: "r2",
    numero: "R-0002",
    clienteId: "c3",
    fecha: dia("2026-08-11", "10:05"),
    ajustePct: 10.5,
    lineas: [
      { productoCodigo: "W2202", bultos: 1, unidades: 6, precioUnitario: 24765, entregado: true },
      { productoCodigo: "A5010", bultos: 6, unidades: 6, precioUnitario: 13750, entregado: true },
      // Pedido pero sin stock: queda pendiente y NO descuenta.
      { productoCodigo: "W3010", bultos: 2, unidades: 2, precioUnitario: 462000, entregado: false },
    ],
    estado: "emitido",
    usuario: "Carla",
    notas: "Paga por transferencia.",
  },
];

function movimientosDesde(ingresos: Ingreso[], remitos: Remito[]): Movimiento[] {
  const movs: Movimiento[] = [];
  let n = 0;

  for (const ing of ingresos) {
    for (const l of ing.lineas) {
      movs.push({
        id: `m${++n}`,
        fecha: ing.fecha,
        productoCodigo: l.productoCodigo,
        tipo: "ingreso",
        unidades: l.unidades,
        usuario: ing.usuario,
        nota: `Ingreso ${ing.nroRemitoProveedor} · ${ing.bodega}`,
        refId: ing.id,
      });
    }
  }

  for (const rem of remitos) {
    for (const l of rem.lineas) {
      if (!l.entregado) continue;
      movs.push({
        id: `m${++n}`,
        fecha: rem.fecha,
        productoCodigo: l.productoCodigo,
        tipo: "egreso",
        unidades: -l.unidades,
        usuario: rem.usuario,
        nota: `Remito ${rem.numero}`,
        refId: rem.id,
      });
    }
  }

  // Un ajuste manual, para mostrar que la corrección es un movimiento más.
  movs.push({
    id: `m${++n}`,
    fecha: dia("2026-08-11", "17:30"),
    productoCodigo: "W1102",
    tipo: "ajuste",
    unidades: -2,
    usuario: "Federico Barba",
    nota: "Rotura en el depósito (2 botellas)",
  });

  return movs.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function seedDB(): DB {
  return {
    productos,
    clientes,
    movimientos: movimientosDesde(ingresos, remitos),
    remitos,
    ingresos,
    proximoRemito: 3,
  };
}

export const FECHA_DEMO = HOY;
