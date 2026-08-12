"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { fechaHora, enBultos } from "@/lib/formato";
import { BuscadorProducto } from "@/components/BuscadorProducto";

type Linea = { codigo: string; bultos: number };

export default function Ingresos() {
  const { db, producto, registrarIngreso } = useStore();
  const [bodega, setBodega] = useState("");
  const [nro, setNro] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [ok, setOk] = useState("");

  const unidadesDe = (l: Linea) =>
    l.bultos * (producto(l.codigo)?.unidadesPorBulto ?? 1);

  function guardar() {
    if (lineas.length === 0) return;
    registrarIngreso({
      bodega: bodega.trim() || "Sin especificar",
      nroRemitoProveedor: nro.trim(),
      lineas: lineas.map((l) => ({
        productoCodigo: l.codigo,
        bultos: l.bultos,
        unidades: unidadesDe(l),
      })),
    });
    const total = lineas.reduce((a, l) => a + unidadesDe(l), 0);
    setOk(`Ingreso guardado: entraron ${total} unidades al depósito.`);
    setLineas([]);
    setBodega("");
    setNro("");
    setTimeout(() => setOk(""), 6000);
  }

  return (
    <div>
      <h1 className="serif text-3xl font-semibold">Ingreso de mercadería</h1>
      <p className="mt-1 text-muted">
        Lo que entra al depósito. Es la contracara del remito: sin esto, el
        stock se va a negativo.
      </p>

      {ok && (
        <div className="mt-5 rounded-md border border-line bg-amber-soft px-4 py-3 text-sm text-amber-ink">
          {ok}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
              Bodega / proveedor
            </label>
            <input
              value={bodega}
              onChange={(e) => setBodega(e.target.value)}
              placeholder="Alfa Crux"
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-wine"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
              Nº de remito del proveedor
            </label>
            <input
              value={nro}
              onChange={(e) => setNro(e.target.value)}
              placeholder="0001-00042871"
              className="tnum w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-wine"
            />
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            Agregar producto
          </label>
          <BuscadorProducto
            excluir={lineas.map((l) => l.codigo)}
            onElegir={(p) =>
              setLineas((prev) => [...prev, { codigo: p.codigo, bultos: 1 }])
            }
          />
        </div>

        {lineas.length > 0 && (
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
                <th className="py-2 font-semibold">Producto</th>
                <th className="w-28 py-2 text-right font-semibold">Bultos</th>
                <th className="w-32 py-2 text-right font-semibold">Unidades</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const p = producto(l.codigo);
                return (
                  <tr key={l.codigo} className="border-b border-line last:border-0">
                    <td className="py-2.5">
                      <div className="font-medium">{p?.nombre}</div>
                      <div className="text-xs text-faint">
                        {p?.codigo} · {p?.presentacion}
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      <input
                        type="number"
                        min={1}
                        value={l.bultos}
                        onChange={(e) =>
                          setLineas((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? { ...x, bultos: Math.max(1, Number(e.target.value) || 1) }
                                : x,
                            ),
                          )
                        }
                        className="tnum w-20 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-wine"
                      />
                    </td>
                    <td className="tnum py-2.5 text-right text-muted">
                      {unidadesDe(l)} u
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() =>
                          setLineas((prev) => prev.filter((_, j) => j !== i))
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
        )}

        <div className="mt-5 flex items-center justify-between gap-4">
          <span className="text-sm text-muted">
            {lineas.length === 0
              ? "Buscá un producto para empezar."
              : `${lineas.length} producto(s) · ${lineas.reduce((a, l) => a + unidadesDe(l), 0)} unidades`}
          </span>
          <button
            onClick={guardar}
            disabled={lineas.length === 0}
            className="rounded-md bg-wine px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wine-ink disabled:opacity-40"
          >
            Guardar ingreso
          </button>
        </div>
      </div>

      <h2 className="serif mt-10 mb-3 border-b border-line pb-2 text-xl font-semibold">
        Ingresos anteriores
      </h2>

      <div className="space-y-3">
        {db.ingresos.map((ing) => (
          <div
            key={ing.id}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-medium">
                {ing.bodega}
                <span className="tnum ml-2 font-mono text-xs text-faint">
                  {ing.nroRemitoProveedor || "s/nº"}
                </span>
              </div>
              <div className="text-xs text-muted">
                {fechaHora(ing.fecha)} · cargó {ing.usuario}
              </div>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {ing.lineas.map((l) => {
                const p = producto(l.productoCodigo);
                return (
                  <li key={l.productoCodigo} className="flex justify-between gap-4">
                    <span>{p?.nombre ?? l.productoCodigo}</span>
                    <span className="tnum shrink-0 whitespace-nowrap">
                      +{enBultos(l.unidades, p?.unidadesPorBulto ?? 1)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {db.ingresos.length === 0 && (
          <p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-muted">
            Todavía no se cargó ningún ingreso.
          </p>
        )}
      </div>
    </div>
  );
}
