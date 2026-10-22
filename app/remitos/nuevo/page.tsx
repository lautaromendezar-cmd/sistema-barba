"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { BuscadorCliente } from "@/components/BuscadorCliente";
import { money, enBultos, pct, totalRemito } from "@/lib/formato";
import { BuscadorProducto } from "@/components/BuscadorProducto";
import { RemitoDoc } from "@/components/RemitoDoc";
import type { Remito, RemitoLinea } from "@/lib/types";

/**
 * Una fila del remito en armado. Las libres no son del catálogo (una botella
 * especial que se le da a un solo cliente): llevan descripción y cantidad a
 * mano, salen impresas y suman al total, pero no tocan el stock.
 */
type Fila = {
  /** Código del producto, o una clave propia en las libres. */
  codigo: string;
  libre?: boolean;
  descripcion?: string;
  bultos: number;
  /** Solo en las libres: en las demás sale de bultos × unidades por bulto. */
  unidades?: number;
  precioUnitario: number;
  entregado: boolean;
};

/** La nota que deja una corrección. Al corregir una corrección no se acumula. */
const NOTA_REEMPLAZO = /^Reemplaza al remito R-\d+\.\s*/;

export default function Pagina() {
  // useSearchParams pide un Suspense alrededor para poder generar la página.
  return (
    <Suspense>
      <SegunDireccion />
    </Suspense>
  );
}

/**
 * Pasar de «corregir R-0008» a «Nuevo remito» (el menú) no recarga la página:
 * sin la key, el formulario seguiría atado al R-0008 y emitir lo anularía.
 */
function SegunDireccion() {
  const corrigeId = useSearchParams().get("corrige");
  return <NuevoRemito key={corrigeId ?? "nuevo"} corrigeId={corrigeId} />;
}

