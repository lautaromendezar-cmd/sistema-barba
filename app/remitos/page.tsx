"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { money, fecha, totalRemito } from "@/lib/formato";
import { coincide, normalizar } from "@/lib/texto";
import { RemitoDoc } from "@/components/RemitoDoc";

export default function Remitos() {
  const { db, cliente, producto, anularRemito } = useStore();
  const [verId, setVerId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const remitos = useMemo(() => {
    const t = normalizar(q);
    return [...db.remitos]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .filter((r) => {
        if (!t) return true;
        const c = db.clientes.find((x) => x.id === r.clienteId);
        return coincide(r.numero, t) || (c ? coincide(c.nombre, t) : false);
      });
  }, [db.remitos, db.clientes, q]);

  /** Lo que se vendió y no salió del depósito, agrupado por bodega. */
  const pendientes = useMemo(() => {
    const porBodega = new Map<string, { nombre: string; unidades: number }[]>();
    for (const r of db.remitos) {
      if (r.estado === "anulado") continue;
      for (const l of r.lineas) {
        if (l.entregado) continue;
        const p = producto(l.productoCodigo);
        const bodega = p?.bodega ?? "Sin bodega";
        const lista = porBodega.get(bodega) ?? [];
        lista.push({
          nombre: `${p?.nombre ?? l.productoCodigo} · ${r.numero}`,
          unidades: l.unidades,
        });
        porBodega.set(bodega, lista);
      }
    }
    return [...porBodega.entries()];
  }, [db.remitos, producto]);

  const ver = verId ? db.remitos.find((r) => r.id === verId) : null;

  return (
    <div>
      <div className={ver ? "no-print" : ""}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="serif text-3xl font-semibold">Remitos</h1>
            <p className="mt-1 text-muted">
              Emitidos desde el sistema. Se anulan, nunca se borran.
            </p>
          </div>
          <Link
            href="/remitos/nuevo"
            className="rounded-md bg-wine px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wine-ink"
          >
            Nuevo remito
          </Link>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por número o cliente…"
          className="mt-6 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-wine sm:max-w-sm"
        />

        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
                <th className="px-4 py-2.5 font-semibold">Número</th>
                <th className="px-4 py-2.5 font-semibold">Fecha</th>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Emitió</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {remitos.map((r) => {
                const { total } = totalRemito(r.lineas, r.ajustePct);
                const anulado = r.estado === "anulado";
                return (
                  <tr
                    key={r.id}
                    className="border-b border-line last:border-0 hover:bg-paper"
                  >
                    <td className="tnum px-4 py-3 font-medium">
                      {r.numero}
                      {anulado && (
                        <span className="ml-2 rounded bg-wine-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-wine uppercase">
                          Anulado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {fecha(r.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      {cliente(r.clienteId)?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{r.usuario}</td>
                    <td
                      className={`tnum px-4 py-3 text-right ${anulado ? "text-faint line-through" : ""}`}
                    >
                      {money(total)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setVerId(r.id)}
                        className="rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-wine hover:text-wine"
                      >
                        Ver / imprimir
                      </button>
                      {!anulado && (
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `¿Anular el remito ${r.numero}? El stock entregado vuelve al depósito.`,
                              )
                            )
                              anularRemito(r.id);
                          }}
                          className="ml-1.5 rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-wine hover:text-wine"
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {remitos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No hay remitos que coincidan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h2 className="serif mt-10 mb-1 border-b border-line pb-2 text-xl font-semibold">
          Falta pedirle al proveedor
        </h2>
        <p className="mb-3 text-sm text-muted">
          Lo que se vendió de lista y todavía no está en el depósito.
        </p>

        {pendientes.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-muted">
            No hay nada pendiente.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {pendientes.map(([bodega, items]) => (
              <div
                key={bodega}
                className="rounded-lg border border-line bg-surface p-4"
              >
                <div className="font-medium">{bodega}</div>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>{it.nombre}</span>
                      <span className="tnum shrink-0">{it.unidades} u</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {ver && (
        <div className="print-area fixed inset-0 z-30 overflow-y-auto bg-black/40 p-4 py-8">
          <div className="mx-auto max-w-3xl">
            <div className="no-print mb-3 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition hover:bg-wine-ink"
              >
                Imprimir
              </button>
              <button
                onClick={() => setVerId(null)}
                className="rounded-md border border-line bg-surface px-4 py-2 text-sm transition hover:border-wine hover:text-wine"
              >
                Cerrar
              </button>
            </div>
            <div className="rounded-lg bg-white p-8 shadow-xl print:rounded-none print:p-0 print:shadow-none">
              <RemitoDoc remito={ver} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
