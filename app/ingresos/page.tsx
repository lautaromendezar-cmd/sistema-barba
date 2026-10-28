"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { fechaHora, enBultos, money } from "@/lib/formato";
import { BuscadorProducto } from "@/components/BuscadorProducto";
import { BuscadorProveedor } from "@/components/BuscadorProveedor";
import { IngresoDoc } from "@/components/IngresoDoc";
import type { Ingreso } from "@/lib/types";

/**
 * Bultos cerrados más botellas sueltas: a veces llega una caja abierta o una sola.
 * El costo se escribe por caja, como viene en el remito del proveedor (0 = no se
 * cargó); en la base se guarda por unidad, como todo precio del sistema.
 */
type Linea = { codigo: string; bultos: number; sueltas: number; costoCaja: number };

/** Lo que se le pagó por caja → por unidad. Sin costo, null. */
const porUnidad = (costoCaja: number, unidadesPorBulto: number) =>
    costoCaja > 0 ? costoCaja / Math.max(1, unidadesPorBulto) : null;

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
  /** El recién guardado: se muestra para imprimir, como el remito emitido. */
  const [guardadoId, setGuardadoId] = useState<string | null>(null);
  const guardado = db.ingresos.find((i) => i.id === guardadoId);
  /** El de la lista que se abrió para ver o reimprimir. */
  const [verId, setVerId] = useState<string | null>(null);
  const ver = db.ingresos.find((i) => i.id === verId);

  const nombreProveedor = (id: string | null | undefined) =>
    db.proveedores.find((v) => v.id === id)?.nombre;

  const unidadesDe = (l: Linea) =>
    l.bultos * (producto(l.codigo)?.unidadesPorBulto ?? 1) + l.sueltas;

  const cambiar = (
    i: number,
    campo: "bultos" | "sueltas" | "costoCaja",
    valor: string,
  ) =>
    setLineas((prev) =>
      prev.map((x, j) =>
        j === i
          ? { ...x, [campo]: Math.max(0, Math.floor(Number(valor)) || 0) }
          : x,
      ),
    );

  const enCero = lineas.filter((l) => unidadesDe(l) === 0);

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
    if (lineas.length === 0 || enCero.length > 0 || guardando) return;
    setGuardando(true);
    const id = await registrarIngreso({
      bodega: nombreProveedor(proveedorId) ?? "Sin especificar",
      proveedorId: proveedorId || null,
      nroRemitoProveedor: nro.trim(),
      lineas: lineas.map((l) => ({
        productoCodigo: l.codigo,
        bultos: l.bultos,
        unidades: unidadesDe(l),
        costoUnitario: porUnidad(
          l.costoCaja,
          producto(l.codigo)?.unidadesPorBulto ?? 1,
        ),
      })),
    });
    setGuardando(false);
    if (!id) return;
    setLineas([]);
    setProveedorId("");
    setNro("");
    setGuardadoId(id);
  }

  if (guardado) {
    return (
      <div className="print-area">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="titulo text-2xl font-semibold">Ingreso guardado</h1>
            <p className="mt-1 text-sm text-muted">
              Lo que entró ya está sumado al stock.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-hover"
            >
              Imprimir
            </button>
            <button
              onClick={() => setGuardadoId(null)}
              className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm transition hover:border-ink hover:text-acento-ink"
            >
              Cargar otro
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <IngresoDoc ingreso={guardado} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={ver ? "no-print" : ""}>
        <h1 className="titulo text-3xl font-semibold">Ingreso de mercadería</h1>
        <p className="mt-1 text-muted">
          Lo que entra al depósito. Es la contracara del remito: sin esto, el
          stock se va a negativo.
        </p>

        <div className="mt-6 rounded-lg border border-line bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={etiqueta}>Proveedor</label>
              <BuscadorProveedor
                valor={proveedorId}
                onElegir={setProveedorId}
              />
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
                if (!proveedorId && p.proveedorId)
                  setProveedorId(p.proveedorId);
                setLineas((prev) => [
                  ...prev,
                  { codigo: p.codigo, bultos: 1, sueltas: 0, costoCaja: 0 },
                ]);
              }}
            />
          </div>

          {lineas.length > 0 && (
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
                  <th className="py-2 font-semibold">Producto</th>
                  <th className="w-24 py-2 text-right font-semibold">Bultos</th>
                  <th className="w-24 py-2 text-right font-semibold">
                    Sueltas
                  </th>
                  <th className="w-28 py-2 text-right font-semibold">
                    Unidades
                  </th>
                  <th
                    className="w-36 py-2 text-right font-semibold"
                    title="Lo que se le pagó al proveedor por caja. Si el remito no trae precio, se deja vacío y se completa después con «Corregir»."
                  >
                    Costo x caja
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const p = producto(l.codigo);
                  const otro =
                    proveedorId &&
                    p?.proveedorId &&
                    p.proveedorId !== proveedorId
                      ? nombreProveedor(p.proveedorId)
                      : null;
                  return (
                    <tr
                      key={l.codigo}
                      className="border-b border-line last:border-0"
                    >
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
                          min={0}
                          value={l.bultos}
                          onChange={(e) => cambiar(i, "bultos", e.target.value)}
                          aria-label="Bultos"
                          className="tnum w-20 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-ink"
                        />
                      </td>
                      <td className="py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          value={l.sueltas}
                          onChange={(e) =>
                            cambiar(i, "sueltas", e.target.value)
                          }
                          aria-label="Unidades sueltas"
                          className="tnum w-20 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-ink"
                        />
                      </td>
                      <td
                        className={`tnum py-2.5 text-right ${unidadesDe(l) === 0 ? "text-alerta font-medium" : "text-muted"}`}
                      >
                        {unidadesDe(l)} u
                      </td>
                      <td className="py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          value={l.costoCaja || ""}
                          onChange={(e) =>
                            cambiar(i, "costoCaja", e.target.value)
                          }
                          onFocus={(e) => e.target.select()}
                          placeholder={
                            (p?.unidadesPorBulto ?? 1) > 1 ? "opcional" : "x unidad"
                          }
                          aria-label="Costo por caja"
                          className="tnum w-28 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-ink"
                        />
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
              {enCero.length > 0 && (
                <span className="text-alerta ml-2 font-medium">
                  · hay productos en 0 unidades
                </span>
              )}
              {deOtroProveedor.length > 0 && (
                <span className="text-alerta ml-2 font-medium">
                  · revisá el proveedor
                </span>
              )}
            </span>
            <button
              onClick={guardar}
              disabled={lineas.length === 0 || enCero.length > 0 || guardando}
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
            <IngresoAnterior
              key={ing.id}
              ing={ing}
              onVer={() => setVerId(ing.id)}
            />
          ))}
          {db.ingresos.length === 0 && (
            <p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-muted">
              Todavía no se cargó ningún ingreso.
            </p>
          )}
        </div>
      </div>

      {ver && (
        <div className="print-area fixed inset-0 z-30 overflow-y-auto bg-black/40 p-4 py-8">
          <div className="mx-auto max-w-3xl">
            <div className="no-print mb-3 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-hover"
              >
                Imprimir
              </button>
              <button
                onClick={() => setVerId(null)}
                className="rounded-md border border-line bg-surface px-4 py-2 text-sm transition hover:border-ink hover:text-acento-ink"
              >
                Cerrar
              </button>
            </div>
            <div className="rounded-lg bg-white p-8 shadow-xl print:rounded-none print:p-0 print:shadow-none">
              <IngresoDoc ingreso={ver} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Un ingreso ya guardado. Se puede corregir el proveedor, el número y el costo
 * de cada línea (el remito del proveedor a veces llega sin precio), que son
 * datos de referencia; las cantidades no, porque ya sumaron stock: si se cargó
 * mal una cantidad, se corrige con un ajuste en Productos. Si estaba todo mal,
 * se anula (0019) y se carga de nuevo.
 */
function IngresoAnterior({ ing, onVer }: { ing: Ingreso; onVer: () => void }) {
  const { db, producto, editarIngreso, anularIngreso } = useStore();
  const anulado = Boolean(ing.anuladoAt);
  const [editando, setEditando] = useState(false);
  const [proveedorId, setProveedorId] = useState(ing.proveedorId ?? "");
  const [nro, setNro] = useState(ing.nroRemitoProveedor);
  const [guardando, setGuardando] = useState(false);
  /** Costo por caja de cada línea mientras se corrige, por id de línea. */
  const costosDeHoy = () =>
    Object.fromEntries(
      ing.lineas.map((l) => [
        l.id ?? "",
        l.costoUnitario
          ? Math.round(
              l.costoUnitario * (producto(l.productoCodigo)?.unidadesPorBulto ?? 1),
            )
          : 0,
      ]),
    );
  const [costos, setCostos] = useState<Record<string, number>>(costosDeHoy);

  const nombre =
    db.proveedores.find((v) => v.id === ing.proveedorId)?.nombre ?? ing.bodega;

  async function guardar() {
    setGuardando(true);
    const antes = costosDeHoy();
    const ok = await editarIngreso(ing.id, {
      proveedorId: proveedorId || null,
      nroRemitoProveedor: nro,
      costos: ing.lineas
        .filter((l) => l.id && costos[l.id] !== antes[l.id])
        .map((l) => ({
          lineaId: l.id!,
          costoUnitario: porUnidad(
            costos[l.id!] ?? 0,
            producto(l.productoCodigo)?.unidadesPorBulto ?? 1,
          ),
        })),
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
              setCostos(costosDeHoy());
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
            {anulado && (
              <span className="ml-2 rounded bg-acento-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-acento-ink uppercase">
                Anulado
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-3 text-xs text-muted">
            <span>
              {fechaHora(ing.fecha)} · cargó {ing.usuario}
              {anulado &&
                ` · anuló ${ing.anuladoPor} el ${fechaHora(ing.anuladoAt!)}`}
            </span>
            <button
              onClick={onVer}
              className="rounded border border-line px-2 py-0.5 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
            >
              Ver / imprimir
            </button>
            {!anulado && (
              <button
                onClick={() => {
                  setCostos(costosDeHoy());
                  setEditando(true);
                }}
                className="rounded border border-line px-2 py-0.5 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
              >
                Corregir
              </button>
            )}
            {!anulado && (
              <button
                onClick={() => {
                  if (
                    confirm(
                      `¿Anular el ingreso de ${nombre}? Lo que sumó sale del stock. No tiene vuelta atrás: si hacía falta, se carga uno nuevo.`,
                    )
                  )
                    void anularIngreso(ing.id);
                }}
                className="rounded border border-line px-2 py-0.5 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
              >
                Anular
              </button>
            )}
          </div>
        </div>
      )}
      <ul
        className={`mt-2 space-y-1 text-sm text-muted ${anulado ? "text-faint line-through" : ""}`}
      >
        {ing.lineas.map((l) => {
          const p = producto(l.productoCodigo);
          const porBulto = p?.unidadesPorBulto ?? 1;
          return (
            <li
              key={l.id ?? l.productoCodigo}
              className="flex items-center justify-between gap-4"
            >
              <span>{p?.nombre ?? l.productoCodigo}</span>
              <span className="tnum flex shrink-0 items-center gap-3 whitespace-nowrap">
                {editando && l.id ? (
                  <input
                    type="number"
                    min={0}
                    value={costos[l.id] || ""}
                    onChange={(e) =>
                      setCostos({
                        ...costos,
                        [l.id!]: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    onFocus={(e) => e.target.select()}
                    placeholder={porBulto > 1 ? "costo x caja" : "costo x unidad"}
                    aria-label="Costo por caja"
                    className="tnum w-32 rounded-md border border-line bg-white px-2 py-1 text-right text-sm no-underline outline-none focus:border-ink"
                  />
                ) : (
                  l.costoUnitario && (
                    <span className="text-xs text-faint">
                      {money(l.costoUnitario * porBulto)}
                      {porBulto > 1 ? "/caja" : "/u"}
                    </span>
                  )
                )}
                +{enBultos(l.unidades, porBulto)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
