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
import { seedDB } from "./seed";

const CLAVE_DB = "barba.demo.db.v1";
const CLAVE_USUARIO = "barba.demo.usuario.v1";

type Store = {
  db: DB;
  usuario: Usuario | null;
  entrar: (u: Usuario) => void;
  salir: () => void;
  reiniciarDemo: () => void;

  stock: (codigo: string) => number;
  producto: (codigo: string) => Producto | undefined;
  cliente: (id: string) => Cliente | undefined;
  movimientosDe: (codigo: string) => Movimiento[];

  agregarProducto: (p: Producto) => void;
  agregarCliente: (c: Omit<Cliente, "id">) => Cliente;
  registrarIngreso: (
    datos: Omit<Ingreso, "id" | "fecha" | "usuario">,
  ) => Ingreso;
  ajustarStock: (codigo: string, nuevasUnidades: number, nota: string) => void;
  emitirRemito: (datos: {
    clienteId: string;
    lineas: RemitoLinea[];
    ajustePct: number;
    notas: string;
  }) => Remito;
  anularRemito: (id: string) => void;
};

const Ctx = createContext<Store | null>(null);

function ahora() {
  return new Date().toISOString();
}

function id() {
  return Math.random().toString(36).slice(2, 10);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  // Carga inicial (solo en el navegador).
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_DB);
      setDb(guardado ? (JSON.parse(guardado) as DB) : seedDB());
      const u = localStorage.getItem(CLAVE_USUARIO);
      if (u) setUsuario(JSON.parse(u) as Usuario);
    } catch {
      setDb(seedDB());
    }
  }, []);

  useEffect(() => {
    if (db) localStorage.setItem(CLAVE_DB, JSON.stringify(db));
  }, [db]);

  const entrar = useCallback((u: Usuario) => {
    setUsuario(u);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(u));
  }, []);

  const salir = useCallback(() => {
    setUsuario(null);
    localStorage.removeItem(CLAVE_USUARIO);
  }, []);

  const reiniciarDemo = useCallback(() => {
    const fresca = seedDB();
    setDb(fresca);
    localStorage.setItem(CLAVE_DB, JSON.stringify(fresca));
  }, []);

  /** Stock = suma de movimientos. No hay columna que se pise. */
  const stockPorCodigo = useMemo(() => {
    const m = new Map<string, number>();
    if (!db) return m;
    for (const p of db.productos) m.set(p.codigo, 0);
    for (const mov of db.movimientos) {
      m.set(mov.productoCodigo, (m.get(mov.productoCodigo) ?? 0) + mov.unidades);
    }
    return m;
  }, [db]);

  const valor = useMemo<Store | null>(() => {
    if (!db) return null;
    const nombreUsuario = usuario?.nombre ?? "Sistema";

    return {
      db,
      usuario,
      entrar,
      salir,
      reiniciarDemo,

      stock: (codigo) => stockPorCodigo.get(codigo) ?? 0,
      producto: (codigo) => db.productos.find((p) => p.codigo === codigo),
      cliente: (cid) => db.clientes.find((c) => c.id === cid),
      movimientosDe: (codigo) =>
        db.movimientos
          .filter((m) => m.productoCodigo === codigo)
          .sort((a, b) => b.fecha.localeCompare(a.fecha)),

      agregarProducto: (p) =>
        setDb((prev) =>
          prev ? { ...prev, productos: [...prev.productos, p] } : prev,
        ),

      agregarCliente: (datos) => {
        const nuevo: Cliente = { ...datos, id: id() };
        setDb((prev) =>
          prev ? { ...prev, clientes: [...prev.clientes, nuevo] } : prev,
        );
        return nuevo;
      },

      registrarIngreso: (datos) => {
        const ingreso: Ingreso = {
          ...datos,
          id: id(),
          fecha: ahora(),
          usuario: nombreUsuario,
        };
        const movs: Movimiento[] = ingreso.lineas.map((l) => ({
          id: id(),
          fecha: ingreso.fecha,
          productoCodigo: l.productoCodigo,
          tipo: "ingreso",
          unidades: l.unidades,
          usuario: nombreUsuario,
          nota: `Ingreso ${ingreso.nroRemitoProveedor || "s/nº"} · ${ingreso.bodega}`,
          refId: ingreso.id,
        }));
        setDb((prev) =>
          prev
            ? {
                ...prev,
                ingresos: [ingreso, ...prev.ingresos],
                movimientos: [...prev.movimientos, ...movs],
              }
            : prev,
        );
        return ingreso;
      },

      ajustarStock: (codigo, nuevasUnidades, nota) => {
        const actual = stockPorCodigo.get(codigo) ?? 0;
        const delta = nuevasUnidades - actual;
        if (delta === 0) return;
        const mov: Movimiento = {
          id: id(),
          fecha: ahora(),
          productoCodigo: codigo,
          tipo: "ajuste",
          unidades: delta,
          usuario: nombreUsuario,
          nota: nota || "Ajuste manual",
        };
        setDb((prev) =>
          prev ? { ...prev, movimientos: [...prev.movimientos, mov] } : prev,
        );
      },

      emitirRemito: (datos) => {
        const numero = `R-${String(db.proximoRemito).padStart(4, "0")}`;
        const remito: Remito = {
          id: id(),
          numero,
          clienteId: datos.clienteId,
          fecha: ahora(),
          ajustePct: datos.ajustePct,
          lineas: datos.lineas,
          estado: "emitido",
          usuario: nombreUsuario,
          notas: datos.notas,
        };
        // Solo lo ENTREGADO descuenta stock. Lo pendiente no genera movimiento.
        const movs: Movimiento[] = remito.lineas
          .filter((l) => l.entregado)
          .map((l) => ({
            id: id(),
            fecha: remito.fecha,
            productoCodigo: l.productoCodigo,
            tipo: "egreso" as const,
            unidades: -l.unidades,
            usuario: nombreUsuario,
            nota: `Remito ${numero}`,
            refId: remito.id,
          }));
        setDb((prev) =>
          prev
            ? {
                ...prev,
                remitos: [remito, ...prev.remitos],
                movimientos: [...prev.movimientos, ...movs],
                proximoRemito: prev.proximoRemito + 1,
              }
            : prev,
        );
        return remito;
      },

      /** No se borra: se anula y se devuelve el stock con movimientos nuevos. */
      anularRemito: (rid) => {
        setDb((prev) => {
          if (!prev) return prev;
          const rem = prev.remitos.find((r) => r.id === rid);
          if (!rem || rem.estado === "anulado") return prev;
          const devoluciones: Movimiento[] = rem.lineas
            .filter((l) => l.entregado)
            .map((l) => ({
              id: id(),
              fecha: ahora(),
              productoCodigo: l.productoCodigo,
              tipo: "ajuste" as const,
              unidades: l.unidades,
              usuario: nombreUsuario,
              nota: `Anulación del remito ${rem.numero}`,
              refId: rem.id,
            }));
          return {
            ...prev,
            movimientos: [...prev.movimientos, ...devoluciones],
            remitos: prev.remitos.map((r) =>
              r.id === rid
                ? {
                    ...r,
                    estado: "anulado" as const,
                    anuladoPor: nombreUsuario,
                    anuladoAt: ahora(),
                  }
                : r,
            ),
          };
        });
      },
    };
  }, [db, usuario, entrar, salir, reiniciarDemo, stockPorCodigo]);

  if (!valor) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Cargando…
      </div>
    );
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore fuera del StoreProvider");
  return ctx;
}
