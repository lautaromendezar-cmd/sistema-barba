"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { money, enBultos, fechaHora } from "@/lib/formato";
import type { Movimiento, Producto } from "@/lib/types";
import { coincide, normalizar } from "@/lib/texto";
import { Modal } from "@/components/Modal";

export default function Productos() {
  const { db, stock, agregarProducto, ajustarStock } = useStore();
  const [busqueda, setBusqueda] = useState("");
  const [seccion, setSeccion] = useState("todas");
  const [alta, setAlta] = useState(false);
  const [ajustando, setAjustando] = useState<Producto | null>(null);
  const [detalle, setDetalle] = useState<Producto | null>(null);

  const secciones = useMemo(
    () => [...new Set(db.productos.map((p) => p.seccion))].sort(),
    [db.productos],
  );

  const [editandoProd, setEditandoProd] = useState<Producto | null>(null);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    return db.productos.filter((p) => {
      if (seccion !== "todas" && p.seccion !== seccion) return false;
      if (!q) return true;
      return (
        coincide(p.nombre, q) ||
        coincide(p.codigo, q) ||
        coincide(p.bodega, q)
      );
    });
  }, [db.productos, busqueda, seccion]);

  // Pintar 4.300 filas son 53.000 nodos en el DOM: la pantalla tarda 3,5 s en
  // abrir y 5 s en reaccionar a cada letra del buscador. Se muestran las
  // primeras y el resto aparece afinando la busqueda, que es lo que uno hace
  // igual cuando el catalogo es asi de grande.
  const A_LA_VISTA = 200;
  const visibles = filtrados.slice(0, A_LA_VISTA);
  const ocultos = filtrados.length - visibles.length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo text-3xl font-semibold">Productos y stock</h1>
          <p className="mt-1 text-muted">
            {db.productos.length} productos · el stock se calcula sumando los
            movimientos, no se escribe a mano.
          </p>
        </div>
        <button
          onClick={() => setAlta((v) => !v)}
          className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-hover"
        >
          {alta ? "Cancelar" : "Nuevo producto"}
        </button>
      </div>

      {alta && (
        <FormAlta
          onGuardar={(p) => {
            agregarProducto(p);
            setAlta(false);
          }}
        />
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código, producto o bodega…"
          className="min-w-[240px] flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <select
          value={seccion}
          onChange={(e) => setSeccion(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        >
          <option value="todas">Todas las secciones</option>
          {secciones.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
              <th className="px-4 py-2.5 font-semibold">Código</th>
              <th className="px-4 py-2.5 font-semibold">Producto</th>
              <th className="px-4 py-2.5 text-right font-semibold">
                Precio unidad
              </th>
              <th className="px-4 py-2.5 text-right font-semibold">
                Precio bulto
              </th>
              <th className="px-4 py-2.5 text-right font-semibold">Stock</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const s = stock(p.codigo);
              return (
                <tr
                  key={p.codigo}
                  className="border-b border-line last:border-0 hover:bg-canvas"
                >
                  <td className="tnum px-4 py-3 font-mono text-xs text-muted">
                    {p.codigo}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.nombre}</div>
                    <div className="text-xs text-faint">
                      {p.bodega} · {p.presentacion}
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-right">
                    {p.precioAConsultar ? (
                      <span className="bg-acento-soft text-acento-ink rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        a consultar
                      </span>
                    ) : (
                      money(p.precioLista)
                    )}
                  </td>
                  <td className="tnum px-4 py-3 text-right text-muted">
                    {p.precioAConsultar || p.unidadesPorBulto <= 1
                      ? "—"
                      : money(p.precioLista * p.unidadesPorBulto)}
                  </td>
                  <td
                    className={`tnum px-4 py-3 text-right ${
                      s <= 0 ? "font-semibold text-alerta" : ""
                    }`}
                  >
                    {enBultos(s, p.unidadesPorBulto)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setDetalle(p)}
                      className="rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
                    >
                      Movimientos
                    </button>
                    <button
                      onClick={() => setAjustando(p)}
                      className="ml-1.5 rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
                    >
                      Ajustar
                    </button>
                    <button
                      onClick={() => setEditandoProd(p)}
                      className="ml-1.5 rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Ningún producto coincide con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {ocultos > 0 && (
          <p className="border-line text-muted border-t px-4 py-3 text-center text-sm">
            Se muestran {A_LA_VISTA} de {filtrados.length}. Escribí en el
            buscador para llegar al que falta.
          </p>
        )}
      </div>

      <p className="mt-3 text-xs text-muted">
        El stock en <span className="font-semibold text-alerta">rojo</span> es
        cero o negativo. No bloquea la venta: es la lista de lo que falta cargar.
      </p>

      {editandoProd && (
        <Modal
          titulo={`Editar · ${editandoProd.nombre}`}
          onCerrar={() => setEditandoProd(null)}
        >
          <FormEditarProducto
            producto={editandoProd}
            onCerrar={() => setEditandoProd(null)}
          />
        </Modal>
      )}

      {ajustando && (
        <Modal titulo={`Ajustar stock · ${ajustando.nombre}`} onCerrar={() => setAjustando(null)}>
          <FormAjuste
            actual={stock(ajustando.codigo)}
            unidadesPorBulto={ajustando.unidadesPorBulto}
            onGuardar={(nuevo, nota) => {
              ajustarStock(ajustando.codigo, nuevo, nota);
              setAjustando(null);
            }}
          />
        </Modal>
      )}

      {detalle && (
        <Modal
          titulo={`Movimientos · ${detalle.nombre}`}
          onCerrar={() => setDetalle(null)}
        >
          <Historial key={detalle.codigo} codigo={detalle.codigo} />
        </Modal>
      )}
    </div>
  );
}

/**
 * El historial de un producto se pide a la base al abrirlo, no sale de lo que
 * la app tenga cargado: son la tabla que mas crece y no hace falta tenerla en
 * memoria para mostrar una tabla que se abre de a un producto por vez.
 */
function Historial({ codigo }: { codigo: string }) {
  const { movimientosDe } = useStore();
  const [movs, setMovs] = useState<Movimiento[] | null>(null);

  useEffect(() => {
    let vivo = true;
    movimientosDe(codigo).then((m) => {
      if (vivo) setMovs(m);
    });
    return () => {
      vivo = false;
    };
  }, [codigo, movimientosDe]);

  if (movs === null) {
    return <p className="py-6 text-center text-muted">Buscando los movimientos...</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
          <th className="py-2 font-semibold">Fecha</th>
          <th className="py-2 font-semibold">Detalle</th>
          <th className="py-2 font-semibold">Usuario</th>
          <th className="py-2 text-right font-semibold">Unidades</th>
        </tr>
      </thead>
      <tbody>
        {movs.map((m) => (
          <tr key={m.id} className="border-b border-line last:border-0">
            <td className="py-2 whitespace-nowrap text-muted">
              {fechaHora(m.fecha)}
            </td>
            <td className="py-2">{m.nota}</td>
            <td className="py-2 text-muted">{m.usuario}</td>
            <td
              className={`tnum py-2 text-right font-medium ${
                m.unidades < 0 ? "text-acento-ink" : ""
              }`}
            >
              {m.unidades > 0 ? `+${m.unidades}` : m.unidades}
            </td>
          </tr>
        ))}
        {movs.length === 0 && (
          <tr>
            <td colSpan={4} className="py-6 text-center text-muted">
              Sin movimientos: este producto nunca entró ni salió.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function FormAjuste({
  actual,
  unidadesPorBulto,
  onGuardar,
}: {
  actual: number;
  unidadesPorBulto: number;
  onGuardar: (nuevo: number, nota: string) => void;
}) {
  const [valor, setValor] = useState(String(actual));
  const [nota, setNota] = useState("");
  const nuevo = Number(valor) || 0;
  const delta = nuevo - actual;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar(nuevo, nota);
      }}
    >
      <p className="mb-4 text-sm text-muted">
        Stock actual: <b className="text-ink">{actual} unidades</b>
        {unidadesPorBulto > 1 && ` (bultos de ${unidadesPorBulto})`}. Poné lo
        que hay de verdad en el depósito.
      </p>

      <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
        Unidades contadas
      </label>
      <input
        autoFocus
        type="number"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="tnum mb-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-ink"
      />
      <p className="mb-4 text-xs text-muted">
        {delta === 0
          ? "Sin cambios."
          : `Se registra un ajuste de ${delta > 0 ? "+" : ""}${delta} unidades.`}
      </p>

      <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
        Motivo
      </label>
      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Rotura, conteo, error de carga…"
        className="mb-5 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-ink"
      />

      <button
        type="submit"
        disabled={delta === 0}
        className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-hover disabled:opacity-40"
      >
        Guardar ajuste
      </button>
    </form>
  );
}

function FormAlta({ onGuardar }: { onGuardar: (p: Producto) => void }) {
  const [f, setF] = useState({
    codigo: "",
    nombre: "",
    bodega: "",
    seccion: "Media Gama",
    presentacion: "",
    unidadesPorBulto: "6",
    precioLista: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({
          codigo: f.codigo.trim().toUpperCase(),
          nombre: f.nombre.trim(),
          bodega: f.bodega.trim(),
          seccion: f.seccion,
          presentacion: f.presentacion.trim(),
          unidadesPorBulto: Math.max(1, Number(f.unidadesPorBulto) || 1),
          precioLista: Number(f.precioLista) || 0,
          enListaActual: true,
        });
      }}
      className="mt-5 rounded-lg border border-line bg-surface p-5"
    >
      <h2 className="titulo mb-4 text-lg font-semibold">Nuevo producto</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo label="Código" required value={f.codigo} onChange={set("codigo")} placeholder="W1234" />
        <Campo label="Producto" required value={f.nombre} onChange={set("nombre")} placeholder="Alfa Crux Malbec" />
        <Campo label="Bodega / marca" value={f.bodega} onChange={set("bodega")} placeholder="Alfa Crux" />
        <div>
          <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            Sección
          </label>
          <select
            value={f.seccion}
            onChange={(e) => setF({ ...f, seccion: e.target.value })}
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
          >
            {[
              "Media Gama",
              "Alta Gama",
              "Espumantes e Importados",
              "Whisky, Gin y Aperitivos",
              "Aceites, Pastas y Aceto",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <Campo label="Presentación" value={f.presentacion} onChange={set("presentacion")} placeholder="Caja x 6 bot x 750cc" />
        <Campo label="Unidades por bulto" type="number" value={f.unidadesPorBulto} onChange={set("unidadesPorBulto")} />
        <Campo label="Precio por unidad" type="number" required value={f.precioLista} onChange={set("precioLista")} placeholder="11934" />
      </div>
      <button
        type="submit"
        className="mt-5 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-hover"
      >
        Guardar producto
      </button>
      <p className="mt-3 text-xs text-muted">
        El producto nace con stock cero: recién tiene existencias cuando se carga
        un ingreso de mercadería.
      </p>
    </form>
  );
}

function Campo({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </label>
      <input
        {...props}
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </div>
  );
}

/**
 * Edición de un producto ya cargado. Cambiar el precio acá deja el nuevo valor
 * para los remitos que se emitan de ahora en más: los ya emitidos guardan el
 * precio con el que salieron y no se tocan.
 */
function FormEditarProducto({
  producto,
  onCerrar,
}: {
  producto: Producto;
  onCerrar: () => void;
}) {
  const { db, editarProducto } = useStore();
  const [f, setF] = useState({
    codigo: producto.codigo,
    nombre: producto.nombre,
    bodega: producto.bodega,
    seccion: producto.seccion,
    presentacion: producto.presentacion,
    unidadesPorBulto: producto.unidadesPorBulto,
    precioLista: producto.precioLista,
    seVendeSuelto: producto.seVendeSuelto ?? false,
    enListaActual: producto.enListaActual,
    proveedorId: producto.proveedorId ?? "",
  });
  const [guardando, setGuardando] = useState(false);

  const campo =
    "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink";
  const etiqueta =
    "mb-1 block text-xs font-semibold tracking-wide text-muted uppercase";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (guardando) return;
        setGuardando(true);
        await editarProducto(producto.id!, f);
        setGuardando(false);
        onCerrar();
      }}
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-[140px_1fr]">
        <div>
          <label className={etiqueta}>Código</label>
          <input
            value={f.codigo}
            onChange={(e) => setF({ ...f, codigo: e.target.value })}
            className={`${campo} tnum font-mono`}
          />
        </div>
        <div>
          <label className={etiqueta}>Nombre</label>
          <input
            autoFocus
            value={f.nombre}
            onChange={(e) => setF({ ...f, nombre: e.target.value })}
            className={campo}
          />
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>Bodega (quién lo produce)</label>
          <input
            value={f.bodega}
            onChange={(e) => setF({ ...f, bodega: e.target.value })}
            className={campo}
          />
        </div>
        <div>
          <label className={etiqueta}>Proveedor (a quién se le compra)</label>
          <select
            value={f.proveedorId}
            onChange={(e) => setF({ ...f, proveedorId: e.target.value })}
            className={campo}
          >
            <option value="">Sin asignar</option>
            {db.proveedores
              .filter((v) => v.activo)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>Sección</label>
          <input
            value={f.seccion}
            onChange={(e) => setF({ ...f, seccion: e.target.value })}
            className={campo}
          />
        </div>
        <div>
          <label className={etiqueta}>Presentación</label>
          <input
            value={f.presentacion}
            onChange={(e) => setF({ ...f, presentacion: e.target.value })}
            className={campo}
            placeholder="Caja x 6 botellas"
          />
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>Unidades por bulto</label>
          <input
            type="number"
            min={1}
            value={f.unidadesPorBulto}
            onChange={(e) =>
              setF({ ...f, unidadesPorBulto: Number(e.target.value) })
            }
            className={`${campo} tnum`}
          />
        </div>
        <div>
          <label className={etiqueta}>Precio por unidad</label>
          <input
            type="number"
            step="0.01"
            value={f.precioLista}
            onChange={(e) => setF({ ...f, precioLista: Number(e.target.value) })}
            className={`${campo} tnum`}
          />
          <p className="mt-1 text-xs text-faint">
            El bulto sale {money(f.precioLista * f.unidadesPorBulto)}.
          </p>
        </div>
      </div>

      <div className="mb-5 space-y-2 text-sm text-muted">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.seVendeSuelto}
            onChange={(e) => setF({ ...f, seVendeSuelto: e.target.checked })}
          />
          Se vende también por unidad suelta
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.enListaActual}
            onChange={(e) => setF({ ...f, enListaActual: e.target.checked })}
          />
          Está en la lista de precios vigente
        </label>
      </div>

      <button
        type="submit"
        disabled={guardando || !f.nombre.trim() || !f.codigo.trim()}
        className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-hover disabled:opacity-40"
      >
        {guardando ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
