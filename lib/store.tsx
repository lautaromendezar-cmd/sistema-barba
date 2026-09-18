"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Cliente,
  DB,
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

  entrar: (usuario: string, clave: string) => Promise<string | null>;
  salir: () => Promise<void>;
  recargar: () => Promise<void>;

  stock: (codigo: string) => number;
  aPedir: (codigo: string) => number;
  producto: (codigo: string) => Producto | undefined;
  cliente: (id: string) => Cliente | undefined;
  movimientosDe: (codigo: string) => Movimiento[];

  agregarProducto: (p: Producto) => Promise<void>;
  agregarCliente: (c: Omit<Cliente, "id">) => Promise<Cliente>;
  registrarIngreso: (
    datos: Omit<Ingreso, "id" | "fecha" | "usuario">,
  ) => Promise<void>;
  ajustarStock: (
    codigo: string,
    nuevasUnidades: number,
    nota: string,
    tipo?: "ajuste" | "rotura" | "vencimiento" | "inventario_inicial",
  ) => Promise<void>;
  emitirRemito: (datos: {
    clienteId: string;
    lineas: RemitoLinea[];
    ajustePct: number;
    notas: string;
  }) => Promise<Remito>;
  anularRemito: (id: string) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

const DB_VACIA: DB = {
  productos: [],
  clientes: [],
  movimientos: [],
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
  en_lista_actual: boolean;
};

