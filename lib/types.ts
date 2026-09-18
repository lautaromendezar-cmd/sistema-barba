export type Producto = {
  /** uuid en la base. Las pantallas siguen usando el codigo como clave. */
  id?: string;
  codigo: string;
  nombre: string;
  bodega: string;
  seccion: string;
  presentacion: string;
  /** Cuántas unidades (botellas) trae un bulto. Los sueltos tienen 1. */
  unidadesPorBulto: number;
  /** Whisky, gin, vodka, aperitivos, pastas y aceites tambien se venden sueltos. */
  seVendeSuelto?: boolean;
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
  /** Fede atiende los habituales, Claudia los nuevos, Roxana las entregas. */
  vendedor?: string;
  /** Descuento fijo del cliente. Se copia al remito al armarlo. */
  descuentoPct?: number;
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
  tipo:
    | "inventario_inicial"
    | "ingreso"
    | "egreso"
    | "devolucion"
    | "anulacion"
    | "ajuste"
    | "rotura"
    | "vencimiento";
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
  /** Nace borrador: se arma antes de ir a juntar el pedido al deposito. */
  estado: "borrador" | "emitido" | "anulado";
  /** Descuento del cliente, copiado al crear el remito. */
  descuentoPct?: number;
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

/**
 * Quien esta usando el sistema, tal como sale de la tabla `perfiles`.
 * `usuario` es el uuid de auth.users: el nombre con el que se entra
 * ("claudia") solo existe en la pantalla de login.
 */
export type Usuario = {
  usuario: string;
  nombre: string;
  rol: string;
};

/** Las tres personas que van a usar el sistema (confirmado por Federico). */
export const USUARIOS = [
  { usuario: "federico", nombre: "Federico Barba", rol: "Dueño y ventas" },
  { usuario: "claudia", nombre: "Claudia", rol: "Ventas e ingresos" },
  { usuario: "roxana", nombre: "Roxana", rol: "Entregas" },
] as const;
