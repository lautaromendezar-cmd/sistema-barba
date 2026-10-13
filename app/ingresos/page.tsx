"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { fechaHora, enBultos } from "@/lib/formato";
import { BuscadorProducto } from "@/components/BuscadorProducto";
import { BuscadorProveedor } from "@/components/BuscadorProveedor";
import type { Ingreso } from "@/lib/types";

type Linea = { codigo: string; bultos: number };

const etiqueta =
  "mb-1 block text-xs font-semibold tracking-wide text-muted uppercase";
const campo =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink";

export default function Ingresos() {
  const { db, producto, registrarIngreso } = useStore();
  // Antes era texto libre: el 1-oct un ingreso de ROLLAND quedó guardado como
  // «ANDESMAR» (lo que se tipeó) y no habia forma de corregirlo. Ahora se
  // elige de la lista de proveedores y se sugiere solo con el primer producto.
  const [proveedorId, setProveedorId] = useState("");
  const [nro, setNro] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [guardando, setGuardando] = useState(false);

  const nombreProveedor = (id: string | null | undefined) =>
    db.proveedores.find((v) => v.id === id)?.nombre;

  const unidadesDe = (l: Linea) =>
    l.bultos * (producto(l.codigo)?.unidadesPorBulto ?? 1);

  // Los productos que, según su ficha, se le compran a otro proveedor.
  const deOtroProveedor = proveedorId
    ? lineas.filter((l) => {
        const p = producto(l.codigo);
        return p?.proveedorId && p.proveedorId !== proveedorId;
      })
    : [];

  // Antes decia «Ingreso guardado» y vaciaba el formulario sin esperar a la
  // base: sin internet se perdia lo cargado y el cartel mentia. Ahora el aviso
  // lo da el store cuando la base confirma, y si falla lo cargado queda.
  async function guardar() {
    if (lineas.length === 0 || guardando) return;
    setGuardando(true);
    const ok = await registrarIngreso({
      bodega: nombreProveedor(proveedorId) ?? "Sin especificar",
      proveedorId: proveedorId || null,
      nroRemitoProveedor: nro.trim(),
      lineas: lineas.map((l) => ({
        productoCodigo: l.codigo,
        bultos: l.bultos,
        unidades: unidadesDe(l),
      })),
    });
    setGuardando(false);
    if (!ok) return;
    setLineas([]);
    setProveedorId("");
    setNro("");
  }

  return (
    <div>
      <h1 className="titulo text-3xl font-semibold">Ingreso de mercadería</h1>
      <p className="mt-1 text-muted">
        Lo que entra al depósito. Es la contracara del remito: sin esto, el
        stock se va a negativo.
      </p>

      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={etiqueta}>Proveedor</label>
            <BuscadorProveedor valor={proveedorId} onElegir={setProveedorId} />
            <p className="mt-1 text-xs text-faint">
              Se completa solo con el primer producto. Si no está en la lista,
              se agrega en Proveedores.
            </p>
          </div>
          <div>
            <label className={etiqueta}>Nº de remito del proveedor</label>
            <input
              value={nro}
              onChange={(e) => setNro(e.target.value)}
              placeholder="0001-00042871"
              autoComplete="off"
              className={`tnum ${campo}`}
            />
          </div>
        </div>

        <div className="mt-5">
          <label className={etiqueta}>Agregar producto</label>
          <BuscadorProducto
            excluir={lineas.map((l) => l.codigo)}
            onElegir={(p) => {
              if (!proveedorId && p.proveedorId) setProveedorId(p.proveedorId);
              setLineas((prev) => [...prev, { codigo: p.codigo, bultos: 1 }]);
            }}
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
                const otro =
                  proveedorId && p?.proveedorId && p.proveedorId !== proveedorId
                    ? nombreProveedor(p.proveedorId)
                    : null;
                return (
                  <tr key={l.codigo} className="border-b border-line last:border-0">
                    <td className="py-2.5">
                      <div className="font-medium">{p?.nombre}</div>
                      <div className="text-xs text-faint">
                        {p?.codigo} · {p?.presentacion}
                      </div>
                      {otro && (
                        <div className="text-alerta mt-0.5 text-xs font-medium">
                          Según su ficha, este producto se le compra a {otro}.
                        </div>
                      )}
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
                        className="tnum w-20 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-ink"
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
                        className="px-1 text-faint hover:text-acento-ink"
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
            {deOtroProveedor.length > 0 && (
              <span className="text-alerta ml-2 font-medium">
                · revisá el proveedor
              </span>
            )}
          </span>
          <button
            onClick={guardar}
            disabled={lineas.length === 0 || guardando}
            className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-hover disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Guardar ingreso"}
          </button>
        </div>
      </div>

      <h2 className="titulo mt-10 mb-3 border-b border-line pb-2 text-xl font-semibold">
        Ingresos anteriores
      </h2>

      <div className="space-y-3">
        {db.ingresos.map((ing) => (
          <IngresoAnterior key={ing.id} ing={ing} />
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

/**
 * Un ingreso ya guardado. Se puede corregir el proveedor y el número, que son
 * datos de referencia; las cantidades no, porque ya sumaron stock: si se cargó
 * mal una cantidad, se corrige con un ajuste en Productos.
 */
function IngresoAnterior({ ing }: { ing: Ingreso }) {
  const { db, producto, editarIngreso } = useStore();
  const [editando, setEditando] = useState(false);
  const [proveedorId, setProveedorId] = useState(ing.proveedorId ?? "");
  const [nro, setNro] = useState(ing.nroRemitoProveedor);
  const [guardando, setGuardando] = useState(false);

  const nombre =
    db.proveedores.find((v) => v.id === ing.proveedorId)?.nombre ?? ing.bodega;

  async function guardar() {
    setGuardando(true);
    const ok = await editarIngreso(ing.id, {
      proveedorId: proveedorId || null,
      nroRemitoProveedor: nro,
    });
    setGuardando(false);
    if (ok) setEditando(false);
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      {editando ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className={etiqueta}>Proveedor</label>
            <BuscadorProveedor valor={proveedorId} onElegir={setProveedorId} />
          </div>
          <div className="w-48">
            <label className={etiqueta}>Nº de remito</label>
            <input
              value={nro}
              onChange={(e) => setNro(e.target.value)}
              autoComplete="off"
              className={`tnum ${campo}`}
            />
          </div>
          <button
            onClick={() => void guardar()}
            disabled={guardando}
            className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white transition hover:bg-ink-hover disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            onClick={() => {
              setProveedorId(ing.proveedorId ?? "");
              setNro(ing.nroRemitoProveedor);
              setEditando(false);
            }}
            className="rounded-md border border-line px-3 py-2 text-sm text-muted transition hover:border-ink hover:text-acento-ink"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-medium">
            {nombre}
            <span className="tnum ml-2 font-mono text-xs text-faint">
              {ing.nroRemitoProveedor || "s/nº"}
            </span>
          </div>
          <div className="flex items-baseline gap-3 text-xs text-muted">
            <span>
              {fechaHora(ing.fecha)} · cargó {ing.usuario}
            </span>
            <button
              onClick={() => setEditando(true)}
              className="rounded border border-line px-2 py-0.5 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
            >
              Corregir
            </button>
          </div>
        </div>
      )}
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
  );
}
