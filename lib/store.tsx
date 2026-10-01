"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  Cliente,
  DB,
  Direccion,
  Proveedor,
  Ingreso,
  Movimiento,
  Producto,
  Remito,
  RemitoLinea,
  Usuario,
} from "./types";
import { emailDe, supabase } from "./supabase";

/**
 * La capa de datos del sistema. Las pantallas siguen viendo la misma forma que
 * cuando esto era una demo en localStorage: `db.productos`, `db.remitos`, etc.
 * Lo que cambio es de donde salen y a donde van.
 *
 * Las operaciones que mueven stock NO se arman acá: se llaman por RPC a las
 * funciones de la base (emitir_remito, anular_remito, ajustar_stock), porque
 * tienen que ser atomicas. Ver supabase/migrations/0002_operaciones.sql.
 */
type Store = {
  db: DB;
  usuario: Usuario | null;
  cargando: boolean;
  /** Si la carga falló, esto tiene el aviso y los datos de pantalla son viejos. */
  errorCarga: string | null;
  /** Los avisos de abajo a la derecha: lo que se guardó y lo que no. */
  avisos: Aviso[];
  cerrarAviso: (id: number) => void;
  /** El navegador dice que no hay internet. */
  sinConexion: boolean;

  entrar: (usuario: string, clave: string) => Promise<string | null>;
  salir: () => Promise<void>;
  recargar: () => Promise<void>;


  stock: (codigo: string) => number;
  aPedir: (codigo: string) => number;
  producto: (codigo: string) => Producto | undefined;
  cliente: (id: string) => Cliente | undefined;
  /** El historial se consulta a la base al abrirlo: no vive en memoria. */
  movimientosDe: (codigo: string) => Promise<Movimiento[]>;

  agregarProducto: (p: Producto) => Promise<boolean>;
  editarProducto: (id: string, cambios: Partial<Producto>) => Promise<boolean>;
  agregarCliente: (c: Omit<Cliente, "id">) => Promise<Cliente | null>;
  editarCliente: (id: string, cambios: Partial<Cliente>) => Promise<boolean>;
  guardarDireccion: (
    clienteId: string,
    d: Partial<Direccion> & { id?: string },
  ) => Promise<boolean>;
  borrarDireccion: (id: string) => Promise<boolean>;
  agregarProveedor: (p: Omit<Proveedor, "id">) => Promise<boolean>;
  editarProveedor: (id: string, cambios: Partial<Proveedor>) => Promise<boolean>;
  registrarIngreso: (
    datos: Omit<Ingreso, "id" | "fecha" | "usuario">,
  ) => Promise<boolean>;
  ajustarStock: (
    codigo: string,
    nuevasUnidades: number,
    nota: string,
    tipo?: "ajuste" | "rotura" | "vencimiento" | "inventario_inicial",
  ) => Promise<boolean>;
  emitirRemito: (datos: {
    clienteId: string;
    lineas: RemitoLinea[];
    ajustePct: number;
    notas: string;
  }) => Promise<Remito>;
  anularRemito: (id: string) => Promise<boolean>;
};

export type Aviso = { id: number; tipo: "ok" | "error"; texto: string };

const Ctx = createContext<Store | null>(null);

const DB_VACIA: DB = {
  productos: [],
  proveedores: [],
  clientes: [],
  remitos: [],
  ingresos: [],
  proximoRemito: 1,
};

/** Filas como vienen de Postgres, antes de pasarlas a la forma de la app. */
type FilaProducto = {
  id: string;
  codigo: string;
  nombre: string;
  bodega: string | null;
  seccion: string | null;
  presentacion: string | null;
  unidades_por_bulto: number;
  se_vende_suelto: boolean;
  precio_lista: string | number;
  precio_a_consultar: boolean;
  en_lista_actual: boolean;
  proveedor_id: string | null;
  activo: boolean;
};

type FilaProveedor = {
  id: string;
  nombre: string;
  razon_social: string | null;
  cuit: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
};

const num = (v: string | number | null | undefined) => Number(v ?? 0);

/**
 * Sin internet, supabase-js no devuelve un error de la base sino el de fetch
 * ("TypeError: Failed to fetch"), que no le dice nada a nadie. Y no es lo mismo
 * que no haya conexion (seguro no se guardo) que una respuesta que no llego (se
 * pudo haber guardado igual): en ese caso hay que mirar antes de repetirlo, o
 * el remito sale dos veces.
 */
