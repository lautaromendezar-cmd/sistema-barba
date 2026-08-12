"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { money, enBultos, pct, totalRemito } from "@/lib/formato";
import { BuscadorProducto } from "@/components/BuscadorProducto";
import { RemitoDoc } from "@/components/RemitoDoc";
import type { Remito, RemitoLinea } from "@/lib/types";

type Fila = {
  codigo: string;
  bultos: number;
  precioUnitario: number;
  entregado: boolean;
};

export default function NuevoRemito() {
  const { db, producto, stock, emitirRemito, agregarCliente } = useStore();
  const [clienteId, setClienteId] = useState("");
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [ajustePct, setAjustePct] = useState(0);
  const [notas, setNotas] = useState("");
  const [emitido, setEmitido] = useState<Remito | null>(null);

  const unidadesDe = (f: Fila) =>
    f.bultos * (producto(f.codigo)?.unidadesPorBulto ?? 1);

  const lineas: RemitoLinea[] = filas.map((f) => ({
    productoCodigo: f.codigo,
    bultos: f.bultos,
    unidades: unidadesDe(f),
    precioUnitario: f.precioUnitario,
    entregado: f.entregado,
  }));

  const { subtotal, ajuste, total } = totalRemito(lineas, ajustePct);
  const puedeEmitir = clienteId !== "" && filas.length > 0;

  function emitir() {
    if (!puedeEmitir) return;
    const r = emitirRemito({ clienteId, lineas, ajustePct, notas });
    setEmitido(r);
  }

  function empezarOtro() {
    setEmitido(null);
    setFilas([]);
    setClienteId("");
    setAjustePct(0);
    setNotas("");
  }

  if (emitido) {
    return (
      <div className="print-area">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="serif text-2xl font-semibold">
              Remito {emitido.numero} emitido
            </h1>
            <p className="mt-1 text-sm text-muted">
              El stock de lo entregado ya quedó descontado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-md bg-wine px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wine-ink"
            >
              Imprimir
            </button>
            <button
              onClick={empezarOtro}
              className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm transition hover:border-wine hover:text-wine"
            >
              Hacer otro
            </button>
            <Link
              href="/remitos"
              className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm transition hover:border-wine hover:text-wine"
            >
              Ver todos
            </Link>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <RemitoDoc remito={emitido} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="serif text-3xl font-semibold">Nuevo remito</h1>
      <p className="mt-1 text-muted">
        Lo que se entrega descuenta stock. Lo que queda pendiente, no.
      </p>

      {/* Cliente */}
      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
              Cliente
            </label>
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-wine"
            >
              <option value="">Elegir cliente…</option>
              {db.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} — {c.localidad}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setNuevoCliente((v) => !v)}
            className="rounded-md border border-line px-3 py-2 text-sm text-muted transition hover:border-wine hover:text-wine"
          >
            {nuevoCliente ? "Cancelar" : "+ Cliente nuevo"}
          </button>
        </div>

        {nuevoCliente && (
          <FormCliente
            onGuardar={(datos) => {
              const c = agregarCliente(datos);
              setClienteId(c.id);
              setNuevoCliente(false);
            }}
          />
        )}
      </div>

      {/* Productos */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-5">
        <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
          Agregar producto
        </label>
        <BuscadorProducto
          excluir={filas.map((f) => f.codigo)}
          onElegir={(p) =>
            setFilas((prev) => [
              ...prev,
              {
                codigo: p.codigo,
                bultos: 1,
                precioUnitario: p.precioLista,
                entregado: true,
              },
            ])
          }
        />

        {filas.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
                  <th className="py-2 font-semibold">Producto</th>
                  <th className="w-24 py-2 text-right font-semibold">Bultos</th>
                  <th className="w-20 py-2 text-right font-semibold">Unid.</th>
                  <th className="w-32 py-2 text-right font-semibold">
                    Precio unidad
                  </th>
                  <th className="w-32 py-2 text-right font-semibold">Importe</th>
                  <th className="w-28 py-2 text-center font-semibold">Entrega</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const p = producto(f.codigo);
                  const u = unidadesDe(f);
                  const disponible = stock(f.codigo);
                  const faltan = f.entregado && u > disponible;
                  return (
                    <tr key={f.codigo} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-2">
                        <div className="font-medium">{p?.nombre}</div>
                        <div className="text-xs text-faint">
                          {f.codigo} · {p?.presentacion} · en depósito{" "}
                          {enBultos(disponible, p?.unidadesPorBulto ?? 1)}
                        </div>
                        {faltan && (
                          <div className="mt-0.5 text-xs font-medium text-alerta">
                            Faltan {u - disponible} unidades. Se puede emitir
                            igual: el stock queda en negativo.
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <input
                          type="number"
                          min={1}
                          value={f.bultos}
                          onChange={(e) =>
                            setFilas((prev) =>
                              prev.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      bultos: Math.max(
                                        1,
                                        Number(e.target.value) || 1,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="tnum w-20 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-wine"
                        />
                      </td>
                      <td className="tnum py-2.5 text-right text-muted">{u}</td>
                      <td className="py-2.5 text-right">
                        <input
                          type="number"
                          value={f.precioUnitario}
                          onChange={(e) =>
                            setFilas((prev) =>
                              prev.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      precioUnitario: Number(e.target.value) || 0,
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="tnum w-28 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-wine"
                        />
                        {p && f.precioUnitario !== p.precioLista && (
                          <div className="mt-0.5 text-[11px] text-wine">
                            lista {money(p.precioLista)}
                          </div>
                        )}
                      </td>
                      <td className="tnum py-2.5 text-right">
                        {money(u * f.precioUnitario)}
                      </td>
                      <td className="py-2.5 text-center">
                        <button
                          onClick={() =>
                            setFilas((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, entregado: !x.entregado } : x,
                              ),
                            )
                          }
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                            f.entregado
                              ? "bg-wine-soft text-wine"
                              : "bg-amber-soft text-amber-ink"
                          }`}
                        >
                          {f.entregado ? "Se entrega" : "Pendiente"}
                        </button>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() =>
                            setFilas((prev) => prev.filter((_, j) => j !== i))
                          }
                          className="px-1 text-faint hover:text-wine"
                          aria-label="Quitar"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cierre */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-line bg-surface p-5">
          <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            Ajuste sobre el total
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAjustePct(0)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                ajustePct === 0
                  ? "border-wine bg-wine-soft text-wine"
                  : "border-line text-muted hover:border-wine"
              }`}
            >
              Contado · 0%
            </button>
            <button
              onClick={() => setAjustePct(10.5)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                ajustePct === 10.5
                  ? "border-wine bg-wine-soft text-wine"
                  : "border-line text-muted hover:border-wine"
              }`}
            >
              Transferencia · +10,5%
            </button>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.5"
                value={ajustePct}
                onChange={(e) => setAjustePct(Number(e.target.value) || 0)}
                className="tnum w-24 rounded-md border border-line px-2 py-1.5 text-right text-sm outline-none focus:border-wine"
              />
              <span className="text-sm text-muted">%</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Positivo recarga, negativo descuenta. Queda registrado quién lo
            aplicó.
          </p>

          <label className="mt-5 mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            Observaciones
          </label>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-wine"
          />
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <table className="tnum w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-muted">Subtotal</td>
                <td className="py-1 text-right">{money(subtotal)}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted">
                  Ajuste {ajustePct > 0 ? "+" : ""}
                  {pct(ajustePct)}
                </td>
                <td className="py-1 text-right">{money(ajuste)}</td>
              </tr>
              <tr className="border-t border-line">
                <td className="serif py-2 text-lg font-semibold">Total</td>
                <td className="serif py-2 text-right text-lg font-semibold">
                  {money(total)}
                </td>
              </tr>
            </tbody>
          </table>

          <button
            onClick={emitir}
            disabled={!puedeEmitir}
            className="mt-4 w-full rounded-md bg-wine px-4 py-3 text-sm font-medium text-white transition hover:bg-wine-ink disabled:opacity-40"
          >
            Emitir remito
          </button>
          {!puedeEmitir && (
            <p className="mt-2 text-center text-xs text-muted">
              Falta elegir cliente y cargar al menos un producto.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FormCliente({
  onGuardar,
}: {
  onGuardar: (c: {
    nombre: string;
    direccion: string;
    localidad: string;
    telefono: string;
    notas: string;
  }) => void;
}) {
  const [f, setF] = useState({
    nombre: "",
    direccion: "",
    localidad: "",
    telefono: "",
    notas: "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.nombre.trim()) return;
        onGuardar(f);
      }}
      className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2"
    >
      {(
        [
          ["nombre", "Nombre / razón social", "Vinoteca La Cava"],
          ["direccion", "Dirección de entrega", "Av. Rivadavia 12340"],
          ["localidad", "Localidad", "Ramos Mejía"],
          ["telefono", "Teléfono", "11 4567-8901"],
          ["notas", "Notas de entrega", "Recibe hasta las 13 h"],
        ] as const
      ).map(([k, label, ph]) => (
        <div key={k} className={k === "notas" ? "sm:col-span-2" : ""}>
          <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            {label}
          </label>
          <input
            value={f[k]}
            onChange={(e) => setF({ ...f, [k]: e.target.value })}
            placeholder={ph}
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-wine"
          />
        </div>
      ))}
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition hover:bg-wine-ink"
        >
          Guardar y usar
        </button>
      </div>
    </form>
  );
}