function NuevoRemito({ corrigeId }: { corrigeId: string | null }) {
  const {
    db,
    producto,
    stock,
    emitirRemito,
    anularRemito,
    agregarCliente,
    traerRemito,
  } = useStore();
  const router = useRouter();

  const [clienteId, setClienteId] = useState("");
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [ajustePct, setAjustePct] = useState(0);
  const [notas, setNotas] = useState("");
  const [emitido, setEmitido] = useState<Remito | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState("");
  /** El remito que se está corrigiendo: se anula solo cuando sale el nuevo. */
  const [original, setOriginal] = useState<Remito | null>(null);
  const proximaLibre = useRef(1);
  const precargado = useRef<string | null>(null);

  // Corregir = armar uno nuevo con lo mismo. El emitido no se toca hasta que
  // el nuevo salga bien: si se abandona a mitad, el original sigue vigente.
  const hayCatalogo = db.productos.length > 0;
  useEffect(() => {
    if (!corrigeId || !hayCatalogo || precargado.current === corrigeId) return;
    precargado.current = corrigeId;
    void (async () => {
      const r = await traerRemito(corrigeId);
      if (!r) {
        setError("No se encontró el remito a corregir.");
        return;
      }
      if (r.estado !== "emitido") {
        setError(`El remito ${r.numero} está anulado: ya no se puede corregir.`);
        return;
      }
      setOriginal(r);
      setClienteId(r.clienteId);
      setAjustePct(r.ajustePct);
      setNotas(r.notas.replace(NOTA_REEMPLAZO, ""));
      setFilas(
        r.lineas.map((l) =>
          l.productoCodigo
            ? {
                codigo: l.productoCodigo,
                bultos: l.bultos,
                precioUnitario: l.precioUnitario,
                entregado: l.entregado,
              }
            : {
                codigo: `libre-${proximaLibre.current++}`,
                libre: true,
                descripcion: l.descripcion ?? "",
                bultos: 0,
                unidades: l.unidades,
                precioUnitario: l.precioUnitario,
                entregado: true,
              },
        ),
      );
    })();
  }, [corrigeId, hayCatalogo, traerRemito]);

  const unidadesDe = (f: Fila) =>
    f.libre
      ? (f.unidades ?? 0)
      : f.bultos * (producto(f.codigo)?.unidadesPorBulto ?? 1);

  /**
   * Al corregir, lo que entregó el original todavía figura descontado: vuelve
   * al depósito recién cuando se anula. Para avisar de faltantes se suma.
   */
  const disponibleDe = (codigo: string) =>
    stock(codigo) +
    (original?.lineas ?? [])
      .filter((l) => l.productoCodigo === codigo && l.entregado)
      .reduce((a, l) => a + l.unidades, 0);

  const lineas: RemitoLinea[] = filas.map((f) =>
    f.libre
      ? {
          productoCodigo: "",
          descripcion: f.descripcion ?? "",
          bultos: 0,
          unidades: f.unidades ?? 0,
          precioUnitario: f.precioUnitario,
          entregado: true,
        }
      : {
          productoCodigo: f.codigo,
          bultos: f.bultos,
          unidades: unidadesDe(f),
          precioUnitario: f.precioUnitario,
          entregado: f.entregado,
        },
  );

  const { subtotal, ajuste, total } = totalRemito(lineas, ajustePct);
  const libreSinDescripcion = filas.some(
    (f) => f.libre && !(f.descripcion ?? "").trim(),
  );
  const puedeEmitir =
    clienteId !== "" && filas.length > 0 && !libreSinDescripcion;

  const cambiar = (i: number, cambios: Partial<Fila>) =>
    setFilas((prev) => prev.map((x, j) => (j === i ? { ...x, ...cambios } : x)));

  async function emitir() {
    if (!puedeEmitir || emitiendo) return;
    setEmitiendo(true);
    setError("");
    try {
      const nuevo = await emitirRemito({
        clienteId,
        lineas,
        ajustePct,
        notas: original
          ? `Reemplaza al remito ${original.numero}.${notas.trim() ? ` ${notas.trim()}` : ""}`
          : notas,
      });
      setEmitido(nuevo);
      if (original) {
        const ok = await anularRemito(original.id, `Corregido por ${nuevo.numero}`);
        if (!ok)
          setError(
            `${nuevo.numero} salió bien, pero ${original.numero} no se pudo anular: anulalo a mano desde Remitos.`,
          );
        setOriginal(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo emitir el remito.");
    } finally {
      setEmitiendo(false);
    }
  }

  function empezarOtro() {
    setEmitido(null);
    setFilas([]);
    setClienteId("");
    setAjustePct(0);
    setNotas("");
    setError("");
    setOriginal(null);
    if (corrigeId) router.replace("/remitos/nuevo");
  }

  if (emitido) {
    return (
      <div className="print-area">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="titulo text-2xl font-semibold">
              Remito {emitido.numero} emitido
            </h1>
            <p className="mt-1 text-sm text-muted">
              El stock de lo entregado ya quedó descontado.
            </p>
            {error && <p className="text-alerta mt-1 text-sm font-medium">{error}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-hover"
            >
              Imprimir
            </button>
            <button
              onClick={empezarOtro}
              className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm transition hover:border-ink hover:text-acento-ink"
            >
              Hacer otro
            </button>
            <Link
              href="/remitos"
              className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm transition hover:border-ink hover:text-acento-ink"
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
      <h1 className="titulo text-3xl font-semibold">
        {corrigeId ? "Corregir remito" : "Nuevo remito"}
      </h1>
      <p className="mt-1 text-muted">
        Lo que se entrega descuenta stock. Lo que queda pendiente, no.
      </p>

      {original && (
        <div className="mt-4 rounded-lg border border-line bg-acento-soft px-4 py-3 text-sm">
          Estás corrigiendo el <strong>{original.numero}</strong>. Cambiá lo que
          haga falta y emitilo: sale con un número nuevo y el {original.numero}{" "}
          queda anulado solo, con el stock devuelto. Si salís sin emitir, el{" "}
          {original.numero} sigue como estaba.
        </div>
      )}
      {corrigeId && !original && error && (
        <p className="text-alerta mt-4 text-sm font-medium">{error}</p>
      )}

      {/* Cliente */}
      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
              Cliente
            </label>
            <BuscadorCliente valor={clienteId} onElegir={setClienteId} />
          </div>
          <button
            onClick={() => setNuevoCliente((v) => !v)}
            className="rounded-md border border-line px-3 py-2 text-sm text-muted transition hover:border-ink hover:text-acento-ink"
          >
            {nuevoCliente ? "Cancelar" : "+ Cliente nuevo"}
          </button>
        </div>

        {nuevoCliente && (
          <FormCliente
            onGuardar={async (datos) => {
              const c = await agregarCliente(datos);
              if (!c) return;
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
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-[240px] flex-1">
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
          </div>
          <button
            onClick={() =>
              setFilas((prev) => [
                ...prev,
                {
                  codigo: `libre-${proximaLibre.current++}`,
                  libre: true,
                  descripcion: "",
                  bultos: 0,
                  unidades: 1,
                  precioUnitario: 0,
                  entregado: true,
                },
              ])
            }
            title="Algo que no está en el catálogo: sale en el remito y suma al total, pero no toca el stock"
            className="rounded-md border border-line px-3 py-2.5 text-sm text-muted transition hover:border-ink hover:text-acento-ink"
          >
            + Producto fuera de lista
          </button>
        </div>

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
                  const u = unidadesDe(f);
                  const quitar = (
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() =>
                          setFilas((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="px-1 text-faint hover:text-acento-ink"
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </td>
                  );
                  const precio = (
                    <input
                      type="number"
                      value={f.precioUnitario}
                      onChange={(e) =>
                        cambiar(i, { precioUnitario: Number(e.target.value) || 0 })
                      }
                      // Si no, al hacer clic en el 0 y tipear queda "250000".
                      onFocus={(e) => e.target.select()}
                      className="tnum w-28 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-ink"
                    />
                  );

                  if (f.libre)
                    return (
                      <tr key={f.codigo} className="border-b border-line last:border-0">
                        <td className="py-2.5 pr-2">
                          <input
                            value={f.descripcion ?? ""}
                            onChange={(e) => cambiar(i, { descripcion: e.target.value })}
                            placeholder="Qué se entrega, ej.: Magnum Malbec 2015 grabada"
                            autoFocus={!f.descripcion}
                            className={`w-full rounded-md border px-2 py-1.5 outline-none focus:border-ink ${
                              (f.descripcion ?? "").trim() ? "border-line" : "border-alerta"
                            }`}
                          />
                          <div className="mt-0.5 text-xs text-faint">
                            Fuera de lista · no toca el stock
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-faint">—</td>
                        <td className="py-2.5 text-right">
                          <input
                            type="number"
                            min={1}
                            value={f.unidades ?? 1}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              cambiar(i, {
                                unidades: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="tnum w-16 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-ink"
                          />
                        </td>
                        <td className="py-2.5 text-right">{precio}</td>
                        <td className="tnum py-2.5 text-right">
                          {money(u * f.precioUnitario)}
                        </td>
                        <td className="py-2.5 text-center text-[11px] text-muted">
                          Se entrega
                        </td>
                        {quitar}
                      </tr>
                    );

                  const p = producto(f.codigo);
                  const disponible = disponibleDe(f.codigo);
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
                            cambiar(i, {
                              bultos: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="tnum w-20 rounded-md border border-line px-2 py-1.5 text-right outline-none focus:border-ink"
                        />
                      </td>
                      <td className="tnum py-2.5 text-right text-muted">{u}</td>
                      <td className="py-2.5 text-right">
                        {precio}
                        {p?.precioAConsultar && f.precioUnitario === 0 ? (
                          <div className="text-alerta mt-0.5 text-[11px] font-semibold">
                            falta el precio
                          </div>
                        ) : (
                          p &&
                          f.precioUnitario !== p.precioLista && (
                            <div className="text-acento-ink mt-0.5 text-[11px]">
                              lista {money(p.precioLista)}
                            </div>
                          )
                        )}
                      </td>
                      <td className="tnum py-2.5 text-right">
                        {money(u * f.precioUnitario)}
                      </td>
                      <td className="py-2.5 text-center">
                        <button
                          onClick={() => cambiar(i, { entregado: !f.entregado })}
                          className="rounded-full bg-acento-soft px-2.5 py-1 text-[11px] font-medium text-acento-ink transition"
                        >
                          {f.entregado ? "Se entrega" : "Pendiente"}
                        </button>
                      </td>
                      {quitar}
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
                  ? "border-ink bg-acento-soft text-acento-ink"
                  : "border-line text-muted hover:border-ink"
              }`}
            >
              Contado · 0%
            </button>
            <button
              onClick={() => setAjustePct(10.5)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                ajustePct === 10.5
                  ? "border-ink bg-acento-soft text-acento-ink"
                  : "border-line text-muted hover:border-ink"
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
                className="tnum w-24 rounded-md border border-line px-2 py-1.5 text-right text-sm outline-none focus:border-ink"
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
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-ink"
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
                <td className="titulo py-2 text-lg font-semibold">Total</td>
                <td className="titulo py-2 text-right text-lg font-semibold">
                  {money(total)}
                </td>
              </tr>
            </tbody>
          </table>

          <button
            onClick={() => void emitir()}
            disabled={!puedeEmitir || emitiendo}
            className="mt-4 w-full rounded-md bg-ink px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-hover disabled:opacity-40"
          >
            {emitiendo
              ? "Emitiendo…"
              : original
                ? `Emitir y anular ${original.numero}`
                : "Emitir remito"}
          </button>
          {error && (original || !corrigeId) && (
            <p className="text-alerta mt-2 text-center text-xs">{error}</p>
          )}
          {!puedeEmitir && (
            <p className="mt-2 text-center text-xs text-muted">
              {libreSinDescripcion
                ? "Falta escribir qué es el producto fuera de lista."
                : "Falta elegir cliente y cargar al menos un producto."}
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
          ["nombre", "Apodo (la razón social se carga en Clientes)", "Santi La Cava"],
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
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
      ))}
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-hover"
        >
          Guardar y usar
        </button>
      </div>
    </form>
  );
}