function errorDeRed(contexto: string, error: unknown): string | null {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return `${contexto}: no hay conexión a internet. Volvé a intentar cuando vuelva.`;
  const texto = String((error as { message?: string })?.message ?? error);
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(texto))
    return "No llegó la respuesta del servidor: puede que se haya guardado o no. Fijate en la lista antes de repetirlo.";
  return null;
}

function mensajeDeError(contexto: string, error: unknown) {
  return (
    errorDeRed(contexto, error) ??
    `${contexto}: ${String((error as { message?: string })?.message ?? error)}`
  );
}

/** La base rechaza nombres y CUIT repetidos (0005, 0015): que se entienda por que. */
function errorDeProveedor(
  error: { code?: string; message: string },
  nombre: string,
) {
  const deRed = errorDeRed("No se pudo guardar el proveedor", error);
  if (deRed) return deRed;
  if (error.code === "23505")
    return error.message.includes("cuit")
      ? "Ya hay otro proveedor con ese CUIT."
      : `Ya existe un proveedor que se llama "${nombre}".`;
  if (error.code === "23514" && error.message.includes("cuit"))
    return "El CUIT no es válido: revisá los números.";
  return `No se pudo guardar el proveedor: ${error.message}`;
}

/**
 * Las partes que se pueden recargar por separado. Traerse todo despues de cada
 * operacion es comodo con datos de juguete y se vuelve insostenible con el
 * catalogo real: emitir un remito no cambia ni los 4.000 productos ni los
 * clientes, asi que no hay por que volver a bajarlos.
 */
type Parte =
  | "productos"
  | "clientes"
  | "proveedores"
  | "remitos"
  | "ingresos"
  | "stock"
  | "perfiles";

/**
 * Supabase devuelve como mucho 1.000 filas por consulta y NO avisa de que
 * recorto: con los 4.323 productos reales, la app mostraba mil y se comportaba
 * como si el resto no existiera. Un producto que no esta en la lista no se
 * puede poner en un remito, asi que esto no era lentitud, era catalogo perdido.
 *
 * Recibe una funcion que arma la consulta con el rango puesto, y la llama hasta
 * que una pagina vuelve incompleta. La consulta tiene que traer un orden TOTAL
 * (con desempate unico), o dos paginas pueden repetir una fila y saltearse otra.
 */
const PAGINA = 1000;

/** El navegador avisa cuando se corta y cuando vuelve internet. */
function suscribirConexion(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

async function porPaginas<T>(
  consulta: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[] | null; error: unknown }> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const pagina = await consulta(desde, desde + PAGINA - 1);
    if (pagina.error) return { data: null, error: pagina.error };
    const lote = pagina.data ?? [];
    filas.push(...lote);
    if (lote.length < PAGINA) return { data: filas, error: null };
  }
}

