export type Producto = {
  codigo: string;
  nombre: string;
  bodega: string;
  seccion: string;
  presentacion: string;
  /** Cuántas unidades (botellas) trae un bulto. Los sueltos tienen 1. */
  unidadesPorBulto: number;
  /** Siempre POR UNIDAD. El precio del bulto se calcula. */
  precioLista: number;
  enListaActual: boolean;
};

export type Cliente = {
  id: string;
  nombre: string;
  direccion: string;
  localidad: string;
  telefono: string;
  notas: string;
};

/**
 * Fuente de verdad del stock. No existe una columna "stock" que se pisa:
 * el stock actual es la suma de los movimientos de un producto.
 */
export type Movimiento = {
  id: string;
  fecha: string;
  productoCodigo: string;
  tipo: "ingreso" | "egreso" | "ajuste";
  /** Unidades con signo: + entra, - sale. */
  unidades: number;
  usuario: string;
  nota: string;
  refId?: string;
};

export type RemitoLinea = {
  productoCodigo: string;
  bultos: number;
  unidades: number;
  precioUnitario: number;
  /** false = queda pendiente de entrega y NO descuenta stock. */
  entregado: boolean;
};

export type Remito = {
  id: string;
  numero: string;
  clienteId: string;
  fecha: string;
  /** Positivo recarga (ej. 10.5 por transferencia), negativo descuenta. */
  ajustePct: number;
  lineas: RemitoLinea[];
  estado: "emitido" | "anulado";
  usuario: string;
  notas: string;
  anuladoPor?: string;
  anuladoAt?: string;
};

export type Ingreso = {
  id: string;
  fecha: string;
  bodega: string;
  nroRemitoProveedor: string;
  usuario: string;
  lineas: { productoCodigo: string; bultos: number; unidades: number }[];
};

export type DB = {
  productos: Producto[];
  clientes: Cliente[];
  movimientos: Movimiento[];
  remitos: Remito[];
  ingresos: Ingreso[];
  proximoRemito: number;
};

export const USUARIOS = [
  { usuario: "nahiara", nombre: "Nahiara", rol: "Depósito y ventas" },
  { usuario: "carla", nombre: "Carla", rol: "Depósito y ventas" },
  { usuario: "federico", nombre: "Federico Barba", rol: "Dueño" },
] as const;

export type Usuario = (typeof USUARIOS)[number];
