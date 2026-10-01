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
  proveedorId?: string | null;
  activo?: boolean;
  /** Siempre POR UNIDAD. El precio del bulto se calcula. */
  precioLista: number;
  /** La lista decia "Consultar": no se puede emitir un remito con el en cero. */
  precioAConsultar?: boolean;
  enListaActual: boolean;
};

/** A quien se le compra. Distinto de la bodega, que es quien produce. */
export type Proveedor = {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  notas: string;
  activo: boolean;
};

export type Direccion = {
  id: string;
  direccion: string;
  localidad: string;
  contacto: string;
  telefono: string;
  esPrincipal: boolean;
};

export type Cliente = {
  id: string;
  /** Lo pone la base y no cambia nunca: identifica al cliente aunque le cambien el nombre. */
  numero?: number;
  /** El apodo: como Federico lo tiene agendado ("SANTI"). La columna se sigue llamando nombre. */
  nombre: string;
  /** Opcional. Si esta cargada, es lo que sale impreso en el remito. */
  razonSocial?: string;
  direccion: string;
  localidad: string;
  telefono: string;
  /** Fede atiende los habituales, Claudia los nuevos, Roxana las entregas. */
  vendedor?: string;
  /** Descuento fijo del cliente. Se copia al remito al armarlo. */
  descuentoPct?: number;
  notas: string;
  activo?: boolean;
  /** Sucursales. La principal es la que sale impresa en el remito. */
  direcciones?: Direccion[];
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

export type ClienteEnRemito = {
  numero?: number;
  apodo?: string;
  razon_social?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  notas?: string | null;
};

export type Remito = {
  id: string;
  numero: string;
  clienteId: string;
  /** Copia del cliente tomada al emitir. Si se edita la ficha, el remito no cambia. */
  clienteDatos?: ClienteEnRemito;
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

/**
 * Lo que la app tiene cargado en memoria. Los movimientos NO estan aca a
 * proposito: son la tabla que mas crece (cada linea de cada remito deja uno) y
 * se consultan por producto cuando alguien abre el historial. El stock tampoco
 * se calcula sumandolos: sale de las vistas de la base.
 */
export type DB = {
  productos: Producto[];
  proveedores: Proveedor[];
  clientes: Cliente[];
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
  /** El texto que se ve abajo del nombre en el menu. Es una etiqueta, no un permiso. */
  rol: string;
  /** Ve el panel con la facturacion. Sale de `perfiles.es_admin`. */
  esAdmin: boolean;
};

/** Las tres personas que van a usar el sistema (confirmado por Federico). */
export const USUARIOS = [
  { usuario: "federico", nombre: "Federico Barba", rol: "Dueño y ventas" },
  { usuario: "claudia", nombre: "Claudia", rol: "Ventas e ingresos" },
  { usuario: "roxana", nombre: "Roxana", rol: "Entregas" },
] as const;
