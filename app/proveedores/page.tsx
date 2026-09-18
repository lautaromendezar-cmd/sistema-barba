"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Modal } from "@/components/Modal";
import type { Proveedor } from "@/lib/types";
import { normalizar } from "@/lib/texto";

export default function ProveedoresPage() {
  const { db, agregarProveedor, editarProveedor } = useStore();
  const [busca, setBusca] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [creando, setCreando] = useState(false);

  const cuantosProductos = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of db.productos) {
      if (p.proveedorId) m.set(p.proveedorId, (m.get(p.proveedorId) ?? 0) + 1);
    }
    return m;
  }, [db.productos]);

  const lista = useMemo(() => {
    const q = normalizar(busca);
    return db.proveedores
      .filter((v) => verInactivos || v.activo)
      .filter((v) => !q || normalizar(`${v.nombre} ${v.contacto}`).includes(q));
  }, [db.proveedores, busca, verInactivos]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="titulo text-2xl">Proveedores</h2>
          <p className="text-muted mt-1 text-sm">
            A quién se le compra. Es distinto de la bodega, que es quien produce
            el vino.
          </p>
        </div>
        <button
          onClick={() => setCreando(true)}
          className="bg-ink hover:bg-ink-hover rounded-md px-4 py-2.5 text-sm font-medium text-white transition"
        >
          Proveedor nuevo
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          className="border-line focus:border-ink min-w-64 flex-1 rounded-md border bg-white px-3 py-2 text-sm outline-none"
        />
        <label className="text-muted flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={verInactivos}
            onChange={(e) => setVerInactivos(e.target.checked)}
          />
          Ver también los dados de baja
        </label>
      </div>

      <div className="tarjeta overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-line text-faint border-b text-left text-[11px] tracking-wide uppercase">
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Contacto</th>
                <th className="px-4 py-3 font-semibold">Teléfono</th>
                <th className="px-4 py-3 text-right font-semibold">Productos</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr
                  key={v.id}
                  className="border-line hover:bg-canvas border-b last:border-0"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">{v.nombre}</span>
                    {!v.activo && (
                      <span className="bg-canvas text-faint ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                        De baja
                      </span>
                    )}
                  </td>
                  <td className="text-muted px-4 py-3">{v.contacto || "—"}</td>
                  <td className="text-muted px-4 py-3">{v.telefono || "—"}</td>
                  <td className="tnum px-4 py-3 text-right">
                    {cuantosProductos.get(v.id) ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditando(v)}
                      className="border-line hover:border-ink rounded-md border px-2.5 py-1.5 text-xs transition"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-faint px-4 py-10 text-center">
                    No hay proveedores cargados todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-faint mt-4 text-xs leading-relaxed">
        Los proveedores se crearon a partir de la columna <b>bodega</b> de los
        productos, así que puede haber entradas que en realidad son rubros y no
        proveedores. Corregirlos acá es parte del trabajo de poner la lista en
        orden.
      </p>

      {(creando || editando) && (
        <Modal
          titulo={creando ? "Proveedor nuevo" : "Editar proveedor"}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        >
          <FormProveedor
            proveedor={editando}
            onGuardar={async (datos) => {
              if (editando) await editarProveedor(editando.id, datos);
              else
                await agregarProveedor({
                  nombre: datos.nombre ?? "",
                  contacto: datos.contacto ?? "",
                  telefono: datos.telefono ?? "",
                  email: datos.email ?? "",
                  notas: datos.notas ?? "",
                  activo: true,
                });
              setCreando(false);
              setEditando(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function FormProveedor({
  proveedor,
  onGuardar,
}: {
  proveedor: Proveedor | null;
  onGuardar: (datos: Partial<Proveedor>) => Promise<void>;
}) {
  const [f, setF] = useState({
    nombre: proveedor?.nombre ?? "",
    contacto: proveedor?.contacto ?? "",
    telefono: proveedor?.telefono ?? "",
    email: proveedor?.email ?? "",
    notas: proveedor?.notas ?? "",
    activo: proveedor?.activo ?? true,
  });
  const [guardando, setGuardando] = useState(false);

  const campo =
    "border-line focus:border-ink w-full rounded-md border bg-white px-3 py-2 text-sm outline-none";
  const etiqueta =
    "text-muted mb-1 block text-xs font-semibold tracking-wide uppercase";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (guardando || !f.nombre.trim()) return;
        setGuardando(true);
        await onGuardar(f);
        setGuardando(false);
      }}
    >
      <label className={etiqueta}>Nombre</label>
      <input
        autoFocus
        value={f.nombre}
        onChange={(e) => setF({ ...f, nombre: e.target.value })}
        className={`${campo} mb-4`}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>Persona de contacto</label>
          <input
            value={f.contacto}
            onChange={(e) => setF({ ...f, contacto: e.target.value })}
            className={campo}
          />
        </div>
        <div>
          <label className={etiqueta}>Teléfono</label>
          <input
            value={f.telefono}
            onChange={(e) => setF({ ...f, telefono: e.target.value })}
            className={campo}
          />
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>Email</label>
          <input
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            className={campo}
          />
        </div>
        {proveedor && (
          <div>
            <label className={etiqueta}>Estado</label>
            <select
              value={f.activo ? "si" : "no"}
              onChange={(e) => setF({ ...f, activo: e.target.value === "si" })}
              className={campo}
            >
              <option value="si">Activo</option>
              <option value="no">Dado de baja</option>
            </select>
          </div>
        )}
      </div>

      <label className={etiqueta}>Notas</label>
      <textarea
        value={f.notas}
        onChange={(e) => setF({ ...f, notas: e.target.value })}
        rows={2}
        className={`${campo} mb-5`}
      />

      <button
        type="submit"
        disabled={guardando || !f.nombre.trim()}
        className="bg-ink hover:bg-ink-hover w-full rounded-md px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