const TODAS: Parte[] = [
  "productos",
  "clientes",
  "proveedores",
  "remitos",
  "ingresos",
  "stock",
  "perfiles",
];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(DB_VACIA);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  /** Lo que se guardó y lo que no: los muestra <Avisos /> abajo a la derecha. */
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const enLinea = useSyncExternalStore(
    suscribirConexion,
    () => navigator.onLine,
    () => true,
  );
  const proximoAviso = useRef(1);

  const cerrarAviso = useCallback(
    (id: number) => setAvisos((as) => as.filter((a) => a.id !== id)),
    [],
  );
  /** Lo que salio bien se va solo; un error se queda hasta que lo cierren. */
  const notificar = useCallback(
    (tipo: Aviso["tipo"], texto: string) => {
      const id = proximoAviso.current++;
      // Mas de cuatro apilados ya tapan la pantalla: se van los mas viejos.
      setAvisos((as) => [...as.slice(-3), { id, tipo, texto }]);
      if (tipo === "ok") setTimeout(() => cerrarAviso(id), 4000);
    },
    [cerrarAviso],
  );
  /** Viene de las vistas de la base, que suman sobre todos los movimientos. */
  const [stockCalculado, setStockCalculado] = useState<{
    fisico: Map<string, number>;
    aPedir: Map<string, number>;
  }>({ fisico: new Map(), aPedir: new Map() });

  // Dos traducciones que hacen falta para mapear remitos, ingresos y
  // movimientos: id de producto -> codigo, y uuid de perfil -> nombre. Van en
  // refs porque una recarga parcial de remitos tiene que poder traducir esas
  // columnas sin volver a bajarse productos ni perfiles.
  const porIdProducto = useRef(new Map<string, string>());
  const nombrePorPerfil = useRef(new Map<string, string>());

  const cargar = useCallback(async (partes: Parte[] = TODAS) => {
    const pedido = new Set(partes);
    const pide = (p: Parte) => pedido.has(p);

    const [
      productos,
      clientes,
      remitos,
      ingresos,
      stockFisico,
      stockAPedir,
      perfiles,
      proveedores,
    ] = await Promise.all([
      pide("productos")
        ? porPaginas((desde, hasta) =>
            supabase
              .from("productos")
              .select("*")
              // El código desempata: sin un orden total, dos páginas pueden
              // repetir una fila y saltearse otra.
              .order("nombre")
              .order("codigo")
              .range(desde, hasta),
          )
        : null,
      pide("clientes")
        ? porPaginas((desde, hasta) =>
            supabase
              .from("clientes")
              .select("*, cliente_direcciones(*)")
              .order("nombre")
              .order("id")
              .range(desde, hasta),
          )
        : null,
      pide("remitos")
        ? supabase
            .from("remitos")
            .select("*, remito_lineas(*)")
            .order("creado_at", { ascending: false })
            .limit(500)
        : null,
      pide("ingresos")
        ? supabase
            .from("ingresos")
            .select("*, ingreso_lineas(*)")
            .order("creado_at", { ascending: false })
            .limit(500)
        : null,
      // La vista trae una fila por producto, tenga movimiento o no: con el
      // catálogo real serían 4.400 filas para leer un puñado de numeros. Los
      // que no aparecen valen cero, que es lo que ya devuelve `stock()`.
      pide("stock")
        ? porPaginas((desde, hasta) =>
            supabase
              .from("stock_fisico")
              .select("*")
              .neq("unidades", 0)
              .order("producto_id")
              .range(desde, hasta),
          )
        : null,
      pide("stock")
        ? porPaginas((desde, hasta) =>
            supabase
              .from("stock_a_pedir")
              .select("*")
              .neq("unidades", 0)
              .order("producto_id")
              .range(desde, hasta),
          )
        : null,
      pide("perfiles") ? supabase.from("perfiles").select("id, nombre") : null,
      pide("proveedores")
        ? supabase.from("proveedores").select("*").order("nombre")
        : null,
    ]);

    // Si la carga falla, NO se pisa lo que ya estaba: mostrar todo en cero
    // como si fuera un dato real es peor que no mostrar nada. En un sistema de
    // stock, un cero inventado se parece demasiado a un cero de verdad.
    const problema = [
      productos,
      clientes,
      remitos,
      ingresos,
      stockFisico,
      stockAPedir,
      perfiles,
      proveedores,
    ].find((r) => r?.error)?.error;
    if (problema) {
      setErrorCarga(
        "No se pudieron traer los datos. Revisá la conexión y volvé a intentar.",
      );
      return;
    }
    setErrorCarga(null);

    if (perfiles) {
      nombrePorPerfil.current = new Map(
        (perfiles.data ?? []).map((p) => [p.id as string, p.nombre as string]),
      );
    }
    const nombreDe = (id: string | null | undefined) =>
      (id ? nombrePorPerfil.current.get(id) : "") ?? "";

    if (productos) {
      porIdProducto.current = new Map(
        ((productos.data ?? []) as FilaProducto[]).map((p) => [p.id, p.codigo]),
      );
    }
    const codigoDe = (id: string) => porIdProducto.current.get(id) ?? "";

    // El stock lo suma Postgres sobre TODOS los movimientos. Calcularlo acá
    // sumando los que se trajeron daria un numero falso apenas el historial
    // pase del limite de la consulta.
    if (stockFisico && stockAPedir) {
      setStockCalculado({
        fisico: new Map(
          (stockFisico.data ?? []).map((f) => [
            codigoDe(f.producto_id),
            f.unidades as number,
          ]),
        ),
        aPedir: new Map(
          (stockAPedir.data ?? []).map((f) => [
            codigoDe(f.producto_id),
            f.unidades as number,
          ]),
        ),
      });
    }

    const parcial: Partial<DB> = {};

    if (productos) {
      parcial.productos = ((productos.data ?? []) as FilaProducto[]).map(
        (p) => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          bodega: p.bodega ?? "",
          seccion: p.seccion ?? "",
          presentacion: p.presentacion ?? "",
          unidadesPorBulto: p.unidades_por_bulto,
          seVendeSuelto: p.se_vende_suelto,
          precioLista: num(p.precio_lista),
          precioAConsultar: p.precio_a_consultar === true,
          enListaActual: p.en_lista_actual,
          proveedorId: p.proveedor_id ?? null,
          activo: p.activo,
        }),
      );
    }

    if (proveedores) {
      parcial.proveedores = ((proveedores.data ?? []) as FilaProveedor[]).map(
        (v) => ({
          id: v.id,
          nombre: v.nombre,
          razonSocial: v.razon_social ?? "",
          cuit: v.cuit ?? "",
          contacto: v.contacto ?? "",
          telefono: v.telefono ?? "",
          email: v.email ?? "",
          notas: v.notas ?? "",
          activo: v.activo,
        }),
      );
    }

    if (clientes) {
      parcial.clientes = (clientes.data ?? []).map((c) => {
        // Un cliente puede tener varias sucursales. La principal es la que sale
        // impresa en el remito mientras no se elija otra.
        const direcciones = (c.cliente_direcciones ?? []) as Array<{
          id: string;
          direccion: string;
          localidad: string | null;
          contacto: string | null;
          telefono: string | null;
          es_principal: boolean;
        }>;
        const principal =
          direcciones.find((d) => d.es_principal) ?? direcciones[0];
        return {
          id: c.id,
          numero: c.numero ?? undefined,
          nombre: c.nombre,
          razonSocial: c.razon_social ?? "",
          direccion: principal?.direccion ?? "",
          localidad: principal?.localidad ?? "",
          telefono: c.telefono ?? "",
          vendedor: c.vendedor ?? "",
          descuentoPct: num(c.descuento_pct),
          notas: c.notas ?? "",
          activo: c.activo,
          direcciones: direcciones.map((d) => ({
            id: d.id,
            direccion: d.direccion,
            localidad: d.localidad ?? "",
            contacto: d.contacto ?? "",
            telefono: d.telefono ?? "",
            esPrincipal: d.es_principal,
          })),
        };
      });
    }

    if (remitos) {
      parcial.remitos = (remitos.data ?? []).map((r) => ({
        id: r.id,
        numero: r.numero
          ? `R-${String(r.numero).padStart(4, "0")}`
          : "Borrador",
        clienteId: r.cliente_id,
        clienteDatos: r.cliente_datos ?? undefined,
        fecha: r.emitido_at ?? r.creado_at,
        ajustePct: num(r.ajuste_pct),
        descuentoPct: num(r.descuento_pct),
        estado: r.estado,
        usuario: nombreDe(r.usuario_id),
        anuladoPor: nombreDe(r.anulado_por) || undefined,
        notas: r.notas ?? "",
        anuladoAt: r.anulado_at ?? undefined,
        lineas: (r.remito_lineas ?? []).map((l: Record<string, unknown>) => ({
          productoCodigo: codigoDe(l.producto_id as string),
          bultos: l.cantidad_bultos as number,
          unidades: l.unidades_totales as number,
          precioUnitario: num(l.precio_unitario as string),
          entregado: l.entregado as boolean,
        })),
      }));
    }

    if (ingresos) {
      parcial.ingresos = (ingresos.data ?? []).map((i) => ({
        id: i.id,
        fecha: i.creado_at,
        bodega: i.bodega ?? "",
        nroRemitoProveedor: i.nro_remito_proveedor ?? "",
        usuario: nombreDe(i.usuario_id),
        lineas: (i.ingreso_lineas ?? []).map((l: Record<string, unknown>) => ({
          productoCodigo: codigoDe(l.producto_id as string),
          bultos: l.cantidad_bultos as number,
          unidades: l.unidades_totales as number,
        })),
      }));
    }

    setDb((antes) => ({ ...antes, ...parcial }));
  }, []);

  const cargarPerfil = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("perfiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) {
      setUsuario({
        usuario: data.id,
        nombre: data.nombre,
        rol: data.rol,
        esAdmin: data.es_admin === true,
      });
    }
  }, []);

  useEffect(() => {
    let vivo = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      if (data.session) {
        await cargarPerfil(data.session.user.id);
        await cargar();
      }
      setCargando(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "SIGNED_OUT") {
        setUsuario(null);
        setDb(DB_VACIA);
      } else if (sesion) {
        void cargarPerfil(sesion.user.id).then(() => cargar());
      }
    });

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [cargarPerfil, cargar]);

  // Lo que hace otra PC. Sin esto cada pantalla mostraba lo que habia al
  // entrar: un remito emitido en una PC no aparecia en las otras hasta
  // refrescar, y no se sabia si el pedido estaba cargado o no.
  //
  // El aviso de la base no se usa como dato, solo como "volve a pedir esta
  // parte". Emitir un remito dispara varios (el remito, sus lineas, cada
  // movimiento): se juntan un momento y se recarga una sola vez.
  const hayUsuario = usuario !== null;
  useEffect(() => {
    if (!hayUsuario) return;

    const pendientes = new Set<Parte>();
    let espera: ReturnType<typeof setTimeout> | undefined;
    const recargar = (partes: Parte[]) => {
      partes.forEach((p) => pendientes.add(p));
      clearTimeout(espera);
      espera = setTimeout(() => {
        const lote = [...pendientes];
        pendientes.clear();
        void cargar(lote);
      }, 400);
    };

    const QUE_RECARGA: Record<string, Parte[]> = {
      remitos: ["remitos", "stock"],
      remito_lineas: ["remitos", "stock"],
      ingresos: ["ingresos", "stock"],
      ingreso_lineas: ["ingresos", "stock"],
      movimientos: ["stock"],
      clientes: ["clientes"],
      cliente_direcciones: ["clientes"],
      productos: ["productos"],
      proveedores: ["proveedores"],
    };

    let canal = supabase.channel("cambios-del-equipo");
    for (const tabla of Object.keys(QUE_RECARGA)) {
      canal = canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabla },
        () => recargar(QUE_RECARGA[tabla]),
      );
    }
    // Mientras la conexion estuvo caida (PC suspendida, wifi que se corta) los
    // avisos se pierden: al volver a conectarse se trae todo de nuevo.
    let yaConecto = false;
    canal.subscribe((estado) => {
      if (estado !== "SUBSCRIBED") return;
      if (yaConecto) recargar(TODAS);
      yaConecto = true;
    });

    // Respaldo por si la reconexion no avisa: volver a la pestaña despues de
    // un rato fuera tambien trae todo.
    let ocultaDesde = 0;
    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        ocultaDesde = Date.now();
      } else if (ocultaDesde && Date.now() - ocultaDesde > 30_000) {
        recargar(TODAS);
      }
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    return () => {
      clearTimeout(espera);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      void supabase.removeChannel(canal);
    };
  }, [hayUsuario, cargar]);

  // Sin internet no se puede guardar nada, y es mejor saberlo antes de cargar
  // un remito entero que al tocar «Emitir». Al volver se trae todo, porque los
  // avisos de las otras PC no llegaron mientras tanto.
  const sinConexion = hayUsuario && !enLinea;
  useEffect(() => {
    if (!hayUsuario) return;
    const alVolver = () => {
      notificar("ok", "Volvió la conexión.");
      void cargar();
    };
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, [hayUsuario, cargar, notificar]);

  // Buscar por codigo con find() recorre la lista entera, y en un remito eso
  // pasa una vez por linea. Con 4.000 productos se nota; con un indice, no.
  const porCodigo = useMemo(
    () => new Map(db.productos.map((p) => [p.codigo, p])),
    [db.productos],
  );
  const porIdCliente = useMemo(
    () => new Map(db.clientes.map((c) => [c.id, c])),
    [db.clientes],
  );

  const idDe = useCallback(
    (codigo: string) => porCodigo.get(codigo)?.id ?? "",
    [porCodigo],
  );

  const valor = useMemo<Store>(() => {
    const fallo = (contexto: string, error: unknown) => {
      notificar("error", mensajeDeError(contexto, error));
      return false;
    };

    return {
      db,
      usuario,
      cargando,
      errorCarga,
      avisos,
      cerrarAviso,
      sinConexion,

      entrar: async (nombreUsuario, clave) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailDe(nombreUsuario),
          password: clave,
        });
        return error ? "Usuario o contraseña incorrectos." : null;
      },

      salir: async () => {
        await supabase.auth.signOut();
      },

      recargar: () => cargar(),

      stock: (codigo) => stockCalculado.fisico.get(codigo) ?? 0,
      aPedir: (codigo) => stockCalculado.aPedir.get(codigo) ?? 0,
      producto: (codigo) => porCodigo.get(codigo),
      cliente: (cid) => porIdCliente.get(cid),
      // El historial se pide al abrirlo y filtrado en la base. Antes salia de
      // los ultimos 5.000 movimientos traidos al entrar: el de un producto que
      // no se movio en meses salia vacio aunque tuviera movimientos.
      movimientosDe: async (codigo) => {
        const id = idDe(codigo);
        if (!id) return [];
        const { data, error } = await supabase
          .from("movimientos")
          .select("*")
          .eq("producto_id", id)
          .order("fecha", { ascending: false })
          .limit(200);
        if (error) {
          notificar("error", mensajeDeError("No se pudo traer el historial", error));
          return [];
        }
        return (data ?? []).map((m) => ({
          id: m.id,
          fecha: m.fecha,
          productoCodigo: codigo,
          tipo: m.tipo,
          unidades: m.unidades,
          usuario: nombrePorPerfil.current.get(m.usuario_id) ?? "",
          nota: m.nota ?? "",
          refId: m.remito_id ?? m.ingreso_id ?? m.devolucion_id ?? undefined,
        }));
      },

      agregarProducto: async (p) => {
        const { error } = await supabase.from("productos").insert({
          codigo: p.codigo,
          nombre: p.nombre,
          bodega: p.bodega,
          seccion: p.seccion,
          presentacion: p.presentacion,
          unidades_por_bulto: p.unidadesPorBulto,
          se_vende_suelto: p.seVendeSuelto ?? false,
          precio_lista: p.precioLista,
          en_lista_actual: p.enListaActual,
        });
        if (error) return fallo("No se pudo guardar el producto", error);
        notificar("ok", `Producto ${p.codigo} cargado.`);
        await cargar(["productos"]);
        return true;
      },

      agregarCliente: async (datos) => {
        const { data, error } = await supabase
          .from("clientes")
          .insert({
            nombre: datos.nombre,
            razon_social: datos.razonSocial?.trim() || null,
            telefono: datos.telefono,
            vendedor: datos.vendedor || null,
            descuento_pct: datos.descuentoPct ?? 0,
            notas: datos.notas,
          })
          .select()
          .single();
        if (error) {
          fallo("No se pudo guardar el cliente", error);
          return null;
        }

        if (datos.direccion) {
          const res = await supabase.from("cliente_direcciones").insert({
            cliente_id: data.id,
            direccion: datos.direccion,
            localidad: datos.localidad,
            es_principal: true,
          });
          // El cliente ya quedo creado: no se devuelve null, pero se avisa.
          if (res.error)
            fallo(
              `El cliente ${datos.nombre} se guardó sin la dirección`,
              res.error,
            );
          else notificar("ok", `Cliente ${datos.nombre} cargado.`);
        } else {
          notificar("ok", `Cliente ${datos.nombre} cargado.`);
        }

        await cargar(["clientes"]);
        return { ...datos, id: data.id, numero: data.numero };
      },

      editarProducto: async (id, cambios) => {
        const fila: Record<string, unknown> = {};
        if (cambios.codigo !== undefined) fila.codigo = cambios.codigo;
        if (cambios.nombre !== undefined) fila.nombre = cambios.nombre;
        if (cambios.bodega !== undefined) fila.bodega = cambios.bodega;
        if (cambios.seccion !== undefined) fila.seccion = cambios.seccion;
        if (cambios.presentacion !== undefined)
          fila.presentacion = cambios.presentacion;
        if (cambios.unidadesPorBulto !== undefined)
          fila.unidades_por_bulto = cambios.unidadesPorBulto;
        if (cambios.seVendeSuelto !== undefined)
          fila.se_vende_suelto = cambios.seVendeSuelto;
        if (cambios.precioLista !== undefined)
          fila.precio_lista = cambios.precioLista;
        if (cambios.enListaActual !== undefined)
          fila.en_lista_actual = cambios.enListaActual;
        if (cambios.proveedorId !== undefined)
          fila.proveedor_id = cambios.proveedorId || null;
        if (cambios.activo !== undefined) fila.activo = cambios.activo;

        const { error } = await supabase
          .from("productos")
          .update(fila)
          .eq("id", id);
        if (error) return fallo("No se pudo guardar el producto", error);
        notificar("ok", "Cambios del producto guardados.");
        await cargar(["productos", "stock"]);
        return true;
      },

      editarCliente: async (id, cambios) => {
        const fila: Record<string, unknown> = {};
        if (cambios.nombre !== undefined) fila.nombre = cambios.nombre;
        if (cambios.razonSocial !== undefined)
          fila.razon_social = cambios.razonSocial.trim() || null;
        if (cambios.telefono !== undefined) fila.telefono = cambios.telefono;
        if (cambios.vendedor !== undefined)
          fila.vendedor = cambios.vendedor || null;
        if (cambios.descuentoPct !== undefined)
          fila.descuento_pct = cambios.descuentoPct;
        if (cambios.notas !== undefined) fila.notas = cambios.notas;
        if (cambios.activo !== undefined) fila.activo = cambios.activo;

        const { error } = await supabase
          .from("clientes")
          .update(fila)
          .eq("id", id);
        if (error) return fallo("No se pudo guardar el cliente", error);
        notificar(
          "ok",
          cambios.activo === false
            ? "Cliente dado de baja."
            : "Cambios del cliente guardados.",
        );
        await cargar(["clientes"]);
        return true;
      },

      guardarDireccion: async (clienteId, d) => {
        const fila = {
          cliente_id: clienteId,
          direccion: d.direccion ?? "",
          localidad: d.localidad ?? "",
          contacto: d.contacto ?? "",
          telefono: d.telefono ?? "",
          es_principal: d.esPrincipal ?? false,
        };

        // Una sola principal por cliente: la nueva desplaza a la anterior.
        if (fila.es_principal) {
          const res = await supabase
            .from("cliente_direcciones")
            .update({ es_principal: false })
            .eq("cliente_id", clienteId);
          if (res.error)
            return fallo("No se pudo guardar la dirección", res.error);
        }

        const { error } = d.id
          ? await supabase
              .from("cliente_direcciones")
              .update(fila)
              .eq("id", d.id)
          : await supabase.from("cliente_direcciones").insert(fila);

        if (error) return fallo("No se pudo guardar la dirección", error);
        notificar("ok", "Dirección guardada.");
        await cargar(["clientes"]);
        return true;
      },

      borrarDireccion: async (id) => {
        const { error } = await supabase
          .from("cliente_direcciones")
          .delete()
          .eq("id", id);
        if (error) return fallo("No se pudo borrar la dirección", error);
        notificar("ok", "Dirección borrada.");
        await cargar(["clientes"]);
        return true;
      },

      agregarProveedor: async (p) => {
        const { error } = await supabase.from("proveedores").insert({
          nombre: p.nombre,
          razon_social: p.razonSocial.trim() || null,
          cuit: p.cuit.trim() || null,
          contacto: p.contacto || null,
          telefono: p.telefono || null,
          email: p.email || null,
          notas: p.notas,
        });
        if (error) {
          notificar("error", errorDeProveedor(error, p.nombre));
          return false;
        }
        notificar("ok", `Proveedor ${p.nombre} cargado.`);
        await cargar(["proveedores"]);
        return true;
      },

      editarProveedor: async (id, cambios) => {
        const fila: Record<string, unknown> = {};
        if (cambios.nombre !== undefined) fila.nombre = cambios.nombre;
        if (cambios.razonSocial !== undefined)
          fila.razon_social = cambios.razonSocial.trim() || null;
        if (cambios.cuit !== undefined) fila.cuit = cambios.cuit.trim() || null;
        if (cambios.contacto !== undefined)
          fila.contacto = cambios.contacto || null;
        if (cambios.telefono !== undefined)
          fila.telefono = cambios.telefono || null;
        if (cambios.email !== undefined) fila.email = cambios.email || null;
        if (cambios.notas !== undefined) fila.notas = cambios.notas;
        if (cambios.activo !== undefined) fila.activo = cambios.activo;

        const { error } = await supabase
          .from("proveedores")
          .update(fila)
          .eq("id", id);
        if (error) {
          notificar("error", errorDeProveedor(error, cambios.nombre ?? ""));
          return false;
        }
        notificar(
          "ok",
          cambios.activo === false
            ? "Proveedor dado de baja."
            : "Cambios del proveedor guardados.",
        );
        await cargar(["proveedores"]);
        return true;
      },

      registrarIngreso: async (datos) => {
        const { data, error } = await supabase
          .from("ingresos")
          .insert({
            bodega: datos.bodega,
            nro_remito_proveedor: datos.nroRemitoProveedor,
            // El autor lo completa la base (default auth.uid(), migración
            // 0008): mandarlo desde acá permitía forjar el uuid de otro.
          })
          .select()
          .single();
        if (error) return fallo("No se guardó el ingreso", error);

        // El trigger de la base genera los movimientos de stock.
        const lineas = datos.lineas.map((l) => {
          const p = porCodigo.get(l.productoCodigo);
          return {
            ingreso_id: data.id,
            producto_id: p?.id,
            cantidad_bultos: l.bultos,
            cantidad_unidades:
              l.unidades - l.bultos * (p?.unidadesPorBulto ?? 1),
            unidades_por_bulto: p?.unidadesPorBulto ?? 1,
          };
        });
        const res = await supabase.from("ingreso_lineas").insert(lineas);
        if (res.error) {
          // La cabecera ya existe sin lineas: no sumo nada al stock, pero
          // aparece en «Ingresos anteriores». Hay que cargarlo de nuevo.
          await cargar(["ingresos", "stock"]);
          return fallo(
            "El ingreso quedó vacío y no sumó stock, cargalo de nuevo",
            res.error,
          );
        }

        const unidades = datos.lineas.reduce((t, l) => t + l.unidades, 0);
        notificar(
          "ok",
          `Ingreso guardado: entraron ${unidades.toLocaleString("es-AR")} unidades al depósito.`,
        );
        await cargar(["ingresos", "stock"]);
        return true;
      },

      ajustarStock: async (codigo, nuevasUnidades, nota, tipo = "ajuste") => {
        const { error } = await supabase.rpc("ajustar_stock", {
          p_producto_id: idDe(codigo),
          p_unidades_contadas: nuevasUnidades,
          p_nota: nota,
          p_tipo: tipo,
        });
        if (error) return fallo("No se pudo ajustar el stock", error);
        notificar("ok", `Stock de ${codigo} ajustado.`);
        await cargar(["stock"]);
        return true;
      },

      emitirRemito: async (datos) => {
        const cli = porIdCliente.get(datos.clienteId);

        const { data: remito, error } = await supabase
          .from("remitos")
          .insert({
            cliente_id: datos.clienteId,
            ajuste_pct: datos.ajustePct,
            descuento_pct: cli?.descuentoPct ?? 0,
            notas: datos.notas,
            usuario_id: usuario?.usuario ?? null,
          })
          .select()
          .single();
        if (error) {
          const texto = mensajeDeError("No se emitió el remito", error);
          notificar("error", texto);
          throw new Error(texto);
        }

        const lineas = datos.lineas.map((l, i) => {
          const p = porCodigo.get(l.productoCodigo);
          return {
            remito_id: remito.id,
            producto_id: p?.id,
            cantidad_bultos: l.bultos,
            cantidad_unidades:
              l.unidades - l.bultos * (p?.unidadesPorBulto ?? 1),
            unidades_por_bulto: p?.unidadesPorBulto ?? 1,
            precio_unitario: l.precioUnitario,
            entregado: l.entregado,
            orden: i,
          };
        });
        const resLineas = await supabase.from("remito_lineas").insert(lineas);
        if (resLineas.error) {
          const texto = mensajeDeError("No se emitió el remito", resLineas.error);
          notificar("error", texto);
          throw new Error(texto);
        }

        // Recien acá deja de ser borrador: toma numero y descuenta stock.
        const { data: emitido, error: errorEmitir } = await supabase
          .rpc("emitir_remito", { p_remito_id: remito.id })
          .single();
        if (errorEmitir) {
          const texto = mensajeDeError("No se emitió el remito", errorEmitir);
          notificar("error", texto);
          throw new Error(texto);
        }

        await cargar(["remitos", "stock"]);

        const numero = (emitido as { numero: number }).numero;
        notificar("ok", `Remito R-${String(numero).padStart(4, "0")} emitido.`);
        return {
          ...datos,
          id: remito.id,
          numero: `R-${String(numero).padStart(4, "0")}`,
          fecha: new Date().toISOString(),
          estado: "emitido",
          usuario: usuario?.nombre ?? "",
        } as Remito;
      },

      anularRemito: async (rid) => {
        const { error } = await supabase.rpc("anular_remito", {
          p_remito_id: rid,
          p_motivo: "",
        });
        if (error) return fallo("No se pudo anular el remito", error);
        const numero = db.remitos.find((x) => x.id === rid)?.numero;
        notificar("ok", numero ? `Remito ${numero} anulado.` : "Remito anulado.");
        await cargar(["remitos", "stock"]);
        return true;
      },
    };
  }, [
    db,
    usuario,
    avisos,
    sinConexion,
    notificar,
    cerrarAviso,
    cargando,
    cargar,
    stockCalculado,
    errorCarga,
    idDe,
    porCodigo,
    porIdCliente,
  ]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore fuera del StoreProvider");
  return ctx;
}
