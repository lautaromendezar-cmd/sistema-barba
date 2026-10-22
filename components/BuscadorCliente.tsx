"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { codigoCliente, nombreCliente, textoBuscableCliente } from "@/lib/clientes";
import { normalizar } from "@/lib/texto";
import type { Cliente } from "@/lib/types";

/**
 * Elegir el cliente del remito escribiendo el número, el apodo, la razón social
 * o la localidad. Antes era un desplegable con los ~600 clientes y había que
 * bajar uno por uno (pedido de Claudia, 22-oct).
 */
export function BuscadorCliente({
  valor,
  onElegir,
}: {
  valor: string;
  onElegir: (id: string) => void;
}) {
  const { db } = useStore();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);

  const elegido = db.clientes.find((c) => c.id === valor);

  const resultados = useMemo(() => {
    const t = normalizar(q);
    const activos = db.clientes.filter((c) => c.activo !== false);
    if (!t) return activos.slice(0, 10);
    // «616» o «C-0616»: el número exacto va primero, como el código en productos.
    const numero = Number(t.replace(/^c-?/, ""));
    const exacto = activos.filter((c) => numero > 0 && c.numero === numero);
    const resto = activos.filter(
      (c) =>
        !exacto.includes(c) &&
        (normalizar(textoBuscableCliente(c)).includes(t) ||
          normalizar(c.localidad ?? "").includes(t)),
    );
    return [...exacto, ...resto].slice(0, 10);
  }, [q, db.clientes]);

  function elegir(id: string) {
    onElegir(id);
    setQ("");
    setAbierto(false);
  }

  const titulo = (c: Cliente) =>
    [codigoCliente(c.numero), nombreCliente(c)].filter(Boolean).join(" · ");
  const detalle = (c: Cliente) =>
    [c.razonSocial?.trim() && c.nombre !== c.razonSocial && c.nombre, c.localidad]
      .filter(Boolean)
      .join(" · ");

  if (elegido)
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2 text-sm">
        <span className="min-w-0">
          <span className="block truncate font-medium">{titulo(elegido)}</span>
          {detalle(elegido) && (
            <span className="block truncate text-xs text-faint">{detalle(elegido)}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onElegir("")}
          className="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-muted transition hover:border-ink hover:text-acento-ink"
        >
          Cambiar
        </button>
      </div>
    );

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        // Un momento para que el clic en la lista llegue antes de cerrarla.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (q.trim() && resultados[0]) elegir(resultados[0].id);
          }
          if (e.key === "Escape") {
            setQ("");
            setAbierto(false);
          }
        }}
        placeholder="Buscar cliente por número, nombre o localidad… (Enter elige el primero)"
        autoComplete="off"
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
      />

      {abierto && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(c.id)}
                className="block w-full border-b border-line px-3 py-2 text-left last:border-0 hover:bg-acento-soft"
              >
                <span className="block truncate text-sm">{titulo(c)}</span>
                {detalle(c) && (
                  <span className="block truncate text-xs text-faint">{detalle(c)}</span>
                )}
              </button>
            </li>
          ))}
          {resultados.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-muted">
              No hay ningún cliente así. Si es nuevo, usá «+ Cliente nuevo».
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
