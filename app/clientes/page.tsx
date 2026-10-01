"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Modal } from "@/components/Modal";
import type { Cliente, Direccion } from "@/lib/types";
import { normalizar } from "@/lib/texto";
import { codigoCliente, nombreCliente, textoBuscableCliente } from "@/lib/clientes";

const VENDEDORES = ["Fede", "Claudia", "Roxana"] as const;

export default function ClientesPage() {
  const { db, agregarCliente, editarCliente } = useStore();
  const [busca, setBusca] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [creando, setCreando] = useState(false);
  const [direcciones, setDirecciones] = useState<Cliente | null>(null);

  const lista = useMemo(() => {
    const q = normalizar(busca);
    return db.clientes
      .filter((c) => verInactivos || c.activo !== false)
      .filter((c) => {
        if (!q) return true;
        const donde = normalizar(
          `${textoBuscableCliente(c)} ${c.telefono} ${c.direccion} ${c.localidad}`,
        );
        return donde.includes(q);
      });
  }, [db.clientes, busca, verInactivos]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="titulo text-2xl">Clientes</h2>
          <p className="text-muted mt-1 text-sm">
            {db.clientes.length} en total. El remito sale con la dirección
            marcada como principal.
          </p>
        </div>
        <button
          onClick={() => setCreando(true)}
          className="bg-ink hover:bg-ink-hover rounded-md px-4 py-2.5 text-sm font-medium text-white transition"
        >
          Cliente nuevo
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por número, nombre, teléfono o localidad…"
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
                <th className="px-4 py-3 font-semibold">Nº</th>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Dirección principal</th>
                <th className="px-4 py-3 font-semibold">Teléfono</th>
                <th className="px-4 py-3 font-semibold">Vendedor</th>
                <th className="px-4 py-3 text-right font-semibold">Desc.</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const cuantas = c.direcciones?.length ?? 0;
                return (
                  <tr
                    key={c.id}
                    className="border-line hover:bg-canvas border-b last:border-0"
                  >
                    <td className="tnum text-faint px-4 py-3 whitespace-nowrap">
                      {codigoCliente(c.numero)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{nombreCliente(c)}</span>
                      {c.activo === false && (
                        <span className="bg-canvas text-faint ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                          De baja
                        </span>
                      )}
                      {c.razonSocial?.trim() && (
                        <div className="text-faint text-xs">{c.nombre}</div>
                      )}
                    </td>
                    <td className="text-muted px-4 py-3">
                      {c.direccion ? (
                        <>
                          {c.direccion}
                          {c.localidad ? ` · ${c.localidad}` : ""}
                          {cuantas > 1 && (
                            <span className="text-faint"> +{cuantas - 1}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-faint">Sin dirección</span>
                      )}
                    </td>
                    <td className="text-muted px-4 py-3">{c.telefono}</td>
                    <td className="text-muted px-4 py-3">{c.vendedor}</td>
                    <td className="tnum px-4 py-3 text-right">
                      {c.descuentoPct ? `${c.descuentoPct}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setDirecciones(c)}
                          className="border-line hover:border-ink rounded-md border px-2.5 py-1.5 text-xs transition"
                        >
                          Direcciones
                        </button>
                        <button
                          onClick={() => setEditando(c)}
                          className="border-line hover:border-ink rounded-md border px-2.5 py-1.5 text-xs transition"
                        >
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-faint px-4 py-10 text-center">
                    No hay clientes que coincidan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creando || editando) && (
        <Modal
          titulo={creando ? "Cliente nuevo" : "Editar cliente"}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        >
          <FormCliente
            cliente={editando}
            onGuardar={async (datos) => {
              if (editando) await editarCliente(editando.id, datos);
              else
                await agregarCliente({
                  nombre: datos.nombre ?? "",
                  razonSocial: datos.razonSocial ?? "",
                  direccion: datos.direccion ?? "",
                  localidad: datos.localidad ?? "",
                  telefono: datos.telefono ?? "",
                  vendedor: datos.vendedor,
                  descuentoPct: datos.descuentoPct,
                  notas: datos.notas ?? "",
                });
              setCreando(false);
              setEditando(null);
            }}
          />
        </Modal>
      )}

      {direcciones && (
        <Modal
          titulo={`Direcciones de ${nombreCliente(direcciones)}`}
          onCerrar={() => setDirecciones(null)}
        >
          <PanelDirecciones
            cliente={db.clientes.find((c) => c.id === direcciones.id)!}
          />
        </Modal>
      )}
    </div>
  );
}

function FormCliente({
  cliente,
  onGuardar,
}: {
  cliente: Cliente | null;
  onGuardar: (datos: Partial<Cliente>) => Promise<void>;
}) {
  const [f, setF] = useState({
    nombre: cliente?.nombre ?? "",
    razonSocial: cliente?.razonSocial ?? "",
    telefono: cliente?.telefono ?? "",
    direccion: cliente?.direccion ?? "",
    localidad: cliente?.localidad ?? "",
    vendedor: cliente?.vendedor ?? "",
    descuentoPct: cliente?.descuentoPct ?? 0,
    notas: cliente?.notas ?? "",
    activo: cliente?.activo ?? true,
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
      {cliente?.numero && (
        <p className="text-muted mb-4 text-sm">
          Cliente <span className="text-ink font-semibold">{codigoCliente(cliente.numero)}</span>
          <span className="text-faint"> · el número no cambia aunque se edite el resto</span>
        </p>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>Apodo</label>
          <input
            autoFocus
            value={f.nombre}
            onChange={(e) => setF({ ...f, nombre: e.target.value })}
            placeholder="Como lo tienen agendado"
            className={campo}
          />
        </div>
        <div>
          <label className={etiqueta}>Razón social</label>
          <input
            value={f.razonSocial}
            onChange={(e) => setF({ ...f, razonSocial: e.target.value })}
            placeholder="Opcional · si está, sale en el remito"
            className={campo}
          />
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>Teléfono</label>
          <input
            value={f.telefono}
            onChange={(e) => setF({ ...f, telefono: e.target.value })}
            className={campo}
          />
        </div>
        <div>
          <label className={etiqueta}>Vendedor</label>
          <select
            value={f.vendedor}
            onChange={(e) => setF({ ...f, vendedor: e.target.value })}
            className={campo}
          >
            <option value="">Sin asignar</option>
            {VENDEDORES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!cliente && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={etiqueta}>Dirección de entrega</label>
            <input
              value={f.direccion}
              onChange={(e) => setF({ ...f, direccion: e.target.value })}
              className={campo}
            />
          </div>
          <div>
            <label className={etiqueta}>Localidad</label>
            <input
              value={f.localidad}
              onChange={(e) => setF({ ...f, localidad: e.target.value })}
              className={campo}
            />
          </div>
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>Descuento fijo (%)</label>
          <input
            type="number"
            step="0.5"
            value={f.descuentoPct}
            onChange={(e) =>
              setF({ ...f, descuentoPct: Number(e.target.value) })
            }
            className={`${campo} tnum`}
          />
          <p className="text-faint mt-1 text-xs">
            Se copia al remito cuando se lo elige.
          </p>
        </div>
        {cliente && (
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
            <p className="text-faint mt-1 text-xs">
              Un cliente de baja no se borra: deja de aparecer al armar
              remitos.
            </p>
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

function PanelDirecciones({ cliente }: { cliente: Cliente }) {
  const { guardarDireccion, borrarDireccion } = useStore();
  const [nueva, setNueva] = useState<(Partial<Direccion> & { id?: string }) | null>(
    null,
  );

  const campo =
    "border-line focus:border-ink w-full rounded-md border bg-white px-3 py-2 text-sm outline-none";

  return (
    <div>
      <ul className="mb-4 space-y-2">
        {(cliente.direcciones ?? []).map((d) => (
          <li
            key={d.id}
            className="border-line flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm"
          >
            <div>
              <div className="font-medium">
                {d.direccion}
                {d.esPrincipal && (
                  <span className="bg-acento-soft text-acento-ink ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                    Principal
                  </span>
                )}
              </div>
              <div className="text-muted text-xs">
                {[d.localidad, d.contacto, d.telefono]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setNueva(d)}
                className="border-line hover:border-ink rounded border px-2 py-1 text-xs transition"
              >
                Editar
              </button>
              <button
                onClick={() => {
                  if (confirm("¿Borrar esta dirección?")) void borrarDireccion(d.id);
                }}
                className="border-line hover:border-alerta hover:text-alerta rounded border px-2 py-1 text-xs transition"
              >
                Borrar
              </button>
            </div>
          </li>
        ))}
        {(cliente.direcciones ?? []).length === 0 && (
          <li className="text-faint py-4 text-center text-sm">
            Todavía no tiene ninguna dirección cargada.
          </li>
        )}
      </ul>

      {nueva ? (
        <form
          className="border-line bg-canvas rounded-lg border p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await guardarDireccion(cliente.id, nueva);
            setNueva(null);
          }}
        >
          <input
            autoFocus
            placeholder="Calle y número"
            value={nueva.direccion ?? ""}
            onChange={(e) => setNueva({ ...nueva, direccion: e.target.value })}
            className={`${campo} mb-2`}
          />
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <input
              placeholder="Localidad"
              value={nueva.localidad ?? ""}
              onChange={(e) => setNueva({ ...nueva, localidad: e.target.value })}
              className={campo}
            />
            <input
              placeholder="Contacto"
              value={nueva.contacto ?? ""}
              onChange={(e) => setNueva({ ...nueva, contacto: e.target.value })}
              className={campo}
            />
            <input
              placeholder="Teléfono"
              value={nueva.telefono ?? ""}
              onChange={(e) => setNueva({ ...nueva, telefono: e.target.value })}
              className={campo}
            />
          </div>
          <label className="text-muted mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={nueva.esPrincipal ?? false}
              onChange={(e) =>
                setNueva({ ...nueva, esPrincipal: e.target.checked })
              }
            />
            Es la dirección que sale impresa en el remito
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!nueva.direccion?.trim()}
              className="bg-ink hover:bg-ink-hover rounded-md px-3 py-2 text-sm font-medium text-white transition disabled:opacity-40"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setNueva(null)}
              className="border-line hover:border-ink rounded-md border px-3 py-2 text-sm transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setNueva({ esPrincipal: (cliente.direcciones ?? []).length === 0 })}
          className="border-line hover:border-ink w-full rounded-md border border-dashed px-4 py-2.5 text-sm transition"
        >
          + Agregar dirección
        </button>
      )}
    </div>
  );
}