const num = (v: string | number | null | undefined) => Number(v ?? 0);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(DB_VACIA);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargarTodo = useCallback(async () => {
    const [productos, clientes, movimientos, remitos, ingresos] =
      await Promise.all([
        supabase.from("productos").select("*").order("nombre"),
        supabase
          .from("clientes")
          .select("*, cliente_direcciones(*)")
          .order("nombre"),
        supabase
          .from("movimientos")
          .select("*")
          .order("fecha", { ascending: false })
          .limit(5000),
        supabase
          .from("remitos")
          .select("*, remito_lineas(*)")
          .order("creado_at", { ascending: false })
          .limit(500),
        supabase
          .from("ingresos")
          .select("*, ingreso_lineas(*)")
          .order("creado_at", { ascending: false })
          .limit(500),
      ]);

    const filasProducto = (productos.data ?? []) as FilaProducto[];
    const porId = new Map(filasProducto.map((p) => [p.id, p.codigo]));

    setDb({
      productos: filasProducto.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        bodega: p.bodega ?? "",
        seccion: p.seccion ?? "",
        presentacion: p.presentacion ?? "",
        unidadesPorBulto: p.unidades_por_bulto,
        seVendeSuelto: p.se_vende_suelto,
        precioLista: num(p.precio_lista),
        enListaActual: p.en_lista_actual,
      })),

      clientes: (clientes.data ?? []).map((c) => {
        // Un cliente puede tener varias sucursales. La principal es la que sale
        // impresa en el remito mientras no se elija otra.
        const direcciones = (c.cliente_direcciones ?? []) as Array<{
          direccion: string;
          localidad: string | null;
          es_principal: boolean;
        }>;
        const principal =
          direcciones.find((d) => d.es_principal) ?? direcciones[0];
        return {
          id: c.id,
          nombre: c.nombre,
          direccion: principal?.direccion ?? "",
          localidad: principal?.localidad ?? "",
          telefono: c.telefono ?? "",
          vendedor: c.vendedor ?? "",
          descuentoPct: num(c.descuento_pct),
          notas: c.notas ?? "",
        };
      }),

      movimientos: (movimientos.data ?? []).map((m) => ({
        id: m.id,
        fecha: m.fecha,
        productoCodigo: porId.get(m.producto_id) ?? "",
        tipo: m.tipo,
        unidades: m.unidades,
        usuario: "",
        nota: m.nota ?? "",
        refId: m.remito_id ?? m.ingreso_id ?? m.devolucion_id ?? undefined,
      })),

      remitos: (remitos.data ?? []).map((r) => ({
        id: r.id,
        numero: r.numero
          ? `R-${String(r.numero).padStart(4, "0")}`
          : "Borrador",
        clienteId: r.cliente_id,
        fecha: r.emitido_at ?? r.creado_at,
        ajustePct: num(r.ajuste_pct),
        descuentoPct: num(r.descuento_pct),
        estado: r.estado,
        usuario: "",
        notas: r.notas ?? "",
        anuladoAt: r.anulado_at ?? undefined,
        lineas: (r.remito_lineas ?? []).map((l: Record<string, unknown>) => ({
          productoCodigo: porId.get(l.producto_id as string) ?? "",
          bultos: l.cantidad_bultos as number,
          unidades: l.unidades_totales as number,
          precioUnitario: num(l.precio_unitario as string),
          entregado: l.entregado as boolean,
        })),
      })),

      ingresos: (ingresos.data ?? []).map((i) => ({
        id: i.id,
        fecha: i.creado_at,
        bodega: i.bodega ?? "",
        nroRemitoProveedor: i.nro_remito_proveedor ?? "",
        usuario: "",
        lineas: (i.ingreso_lineas ?? []).map((l: Record<string, unknown>) => ({
          productoCodigo: porId.get(l.producto_id as string) ?? "",
          bultos: l.cantidad_bultos as number,
          unidades: l.unidades_totales as number,
        })),
      })),

      proximoRemito: 1,
    });
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
      } as Usuario);
    }
  }, []);

  useEffect(() => {
    let vivo = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      if (data.session) {
        await cargarPerfil(data.session.user.id);
        await cargarTodo();
      }
      setCargando(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "SIGNED_OUT") {
        setUsuario(null);
        setDb(DB_VACIA);
      } else if (sesion) {
        void cargarPerfil(sesion.user.id).then(() => cargarTodo());
      }
    });

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [cargarPerfil, cargarTodo]);

  /** Stock = suma de movimientos. No hay columna que se pise. */
  const stockPorCodigo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of db.productos) m.set(p.codigo, 0);
    for (const mov of db.movimientos) {
      m.set(
        mov.productoCodigo,
        (m.get(mov.productoCodigo) ?? 0) + mov.unidades,
      );
    }
    return m;
  }, [db]);

  /** Lo vendido que todavia no se entrego: se le pide al proveedor. */
  const aPedirPorCodigo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of db.remitos) {
      if (r.estado !== "emitido") continue;
      for (const l of r.lineas) {
        if (l.entregado) continue;
        m.set(l.productoCodigo, (m.get(l.productoCodigo) ?? 0) + l.unidades);
      }
    }
    return m;
  }, [db]);

  const idDe = useCallback(
    (codigo: string) => db.productos.find((p) => p.codigo === codigo)?.id ?? "",
    [db.productos],
  );

  const valor = useMemo<Store>(() => {
    return {
      db,
      usuario,
      cargando,

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

      recargar: cargarTodo,

      stock: (codigo) => stockPorCodigo.get(codigo) ?? 0,
      aPedir: (codigo) => aPedirPorCodigo.get(codigo) ?? 0,
      producto: (codigo) => db.productos.find((p) => p.codigo === codigo),
      cliente: (cid) => db.clientes.find((c) => c.id === cid),
      movimientosDe: (codigo) =>
        db.movimientos
          .filter((m) => m.productoCodigo === codigo)
          .sort((a, b) => b.fecha.localeCompare(a.fecha)),

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
        if (error) throw new Error(error.message);
        await cargarTodo();
      },

      agregarCliente: async (datos) => {
        const { data, error } = await supabase
          .from("clientes")
          .insert({
            nombre: datos.nombre,
            telefono: datos.telefono,
            vendedor: datos.vendedor || null,
            descuento_pct: datos.descuentoPct ?? 0,
            notas: datos.notas,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);

        if (datos.direccion) {
          await supabase.from("cliente_direcciones").insert({
            cliente_id: data.id,
            direccion: datos.direccion,
            localidad: datos.localidad,
            es_principal: true,
          });
        }

        await cargarTodo();
        return { ...datos, id: data.id };
      },

      registrarIngreso: async (datos) => {
        const { data, error } = await supabase
          .from("ingresos")
          .insert({
            bodega: datos.bodega,
            nro_remito_proveedor: datos.nroRemitoProveedor,
            usuario_id: usuario?.usuario ?? null,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);

        // El trigger de la base genera los movimientos de stock.
        const lineas = datos.lineas.map((l) => {
          const p = db.productos.find((x) => x.codigo === l.productoCodigo);
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
        if (res.error) throw new Error(res.error.message);

        await cargarTodo();
      },

      ajustarStock: async (codigo, nuevasUnidades, nota, tipo = "ajuste") => {
        const { error } = await supabase.rpc("ajustar_stock", {
          p_producto_id: idDe(codigo),
          p_unidades_contadas: nuevasUnidades,
          p_nota: nota,
          p_tipo: tipo,
        });
        if (error) throw new Error(error.message);
        await cargarTodo();
      },

      emitirRemito: async (datos) => {
        const cli = db.clientes.find((c) => c.id === datos.clienteId);

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
        if (error) throw new Error(error.message);

        const lineas = datos.lineas.map((l, i) => {
          const p = db.productos.find((x) => x.codigo === l.productoCodigo);
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
        if (resLineas.error) throw new Error(resLineas.error.message);

        // Recien acá deja de ser borrador: toma numero y descuenta stock.
        const { data: emitido, error: errorEmitir } = await supabase
          .rpc("emitir_remito", { p_remito_id: remito.id })
          .single();
        if (errorEmitir) throw new Error(errorEmitir.message);

        await cargarTodo();

        const numero = (emitido as { numero: number }).numero;
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
        if (error) throw new Error(error.message);
        await cargarTodo();
      },
    };
  }, [
    db,
    usuario,
    cargando,
    cargarTodo,
    stockPorCodigo,
    aPedirPorCodigo,
    idDe,
  ]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore fuera del StoreProvider");
  return ctx;
}
